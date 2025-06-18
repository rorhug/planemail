import inquirer from "inquirer";
import { getFlights } from "./flights";
import {
  addAccount,
  getAccounts,
  removeAccount,
  reauthenticateAccount,
  Account,
  getAuthenticatedClient,
} from "./auth";

export async function mainMenu() {
  const accounts = await getAccounts();
  console.log("\n--- Flight Scraper ---");
  if (accounts.length > 0) {
    console.log("Available Accounts:");
    accounts.forEach((acc: Account) => console.log(`- ${acc.email}`));
  } else {
    console.log("No accounts configured.");
  }
  console.log("----------------------\n");

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        { name: "Get Flights", value: "getFlights" },
        { name: "Add account", value: "addAccount" },
        { name: "Remove account", value: "removeAccount" },
        new inquirer.Separator(),
        { name: "Quit", value: "quit" },
      ],
    },
  ]);

  switch (action) {
    case "getFlights":
      await getFlightsFlow();
      break;
    case "addAccount":
      await addAccount();
      break;
    case "removeAccount":
      await removeAccountFlow();
      break;
    case "quit":
      console.log("Goodbye!");
      process.exit(0);
  }
  // Loop back to the main menu
  await mainMenu();
}

async function validateAndGetAccounts(): Promise<Account[]> {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    console.log("No accounts found. Please add one first.");
    await addAccount();
    return await validateAndGetAccounts();
  }

  const validAccounts: Account[] = [];
  for (const account of accounts) {
    try {
      await getAuthenticatedClient(account);
      console.log(`- ${account.email}: OK`);
      validAccounts.push(account);
    } catch {
      console.log(`- ${account.email}: Needs re-authentication.`);
      const { choice } = await inquirer.prompt([
        {
          type: "list",
          name: "choice",
          message: `Authentication for ${account.email} has expired. What would you like to do?`,
          choices: ["Re-authenticate", "Skip and Remove Account", "Abort"],
        },
      ]);

      if (choice === "Re-authenticate") {
        try {
          const updatedAccount = await reauthenticateAccount(account.email!);
          validAccounts.push(updatedAccount);
        } catch {
          console.log(`Re-authentication failed for ${account.email}.`);
          const { decision } = await inquirer.prompt([
            {
              type: "list",
              name: "decision",
              message: "What to do?",
              choices: ["Skip and Remove Account", "Abort"],
            },
          ]);
          if (decision === "Skip and Remove Account") {
            await removeAccount(account.email!);
          } else {
            return []; // Abort
          }
        }
      } else if (choice === "Skip and Remove Account") {
        await removeAccount(account.email!);
      } else {
        return []; // Abort
      }
    }
  }
  return validAccounts;
}

async function getFlightsFlow() {
  const accounts = await validateAndGetAccounts();
  if (accounts.length === 0) {
    console.log("No valid accounts to search. Aborting.");
    return;
  }

  const accountChoices = accounts.map((acc: Account) => ({
    name: acc.email,
    value: acc.email,
  }));

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "dateRange",
      message:
        "Enter date range (YYYY-MM-DD YYYY-MM-DD), or leave blank for all:",
      validate: (input: string) => {
        if (input === "") return true;
        const dates = input.split(" ");
        if (dates.length !== 2)
          return "Please enter two dates separated by a space.";
        const [start, end] = dates;
        if (
          isNaN(new Date(start).getTime()) ||
          isNaN(new Date(end).getTime())
        ) {
          return "Invalid date format.";
        }
        return true;
      },
    },
    {
      type: "checkbox",
      name: "selectedEmails",
      message: "Which accounts do you want to search?",
      choices: accountChoices,
      default: accountChoices.map((c) => c.value),
    },
    {
      type: "list",
      name: "format",
      message: "Output format:",
      choices: ["CSV", "JSON"],
      default: "CSV",
    },
    {
      type: "list",
      name: "destination",
      message: "Output destination:",
      choices: ["Print to console", "Save to file", "Both"],
    },
  ]);

  const selectedAccounts = accounts.filter((acc) =>
    answers.selectedEmails.includes(acc.email)
  );
  await getFlights({ ...answers, accounts: selectedAccounts });
}

async function removeAccountFlow() {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    console.log("No accounts to remove.");
    return;
  }
  const { accountEmail } = await inquirer.prompt([
    {
      type: "list",
      name: "accountEmail",
      message: "Which account would you like to remove?",
      choices: accounts.map((acc: Account) => ({
        name: acc.email,
        value: acc.email,
      })),
    },
  ]);
  await removeAccount(accountEmail);
}
