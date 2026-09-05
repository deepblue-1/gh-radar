import axios from "axios";
import { createApp, type KiwoomRuntime } from "./app.js";
import { supabase } from "./services/supabase.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { createKiwoomRuntime } from "./services/kiwoom-runtime.js";
import { createRelayClient } from "./services/relay-client.js";

const config = loadConfig();

// Phase 09.1 D-17 — server 도 키움 동기 호출. 부팅 시 token sanity check.
// 실패 시 cached fallback 모드 (기존 KIS 패턴 유지).
let kiwoomRuntime: KiwoomRuntime | undefined = undefined;
try {
  kiwoomRuntime = await createKiwoomRuntime(config, supabase);
} catch (err) {
  logger.error(
    { err },
    "Kiwoom runtime init failed — /api/stocks/:code 폴백 모드 (cached only)",
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

// Phase 15 — relay 내부 HTTP 클라이언트 (D-08/D-22). 두 env 가 모두 있을 때만 만든다.
// 미설정 시 relayClient=undefined → POST /api/orders 만 503 RELAY_UNAVAILABLE.
// T-15-06: RELAY_INTERNAL_URL 이 서브넷(10.10.0.0/26) 밖이면 createRelayClient 가 throw
// 한다 — 공유 비밀이 인터넷의 임의 호스트로 나가느니 부팅에 실패하는 편이 낫다.
let relayClient = undefined;
if (config.relayInternalUrl && config.relayOrderSecret) {
  relayClient = createRelayClient({
    baseUrl: config.relayInternalUrl,
    secret: config.relayOrderSecret,
    timeoutMs: config.orderTimeoutMs,
    nodeEnv: config.nodeEnv,
  });
} else {
  logger.warn(
    "RELAY_INTERNAL_URL/RELAY_ORDER_SECRET not set — POST /api/orders will return 503",
  );
}

const app = createApp({
  supabase,
  kiwoomRuntime,
  naverClient,
  brightdataClient,
  brightdataApiKey: config.brightdataApiKey,
  brightdataZone: config.brightdataZone,
  relayClient,
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
