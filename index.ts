import { mainMenu } from "./lib/ui";

async function start() {
  await mainMenu();
}

start().catch(console.error);
