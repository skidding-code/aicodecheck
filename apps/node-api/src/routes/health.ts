/** Health and metadata endpoints. Mirrors the Python API's health router. */

import { DISCLAIMER, __version__ as engineVersion } from "@aicodecheck/detector-core";
import { Router } from "express";

import { usingPostgres, usingRedis } from "../config.js";

export const API_VERSION = "0.1.0";
export const router: Router = Router();

router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    api_version: API_VERSION,
    engine_version: engineVersion,
  });
});

router.get("/", (_req, res) => {
  res.json({
    name: "AI Project Detector API",
    runtime: "node",
    api_version: API_VERSION,
    engine_version: engineVersion,
    queue: usingRedis() ? "redis" : "in-process",
    store: usingPostgres() ? "postgres" : "sqlite",
    disclaimer: DISCLAIMER,
  });
});
