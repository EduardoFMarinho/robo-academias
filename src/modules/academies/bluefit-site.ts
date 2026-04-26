import { By, type WebDriver } from "selenium-webdriver";

import { env } from "../../config/env.js";
import type { GymDefinition, GymPlan, GymScrapeData } from "./types.js";

export const bluefitGym: GymDefinition = {
  id: "bluefit",
  name: "Bluefit",
  sourceUrl: env.BLUEFIT_SOURCE_URL
};

export const scrapeBluefit = async (driver: WebDriver): Promise<GymScrapeData> => {
  // A Bluefit exibe mais cards, mas a ideia e a mesma: XPath direto para cada campo.
  const xpaths = [
    {
      title: '(//div[contains(@class,"xano_plano-template")])[1]//h5',
      price: '(//div[contains(@class,"xano_plano-template")])[1]//*[contains(@class,"plano_item-pricing")]',
      monthly: '(//div[contains(@class,"xano_plano-template")])[1]//h6[contains(@class,"plan-card_main-price")]'
    },
    {
      title: '(//div[contains(@class,"xano_plano-template")])[2]//h5',
      price: '(//div[contains(@class,"xano_plano-template")])[2]//*[contains(@class,"plano_item-pricing")]',
      monthly: '(//div[contains(@class,"xano_plano-template")])[2]//h6[contains(@class,"plan-card_main-price")]'
    },
    {
      title: '(//div[contains(@class,"xano_plano-template")])[3]//h5',
      price: '(//div[contains(@class,"xano_plano-template")])[3]//*[contains(@class,"plano_item-pricing")]',
      monthly: '(//div[contains(@class,"xano_plano-template")])[3]//h6[contains(@class,"plan-card_main-price")]'
    },
    {
      title: '(//div[contains(@class,"xano_plano-template")])[4]//h5',
      price: '(//div[contains(@class,"xano_plano-template")])[4]//*[contains(@class,"plano_item-pricing")]',
      monthly: '(//div[contains(@class,"xano_plano-template")])[4]//h6[contains(@class,"plan-card_main-price")]'
    },
    {
      title: '(//div[contains(@class,"xano_plano-template")])[5]//h5',
      price: '(//div[contains(@class,"xano_plano-template")])[5]//*[contains(@class,"plano_item-pricing")]',
      monthly: '(//div[contains(@class,"xano_plano-template")])[5]//h6[contains(@class,"plan-card_main-price")]'
    }
  ];

  const plans: GymPlan[] = [];
  const detectedPrices: string[] = [];

  for (const item of xpaths) {
    const rawTitle = (await driver.findElement(By.xpath(item.title)).getText()).trim();
    const rawPrice = (await driver.findElement(By.xpath(item.price)).getText()).trim();
    const rawMonthly = (await driver.findElement(By.xpath(item.monthly)).getText()).trim();

    const titleLines = rawTitle.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const name = titleLines[titleLines.length - 1] ?? rawTitle;
    const price = rawPrice.match(/R\$\s*\d{1,4}(?:[.,]\d{2})?/)?.[0].replace(/\s+/g, " ") ?? null;

    if (price) {
      detectedPrices.push(price);
    }

    plans.push({
      name,
      headlinePrice: price,
      pricePeriod: rawPrice.includes("por mês") ? "por mês" : rawMonthly || null
    });
  }

  return {
    currentPrice: plans[0]?.headlinePrice ?? null,
    currentPlanName: plans[0]?.name ?? null,
    detectedPrices,
    plans,
    sourceHint: "xpath:bluefit"
  };
};
