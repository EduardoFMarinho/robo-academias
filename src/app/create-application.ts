import { env } from "../config/env.js";
import { bluefitGym } from "../modules/academies/bluefit-site.js";
import { SeleniumPriceScraper } from "../modules/academies/selenium-price-scraper.js";
import { smartFitGym } from "../modules/academies/smartfit-site.js";
import { PriceMonitorService } from "../modules/monitor/price-monitor-service.js";
import { FileDatabase } from "../modules/storage/file-database.js";
import { appPaths, ensureAppDirectories } from "../shared/fs.js";

export const createApplication = async () => {
  await ensureAppDirectories();

  // Estas sao as academias monitoradas hoje. Nao dependemos mais de um catalogo separado.
  const gyms = [smartFitGym, bluefitGym];

  const database = new FileDatabase(
    appPaths.dbFile,
    gyms.map((gym) => ({
      id: gym.id,
      name: gym.name,
      sourceUrl: gym.sourceUrl
    }))
  );

  await database.initialize();

  const scraper = new SeleniumPriceScraper();
  const monitor = new PriceMonitorService(database, gyms, scraper);

  return {
    env,
    database,
    monitor
  };
};
