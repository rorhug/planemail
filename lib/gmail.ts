import { google, gmail_v1 } from "googleapis";
import { GaxiosError, GaxiosResponse } from "gaxios";
import { OAuth2Client } from "google-auth-library";
import { airports } from "@nwpr/airport-codes";

// Regex for IATA airport codes (three uppercase letters)
// const IATA_REGEX = /\b([A-Z]{3})\b/g;
// Regex for common date/time formats (very basic, can be improved)
const DATE_REGEX =
  /\b(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2} [A-Za-z]{3,9} \d{4})\b/gi;
const TIME_REGEX = /\b(\d{1,2}:\d{2}(?: ?[APMapm]{2})?)\b/gi;
// Regex for flight numbers: 2 letters, optional number, optional space, 1-4 digits.
const FLIGHT_NUMBER_REGEX = /\b([A-Z]{2}[A-Z0-9]? {0,1}\d{1,4})\b/g;
// Regex for booking references (PNR): 6-8 alphanumeric characters, often prefixed
const BOOKING_REF_REGEX =
  /(?:booking reference|PNR|confirmation no|ref|reservation no):? *\b([A-Z0-9]{6,8})\b/gi;

// Build a set of valid IATA codes from the airports data
const VALID_IATA_CODES = new Set(airports.map((a) => a.iata).filter(Boolean));

const AIRPORT_NAME_TO_IATA: Map<string, string> = new Map();
airports.forEach((airport) => {
  if (airport.iata) {
    if (airport.name) {
      AIRPORT_NAME_TO_IATA.set(airport.name.toLowerCase(), airport.iata);
    }
    if (airport.city) {
      AIRPORT_NAME_TO_IATA.set(airport.city.toLowerCase(), airport.iata);
    }
  }
});

const SUBJECT_BLACKLIST = [
  "re:",
  "fwd:",
  "receipt",
  "ramp",
  "transaction",
  "tracked flight",
  "pantera",
  "needs an itinerary",
  "needs a receipt",
  "political pivot",
  "blockchain letter",
  "price change",
];

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

function extractFlightInfo(text: string): {
  iataMatches: string[];
  dateMatches: string[];
  timeMatches: string[];
  flightNumbers: string[];
  bookingRefs: string[];
} {
  // Sanitize the text to remove non-standard characters and normalize whitespace
  const sanitizedText = text
    .replace(/[^a-zA-Z0-9\s-():/]/g, "")
    .replace(/\s+/g, " ");

  let iataMatches: string[] = [];

  // 1. Look for pattern like "Dublin (DUB) to London (LHR)"
  const cityIataPattern = /\(([A-Z]{3})\)/g;
  const cityIataMatches = Array.from(
    sanitizedText.matchAll(cityIataPattern)
  ).map((m) => m[1]);
  if (cityIataMatches.length >= 2) {
    iataMatches = cityIataMatches;
  }

  // 2. If not found, look for "DUB-LHR" or "DUB to LHR"
  if (iataMatches.length < 2) {
    const directIataPattern = /([A-Z]{3})(?:-| to )([A-Z]{3})/g;
    const directMatches = Array.from(
      sanitizedText.matchAll(directIataPattern)
    ).flatMap((m) => [m[1], m[2]]);
    if (directMatches.length >= 2) {
      iataMatches = directMatches;
    }
  }

  // 3. Look for airport names
  if (iataMatches.length < 2) {
    const airportNames = Array.from(AIRPORT_NAME_TO_IATA.keys());
    const airportNamePattern = new RegExp(
      `\\b(${airportNames.join("|")})\\b`,
      "gi"
    );
    const nameMatches = Array.from(
      sanitizedText.matchAll(airportNamePattern)
    ).map((m) => AIRPORT_NAME_TO_IATA.get(m[1].toLowerCase())!);
    if (nameMatches.length >= 2) {
      iataMatches = nameMatches;
    }
  }

  // Final filtering to ensure we only have valid codes & pairs
  iataMatches = iataMatches.filter((code) => VALID_IATA_CODES.has(code));
  if (iataMatches.length < 2) {
    iataMatches = [];
  }

  const dateMatches = Array.from(sanitizedText.matchAll(DATE_REGEX)).map(
    (m) => m[1]
  );
  const timeMatches = Array.from(sanitizedText.matchAll(TIME_REGEX)).map(
    (m) => m[1]
  );
  const flightNumbers = Array.from(
    sanitizedText.matchAll(FLIGHT_NUMBER_REGEX)
  ).map((m) => m[1]);
  const bookingRefs = Array.from(sanitizedText.matchAll(BOOKING_REF_REGEX)).map(
    (m) => m[1]
  );
  return { iataMatches, dateMatches, timeMatches, flightNumbers, bookingRefs };
}

