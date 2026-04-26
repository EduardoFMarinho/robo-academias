import path from "node:path";
import { promises as fs } from "node:fs";

import { By, until, type WebDriver } from "selenium-webdriver";

import { env } from "../../config/env.js";
import { appPaths, toProjectRelativePath } from "../../shared/fs.js";
import { logger } from "../../shared/logger.js";
import { extractPlansFromText } from "./plan-parsers.js";
import { collectPriceMatches, pickBestPrice } from "./price-parser.js";
import { createChromeDriver } from "./selenium-driver.js";
import type { GymDefinition, ScrapeOutcome } from "./types.js";

const STABILIZATION_DELAY_MS = 1500;

export class SeleniumPriceScraper {
  async scrape(gym: GymDefinition): Promise<ScrapeOutcome> {
    const checkedAt = new Date().toISOString();
    let driver: WebDriver | null = null;

    try {
      driver = await createChromeDriver();
      const browser = driver;

      logger.info(`Abrindo pagina de ${gym.name}`, { url: gym.sourceUrl });

      await browser.get(gym.sourceUrl);
      await browser.wait(until.elementLocated(By.css("body")), env.SCRAPER_TIMEOUT_MS);
      await browser.wait(async () => {
        const state = String(await browser.executeScript("return document.readyState"));
        return state === "interactive" || state === "complete";
      }, env.SCRAPER_TIMEOUT_MS);

      await this.waitForKeywords(browser, gym.keywordWaitHints);
      await browser.sleep(STABILIZATION_DELAY_MS);
      await this.debugPause(browser, "after-page-load");

      const bodyText = await this.readBodyText(browser);
      const parsedPlans = extractPlansFromText(gym, bodyText);
      const detectedPrices = collectPriceMatches(bodyText);
      const primaryPlan = parsedPlans.find((plan) => plan.headlinePrice) ?? parsedPlans[0] ?? null;

      if (primaryPlan?.headlinePrice) {
        await this.debugPause(browser, "before-returning-plan-results");

        return {
          gymId: gym.id,
          gymName: gym.name,
          sourceUrl: gym.sourceUrl,
          status: "ok",
          currentPrice: primaryPlan.headlinePrice,
          currentPlanName: primaryPlan.name,
          detectedPrices,
          plans: parsedPlans,
          sourceHint: `plans:${gym.planParser}`,
          checkedAt,
          screenshotPath: null
        };
      }

      const selectorAttempt = await this.extractFromSelectors(browser, gym);

      if (selectorAttempt.currentPrice) {
        await this.debugPause(browser, "before-returning-selector-results");

        return {
          gymId: gym.id,
          gymName: gym.name,
          sourceUrl: gym.sourceUrl,
          status: "ok",
          currentPrice: selectorAttempt.currentPrice,
          currentPlanName: primaryPlan?.name ?? null,
          detectedPrices: selectorAttempt.detectedPrices.length > 0 ? selectorAttempt.detectedPrices : detectedPrices,
          plans: parsedPlans,
          sourceHint: selectorAttempt.sourceHint,
          checkedAt,
          screenshotPath: null
        };
      }
      const bodyAttempt = pickBestPrice(bodyText, gym.anchorPhrases);

      if (bodyAttempt.currentPrice) {
        await this.debugPause(browser, "before-returning-fallback-results");

        return {
          gymId: gym.id,
          gymName: gym.name,
          sourceUrl: gym.sourceUrl,
          status: "ok",
          currentPrice: bodyAttempt.currentPrice,
          currentPlanName: primaryPlan?.name ?? null,
          detectedPrices: bodyAttempt.detectedPrices.length > 0 ? bodyAttempt.detectedPrices : detectedPrices,
          plans: parsedPlans,
          sourceHint: `body:${bodyAttempt.sourceHint ?? "text"}`,
          checkedAt,
          screenshotPath: null
        };
      }

      throw new Error(`Nenhum preco foi encontrado para ${gym.name}.`);
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

  private async waitForKeywords(driver: WebDriver, keywords: string[]): Promise<void> {
    if (keywords.length === 0) {
      return;
    }

    await driver
      .wait(async () => {
        const bodyText = await this.readBodyText(driver);
        const normalized = bodyText.toLowerCase();

        return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
      }, Math.min(env.SCRAPER_TIMEOUT_MS, 12000))
      .catch(() => undefined);
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

  private async extractFromSelectors(
    driver: WebDriver,
    gym: GymDefinition
  ): Promise<{
    currentPrice: string | null;
    detectedPrices: string[];
    sourceHint: string | null;
  }> {
    const collectedMatches = new Set<string>();

    for (const selector of gym.selectorCandidates) {
      const elements = await driver.findElements(By.css(selector));

      for (const element of elements.slice(0, 10)) {
        const text = (await element.getText()).trim();

        if (!text) {
          continue;
        }

        const attempt = pickBestPrice(text, gym.anchorPhrases);

        for (const price of collectPriceMatches(text)) {
          collectedMatches.add(price);
        }

        if (attempt.currentPrice) {
          return {
            currentPrice: attempt.currentPrice,
            detectedPrices: attempt.detectedPrices.length > 0 ? attempt.detectedPrices : [...collectedMatches],
            sourceHint: `css:${selector}:${attempt.sourceHint ?? "match"}`
          };
        }
      }
    }

    return {
      currentPrice: null,
      detectedPrices: [...collectedMatches],
      sourceHint: null
    };
  }

  private async readBodyText(driver: WebDriver): Promise<string> {
    const text = await driver.executeScript("return document.body ? document.body.innerText : ''");

    return String(text ?? "");
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
