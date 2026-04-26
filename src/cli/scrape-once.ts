import { createApplication } from "../app/create-application.js";

const run = async (): Promise<void> => {
  const app = await createApplication();
  const summary = await app.monitor.runScrape("cli");

  console.log(JSON.stringify(summary, null, 2));
};

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
