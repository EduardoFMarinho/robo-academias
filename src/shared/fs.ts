import path from "node:path";
import { promises as fs } from "node:fs";

import { env } from "../config/env.js";

const rootDir = process.cwd();
const dataDir = path.resolve(rootDir, env.DATA_DIR);
const screenshotsDir = path.join(dataDir, "screenshots");
const dbFile = path.join(dataDir, "db.json");

export const appPaths = {
  rootDir,
  dataDir,
  screenshotsDir,
  dbFile
};

export const ensureAppDirectories = async (): Promise<void> => {
  await fs.mkdir(appPaths.dataDir, { recursive: true });
  await fs.mkdir(appPaths.screenshotsDir, { recursive: true });
};

export const toProjectRelativePath = (absolutePath: string): string => {
  return path.relative(appPaths.rootDir, absolutePath).replace(/\\/g, "/");
};
