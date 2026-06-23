/**
 * Report retrieval, job status, history, repository lookup, and detector listing.
 * Mirrors the Python API's reports router.
 */

import { DISCLAIMER, registered } from "@aicodecheck/detector-core";
import { Router } from "express";
import { z } from "zod";

import { getStore, type AnalysisRecord } from "../db.js";
import { HttpError } from "../security.js";
import { asyncHandler } from "./helpers.js";

export const router: Router = Router();

function toHistoryItem(a: AnalysisRecord) {
  return {
    id: a.id,
    kind: a.kind,
    target_name: a.target_name,
    classification: a.classification,
    ai_probability: a.ai_probability,
    confidence: a.confidence,
    created_at: a.created_at,
  };
}

router.get(
  "/report/:id",
  asyncHandler(async (req, res) => {
    const store = await getStore();
    const a = await store.getAnalysis(req.params.id);
    if (!a) throw new HttpError(404, "Report not found.");
    res.json(a.report);
  }),
);

router.get(
  "/analysis/:id",
  asyncHandler(async (req, res) => {
    const store = await getStore();
    const a = await store.getAnalysis(req.params.id);
    if (a) {
      res.json({ status: "finished", report: a.report });
      return;
    }
    const job = await store.getJob(req.params.id);
    if (job) {
      res.json({
        status: job.status,
        progress: job.progress,
        error: job.error,
        report: null,
      });
      return;
    }
    throw new HttpError(404, "No analysis or job with that id.");
  }),
);

router.get(
  "/jobs/:id",
  asyncHandler(async (req, res) => {
    const store = await getStore();
    const job = await store.getJob(req.params.id);
    if (!job) throw new HttpError(404, "Job not found.");
    const analysis = await store.getAnalysis(req.params.id);
    res.json({
      id: job.id,
      status: job.status,
      kind: job.kind,
      target: job.target,
      progress: job.progress,
      error: job.error,
      analysis_id: analysis ? analysis.id : null,
    });
  }),
);

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  owner: z.string().nullish(),
});

router.get(
  "/history",
  asyncHandler(async (req, res) => {
    const q = historyQuery.parse(req.query);
    const store = await getStore();
    const rows = await store.listHistory({ limit: q.limit, owner: q.owner ?? null });
    res.json(rows);
  }),
);

router.get(
  "/history/:owner",
  asyncHandler(async (req, res) => {
    const q = historyQuery.parse(req.query);
    const store = await getStore();
    const rows = await store.listHistory({ limit: q.limit, owner: req.params.owner });
    res.json(rows);
  }),
);

router.get(
  "/repository/:owner/:repo",
  asyncHandler(async (req, res) => {
    const store = await getStore();
    const rows = await store.findRepositoryAnalyses(
      req.params.owner,
      req.params.repo,
    );
    if (!rows.length) throw new HttpError(404, "No analyses for that repository yet.");
    res.json({
      owner: req.params.owner,
      repo: req.params.repo,
      latest: rows[0]!.report,
      history: rows.map(toHistoryItem),
      disclaimer: DISCLAIMER,
    });
  }),
);

router.get("/detectors", (_req, res) => {
  const detectors = Array.from(registered().entries()).map(([name, cls]) => ({
    name,
    description: new cls().description,
  }));
  res.json({ detectors, disclaimer: DISCLAIMER });
});
