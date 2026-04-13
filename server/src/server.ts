import { createApp } from "./app.js";
import { supabase } from "./services/supabase.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ supabase });

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
