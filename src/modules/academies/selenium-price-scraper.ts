import path from "node:path";
import { promises as fs } from "node:fs";

import { By, until, type WebDriver } from "selenium-webdriver";

import { env } from "../../config/env.js";
import { appPaths, toProjectRelativePath } from "../../shared/fs.js";
import { logger } from "../../shared/logger.js";
import { bluefitGym, scrapeBluefit } from "./bluefit-site.js";
import { createChromeDriver } from "./selenium-driver.js";
import { scrapeSmartFit, smartFitGym } from "./smartfit-site.js";
import type { GymDefinition } from "./types.js";
import type { ScrapeOutcome } from "../monitor/types.js";

const PAGE_STABILIZATION_DELAY_MS = 1500;

export class SeleniumPriceScraper {
  async scrape(gym: GymDefinition): Promise<ScrapeOutcome> {
    const checkedAt = new Date().toISOString();
    let driver: WebDriver | null = null;

    try {
      const scrapeGym =
        gym.id === smartFitGym.id
          ? scrapeSmartFit
          : gym.id === bluefitGym.id
            ? scrapeBluefit
            : null;

      if (!scrapeGym) {
        throw new Error(`Nenhum scraper foi cadastrado para ${gym.name}.`);
      }

      driver = await createChromeDriver();

      logger.info(`Abrindo pagina de ${gym.name}`, { url: gym.sourceUrl });

      await this.openPage(driver, gym.sourceUrl);
      await this.debugPause(driver, "after-page-load");

      // Daqui para frente quem manda e o arquivo da academia.
      const data = await scrapeGym(driver);

      if (!data.currentPrice) {
        throw new Error(`Nenhum preco foi encontrado para ${gym.name}.`);
      }

      await this.debugPause(driver, "before-returning-results");

      return {
        gymId: gym.id,
        gymName: gym.name,
        sourceUrl: gym.sourceUrl,
        status: "ok",
        currentPrice: data.currentPrice,
        currentPlanName: data.currentPlanName,
        detectedPrices: data.detectedPrices,
        plans: data.plans,
        sourceHint: data.sourceHint,
        checkedAt,
        screenshotPath: null
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const screenshotPath = driver ? await this.captureScreenshot(driver, gym.id) : null;

      logger.error(`Falha ao raspar ${gym.name}`, { message, screenshotPath });

      return {
        gymId: gym.id,
        gymName: gym.name,
        sourceUrl: gym.sourceUrl,
        status: "error",
        currentPrice: null,
        currentPlanName: null,
        detectedPrices: [],
        plans: [],
        sourceHint: null,
        checkedAt,
        errorMessage: message,
        screenshotPath
      };
    } finally {
      await driver?.quit().catch(() => undefined);
    }
  }

  private async openPage(driver: WebDriver, url: string): Promise<void> {
    // Esta parte fica compartilhada para os dois robos abrirem a pagina do mesmo jeito.
    await driver.get(url);
    await driver.wait(until.elementLocated(By.xpath("//body")), env.SCRAPER_TIMEOUT_MS);
    await driver.wait(async () => {
      const state = String(await driver.executeScript("return document.readyState"));

      return state === "interactive" || state === "complete";
    }, env.SCRAPER_TIMEOUT_MS);

    await driver.sleep(PAGE_STABILIZATION_DELAY_MS);
  }

  private async debugPause(driver: WebDriver, stage: string): Promise<void> {
    if (env.SCRAPER_STEP_DELAY_MS <= 0) {
      return;
    }

    logger.info("Pausa de visualizacao do navegador.", {
      stage,
      delayMs: env.SCRAPER_STEP_DELAY_MS
    });
    await driver.sleep(env.SCRAPER_STEP_DELAY_MS);
  }

  private async captureScreenshot(driver: WebDriver, gymId: string): Promise<string | null> {
    try {
      const screenshot = await driver.takeScreenshot();
      const fileName = `${gymId}-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
      const absolutePath = path.join(appPaths.screenshotsDir, fileName);

      await fs.writeFile(absolutePath, screenshot, "base64");

      return toProjectRelativePath(absolutePath);
    } catch {
      return null;
    }
  }
}
