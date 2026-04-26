import { Builder, type WebDriver } from "selenium-webdriver";
import * as chrome from "selenium-webdriver/chrome.js";

import { env } from "../../config/env.js";

export const createChromeDriver = async (): Promise<WebDriver> => {
  const options = new chrome.Options();
  const runHeadless = env.SCRAPER_SHOW_BROWSER ? false : env.SCRAPER_HEADLESS;

  if (runHeadless) {
    options.addArguments("--headless=new");
  }

  options.addArguments(
    "--window-size=1440,1200",
    "--lang=pt-BR",
    "--disable-gpu",
    "--disable-accelerated-video-decode",
    "--disable-accelerated-2d-canvas",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--mute-audio",
    "--hide-crash-restore-bubble",
    "--no-sandbox"
  );
  options.excludeSwitches("enable-logging");

  if (env.CHROME_BINARY_PATH) {
    options.setChromeBinaryPath(env.CHROME_BINARY_PATH);
  }

  return new Builder()
    .forBrowser(env.SCRAPER_BROWSER)
    .setChromeOptions(options)
    .build();
};
