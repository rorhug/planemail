import { getAccounts, getAuthenticatedClient } from "./lib/auth";
import { getEmail, searchFirstEmailBySubject } from "./lib/gmail";
import { gmail_v1 } from "googleapis";

function findHeader(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string
): string {
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value || "N/A";
}

function getBody(payload: gmail_v1.Schema$MessagePart | undefined): {
  plain: string | null;
  html: string | null;
  rawPlain: string | null;
} {
  let plain: string | null = null;
  let html: string | null = null;
  let rawPlain: string | null = null;

  if (!payload) {
    return { plain, html, rawPlain };
  }

  const parts = payload.parts || [];
  console.log("--- Email Parts ---");
  parts.forEach((part, index) => {
    console.log(`Part ${index}: ${part.mimeType}`);
  });
  console.log("-------------------");

  if (parts.length > 0) {
    const plainPart = parts.find((p) => p.mimeType === "text/plain");
    if (plainPart?.body?.data) {
      rawPlain = plainPart.body.data;
      plain = Buffer.from(plainPart.body.data, "base64").toString("utf8");
    }

    const htmlPart = parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      html = Buffer.from(htmlPart.body.data, "base64").toString("utf8");
    }
  } else if (payload.body?.data) {
    if (payload.mimeType === "text/plain") {
      rawPlain = payload.body.data;
      plain = Buffer.from(payload.body.data, "base64").toString("utf8");
    } else if (payload.mimeType === "text/html") {
      html = Buffer.from(payload.body.data, "base64").toString("utf8");
    }
  }

  return { plain, html, rawPlain };
}

async function run() {
  const query = process.argv[2];
  if (!query) {
    console.error(
      "Please provide a message ID or an exact subject line as an argument."
    );
    process.exit(1);
  }

  const accounts = await getAccounts();
  if (accounts.length === 0) {
    console.error("No accounts found. Please add an account first.");
    return;
  }

  // Simple heuristic: Gmail IDs are typically 16+ alphanumeric chars.
  const isMessageId = /^[a-zA-Z0-9]{16,}$/.test(query);
  let email: gmail_v1.Schema$Message | null = null;
  let foundInAccount: string | undefined = undefined;

  for (const account of accounts) {
    try {
      console.log(`Checking account: ${account.email} for query: "${query}"`);
      const auth = await getAuthenticatedClient(account);

      if (isMessageId) {
        email = await getEmail(auth, query);
      } else {
        email = await searchFirstEmailBySubject(auth, query, "asc");
      }

      if (email) {
        foundInAccount = account.email;
        break; // Found it, exit the loop
      }
    } catch (error) {
      // Only ignore 404 errors for message ID lookups
      if (
        isMessageId &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 404
      ) {
        // Not in this account, continue to the next one.
      } else {
        // For other errors, or for subject search errors, we should stop.
        console.error(
          `An error occurred while checking account ${account.email}:`
        );
        throw error;
      }
    }
  }

  if (email && email.payload) {
    const headers = email.payload.headers || [];
    const from = findHeader(headers, "From");
    const to = findHeader(headers, "To");
    const subject = findHeader(headers, "Subject");
    const { plain, html, rawPlain } = getBody(email.payload);

    console.log(
      `-------------------- Email Details (found in ${
        foundInAccount || "N/A"
      }) --------------------`
    );
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(
      `-------------------- Raw Base64 Plain Text --------------------`
    );
    console.log(rawPlain || "No raw plain text data found.");
    console.log(
      `-------------------- Decoded Plain Text Body --------------------`
    );
    console.log(plain || "No plain text body found.");
    console.log(`-------------------- HTML Body --------------------`);
    console.log(html || "No HTML body found.");
    console.log(`-----------------------------------------------------`);
  } else {
    console.error(`Could not find email with query "${query}" in any account.`);
  }
}

run().catch(console.error);
