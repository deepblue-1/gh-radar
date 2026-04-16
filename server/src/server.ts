import { createApp } from "./app.js";
import { supabase } from "./services/supabase.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { createKisRuntime } from "./services/kis-runtime.js";

const config = loadConfig();

let kisClient = undefined;
try {
  kisClient = await createKisRuntime(config, supabase);
} catch (err) {
  logger.error(
    { err },
    "KIS runtime init failed — /api/stocks/:code 폴백 모드 (cached only)",
  );
}

const app = createApp({ supabase, kisClient });

app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.nodeEnv,
      version: config.appVersion,
    },
    "gh-radar-server listening",
  );
});

// Graceful shutdown (Cloud Run SIGTERM)
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    logger.info({ signal: sig }, "shutting down");
    process.exit(0);
  });
}
