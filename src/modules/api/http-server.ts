import type { Server } from "node:http";

import express, { type Request, type Response } from "express";

import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";
import type { PriceMonitorService } from "../monitor/price-monitor-service.js";

const isAuthorized = (request: Request): boolean => {
  if (!env.API_AUTH_TOKEN) {
    return true;
  }

  const headerToken = request.header("x-api-token")?.trim() ?? "";

  return headerToken === env.API_AUTH_TOKEN;
};

export const startHttpServer = async (monitor: PriceMonitorService): Promise<Server> => {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/", async (_request, response) => {
    const snapshot = await monitor.getSnapshot();

    response.json({
      name: "robo-academias",
      status: "online",
      gyms: snapshot.gyms.length,
      endpoints: ["/health", "/api/overview", "/api/gyms", "/api/logs", "/api/scrape"]
    });
  });

  app.get("/health", async (_request, response) => {
    response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      running: monitor.isRunning()
    });
  });

  app.get("/api/overview", async (_request, response) => {
    const snapshot = await monitor.getSnapshot();

    response.json({
      running: monitor.isRunning(),
      status: snapshot.status,
      gyms: snapshot.gyms,
      executions: snapshot.executions.slice(0, 10),
      logs: snapshot.logs
    });
  });

  app.get("/api/gyms", async (_request, response) => {
    const snapshot = await monitor.getSnapshot();

    response.json(snapshot.gyms);
  });

  app.get("/api/logs", async (_request, response) => {
    const snapshot = await monitor.getSnapshot();

    response.json(snapshot.logs);
  });

  app.post("/api/scrape", async (request: Request, response: Response) => {
    if (!isAuthorized(request)) {
      response.status(401).json({
        error: "Nao autorizado. Envie o cabecalho x-api-token correto."
      });
      return;
    }

    const bodyTrigger =
      typeof request.body?.trigger === "string" && request.body.trigger.trim()
        ? request.body.trigger.trim()
        : "manual";

    const summary = await monitor.runScrape(`api:${bodyTrigger}`);

    response.status(summary.reusedExistingRun ? 202 : 200).json(summary);
  });

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    logger.error("Erro nao tratado na API.", error);
    response.status(500).json({
      error: "Erro interno."
    });
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: "Rota nao encontrada."
    });
  });

  return new Promise((resolve) => {
    const server = app.listen(env.APP_PORT, env.APP_HOST, () => {
      logger.info("API HTTP pronta.", {
        host: env.APP_HOST,
        port: env.APP_PORT,
        baseUrl: env.APP_BASE_URL
      });
      resolve(server);
    });
  });
};
