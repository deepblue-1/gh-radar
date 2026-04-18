import axios from "axios";
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

// Naver Search API client — NAVER_CLIENT_ID/SECRET 미설정 시 undefined
// (graceful degradation: POST /api/stocks/:code/news/refresh 만 503 NAVER_UNAVAILABLE)
const naverClient =
  config.naverClientId && config.naverClientSecret
    ? axios.create({
        baseURL: config.naverBaseUrl,
        timeout: 15000,
        headers: {
          "X-Naver-Client-Id": config.naverClientId,
          "X-Naver-Client-Secret": config.naverClientSecret,
          Accept: "application/json",
        },
      })
    : undefined;
if (!naverClient) {
  logger.warn(
    "NAVER_CLIENT_ID/SECRET not set — POST /news/refresh will return 503",
  );
}

// Phase 08 — Bright Data Web Unlocker client (on-demand discussion refresh).
// BRIGHTDATA_API_KEY 미설정 시 brightdataClient=undefined → POST /discussions/refresh 만 503.
// T-09 (MITM): brightdataUrl 이 https 가 아니면 throw.
let brightdataClient = undefined;
if (config.brightdataApiKey) {
  if (!config.brightdataUrl.startsWith("https://")) {
    throw new Error(
      `BRIGHTDATA_URL must be https (got: ${config.brightdataUrl})`,
    );
  }
  brightdataClient = axios.create({
    baseURL: config.brightdataUrl,
    timeout: 30_000,
    headers: {
      "User-Agent": `gh-radar-server/${config.appVersion}`,
    },
  });
} else {
  logger.warn(
    "BRIGHTDATA_API_KEY not set — POST /discussions/refresh will return 503",
  );
}

const app = createApp({
  supabase,
  kisClient,
  naverClient,
  brightdataClient,
  brightdataApiKey: config.brightdataApiKey,
  brightdataZone: config.brightdataZone,
});

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
