import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import type { GymDefinition, RunScrapeOptions, ScrapeOutcome, ScrapeProgressEvent, ScrapeSummary } from "../academies/types.js";
import { SeleniumPriceScraper } from "../academies/selenium-price-scraper.js";
import type { FileDatabase } from "../storage/file-database.js";
import type { AppDatabase, DatabaseLogEntry } from "../storage/schema.js";

const trimLogs = (database: AppDatabase): void => {
  if (database.logs.length > env.LOG_RETENTION_LIMIT) {
    database.logs = database.logs.slice(-env.LOG_RETENTION_LIMIT);
  }
};

const pushLog = (
  database: AppDatabase,
  entry: Omit<DatabaseLogEntry, "timestamp">
): void => {
  database.logs.push({
    timestamp: new Date().toISOString(),
    ...entry
  });
  trimLogs(database);
};

type ProgressListener = NonNullable<RunScrapeOptions["onProgress"]>;

export class PriceMonitorService {
  private currentRun:
    | {
        executionId: string;
        promise: Promise<ScrapeSummary>;
        listeners: Set<ProgressListener>;
      }
    | null = null;

  constructor(
    private readonly database: FileDatabase,
    private readonly gyms: GymDefinition[],
    private readonly scraper: SeleniumPriceScraper
  ) {}

  async getSnapshot() {
    return this.database.read();
  }

  isRunning(): boolean {
    return this.currentRun !== null;
  }

  async runScrape(trigger: string, options: RunScrapeOptions = {}): Promise<ScrapeSummary> {
    const onProgress = options.onProgress;

    if (this.currentRun) {
      const existingRun = this.currentRun;

      if (onProgress) {
        existingRun.listeners.add(onProgress);
        await this.safeNotifyListener(onProgress, {
          type: "queued_existing_run",
          executionId: existingRun.executionId,
          trigger
        });
      }

      try {
        const shared = await existingRun.promise;

        return {
          ...shared,
          reusedExistingRun: true
        };
      } finally {
        if (onProgress) {
          existingRun.listeners.delete(onProgress);
        }
      }
    }

    const executionId = randomUUID();
    const listeners = new Set<ProgressListener>();

    if (onProgress) {
      listeners.add(onProgress);
    }

    const notifyProgress = async (event: ScrapeProgressEvent): Promise<void> => {
      await Promise.all([...listeners].map((listener) => this.safeNotifyListener(listener, event)));
    };

    const promise = this.executeScrape(executionId, trigger, notifyProgress);

    this.currentRun = {
      executionId,
      promise,
      listeners
    };

    try {
      return await promise;
    } finally {
      if (this.currentRun?.executionId === executionId) {
        this.currentRun = null;
      }
    }
  }

