/**
 * Analysis submission endpoints. Mirrors the Python API surface:
 *   POST /analyze-snippet, /analyze-file, /analyze-folder,
 *        /analyze-repository (async), /analyze-zip (multipart, async), /reanalyze
 */

import fs from "node:fs";

import {
  Engine,
  DISCLAIMER,
  loadSnippet,
  loadFiles,
  type AnalysisResult,
} from "@aicodecheck/detector-core";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { getSettings } from "../config.js";
import { computeCacheKey, getStore } from "../db.js";
import { enqueueRepository, enqueueZip } from "../queue.js";
import {
  HttpError,
  encryptToken,
  rateLimit,
  validateRepoReference,
  validateSnippet,
  validateUploadSize,
} from "../security.js";
import { asyncHandler, newId } from "./helpers.js";

export const router: Router = Router();
router.use(rateLimit);

const engine = new Engine();

function withDisclaimer(result: AnalysisResult): AnalysisResult {
  if (!result.disclaimer) result.disclaimer = DISCLAIMER;
  return result;
}

// --------------------------------------------------------------------------- //

const snippetSchema = z.object({
  code: z.string(),
  filename: z.string().default("snippet.txt"),
  language: z.string().nullish(),
});

router.post(
  "/analyze-snippet",
  asyncHandler(async (req, res) => {
    const body = snippetSchema.parse(req.body ?? {});
    validateSnippet(body.code);
    const scan = loadSnippet(body.code, {
      filename: body.filename,
      language: body.language ?? null,
    });
    const result = withDisclaimer(engine.analyze(scan, newId()));
    const store = await getStore();
    await store.saveAnalysis(result);
    res.json(result);
  }),
);

const fileSchema = z.object({
  filename: z.string(),
  content: z.string(),
  language: z.string().nullish(),
});

router.post(
  "/analyze-file",
  asyncHandler(async (req, res) => {
    const body = fileSchema.parse(req.body ?? {});
    validateSnippet(body.content);
    const scan = loadSnippet(body.content, {
      filename: body.filename,
      language: body.language ?? null,
    });
    scan.kind = "file";
    const result = withDisclaimer(engine.analyze(scan, newId()));
    const store = await getStore();
    await store.saveAnalysis(result);
    res.json(result);
  }),
);

const folderSchema = z.object({
  files: z.record(z.string()),
  name: z.string().default("uploaded-folder"),
  config: z.unknown().optional(),
});

router.post(
  "/analyze-folder",
  asyncHandler(async (req, res) => {
    const body = folderSchema.parse(req.body ?? {});
    const total = Object.values(body.files).reduce(
      (a, c) => a + Buffer.byteLength(c, "utf8"),
      0,
    );
    validateUploadSize(total);
    const scan = loadFiles(body.files);
    scan.name = body.name;
    const result = withDisclaimer(engine.analyze(scan, newId()));
    const store = await getStore();
    await store.saveAnalysis(result);
    res.json(result);
  }),
);

const repoSchema = z.object({
  repository: z.string(),
  token: z.string().nullish(),
  ref: z.string().nullish(),
  config: z
    .object({ max_files: z.number().int().positive().optional() })
    .partial()
    .optional(),
  async_job: z.boolean().default(true),
});

router.post(
  "/analyze-repository",
  asyncHandler(async (req, res) => {
    const body = repoSchema.parse(req.body ?? {});
    const ref = await validateRepoReference(body.repository);
    const settings = getSettings();
    const maxFiles = body.config?.max_files ?? settings.maxRepoFiles;
    const configRepr = JSON.stringify(body.config ?? {});
    const cacheKey = computeCacheKey(
      "repository",
      `${body.repository}@${body.ref ?? ""}`,
      configRepr,
    );

    const store = await getStore();

    // Serve a cached analysis when one exists and no token is involved.
    if (!body.token) {
      const cached = await store.findCached(cacheKey, settings.analysisCacheTtlSeconds);
      if (cached) {
        res.json({
          job_id: cached.id,
          status: "finished",
          message: "Returned cached analysis.",
          disclaimer: DISCLAIMER,
        });
        return;
      }
    }

    const jobId = newId();
    await store.createJob({
      id: jobId,
      kind: "repository",
      target: body.repository,
      cache_key: cacheKey,
    });
    const tokenEncrypted = body.token ? encryptToken(body.token) : null;
    await enqueueRepository({
      jobId,
      reference: body.repository,
      url: ref.url,
      tokenEncrypted,
      ref: body.ref ?? null,
      maxFiles,
      cacheKey,
    });
    res.json({
      job_id: jobId,
      status: "queued",
      message: "Analysis queued. Poll GET /jobs/{job_id} or GET /analysis/{job_id}.",
      disclaimer: DISCLAIMER,
    });
  }),
);

// Zip upload — stream to a temp file with a running size guard.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const settings = getSettings();
      fs.mkdirSync(settings.workDir, { recursive: true });
      cb(null, settings.workDir);
    },
    filename: (_req, _file, cb) => cb(null, `upload-${newId()}.zip`),
  }),
  limits: { fileSize: getSettings().maxUploadBytes },
});

router.post(
  "/analyze-zip",
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const e = err as { code?: string; message?: string };
        if (e.code === "LIMIT_FILE_SIZE") {
          next(new HttpError(413, `Upload exceeds limit (${getSettings().maxUploadBytes} bytes).`));
        } else {
          next(new HttpError(400, `Upload failed: ${e.message ?? "unknown"}`));
        }
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) throw new HttpError(400, "No 'file' field provided.");
    const store = await getStore();
    const jobId = newId();
    const cacheKey = computeCacheKey(
      "zip",
      `${file.originalname}:${file.size}`,
      "{}",
    );
    await store.createJob({
      id: jobId,
      kind: "zip",
      target: file.originalname || "upload.zip",
      cache_key: cacheKey,
    });
    await enqueueZip({ jobId, zipPath: file.path, cacheKey });
    res.json({
      job_id: jobId,
      status: "queued",
      message: "Analysis queued. Poll GET /jobs/{job_id} or GET /analysis/{job_id}.",
      disclaimer: DISCLAIMER,
    });
  }),
);

const reanalyzeSchema = z.object({ analysis_id: z.string() });

router.post(
  "/reanalyze",
  asyncHandler(async (req, res) => {
    const body = reanalyzeSchema.parse(req.body ?? {});
    const store = await getStore();
    const prior = await store.getAnalysis(body.analysis_id);
    if (!prior) throw new HttpError(404, "Analysis not found.");
    // Inputs (source text) are not retained after analysis for privacy and
    // storage reasons, so re-analysis requires re-submitting the original
    // input. This mirrors the Python API exactly.
    throw new HttpError(
      409,
      "Re-analysis requires re-submitting the original input. Inputs are not " +
        "retained after analysis for privacy and storage reasons.",
    );
    void res;
  }),
);
