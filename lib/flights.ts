import { getAuthenticatedClient } from "./auth";
import { fetchFlightEmailsForAccount } from "./gmail";
import fs from "fs";
import { Account } from "./auth";

interface FlightData {
  subject: string;
  departureIata: string;
  arrivalIata: string;
  date: string;
  time: string;
  flightNumber: string;
}

export async function getFlights(options: {
  dateRange?: string;
  accounts: Account[];
  format: "JSON" | "CSV";
  destination: "Print to console" | "Save to file" | "Both";
}) {
  const allFlights: FlightData[] = [];
  const uniqueFlights = new Set<string>();

  for (const account of options.accounts) {
    console.log(`Fetching flights for ${account.email}...`);
    const auth = await getAuthenticatedClient(account);
    const results = await fetchFlightEmailsForAccount(auth, options.dateRange);

    for (const r of results) {
      const dep = r.iatas[0];
      const arr = r.iatas[1];
      const date = r.dates[0];
      const time = r.times[0];
      const flightNumber = r.flightNumbers[0];
      const flightId = `${dep}-${arr}-${date}-${time}-${flightNumber}`;

      if (uniqueFlights.has(flightId)) {
        continue;
      }
      uniqueFlights.add(flightId);

      allFlights.push({
        subject: r.subject,
        departureIata: dep,
        arrivalIata: arr,
        date,
        time,
        flightNumber,
      });
    }
  }

  handleOutput(allFlights, options.format, options.destination);
}

function formatDate(dateString: string): string {
  const d = new Date(dateString);
  // Return in YYYY-MM-DD format
  return !isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "";
}

function formatTime(timeString: string): string {
  // Handles various time formats (e.g., "1:05 PM", "13:05") and converts to HH:MM:SS
  const d = new Date(`1970-01-01 ${timeString}`);
  return !isNaN(d.getTime()) ? d.toTimeString().split(" ")[0] : "00:00:00";
}

function handleOutput(
  flights: FlightData[],
  format: "JSON" | "CSV",
  destination: "Print to console" | "Save to file" | "Both"
) {
  let outputData: string;

  if (format === "JSON") {
    outputData = JSON.stringify(flights, null, 2);
  } else {
    const headers =
      'Date,"Flight number",From,To,"Dep time","Arr time",Duration,Airline,Aircraft,Registration,"Seat number","Seat type","Flight class","Flight reason",Note,Dep_id,Arr_id,Airline_id,Aircraft_id';
    const rows = flights
      .map((f) => {
        const row = [
          formatDate(f.date),
          `"${f.flightNumber}"`,
          f.departureIata,
          f.arrivalIata,
          `"${formatTime(f.time)}"`,
          "", // Arr time
          "", // Duration
          "", // Airline
          "", // Aircraft
          "", // Registration
          "", // Seat number
          "", // Seat type
          "", // Flight class
          "", // Flight reason
          `"${f.subject.replace(/"/g, '""')}"`, // Note
          "", // Dep_id
          "", // Arr_id
          "", // Airline_id
          "", // Aircraft_id
        ];
        return row.join(",");
      })
      .join("\n");
    outputData = `${headers}\n${rows}`;
  }

  if (destination === "Print to console" || destination === "Both") {
    console.log(outputData);
  }

  if (destination === "Save to file" || destination === "Both") {
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1)
      .toString()
      .padStart(2, "0")}_${now.getDate().toString().padStart(2, "0")}_${now
      .getHours()
      .toString()
      .padStart(2, "0")}_${now.getMinutes().toString().padStart(2, "0")}`;
    const filename = `planemail_${timestamp}.csv`;
    fs.writeFileSync(filename, outputData);
    console.log(`Data saved to ${filename}`);
  }
}
