import { By, type WebDriver } from "selenium-webdriver";

import { env } from "../../config/env.js";
import type { GymDefinition, GymPlan, GymScrapeData } from "./types.js";

export const smartFitGym: GymDefinition = {
  id: "smartfit",
  name: "Smart Fit",
  sourceUrl: env.SMARTFIT_SOURCE_URL
};

export const scrapeSmartFit = async (driver: WebDriver): Promise<GymScrapeData> => {
  // Cada item aponta direto para o titulo, preco e mensalidade de um card.
  const xpaths = [
    {
      title: '//*[@id="plans-carousel"]/div[1]/div/div[1]//h2',
      price: '(//*[@id="plans-carousel"]/div[1]/div/div[1]//*[contains(@class,"smart-ui-plan-card__old-price")])[1]',
      monthly: '(//*[@id="plans-carousel"]/div[1]/div/div[1]//*[contains(@class,"smart-ui-plan-card__installments-disclaimer")])[1]'
    },
    {
      title: '//*[@id="plans-carousel"]/div[1]/div/div[2]//h2',
      price: '(//*[@id="plans-carousel"]/div[1]/div/div[2]//*[contains(@class,"smart-ui-plan-card__old-price")])[1]',
      monthly: '(//*[@id="plans-carousel"]/div[1]/div/div[2]//*[contains(@class,"smart-ui-plan-card__installments-disclaimer")])[1]'
    },
    {
      title: '//*[@id="plans-carousel"]/div[1]/div/div[3]//h2',
      price: '(//*[@id="plans-carousel"]/div[1]/div/div[3]//*[contains(@class,"smart-ui-plan-card__old-price")])[1]',
      monthly: '(//*[@id="plans-carousel"]/div[1]/div/div[3]//*[contains(@class,"smart-ui-plan-card__installments-disclaimer")])[1]'
    }
  ];

  const plans: GymPlan[] = [];
  const detectedPrices: string[] = [];

  for (const item of xpaths) {
    const title = (await driver.findElement(By.xpath(item.title)).getText()).trim();
    const price = (await driver.findElement(By.xpath(item.price)).getText()).trim();
    const monthly = (await driver.findElement(By.xpath(item.monthly)).getText()).trim();

    if (price) {
      detectedPrices.push(price);
    }

    plans.push({
      name: title,
      headlinePrice: price || null,
      pricePeriod: monthly.includes("/mês") ? "/mês" : null
    });
  }

  return {
    currentPrice: plans[0]?.headlinePrice ?? null,
    currentPlanName: plans[0]?.name ?? null,
    detectedPrices,
    plans,
    sourceHint: "xpath:smartfit"
  };
};
