import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { deflateRawSync } from "node:zlib";

import { createApp } from "./app.js";
import { resetSettings } from "./config.js";
import { resetStore, useInMemoryStore } from "./db.js";
import { drainQueue } from "./queue.js";
import { resetRateLimit } from "./security.js";

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  // Force zero-infra defaults and an in-memory store.
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
  process.env.RATE_LIMIT_PER_MINUTE = "1000";
  resetSettings();
  await useInMemoryStore();
  app = createApp();
});

afterAll(async () => {
  await resetStore();
});

beforeEach(() => {
  resetRateLimit();
});

describe("healthz", () => {
  it("returns ok with versions", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.api_version).toBeTruthy();
    expect(res.body.engine_version).toBeTruthy();
  });

  it("root reports queue and store backends + disclaimer", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.queue).toBe("in-process");
    expect(res.body.store).toBe("sqlite");
    expect(res.body.disclaimer).toBeTruthy();
  });
});

describe("analyze-snippet", () => {
  it("returns a probability, classification and disclaimer", async () => {
    const code = `function add(a, b) {\n  // Adds two numbers together.\n  return a + b;\n}\n`;
    const res = await request(app)
      .post("/analyze-snippet")
      .send({ code, filename: "add.js" });
    expect(res.status).toBe(200);
    expect(typeof res.body.overall_ai_probability).toBe("number");
    expect(res.body.overall_ai_probability).toBeGreaterThanOrEqual(0);
    expect(res.body.overall_ai_probability).toBeLessThanOrEqual(1);
    expect(res.body.classification).toBeTruthy();
    expect(res.body.disclaimer).toBeTruthy();
    expect(res.body.id).toBeTruthy();
  });

  it("persists the report so /report/:id and /history work", async () => {
    const res = await request(app)
      .post("/analyze-snippet")
      .send({ code: "print('hello world')\n", filename: "x.py" });
    const id = res.body.id as string;

    const report = await request(app).get(`/report/${id}`);
    expect(report.status).toBe(200);
    expect(report.body.id).toBe(id);

    const history = await request(app).get("/history");
    expect(history.status).toBe(200);
    expect(Array.isArray(history.body)).toBe(true);
    expect(history.body.some((h: { id: string }) => h.id === id)).toBe(true);
  });
});

describe("detectors", () => {
  it("lists registered detectors", async () => {
    const res = await request(app).get("/detectors");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.detectors)).toBe(true);
    expect(res.body.detectors.length).toBeGreaterThan(0);
    expect(res.body.detectors[0].name).toBeTruthy();
    expect(res.body.detectors[0].description).toBeTruthy();
  });
});

describe("ssrf guard", () => {
  it("rejects http://127.0.0.1 repo", async () => {
    const res = await request(app)
      .post("/analyze-repository")
      .send({ repository: "http://127.0.0.1/foo/bar" });
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/private|loopback|disallowed/i);
  });

  it("rejects localhost repo", async () => {
    const res = await request(app)
      .post("/analyze-repository")
      .send({ repository: "http://localhost:9999/foo/bar.git" });
    expect(res.status).toBe(400);
  });
});

describe("analyze-zip", () => {
  it("creates a job that completes and is retrievable", async () => {
    const zip = buildSimpleZip({
      "src/main.py": "def main():\n    print('hi')\n",
      "README.md": "# Demo\nA tiny project.\n",
    });

    const submit = await request(app)
      .post("/analyze-zip")
      .attach("file", zip, "demo.zip");
    expect(submit.status).toBe(200);
    expect(submit.body.job_id).toBeTruthy();
    expect(submit.body.status).toBe("queued");
    const jobId = submit.body.job_id as string;

    await drainQueue();

    const job = await request(app).get(`/jobs/${jobId}`);
    expect(job.status).toBe(200);
    expect(job.body.status).toBe("finished");
    expect(job.body.analysis_id).toBe(jobId);

    const analysis = await request(app).get(`/analysis/${jobId}`);
    expect(analysis.status).toBe(200);
    expect(analysis.body.status).toBe("finished");
    expect(typeof analysis.body.report.overall_ai_probability).toBe("number");
    expect(analysis.body.report.disclaimer).toBeTruthy();
  });
});

describe("validation", () => {
  it("rejects an oversized snippet (413)", async () => {
    process.env.MAX_SNIPPET_BYTES = "10";
    resetSettings();
    const res = await request(app)
      .post("/analyze-snippet")
      .send({ code: "this is way more than ten bytes", filename: "a.txt" });
    delete process.env.MAX_SNIPPET_BYTES;
    resetSettings();
    expect(res.status).toBe(413);
  });
});

// --------------------------------------------------------------------------- //
// Minimal zip builder (stored + deflate entries) so tests need no zip lib.    //
// --------------------------------------------------------------------------- //

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function buildSimpleZip(files: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method = deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const localEntry = Buffer.concat([local, nameBuf, compressed]);
    localParts.push(localEntry);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));

    offset += localEntry.length;
  }

  const centralBuf = Buffer.concat(central);
  const localBuf = Buffer.concat(localParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(localBuf.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localBuf, centralBuf, end]);
}