  private async executeScrape(
    executionId: string,
    trigger: string,
    notifyProgress: (event: ScrapeProgressEvent) => Promise<void>
  ): Promise<ScrapeSummary> {
    const startedAt = new Date().toISOString();

    logger.info("Iniciando varredura", { executionId, trigger });
    await notifyProgress({
      type: "started",
      executionId,
      trigger,
      startedAt,
      gymCount: this.gyms.length
    });

    await this.database.mutate((database) => {
      database.status.lastRunAt = startedAt;
      database.status.lastRunStatus = "running";
      database.status.lastTrigger = trigger;
      database.executions.unshift({
        id: executionId,
        trigger,
        startedAt,
        finishedAt: null,
        status: "running",
        successfulGyms: 0,
        failedGyms: 0,
        note: null
      });
      database.executions = database.executions.slice(0, 20);
      pushLog(database, {
        level: "info",
        message: "Varredura iniciada.",
        context: { executionId, trigger }
      });
    });

    const results: ScrapeOutcome[] = [];

    for (const [index, gym] of this.gyms.entries()) {
      await notifyProgress({
        type: "gym_started",
        executionId,
        trigger,
        gymId: gym.id,
        gymName: gym.name,
        index: index + 1,
        total: this.gyms.length
      });

      const result = await this.scraper.scrape(gym).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);

        logger.error("Falha inesperada no scraper.", {
          gymId: gym.id,
          message
        });

        return {
          gymId: gym.id,
          gymName: gym.name,
          sourceUrl: gym.sourceUrl,
          status: "error" as const,
          currentPrice: null,
          currentPlanName: null,
          detectedPrices: [],
          plans: [],
          sourceHint: null,
          checkedAt: new Date().toISOString(),
          errorMessage: `Falha inesperada: ${message}`,
          screenshotPath: null
        };
      });

      results.push(result);
      await this.persistGymResult(result);
      await notifyProgress({
        type: "gym_finished",
        executionId,
        trigger,
        gymId: result.gymId,
        gymName: result.gymName,
        index: index + 1,
        total: this.gyms.length,
        status: result.status,
        currentPrice: result.currentPrice,
        currentPlanName: result.currentPlanName,
        planCount: result.plans.length,
        errorMessage: result.errorMessage ?? null
      });
    }

    const successfulGyms = results.filter((result) => result.status === "ok").length;
    const failedGyms = results.length - successfulGyms;
    const finalStatus =
      failedGyms === 0 ? "success" : successfulGyms > 0 ? "partial" : "error";
    const finishedAt = new Date().toISOString();

    await this.database.mutate((database) => {
      database.status.totalRuns += 1;
      database.status.lastRunAt = finishedAt;
      database.status.lastRunStatus = finalStatus;
      database.status.lastTrigger = trigger;

      if (finalStatus === "success") {
        database.status.successfulRuns += 1;
      } else if (finalStatus === "partial") {
        database.status.partialRuns += 1;
      } else {
        database.status.failedRuns += 1;
      }

      const execution = database.executions.find((entry) => entry.id === executionId);

      if (execution) {
        execution.finishedAt = finishedAt;
        execution.status = finalStatus;
        execution.successfulGyms = successfulGyms;
        execution.failedGyms = failedGyms;
        execution.note =
          finalStatus === "success"
            ? "Todos os sites responderam."
            : finalStatus === "partial"
              ? "Uma parte dos sites falhou."
              : "Nenhum preco foi coletado com sucesso.";
      }

      pushLog(database, {
        level: finalStatus === "error" ? "error" : "info",
        message: "Varredura finalizada.",
        context: {
          executionId,
          trigger,
          status: finalStatus,
          successfulGyms,
          failedGyms
        }
      });
    });

    logger.info("Varredura concluida", {
      executionId,
      status: finalStatus,
      successfulGyms,
      failedGyms
    });

    await notifyProgress({
      type: "finished",
      executionId,
      trigger,
      finishedAt,
      status: finalStatus,
      successfulGyms,
      failedGyms
    });

    return {
      executionId,
      trigger,
      startedAt,
      finishedAt,
      status: finalStatus,
      results,
      successfulGyms,
      failedGyms,
      reusedExistingRun: false
    };
  }

  private async safeNotifyListener(
    listener: ProgressListener,
    event: ScrapeProgressEvent
  ): Promise<void> {
    try {
      await listener(event);
    } catch (error) {
      logger.warn("Falha ao notificar progresso da varredura.", error);
    }
  }

  private async persistGymResult(result: ScrapeOutcome): Promise<void> {
    await this.database.mutate((database) => {
      const gym = database.gyms.find((entry) => entry.id === result.gymId);

      if (!gym) {
        return;
      }

      gym.lastCheckedAt = result.checkedAt;
      gym.screenshotPath = result.screenshotPath ?? null;

      if (result.status === "ok") {
        gym.status = "ok";
        gym.currentPrice = result.currentPrice;
        gym.currentPlanName = result.currentPlanName;
        gym.detectedPrices = result.detectedPrices;
        gym.plans = result.plans;
        gym.sourceHint = result.sourceHint;
        gym.lastSuccessfulCheckAt = result.checkedAt;
        gym.lastError = null;
        gym.successCount += 1;

        pushLog(database, {
          level: "info",
          message: `Preco atualizado para ${result.gymName}.`,
          context: {
            gymId: result.gymId,
            planName: result.currentPlanName,
            price: result.currentPrice,
            planCount: result.plans.length,
            sourceHint: result.sourceHint
          }
        });

        return;
      }

      gym.status = "error";
      gym.failureCount += 1;
      gym.lastError = result.errorMessage ?? "Erro desconhecido";

      pushLog(database, {
        level: "error",
        message: `Falha ao raspar ${result.gymName}.`,
        context: {
          gymId: result.gymId,
          error: result.errorMessage ?? "Erro desconhecido",
          screenshotPath: result.screenshotPath ?? null
        }
      });
    });
  }
}
