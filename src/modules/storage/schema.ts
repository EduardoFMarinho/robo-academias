import { z } from "zod";

const gymPlanSchema = z.object({
  name: z.string(),
  headlinePrice: z.string().nullable(),
  pricePeriod: z.string().nullable()
});

const gymStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceUrl: z.string().url(),
  status: z.enum(["unknown", "ok", "error"]),
  currentPrice: z.string().nullable(),
  currentPlanName: z.string().nullable().default(null),
  detectedPrices: z.array(z.string()),
  plans: z.array(gymPlanSchema).default([]),
  sourceHint: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  lastSuccessfulCheckAt: z.string().nullable(),
  lastError: z.string().nullable(),
  screenshotPath: z.string().nullable(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative()
});

const executionSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "success", "partial", "error"]),
  successfulGyms: z.number().int().nonnegative(),
  failedGyms: z.number().int().nonnegative(),
  note: z.string().nullable()
});

const logEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(["info", "error"]),
  message: z.string(),
  context: z.record(z.string(), z.unknown()).nullable()
});

export const databaseSchema = z.object({
  meta: z.object({
    version: z.union([z.literal(1), z.literal(2)]).default(2),
    createdAt: z.string(),
    updatedAt: z.string()
  }),
  status: z.object({
    totalRuns: z.number().int().nonnegative(),
    successfulRuns: z.number().int().nonnegative(),
    failedRuns: z.number().int().nonnegative(),
    partialRuns: z.number().int().nonnegative(),
    lastRunAt: z.string().nullable(),
    lastRunStatus: z.enum(["never", "running", "success", "partial", "error"]),
    lastTrigger: z.string().nullable()
  }),
  executions: z.array(executionSchema),
  gyms: z.array(gymStateSchema),
  logs: z.array(logEntrySchema)
});

export type AppDatabase = z.infer<typeof databaseSchema>;
export type DatabaseLogEntry = z.infer<typeof logEntrySchema>;
export type GymState = z.infer<typeof gymStateSchema>;
export type ExecutionState = z.infer<typeof executionSchema>;
export type GymPlanState = z.infer<typeof gymPlanSchema>;

export interface GymSeed {
  id: string;
  name: string;
  sourceUrl: string;
}

export const createInitialDatabase = (gyms: GymSeed[]): AppDatabase => {
  const now = new Date().toISOString();

  return {
    meta: {
      version: 2,
      createdAt: now,
      updatedAt: now
    },
    status: {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      partialRuns: 0,
      lastRunAt: null,
      lastRunStatus: "never",
      lastTrigger: null
    },
    executions: [],
    gyms: gyms.map((gym) => ({
      id: gym.id,
      name: gym.name,
      sourceUrl: gym.sourceUrl,
      status: "unknown",
      currentPrice: null,
      currentPlanName: null,
      detectedPrices: [],
      plans: [],
      sourceHint: null,
      lastCheckedAt: null,
      lastSuccessfulCheckAt: null,
      lastError: null,
      screenshotPath: null,
      successCount: 0,
      failureCount: 0
    })),
    logs: []
  };
};
