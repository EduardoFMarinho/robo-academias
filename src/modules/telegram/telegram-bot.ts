import { Markup, Telegraf, type Context } from "telegraf";
import type { InlineKeyboardButton } from "telegraf/types";

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import type { ScrapeProgressEvent } from "../academies/types.js";
import type { PriceMonitorService } from "../monitor/price-monitor-service.js";
import {
  formatDashboardMessage,
  formatLogsMessage,
  formatPricesMessage,
  formatScrapeProgressMessage,
  formatSummaryMessage,
  formatWelcomeMessage
} from "./formatters.js";

const getPublicApiUrl = (): string | null => {
  try {
    const url = new URL("/api/overview", env.APP_BASE_URL);
    const blockedHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (blockedHosts.has(url.hostname.toLowerCase())) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

const localApiUrl = new URL("/api/overview", env.APP_BASE_URL).toString();

const buildMenu = () => {
  const rows: Array<Array<InlineKeyboardButton & { hide?: boolean }>> = [
    [Markup.button.callback("💸 Planos e preços", "prices")],
    [Markup.button.callback("📊 Dashboard", "status")],
    [Markup.button.callback("🧾 Logs", "logs")],
    [Markup.button.callback("🚀 Rodar varredura", "scrape")]
  ];
  const publicApiUrl = getPublicApiUrl();

  if (publicApiUrl) {
    rows.push([Markup.button.url("🌐 Abrir API", publicApiUrl)]);
  }

  return Markup.inlineKeyboard(rows);
};

const menu = buildMenu();

const htmlReply = {
  parse_mode: "HTML" as const
};

const htmlMenuReply = {
  ...htmlReply,
  ...menu
};

const SCRAPE_PROGRESS_TRANSITION_DELAY_MS = 2_000;

const sleep = async (durationMs: number): Promise<void> => {
  if (durationMs <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

export class TelegramDashboardBot {
  private bot: Telegraf | null = null;

  constructor(private readonly monitor: PriceMonitorService) {}

  async start(): Promise<void> {
    if (!env.TELEGRAM_BOT_TOKEN) {
      logger.warn("Token do Telegram ausente. Bot não será iniciado.");
      return;
    }

    this.bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

    this.bot.command("start", async (ctx) => {
      await this.withAuthorizedChat(ctx, async () => {
        await ctx.reply(
          formatWelcomeMessage(getPublicApiUrl(), localApiUrl),
          htmlMenuReply
        );
      });
    });

    this.bot.command("precos", async (ctx) => {
      await this.withAuthorizedChat(ctx, async () => {
        const snapshot = await this.monitor.getSnapshot();
        await ctx.reply(formatPricesMessage(snapshot), htmlMenuReply);
      });
    });

    this.bot.command("status", async (ctx) => {
      await this.withAuthorizedChat(ctx, async () => {
        const snapshot = await this.monitor.getSnapshot();
        await ctx.reply(formatDashboardMessage(snapshot, this.monitor.isRunning()), htmlMenuReply);
      });
    });

    this.bot.command("logs", async (ctx) => {
      await this.withAuthorizedChat(ctx, async () => {
        const snapshot = await this.monitor.getSnapshot();
        await ctx.reply(formatLogsMessage(snapshot), htmlMenuReply);
      });
    });

    this.bot.command("varrer", async (ctx) => {
      await this.withAuthorizedChat(ctx, async (chatId) => {
        await this.runScrapeWithFeedback(ctx, chatId);
      });
    });

    this.bot.action("prices", async (ctx) => {
      await this.withAuthorizedChat(
        ctx,
        async () => {
          const snapshot = await this.monitor.getSnapshot();
          await ctx.answerCbQuery("Painel de preços atualizado.");
          await ctx.reply(formatPricesMessage(snapshot), htmlMenuReply);
        },
        true
      );
    });

    this.bot.action("status", async (ctx) => {
      await this.withAuthorizedChat(
        ctx,
        async () => {
          const snapshot = await this.monitor.getSnapshot();
          await ctx.answerCbQuery("Dashboard atualizada.");
          await ctx.reply(formatDashboardMessage(snapshot, this.monitor.isRunning()), htmlMenuReply);
        },
        true
      );
    });

    this.bot.action("logs", async (ctx) => {
      await this.withAuthorizedChat(
        ctx,
        async () => {
          const snapshot = await this.monitor.getSnapshot();
          await ctx.answerCbQuery("Eventos carregados.");
          await ctx.reply(formatLogsMessage(snapshot), htmlMenuReply);
        },
        true
      );
    });

    this.bot.action("scrape", async (ctx) => {
      await this.withAuthorizedChat(
        ctx,
        async (chatId) => {
          await ctx.answerCbQuery("Acompanhando a varredura.");
          await this.runScrapeWithFeedback(ctx, chatId);
        },
        true
      );
    });

    this.bot.catch((error) => {
      logger.error("Erro no bot do Telegram.", error);
    });

    await this.bot.launch();

    process.once("SIGINT", () => this.bot?.stop("SIGINT"));
    process.once("SIGTERM", () => this.bot?.stop("SIGTERM"));

    logger.info("Bot do Telegram em polling.");
  }

  private isAllowed(chatId: number): boolean {
    if (env.TELEGRAM_ALLOWED_CHAT_IDS.length === 0) {
      return true;
    }

    return env.TELEGRAM_ALLOWED_CHAT_IDS.includes(String(chatId));
  }

  private async withAuthorizedChat(
    ctx: Context,
    handler: (chatId: number) => Promise<void>,
    answerCallbackOnUnauthorized = false
  ): Promise<void> {
    const chatId = ctx.chat?.id;

    if (!chatId) {
      return;
    }

    if (!this.isAllowed(chatId)) {
      if (answerCallbackOnUnauthorized && "answerCbQuery" in ctx) {
        await ctx.answerCbQuery("Chat não autorizado.");
      }

      return;
    }

    await handler(chatId);
  }

  private async runScrapeWithFeedback(ctx: Context, chatId: number): Promise<void> {
    const initialText = [
      "<b>⏳ Preparando a varredura</b>",
      "Vou te atualizando por aqui enquanto o robô navega pelos sites."
    ].join("\n");
    const progressMessage = await ctx.reply(initialText, htmlReply);
    let lastProgressText = initialText;
    let lastQueuedText = initialText;
    let lastProgressRenderAt = Date.now();
    let progressUpdateQueue: Promise<void> = Promise.resolve();

    const waitForTransitionDelay = async (): Promise<void> => {
      const remainingDelay =
        SCRAPE_PROGRESS_TRANSITION_DELAY_MS - (Date.now() - lastProgressRenderAt);

      if (remainingDelay > 0) {
        await sleep(remainingDelay);
      }
    };

    const flushProgressUpdates = async (): Promise<void> => {
      await progressUpdateQueue;
    };

    const waitForReadableProgress = async (): Promise<void> => {
      await flushProgressUpdates();
      await waitForTransitionDelay();
    };

    const updateProgressMessage = (event: ScrapeProgressEvent): void => {
      const nextText = formatScrapeProgressMessage(event);

      if (nextText === lastQueuedText) {
        return;
      }

      lastQueuedText = nextText;
      progressUpdateQueue = progressUpdateQueue
        .then(async () => {
          if (nextText === lastProgressText) {
            return;
          }

          await waitForTransitionDelay();

          try {
            await ctx.telegram.editMessageText(
              chatId,
              progressMessage.message_id,
              undefined,
              nextText,
              htmlReply
            );
            lastProgressText = nextText;
            lastProgressRenderAt = Date.now();
          } catch (error) {
            if (this.isIgnorableEditError(error)) {
              lastProgressText = nextText;
              lastProgressRenderAt = Date.now();
              return;
            }

            logger.warn("Não foi possível atualizar a mensagem de progresso no Telegram.", error);
          }
        })
        .catch((error) => {
          logger.warn("Falha ao sincronizar a fila de progresso da varredura.", error);
        });
    };

    try {
      const summary = await this.monitor.runScrape(`telegram:${chatId}`, {
        onProgress: updateProgressMessage
      });

      await waitForReadableProgress();
      await ctx.reply(formatSummaryMessage(summary), htmlMenuReply);
    } catch (error) {
      logger.error("Erro ao executar varredura via Telegram.", error);

      await flushProgressUpdates();

      try {
        await ctx.telegram.editMessageText(
          chatId,
          progressMessage.message_id,
          undefined,
          [
            "<b>⚠️ Não foi possível concluir a varredura</b>",
            "O processo encontrou um erro inesperado antes de finalizar.",
            "Você pode tentar novamente pelo menu logo abaixo."
          ].join("\n"),
          htmlReply
        );
      } catch (editError) {
        if (!this.isIgnorableEditError(editError)) {
          logger.warn("Não foi possível atualizar a mensagem de falha da varredura.", editError);
        }
      }

      await ctx.reply(
        [
          "<b>⚠️ A varredura falhou</b>",
          "Use o menu abaixo para tentar novamente ou consultar os logs mais recentes."
        ].join("\n"),
        htmlMenuReply
      );
    }
  }

  private isIgnorableEditError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("message is not modified");
  }
}
