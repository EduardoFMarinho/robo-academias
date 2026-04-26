import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ quiet: true });

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
};

const toOptionalString = (value: string | undefined): string => {
  return value?.trim() ?? "";
};

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_HOST: z.string().default("0.0.0.0"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_AUTH_TOKEN: z.string().optional().transform(toOptionalString),
  TELEGRAM_BOT_TOKEN: z.string().optional().transform(toOptionalString),
  TELEGRAM_ALLOWED_CHAT_IDS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
    ),
  SCRAPER_SHOW_BROWSER: z.string().optional().transform((value) => toBoolean(value, false)),
  SCRAPER_HEADLESS: z.string().optional().transform((value) => toBoolean(value, true)),
  SCRAPER_STEP_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  SCRAPER_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  SCRAPER_BROWSER: z.enum(["chrome"]).default("chrome"),
  CHROME_BINARY_PATH: z.string().optional().transform(toOptionalString),
  SCRAPE_ON_START: z.string().optional().transform((value) => toBoolean(value, false)),
  SCRAPE_SCHEDULE: z.string().default("*/30 * * * *"),
  SMARTFIT_SOURCE_URL: z.string().url().default("https://www.smartfit.com.br/planos"),
  BLUEFIT_SOURCE_URL: z
    .string()
    .url()
    .default("https://www.bluefit.com.br/unidade/aclimacao"),
  DATA_DIR: z.string().default("data"),
  LOG_RETENTION_LIMIT: z.coerce.number().int().positive().default(25),
  APP_TIMEZONE: z.string().default("America/Sao_Paulo")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const formatted = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Falha ao validar variaveis de ambiente:\n${formatted}`);
}

export const env = parsedEnv.data;
