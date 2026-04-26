import cron, { type ScheduledTask } from "node-cron";

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import type { PriceMonitorService } from "./price-monitor-service.js";

export const startScheduler = (monitor: PriceMonitorService): ScheduledTask | null => {
  const expression = env.SCRAPE_SCHEDULE.trim();

  if (!expression) {
    logger.info("Agendamento automatico desabilitado.");
    return null;
  }

  if (!cron.validate(expression)) {
    logger.warn("Cron invalido. Agendamento nao iniciado.", { expression });
    return null;
  }

  const task = cron.schedule(
    expression,
    () => {
      void monitor.runScrape("scheduler").catch((error) => {
        logger.error("Falha na execucao agendada.", error);
      });
    },
    {
      timezone: env.APP_TIMEZONE
    }
  );

  logger.info("Agendamento automatico ativo.", {
    expression,
    timezone: env.APP_TIMEZONE
  });

  return task;
};
