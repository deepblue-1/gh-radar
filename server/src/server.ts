import axios from "axios";
import { createApp, type KiwoomRuntime } from "./app.js";
import { supabase } from "./services/supabase.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { createKiwoomRuntime } from "./services/kiwoom-runtime.js";
import { createRelayAdminClient, type RelayAdminClient } from "./services/relay-admin-client.js";

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

// Phase 16 Plan 16 — 주문 접수용 relay 결선은 제거됐다 (D-02). 주문 접수는 relay wss 전용이고
// `/api/orders` 는 Supabase 만 읽으므로 relay 가 내려가도 오늘 주문 목록은 계속 나온다.
//
// Phase 29 D-07 — **Admin 명령만** relay 내부 HTTP(8091)를 다시 부른다. 두 env 가 다 있을 때만 만든다.
// 가드(assertRelayUrl) 실패는 여기서 throw → 부팅 실패: 공유 비밀이 사설 대역 밖으로 나가는 것보다 안 뜨는 편이 낫다.
let relayAdmin: RelayAdminClient | undefined = undefined;
if (config.relayInternalUrl && config.relayOrderSecret) {
  relayAdmin = createRelayAdminClient({
    baseUrl: config.relayInternalUrl,
    secret: config.relayOrderSecret,
    timeoutMs: config.relayAdminTimeoutMs,
    nodeEnv: config.nodeEnv,
  });
} else {
  logger.warn(
    {
      relayInternalUrlSet: Boolean(config.relayInternalUrl),
      relayOrderSecretSet: Boolean(config.relayOrderSecret),
    },
    "RELAY_INTERNAL_URL/RELAY_ORDER_SECRET not set — Admin 즉시 반영 통보 꺼짐 · DMA 프록시 라우트 503",
  );
}

const app = createApp({
  supabase,
  kiwoomRuntime,
  naverClient,
  brightdataClient,
  brightdataApiKey: config.brightdataApiKey,
  brightdataZone: config.brightdataZone,
  relayAdmin,
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
