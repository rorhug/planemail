import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { OAuth2Client, Credentials } from "google-auth-library";
import { getOAuthCode } from "./server";

export interface Account extends Credentials {
  email?: string;
}

const TOKEN_PATH = path.join(__dirname, "../accounts.json");
const CREDENTIALS_PATH = path.join(__dirname, "../credentials.json");
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error("credentials.json not found.");
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
}

function loadTokens(): Record<string, Account> {
  if (fs.existsSync(TOKEN_PATH)) {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  }
  return {};
}

export function getAccounts(): Account[] {
  const tokens = loadTokens();
  return Object.values(tokens);
}

async function saveTokens(tokens: Record<string, Account>) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

async function performAuthFlow(
  oAuth2Client: OAuth2Client
): Promise<Credentials> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });

  console.log("Opening browser for authentication...");
  const code = await getOAuthCode(authUrl);
  const { tokens } = await oAuth2Client.getToken(code.trim());
  return tokens;
}

async function createOAuthClient(): Promise<OAuth2Client> {
  const credentials = loadCredentials();
  const { client_secret, client_id } = credentials.installed;
  // Find a free port dynamically for the redirect URI
  const port = 8989; // Start port
  const redirectUri = `http://localhost:${port}`;
  return new google.auth.OAuth2(client_id, client_secret, redirectUri);
}

export async function addAccount() {
  const oAuth2Client = await createOAuthClient();
  const newTokens = await performAuthFlow(oAuth2Client);
  oAuth2Client.setCredentials(newTokens);

  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;

  if (!email) {
    throw new Error("Could not get email from profile.");
  }

  const allTokens = loadTokens();
  allTokens[email] = { ...newTokens, email };
  await saveTokens(allTokens);
  console.log(`Account for ${email} added successfully.`);
}

export async function reauthenticateAccount(email: string): Promise<Account> {
  const oAuth2Client = await createOAuthClient();
  const newTokens = await performAuthFlow(oAuth2Client);
  const updatedAccount = { ...newTokens, email };

  const allTokens = loadTokens();
  allTokens[email] = updatedAccount;
  await saveTokens(allTokens);
  console.log(`Account for ${email} re-authenticated successfully.`);
  return updatedAccount;
}

export async function removeAccount(email: string) {
  const accounts = loadTokens();
  delete accounts[email];
  await saveTokens(accounts);
  console.log(`Account ${email} removed successfully.`);
}

export async function getAuthenticatedClient(
  account: Account
): Promise<OAuth2Client> {
  const oAuth2Client = await createOAuthClient();
  oAuth2Client.setCredentials(account);

  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    await gmail.users.getProfile({ userId: "me" });
    return oAuth2Client;
  } catch {
    throw new Error("Token is invalid or expired.");
  }
}
