import { promises as fs } from "node:fs";

import { createInitialDatabase, databaseSchema, type AppDatabase, type GymSeed } from "./schema.js";

export class FileDatabase {
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(
    private readonly filePath: string,
    private readonly gymSeeds: GymSeed[]
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await fs.access(this.filePath);
      const current = await this.read();
      const merged = this.ensureGymSeeds(current);

      await this.write(merged);
    } catch {
      await this.write(createInitialDatabase(this.gymSeeds));
    }

    this.initialized = true;
  }

  async read(): Promise<AppDatabase> {
    const raw = await fs.readFile(this.filePath, "utf-8");
    const parsed = databaseSchema.parse(JSON.parse(raw));

    return this.ensureGymSeeds(parsed);
  }

  async write(database: AppDatabase): Promise<void> {
    const payload = databaseSchema.parse({
      ...database,
      meta: {
        ...database.meta,
        updatedAt: new Date().toISOString()
      }
    });

    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf-8");
  }

  async mutate<T>(updater: (database: AppDatabase) => Promise<T> | T): Promise<T> {
    let result!: T;

    this.writeQueue = this.writeQueue.then(async () => {
      const current = await this.read();
      result = await updater(current);
      await this.write(current);
    });

    await this.writeQueue;

    return result;
  }

  private ensureGymSeeds(database: AppDatabase): AppDatabase {
    const knownIds = new Set(database.gyms.map((gym) => gym.id));

    for (const seed of this.gymSeeds) {
      if (knownIds.has(seed.id)) {
        const gym = database.gyms.find((entry) => entry.id === seed.id);

        if (gym) {
          gym.name = seed.name;
          gym.sourceUrl = seed.sourceUrl;
        }

        continue;
      }

      database.gyms.push({
        id: seed.id,
        name: seed.name,
        sourceUrl: seed.sourceUrl,
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
      });
    }

    return database;
  }
}
