/** Server bootstrap. */

import { createApp } from "./app.js";
import { getSettings, usingPostgres, usingRedis } from "./config.js";
import { getStore } from "./db.js";

async function main(): Promise<void> {
  const settings = getSettings();
  // Eagerly initialize the store so schema creation failures surface at boot.
  await getStore();

  const app = createApp();
  app.listen(settings.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `AI Project Detector (node) listening on :${settings.port} ` +
        `[store=${usingPostgres() ? "postgres" : "sqlite"}, ` +
        `queue=${usingRedis() ? "redis/bullmq" : "in-process"}]`,
    );
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});
