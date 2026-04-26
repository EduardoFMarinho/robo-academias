import { createApplication } from "./app/create-application.js";
import { startHttpServer } from "./modules/api/http-server.js";
import { startScheduler } from "./modules/monitor/scheduler.js";
import { TelegramDashboardBot } from "./modules/telegram/telegram-bot.js";
import { logger } from "./shared/logger.js";

const bootstrap = async (): Promise<void> => {
  const app = await createApplication();

  await startHttpServer(app.monitor);

  const telegramBot = new TelegramDashboardBot(app.monitor);
  await telegramBot.start();

  startScheduler(app.monitor);

  if (app.env.SCRAPE_ON_START) {
    void app.monitor.runScrape("startup").catch((error) => {
      logger.error("Falha na varredura inicial.", error);
    });
  }

  logger.info("Aplicacao iniciada com sucesso.");
};

void bootstrap().catch((error) => {
  logger.error("Falha ao iniciar a aplicacao.", error);
  process.exit(1);
});
