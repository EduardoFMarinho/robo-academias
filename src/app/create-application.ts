import { env } from "../config/env.js";
import { SeleniumPriceScraper } from "../modules/academies/selenium-price-scraper.js";
import { gymCatalog } from "../modules/academies/catalog.js";
import { PriceMonitorService } from "../modules/monitor/price-monitor-service.js";
import { FileDatabase } from "../modules/storage/file-database.js";
import { appPaths, ensureAppDirectories } from "../shared/fs.js";

export const createApplication = async () => {
  await ensureAppDirectories();

  const database = new FileDatabase(
    appPaths.dbFile,
    gymCatalog.map((gym) => ({
      id: gym.id,
      name: gym.name,
      sourceUrl: gym.sourceUrl
    }))
  );

  await database.initialize();

  const scraper = new SeleniumPriceScraper();
  const monitor = new PriceMonitorService(database, gymCatalog, scraper);

  return {
    env,
    database,
    monitor
  };
};
