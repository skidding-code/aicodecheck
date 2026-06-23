/**
 * Express application factory: CORS, JSON body parsing, routers, and a central
 * error handler that maps HttpError -> status code with a `{ detail }` body
 * (wire-compatible with the FastAPI client used by the frontend).
 */

import { DISCLAIMER } from "@aicodecheck/detector-core";
import express, {
  type Application,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { ZodError } from "zod";

import { getSettings } from "./config.js";
import { HttpError } from "./security.js";
import { router as analyzeRouter } from "./routes/analyze.js";
import { router as healthRouter } from "./routes/health.js";
import { router as reportsRouter } from "./routes/reports.js";

export function createApp(): Application {
  const settings = getSettings();
  const app = express();

  app.set("trust proxy", true);

  // CORS (permissive across configured origins; methods/headers wide open).
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (settings.corsOrigins.includes(origin) || settings.corsOrigins.includes("*"))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: settings.maxSnippetBytes + 1024 * 1024 }));

  app.use(healthRouter);
  app.use(analyzeRouter);
  app.use(reportsRouter);

  // 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ detail: "Not found." });
  });

  // Central error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ detail: err.message, disclaimer: DISCLAIMER });
      return;
    }
    if (err instanceof ZodError) {
      res.status(422).json({
        detail: "Validation error.",
        errors: err.issues,
        disclaimer: DISCLAIMER,
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("[error]", err);
    const message = err instanceof Error ? err.message : "Internal server error.";
    res.status(500).json({ detail: message, disclaimer: DISCLAIMER });
  });

  return app;
}