export async function fetchFlightEmailsForAccount(
  auth: OAuth2Client,
  dateRange?: string
): Promise<
  {
    messageId: string;
    subject: string;
    iatas: string[];
    dates: string[];
    times: string[];
    flightNumbers: string[];
    bookingRefs: string[];
  }[]
> {
  const gmail = google.gmail({ version: "v1", auth });

  let query = `category:travel (${FLIGHT_QUERIES.map((q) => `"${q}"`).join(
    " OR "
  )})`;
  if (dateRange) {
    const [start, end] = dateRange.split(" ");
    query += ` after:${start.replace(/-/g, "/")} before:${end.replace(
      /-/g,
      "/"
    )}`;
  }

  const allResults: {
    messageId: string;
    subject: string;
    iatas: string[];
    dates: string[];
    times: string[];
    flightNumbers: string[];
    bookingRefs: string[];
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

      // First, try to get the plain text body
      const plainTextPart = parts.find((p) => p.mimeType === "text/plain");
      if (plainTextPart && plainTextPart.body?.data) {
        body = Buffer.from(plainTextPart.body.data, "base64").toString("utf8");
      }
      // If no plain text, find the HTML part and strip the tags
      else {
        const htmlPart = parts.find((p) => p.mimeType === "text/html");
        if (htmlPart && htmlPart.body?.data) {
          const htmlBody = Buffer.from(htmlPart.body.data, "base64").toString(
            "utf8"
          );
          // First, remove script and style elements
          let cleanBody = htmlBody.replace(
            /<(script|style)\b[^>]*>[\s\S]*?<\/(script|style)>/g,
            ""
          );
          // Then, strip all remaining HTML tags
          cleanBody = cleanBody.replace(/<[^>]*>/g, "\\n");
          body = cleanBody;
        }
        // If it's a single-part message
        else if (msg.payload?.body?.data) {
          if (msg.payload.mimeType === "text/plain") {
            body = Buffer.from(msg.payload.body.data, "base64").toString(
              "utf8"
            );
          } else if (msg.payload.mimeType === "text/html") {
            const htmlBody = Buffer.from(
              msg.payload.body.data,
              "base64"
            ).toString("utf8");
            // First, remove script and style elements
            let cleanBody = htmlBody.replace(
              /<(script|style)\b[^>]*>[\s\S]*?<\/(script|style)>/g,
              ""
            );
            // Then, strip all remaining HTML tags
            cleanBody = cleanBody.replace(/<[^>]*>/g, "\\n");
            body = cleanBody;
          }
        }
      }

      const {
        iataMatches,
        dateMatches,
        timeMatches,
        flightNumbers,
        bookingRefs,
      } = extractFlightInfo(subject + "\n" + body);
      if (
        iataMatches.length >= 2 &&
        dateMatches.length > 0 &&
        flightNumbers.length > 0
      ) {
        allResults.push({
          messageId: message.id!,
          subject: subject,
          iatas: Array.from(new Set(iataMatches)),
          dates: Array.from(new Set(dateMatches)),
          times: Array.from(new Set(timeMatches)),
          flightNumbers: Array.from(new Set(flightNumbers)),
          bookingRefs: Array.from(new Set(bookingRefs)),
        });
      }
    }
    nextPageToken = res.data.nextPageToken || undefined;
  } while (nextPageToken);

  return allResults.reverse();
}

export async function getEmail(auth: OAuth2Client, messageId: string) {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const msgRes = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
    });
    return msgRes.data;
  } catch (error) {
    if (error instanceof GaxiosError && error.response?.status === 404) {
      return null;
    }
    console.error(error);
    throw error;
  }
}

export async function searchFirstEmailBySubject(
  auth: OAuth2Client,
  subject: string,
  order: "asc" | "desc" = "desc"
): Promise<gmail_v1.Schema$Message | null> {
  const gmail = google.gmail({ version: "v1", auth });

  if (order === "desc") {
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: `subject:"${subject}"`,
      maxResults: 1,
    });
    const firstMessage = listRes.data.messages?.[0];
    if (!firstMessage?.id) {
      return null;
    }
    return getEmail(auth, firstMessage.id);
  }

  // For 'asc', we need to find the oldest message.
  // We paginate through all pages and get the last message from the last page.
  let messagesOnLastPage: gmail_v1.Schema$Message[] = [];
  let nextPageToken: string | null | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `subject:"${subject}"`,
      pageToken: nextPageToken || undefined,
    });
    if (res.data.messages) {
      messagesOnLastPage = res.data.messages;
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  if (messagesOnLastPage.length > 0) {
    const oldestMessage = messagesOnLastPage[messagesOnLastPage.length - 1];
    if (oldestMessage.id) {
      return getEmail(auth, oldestMessage.id);
    }
  }

  return null;
}
