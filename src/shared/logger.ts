import { inspect } from "node:util";

type Level = "INFO" | "WARN" | "ERROR";

const stringifyMeta = (meta?: unknown): string => {
  if (meta === undefined) {
    return "";
  }

  return ` ${inspect(meta, { depth: 6, colors: false, compact: true })}`;
};

const log = (level: Level, message: string, meta?: unknown): void => {
  const line = `[${new Date().toISOString()}] ${level} ${message}${stringifyMeta(meta)}`;

  if (level === "ERROR") {
    console.error(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info: (message: string, meta?: unknown) => log("INFO", message, meta),
  warn: (message: string, meta?: unknown) => log("WARN", message, meta),
  error: (message: string, meta?: unknown) => log("ERROR", message, meta)
};
