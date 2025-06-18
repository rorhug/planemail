import { google, gmail_v1 } from "googleapis";
import { GaxiosResponse } from "gaxios";
import { OAuth2Client } from "google-auth-library";
import { airports } from "@nwpr/airport-codes";

// Regex for IATA airport codes (three uppercase letters)
const IATA_REGEX = /\b([A-Z]{3})\b/g;
// Regex for common date/time formats (very basic, can be improved)
const DATE_REGEX =
  /\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2} [A-Za-z]{3,9} \d{4})\b/gi;
const TIME_REGEX = /\b(\d{1,2}:\d{2}(?: ?[APMapm]{2})?)\b/gi;
// Regex for flight numbers: 2-3 letters followed by 1-4 digits (e.g., AA123, BA4567, LH789)
const FLIGHT_NUMBER_REGEX = /\b([A-Z]{2,3} {0,2}\d{1,4})\b/g;

// Build a set of valid IATA codes from the airports data
const VALID_IATA_CODES = new Set(airports.map((a) => a.iata).filter(Boolean));

function extractFlightInfo(text: string): {
  iataMatches: string[];
  dateMatches: string[];
  timeMatches: string[];
  flightNumbers: string[];
} {
  const iataMatches = Array.from(text.matchAll(IATA_REGEX))
    .map((m) => m[1])
    .filter((code) => VALID_IATA_CODES.has(code));
  const dateMatches = Array.from(text.matchAll(DATE_REGEX)).map((m) => m[1]);
  const timeMatches = Array.from(text.matchAll(TIME_REGEX)).map((m) => m[1]);
  const flightNumbers = Array.from(text.matchAll(FLIGHT_NUMBER_REGEX)).map(
    (m) => m[1]
  );
  return { iataMatches, dateMatches, timeMatches, flightNumbers };
}

export async function fetchFlightEmailsForAccount(
  auth: OAuth2Client,
  dateRange?: string
): Promise<
  {
    subject: string;
    iatas: string[];
    dates: string[];
    times: string[];
    flightNumbers: string[];
  }[]
> {
  const gmail = google.gmail({ version: "v1", auth });

  const FLIGHT_QUERIES = [
    "flight confirmation",
    "flight receipt",
    "your flight",
    "itinerary",
    "boarding pass",
    "e-ticket",
    "upcoming trip",
    "airline reservation",
    "flight details",
    "travel confirmation",
  ];

  let query = `(${FLIGHT_QUERIES.map((q) => `"${q}"`).join(" OR ")})`;
  if (dateRange) {
    const [start, end] = dateRange.split(" ");
    query += ` after:${start.replace(/-/g, "/")} before:${end.replace(
      /-/g,
      "/"
    )}`;
  }

  const SUBJECT_BLACKLIST = [
    "transaction",
    "receipt",
    "tracked flight",
    "pantera",
    "needs an itinerary",
    "needs a receipt",
    "political pivot",
    "blockchain letter",
    "price change",
  ];

  const allResults: {
    subject: string;
    iatas: string[];
    dates: string[];
    times: string[];
    flightNumbers: string[];
  }[] = [];

  let nextPageToken: string | undefined = undefined;
  do {
    const res: GaxiosResponse<gmail_v1.Schema$ListMessagesResponse> =
      await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 50,
        pageToken: nextPageToken,
      });

    const messages = res.data.messages || [];
    for (const message of messages) {
      if (!message.id) continue;
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
      });
      const msg = msgRes.data;
      const subjectHeader = msg.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === "subject"
      );
      const subject = subjectHeader?.value || "";

      if (
        SUBJECT_BLACKLIST.some((keyword) =>
          subject.toLowerCase().includes(keyword)
        )
      ) {
        continue;
      }

      let body = "";
      const parts = msg.payload?.parts || [];
      if (parts.length > 0) {
        for (const part of parts) {
          if (part.mimeType === "text/plain" && part.body?.data) {
            body += Buffer.from(part.body.data, "base64").toString("utf8");
          }
        }
      } else if (msg.payload?.body?.data) {
        body += Buffer.from(msg.payload.body.data, "base64").toString("utf8");
      }

      const { iataMatches, dateMatches, timeMatches, flightNumbers } =
        extractFlightInfo(subject + "\n" + body);
      if (
        iataMatches.length >= 2 &&
        dateMatches.length > 0 &&
        flightNumbers.length > 0
      ) {
        allResults.push({
          subject: subject,
          iatas: Array.from(new Set(iataMatches)),
          dates: Array.from(new Set(dateMatches)),
          times: Array.from(new Set(timeMatches)),
          flightNumbers: Array.from(new Set(flightNumbers)),
        });
      }
    }
    nextPageToken = res.data.nextPageToken || undefined;
  } while (nextPageToken);

  return allResults;
}
