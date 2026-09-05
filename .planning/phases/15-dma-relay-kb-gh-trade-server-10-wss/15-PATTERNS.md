# Phase 15: DMA 중계 서버(relay) — KB gh-trade-server 호가 10단 시세 wss 팬아웃 + 주문 릴레이 - Pattern Map

**Mapped:** 2026-09-05
**Files analyzed:** 67 (신규 55 · 수정 12)
**Analogs found:** 63 / 67 (gh-radar 57 · gh-trade 형제 저장소 6)

> **읽는 법.** 아래 「Pattern Assignments」의 코드 발췌는 전부 **실측 인용**(파일 경로 + 행 번호)이다.
> 플랜 작성자는 각 태스크의 action 에 "analog 파일 + 발췌 블록"을 그대로 붙여 넣고, 새 파일이
> 그 구조(임포트 순서 · 주석 규약 · 에러 형태 · 테스트 배치)를 따르게 하면 된다.
> gh-radar 안에 유사 선례가 없는 DMA 프로토콜 계층만 형제 저장소 `/Users/alex/repos/gh-trade`
> (C# 기준 구현)를 정본 analog 로 인용한다 — **읽기 전용, 수정 대상 아님**(D-38).

---

## File Classification

### Tier A — `relay/` 워크스페이스 (신규, Node 22 + TS ESM/NodeNext)

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|----------------|------|-----------|----------------|-------|
| `relay/package.json` | config | — | `server/package.json` | exact |
| `relay/tsconfig.json` | config | — | `server/tsconfig.json` | exact |
| `relay/vitest.config.ts` | config | — | `server/vitest.config.ts` | exact |
| `relay/Dockerfile` | config | — | `server/Dockerfile` | exact |
| `relay/src/index.ts` | entry/bootstrap | request-response + streaming | `server/src/server.ts` | exact |
| `relay/src/config.ts` | config | — | `server/src/config.ts` | exact |
| `relay/src/logger.ts` | utility | — | `server/src/logger.ts` | exact |
| `relay/src/generated/**` (40 files) | generated | — | **없음** (gh-trade `sync-relay-schema.sh` 산출물) | none |
| `relay/src/dma/codec.ts` | utility | streaming/transform | gh-trade `client/Services/DMA/PacketCodec.cs` | external |
| `relay/src/dma/envelope.ts` | utility | transform | gh-trade `client/Services/DMA/Client.cs` (`TakeCount`) + `PacketCodec.cs` | external |
| `relay/src/dma/dma-client.ts` | service | streaming (TCP) | gh-trade `client/Services/DMA/Client.cs` | external |
| `relay/src/dma/session.ts` | service | event-driven (상태기계) | gh-trade `client/Services/DMA/Session.cs` | external |
| `relay/src/dma/session-manager.ts` | service | event-driven (수명주기 캐시) | `server/src/kiwoom/tokenStore.ts` | role-match |
| `relay/src/hub/subscription-hub.ts` | service | pub-sub (참조계수+캐시) | gh-trade `Client.cs` 시세 소비부 (부분) | external |
| `relay/src/ws/fanout.ts` | controller | streaming (server→client) | `server/src/routes/chat.ts` (SSE 인증 순서·keepalive·finally) | role-match |
| `relay/src/ws/protocol.ts` | schema | — | `server/src/schemas/chat.ts` | exact |
| `relay/src/order/order-api.ts` | controller | request-response | `server/src/routes/chat.ts` + `server/src/app.ts` | role-match |
| `relay/src/store/credentials.ts` | model/store | CRUD (읽기) | `server/src/kiwoom/tokenStore.ts` + `server/src/services/supabase.ts` | role-match |
| `relay/src/store/orders.ts` | model/store | CRUD (쓰기) | `workers/master-sync/src/pipeline/upsert.ts` | role-match |
| `relay/src/auth/verify-token.ts` | middleware/auth | request-response | `server/src/middleware/require-auth.ts` | exact |
| `relay/tests/helpers/fake-gateway.ts` | test fixture | streaming | `server/tests/fixtures/supabase-mock.ts` (구조) + `webapp/src/lib/__tests__/chat-sse.test.ts` (`readerFromChunks`) | role-match |
| `relay/tests/helpers/ws-client.ts` | test fixture | streaming | `webapp/src/lib/__tests__/chat-sse.test.ts` | role-match |
| `relay/src/dma/__tests__/*.test.ts`, `relay/tests/*.test.ts` | test | — | `server/src/middleware/__tests__/require-auth.test.ts`, `server/src/routes/__tests__/chat.route.test.ts` | exact |

### Tier B — `server/` (Cloud Run, 주문 REST)

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|----------------|------|-----------|----------------|-------|
| `server/src/routes/orders.ts` (신규) | controller | request-response | `server/src/routes/chat.ts` | exact |
| `server/src/schemas/orders.ts` (신규) | schema | — | `server/src/schemas/chat.ts` | exact |
| `server/src/services/relay-client.ts` (신규) | service | request-response (outbound) | `server/src/kiwoom/client.ts` + `server/src/server.ts` L42-63 | role-match |
| `server/src/config.ts` (수정) | config | — | 자기 자신 L18-25(optional env 선례) | exact |
| `server/src/app.ts` (수정) | wiring | — | 자기 자신 L73-79 | exact |
| `server/src/errors.ts` (수정) | utility | — | 자기 자신 L39-53 | exact |
| `server/tests/routes/orders.test.ts` (신규) | test | — | `server/src/routes/__tests__/chat.route.test.ts` | exact |

### Tier C — `packages/shared/` (3자 계약)

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|----------------|------|-----------|----------------|-------|
| `packages/shared/src/relay.ts` (신규) | contract | — | `packages/shared/src/chat.ts` | exact |
| `packages/shared/src/index.ts` (수정) | barrel | — | 자기 자신 L10-19 | exact |
| `packages/shared/src/stock.ts` (수정 — `isin`) | model | — | 자기 자신 L23-37 (`StockMaster`) | exact |

### Tier D — `supabase/migrations/`

| 신규 파일 | Role | Data Flow | Closest Analog | Match |
|-----------|------|-----------|----------------|-------|
| `*_stocks_isin.sql` | migration | — | `20260417120200_news_description.sql` | exact |
| `*_dma_credentials.sql` | migration | — | `20260514120100_create_kiwoom_tokens.sql` | exact |
| `*_dma_orders.sql` | migration | — | `20260514120100_create_kiwoom_tokens.sql` + `20260702170000_chat_conversations.sql`(FK/인덱스) | role-match |

### Tier E — `workers/master-sync/` (ISIN 백필)

| 수정 파일 | Role | Data Flow | Closest Analog | Match |
|-----------|------|-----------|----------------|-------|
| `workers/master-sync/src/pipeline/map.ts` | transform | batch | 자기 자신 L27-41 | exact |
| `workers/master-sync/src/pipeline/upsert.ts` | model/store | batch CRUD | 자기 자신 L15-33 | exact |

### Tier F — `webapp/` (4탭 재구성 + 호가창)

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|----------------|------|-----------|----------------|-------|
| `webapp/src/components/ui/tabs.tsx` (신규 — shadcn registry) | ui primitive | — | `webapp/src/components/ui/toggle-group.tsx` (radix 래핑 규약) | role-match |
| `webapp/src/components/stock/stock-detail-tabs.tsx` (신규) | component | — | `webapp/src/components/stock/stock-detail-client.tsx` L126-163 | role-match |
| `webapp/src/components/stock/stock-detail-client.tsx` (수정) | component | request-response | 자기 자신 (탭 재배치) | exact |
| `webapp/src/app/stocks/[code]/page.tsx` (수정) | page | — | 자기 자신 L19-25 | exact |
| `webapp/src/components/stock/stock-orderbook-section.tsx` (신규) | component | streaming | `webapp/src/components/stock/stock-comovement-section.tsx` | exact |
| `webapp/src/components/orderbook/orderbook-ladder.tsx` (신규) | component | streaming | `stock-comovement-section.tsx` L78-107(잔량바) + `ui/number.tsx` | role-match |
| `webapp/src/components/orderbook/trade-tape.tsx` (신규) | component | streaming | `stock-comovement-section.tsx` (행 렌더) | role-match |
| `webapp/src/components/orderbook/order-panel.tsx` (신규) | component | request-response | `webapp/src/components/chat/delete-conversation-dialog.tsx` | role-match |
| `webapp/src/components/orderbook/account-panel.tsx` (신규) | component | streaming | `stock-comovement-section.tsx` + globals.css `.tbl-wrap` | role-match |
| `webapp/src/components/orderbook/relay-status-bar.tsx` (신규) | component | event-driven | `webapp/src/components/stock/stock-hero.tsx` (배지 배치) | role-match |
| `webapp/src/components/orderbook/orderbook-skeleton.tsx` (신규) | component | — | `webapp/src/components/stock/stock-daily-chart-skeleton.tsx` | exact |
| `webapp/src/lib/use-relay-socket.ts` (신규) | hook | streaming | `webapp/src/lib/chat-sse.ts` | role-match |
| `webapp/src/lib/orders-api.ts` (신규) | api client | request-response | `webapp/src/lib/chat-api.ts` (`authFetch`) | exact |
| `webapp/src/lib/__tests__/relay-socket.test.ts` (신규) | test | — | `webapp/src/lib/__tests__/chat-sse.test.ts` | exact |
| `webapp/src/components/stock/__tests__/orderbook.test.tsx` (신규) | test | — | `webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx` | exact |
| `webapp/e2e/specs/orderbook.spec.ts` (신규) | e2e | — | `webapp/e2e/specs/chat.spec.ts` | exact |
| `webapp/e2e/specs/stock-detail-tabs.spec.ts` (신규) | e2e | — | `webapp/e2e/specs/stock-detail-chart.spec.ts` | exact |
| `webapp/e2e/fixtures/relay.ts` (신규) | test fixture | — | `webapp/e2e/fixtures/chat.ts` (미열람 — `mock-api.ts` 계열 규약) | role-match |

### Tier G — 인프라 · 운영

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|----------------|------|-----------|----------------|-------|
| `scripts/setup-relay-iam.sh` (신규) | infra script | — | `scripts/setup-intraday-sync-iam.sh` | exact |
| `scripts/deploy-relay.sh` (신규) | infra script | — | `scripts/deploy-intraday-sync.sh` | exact |
| `scripts/smoke-relay.sh` (신규) | infra script | — | `scripts/smoke-intraday-sync.sh` | exact |
| `scripts/deploy-server.sh` (수정) | infra script | — | 자기 자신 L143-144 | exact |
| `ops/alert-relay-down.yaml` (신규) | config | — | `ops/alert-intraday-sync-failure.yaml` | role-match |
| `scripts/dma-credentials.ts` (신규) | admin script | — | `webapp/scripts/seed-test-user.ts` | exact |
| `infra/relay/startup.sh` (신규) | infra | — | **없음** (gh-radar 최초 IaaS) | none |
| `infra/relay/Caddyfile` (신규) | config | — | **없음** | none |
| `infra/relay/openconnect@.service` (신규) | config | — | **없음** (Mac `/usr/local/sbin/kbvpn-connect` 인자만 참조) | none |
| `pnpm-workspace.yaml` (수정) | config | — | 자기 자신 L1-5 | exact |
| `dev.sh` (수정) | dev script | — | 자기 자신 L1-8 | exact |

---

## Pattern Assignments

### A-1. `relay/package.json` · `tsconfig.json` · `vitest.config.ts` (config)

**Analog:** `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`

> ⚠️ **워커 패턴을 따르지 말 것.** `workers/*` 는 commonjs 지만 relay 는 생성 코드가 `.js` 확장자로
> import 하므로 **server 와 동일한 ESM + NodeNext** 여야 한다(D-26).

**package.json 패턴** (`server/package.json` L1-15, L38-43):

```json
{
  "name": "@gh-radar/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "tsx watch -r dotenv/config src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
```

`typecheck`·`build`·`test` 세 스크립트는 **필수**다 — 루트 `package.json` L5-6 이 `pnpm -r run typecheck`
/ `pnpm -r run build` 로 전 워크스페이스를 돌린다. 없으면 CI/로컬 검증에서 relay 만 조용히 빠진다.

**tsconfig 패턴** (`server/tsconfig.json` L1-12, 전문):

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "src/**/*.test.ts"]
}
```

**vitest 패턴** (`server/vitest.config.ts` L1-12, 전문):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    // co-located 순수함수 단위 테스트(src/**/*.test.ts) + 기존 tests/ 통합 테스트 둘 다 수집.
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
});
```

**워크스페이스 등록** (`pnpm-workspace.yaml` L1-5) — `- relay` 를 여기에 추가하지 않으면
`sync-relay-schema.sh` 가드 0(`../../gh-radar/relay` 존재 확인)도, 루트 typecheck 도 동작하지 않는다:

```yaml
packages:
  - webapp
  - server
  - workers/*
  - packages/*
```

---

### A-2. `relay/Dockerfile` (config)

**Analog:** `server/Dockerfile` (전문 L1-42)

```dockerfile
# === Builder Stage ===
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# 의존성 캐시 최적화 — lockfile 변경 시에만 install 재실행
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/

RUN pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY packages/shared/ ./packages/shared/
COPY server/ ./server/

RUN pnpm -F @gh-radar/shared build
RUN pnpm -F @gh-radar/server build

# pnpm deploy: isolated prod node_modules (hoisted, no symlinks to workspace root)
RUN pnpm --filter=@gh-radar/server --prod --legacy deploy /out

# === Production Image ===
FROM node:22-alpine
WORKDIR /app

# non-root user (D-31)
RUN addgroup -S app && adduser -S app -G app

# deploy 산출물 복사: dist + package.json + 독립 node_modules
COPY --from=builder /out/dist ./dist
COPY --from=builder /out/package.json ./
COPY --from=builder /out/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./node_modules/@gh-radar/shared/dist

# 버전 주입 (RESEARCH Q2 권고 B) — 배포 스크립트가 --build-arg GIT_SHA=$SHA 전달
ARG GIT_SHA=dev
ENV APP_VERSION=${GIT_SHA}

USER app
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

**복사 시 바꿀 곳 4군데만:** `server/` → `relay/`, `@gh-radar/server` → `@gh-radar/relay`,
`EXPOSE 8080` → wss/내부 두 포트, `CMD dist/server.js` → `dist/index.js`.
`corepack prepare pnpm@10` 은 **그대로 유지**(로컬 pnpm 11 과 다름 — RESEARCH 실측 경고).

---

### A-3. `relay/src/index.ts` (entry/bootstrap)

**Analog:** `server/src/server.ts` (L1-20, L74-91)

**부팅 + graceful degradation 패턴** (L1-20):

```ts
import axios from "axios";
import { createApp, type KiwoomRuntime } from "./app.js";
import { supabase } from "./services/supabase.js";
import { logger } from "./logger.js";
import { loadConfig } from "./config.js";
import { createKiwoomRuntime } from "./services/kiwoom-runtime.js";

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
```

**listen + SIGTERM 패턴** (L74-91):

```ts
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
```

**relay 에서의 차이:** relay 는 장기 TCP/ws 세션을 소유하므로 `process.exit(0)` 직전에
① 모든 wss `close(1001)` ② SessionManager 전체 DMA 소켓 종료(구독 해제 포함)를 넣어야 한다.
Docker `--restart=always` 재시작마다 KB 게이트웨이에 고아 세션을 남기지 않는 것이 목적.

---

### A-4. `relay/src/config.ts` (config)

**Analog:** `server/src/config.ts`

**필수/선택 env 로더 패턴** (L46-60):

```ts
export function loadConfig(): AppConfig {
  const get = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} must be set`);
    return v;
  };
  const optional = (k: string): string | undefined => process.env[k];
  return {
    nodeEnv: (process.env.NODE_ENV ?? "development") as AppConfig["nodeEnv"],
    port: Number(process.env.PORT ?? 8080),
    logLevel: process.env.LOG_LEVEL ?? "info",
    appVersion: process.env.APP_VERSION ?? "dev",
    supabaseUrl: get("SUPABASE_URL"),
    supabaseServiceRoleKey: get("SUPABASE_SERVICE_ROLE_KEY"),
```

**optional env 는 주석으로 "미설정 시 어떤 라우트가 503 인지"를 명시**하는 규약이 있다 (L18-25):

```ts
  // Phase 08 — Bright Data Web Unlocker (on-demand discussion refresh).
  // 모두 optional. 미설정 시 server.ts 가 brightdataClient=undefined 로 시작하고
  // POST /api/stocks/:code/discussions/refresh 만 503 PROXY_UNAVAILABLE 반환.
  brightdataApiKey: string | undefined;
```

→ **server/src/config.ts 수정 지점(Tier B)**: `relayInternalUrl`/`relayOrderSecret` 을
이 선례대로 **optional** 로 추가하고 "미설정 시 `/api/orders` 만 503" 주석을 함께 단다.
relay 쪽 `DMA_CRED_KEY`·`RELAY_ORDER_SECRET`·`SUPABASE_SERVICE_ROLE_KEY` 는 `get()` (필수)이다.

---

### A-5. `relay/src/logger.ts` (utility)

**Analog:** `server/src/logger.ts` (전문 L1-30)

```ts
import pino from "pino";
import { createGcpLoggingPinoConfig } from "@google-cloud/pino-logging-gcp-config";

export const logger = pino(
  createGcpLoggingPinoConfig(
    {
      serviceContext: {
        service: "gh-radar-server",
        version: process.env.APP_VERSION ?? "dev",
      },
    },
    {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-api-key']",
          "*.supabase_service_role_key",
          "*.access_token",
          "*.refresh_token",
          // Phase 08.1 — Anthropic key redact (로그에 cfg / headers 전체 덤프 시 보호)
          "*.ANTHROPIC_API_KEY",
          "*.anthropicApiKey",
        ],
        censor: "[REDACTED]",
      },
    },
  ),
);
```

**relay 추가 redact 경로 (D-19 필수):** `*.password`, `*.dma_password`, `*.dmaPassword`,
`*.dma_password_enc`, `*.DMA_CRED_KEY`, `*.RELAY_ORDER_SECRET`, `*.token`, `req.headers['x-relay-secret']`.
`service: "gh-radar-relay"` 로 교체.

---

### A-6. `relay/src/dma/codec.ts` (프레이밍 코덱)

**Analog (external):** `/Users/alex/repos/gh-trade/client/Services/DMA/PacketCodec.cs`

**상한 상수 + 인코딩** (L12-50):

```csharp
    public const int HEADER_SIZE = 4;

    /// <summary>
    /// 허용 최대 프레임 길이. 수신 버퍼 상한(1MB)과 동일하게 맞춘다.
    /// 이보다 큰 길이 헤더는 담을 수 없으므로 프레임 desync 로 판정한다.
    /// </summary>
    public const int MAX_FRAME_SIZE = 1024 * 1024;

    /// <summary>Envelope 최소 크기 (root offset 4 + vtable soffset 4)</summary>
    private const int MIN_ENVELOPE_SIZE = 8;
```

**추출 루프 — 상한 검사가 산술보다 먼저** (L61-93):

```csharp
    /// <returns>소비한 바이트 수 (0=데이터 부족, -1=길이 헤더 손상으로 프레임 동기화 불가)</returns>
    public static int TryExtract(byte[] buffer, int offset, int length, out byte[] payload, out int payloadLength)
    {
      // 헤더를 읽을 수 있는지 확인
      if (length < HEADER_SIZE)
        return 0;

      // 길이 읽기 (Little Endian)
      uint len = (uint)(buffer[offset] | (buffer[offset + 1] << 8) |
                        (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24));

      // 상한 검사를 먼저 — 여기서 걸러야 아래 산술이 안전하다.
      // 상한을 넘는 길이는 수신 버퍼에 담길 수 없어 영원히 "데이터 부족"이 되므로,
      // 호출부가 연결을 재수립하도록 별도 신호(-1)를 돌려준다.
      if (len > (uint)MAX_FRAME_SIZE)
        return -1;

      // 전체 패킷을 읽을 수 있는지 확인
      if ((long)length < (long)HEADER_SIZE + (long)len)
        return 0;

      payloadLength = (int)len;
      payload = new byte[payloadLength];
      Buffer.BlockCopy(buffer, offset + HEADER_SIZE, payload, 0, payloadLength);
      return HEADER_SIZE + payloadLength;
    }
```

**TS 이식 규율 3가지 (그대로 유지):**
1. `MAX_FRAME_SIZE = 1024 * 1024` — **1MB**. 핸드오프의 4MB 는 서버 송신 큐 상한 오독(RESEARCH Pitfall 2).
2. 상한 초과 = `-1` = **연결 재수립**(프레임 드롭 아님). 다음 경계를 신뢰할 수 없기 때문.
3. `MIN_ENVELOPE_SIZE = 8` 미만 페이로드는 파싱 전 드롭.

---

### A-7. `relay/src/dma/envelope.ts` (안전 파싱 + 필드 가드)

**Analog (external):** `PacketCodec.cs` L96-129 (Try-패턴) + `Client.cs` L1985-2005 (`TakeCount`)

**Try-패턴은 total 해야 한다** (`PacketCodec.cs` L96-129):

```csharp
    /// <summary>
    /// 페이로드 구조 검증 후 Envelope 파싱 시도 (수신 경로의 유일한 파싱 진입점)
    /// </summary>
    public static bool TryParseEnvelopeVerified(byte[] payload, out StockDMA.Envelope envelope)
    {
      // 최소 크기 사전검사: root offset(4) + vtable soffset(4).
      if (payload == null || payload.Length < MIN_ENVELOPE_SIZE)
        return false;

      // Try-패턴은 total 해야 한다 — 어떤 입력에도 예외를 던지지 않고 false 로 수렴시킨다.
      // Verifier 가 방어하지 못하는 잘린 페이로드까지 여기서 흡수해야, 호출부의
      // 드롭 처리(누적 카운트 + hex 덤프, D-07)가 모든 검증 실패에 대해 실행된다.
      try
      {
        var bb = new ByteBuffer(payload);
        if (!StockDMA.Envelope.VerifyEnvelope(bb))
          return false;
        envelope = StockDMA.Envelope.GetRootAsEnvelope(bb);
        return true;
      }
      catch (Exception) { envelope = default(StockDMA.Envelope); return false; }
    }
```

> **TS 에서는 `VerifyEnvelope` 가 존재하지 않는다**(RESEARCH 실측: 런타임에 Verifier 심볼 없음, 잘린
> 페이로드가 예외 없이 깨진 값을 반환). 따라서 위 2단(최소 크기 + try/catch)만으로는 부족하고
> **아래 필드 단위 가드가 필수**다.

**필드 상한 가드 — 드롭이 아니라 절단 + Warning** (`Client.cs` L1988-2005):

```csharp
    /// <summary>
    /// 벡터 소비 건수 산정 — 음수(파손)는 0, 상한 초과는 앞의 N건. 어느 쪽이든 Warning 만 남기고
    /// 호출자는 계속 진행한다. 여기서 return 으로 프레임을 삼키면 화면이 서버를 무응답으로 오인한다 (12 WR-06).
    /// </summary>
    private static int TakeCount(int n, int max, string label)
    {
      if (n < 0)
      {
        Log.Instance.Warning("[DMA] 비정상 {0} 길이: {1}", label, n);
        return 0;
      }
      if (n > max)
      {
        Log.Instance.Warning("[DMA] {0} {1}건 — 상한 {2}건으로 자름", label, n, max);
        return max;
      }
      return n;
    }
```

**이식할 상한 상수 원본** (`Client.cs` L59-70):

```csharp
    private const int MAX_ACCOUNT_LIST_COUNT = 256;        // 계좌 목록 상한 (소비측 방어)
    private const int MAX_HOLDING_COUNT = 500;             // 잔고 종목 상한
    private const int MAX_UNFILLED_COUNT = 1000;           // 미체결 주문 상한
    private const int MAX_REMOVED_ORDER_COUNT = 1000;      // 델타 삭제 표식 상한
    private const int MAX_TAPE_ENTRY_COUNT = 200;           // 체결 테이프 1프레임 원소 상한
```

호가 10단은 `TakeCount(s.AskPricesLength, ORDER_BOOK_DEPTH, "매도호가")` 형태(L2149-2164)로
**10 클램프**. 문자열은 `isin.length === 12`, `exchange ∈ {"KRX","NXT"}`, `change_sign.length === 1` 형식 가드.
`long` 필드는 생성 코드가 `bigint` 를 반환하므로 **이 모듈 경계에서 한 번만 Number 변환**(D-34).

---

### A-8. `relay/src/dma/dma-client.ts` (TCP 클라이언트)

**Analog (external):** `client/Services/DMA/Client.cs`

**상수 정본** (L45-60) — 이 값들을 relay 에 **복제하지 말고 한 모듈에 모아 단일 정본**으로 둔다:

```csharp
    private const int MAX_RECV_BUFFER_SIZE = 1024 * 1024;  // 1MB
    private const int RECV_CHUNK_SIZE = 8192;              // 8KB
    private const int CONNECT_TIMEOUT_MS = 3000;           // TCP 연결 시도 상한
    private const int SEND_TIMEOUT_MS = 2000;              // 송신 블로킹 상한 (CONN-09)
    // 재접속 상한의 단일 정본 — Session 의 라벨·이벤트와 폼의 초기 라벨이 이 값을 참조한다 (IN-01)
    public const int MAX_RECONNECT_ATTEMPTS = 10;
    private const int RECONNECT_MAX_DELAY_MS = 30000;      // 지수 백오프 상한 30초
    private const int PING_INTERVAL_MS = 30000;            // 30초
```

**NoDelay** (L288-297):

```csharp
    private void ConnectCore()
    {
        tcp = new TcpClient();
        tcp.NoDelay = true;                     // TCP_NODELAY
        tcp.SendTimeout = SEND_TIMEOUT_MS;      // 송신 블로킹 상한 (CONN-09)
```

**수신 루프 — generation 검사 2회 + 버퍼 오버플로 시 연결 종료** (L1360-1416):

```csharp
          if (generation != _generation)
            return;   // 세대 교체 — 버퍼 미접촉 종료
          ...
          int bytesRead = stream.Read(chunk, 0, chunk.Length);

          if (generation != _generation)
            return;   // Read 중에 재접속이 일어났다 — 읽은 바이트를 버린다

          if (bytesRead == 0)
          {
            Log.Instance.Debug("[DMA] 서버가 연결을 닫음");
            OnDisconnected("서버가 연결을 닫음", generation);
            break;
          }
          ...
            if (_recvLength + bytesRead > MAX_RECV_BUFFER_SIZE) { overflow = true; }
          ...
          if (overflow)
          {
            Log.Instance.Error("[DMA] 수신 버퍼 초과 — 연결을 끊는다");
            OnDisconnected("수신 버퍼 초과", generation);
            break;
          }
          // 완전한 패킷 처리
          ProcessReceivedData(generation);
```

**LivePing** (L1247-1259) — 30초 주기, 세션 불요 메시지:

```csharp
    public bool SendLivePing()
    {
      var builder = new FlatBufferBuilder(64);
      uint pingTime = (uint)((DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalSeconds);
      var livePing = LivePing.CreateLivePing(builder, pingTime);
      var envelope = Envelope.CreateEnvelope(builder, msg_type: MsgType.LivePing, live_pingOffset: livePing);
      builder.Finish(envelope.Value);
      return SendPacket(builder, MsgType.LivePing, false);
    }
```

> **TS 차이 1개:** flatc 25.12.19 는 `Envelope` 에 `createEnvelope(...)` 를 **생성하지 않는다**
> (deprecated 슬롯 2종 때문). `startEnvelope → addMsgType → addXxx → endEnvelope` 로 조립할 것(RESEARCH Pattern 3).

---

### A-9. `relay/src/dma/session.ts` (상태기계)

**Analog (external):** `client/Services/DMA/Session.cs`

**타임아웃 상수 + generation 필드** (L61-110):

```csharp
    private const int LOGIN_RESP_TIMEOUT_MS = 5000;      // LoginResp 대기 상한 (D-08)
    private const int ACCOUNT_RESP_TIMEOUT_MS = 5000;    // 계좌 선언 Resp 대조 대기 상한 (D-08)
    private const int MAX_ACCOUNT_NO_LEN = 12;           // 서버 계좌번호 가드 (Pitfall 5)
    // 재접속 상한은 Client.MAX_RECONNECT_ATTEMPTS 가 단일 정본이다 — 여기 복제하지 않는다 (IN-01)
    ...
    // DMA 서버 비밀번호 (users.toml 대조 값). Start 에서 한 번 받아 최초 부트·자동 재접속·수동 재접속의
    // 단일 로그인 지점(OnTransportUp 워커)에서 재사용한다 — 무인 재접속의 조건이다 (Phase 17 D-16).
    // 로그·SessionStateEventArgs·문자열 포맷에 절대 싣지 않는다.
    private string _password;
    ...
    private volatile SessionState _state = SessionState.Idle;

    // 최초 부트 구간 여부. true 면 실패가 Failed(IsBootFailure), false 면 자동 재접속으로 이어진다.
    private volatile bool _bootPhase;

    // 전송 세대. Start/ManualReconnect/Shutdown/세션 수립 워커/부트 실패 확정(Fail) 다섯 곳에서만 증가한다.
    // 구세대 워커(구부트의 5초 타임아웃 대기 포함)는 세대 불일치를 보면 아무것도 보고하지 않는다 (T-02-14).
    private int _transportGeneration;
```

**부트 시퀀스 — 로그인 → 계좌 선언 → Ready** (L690-812, 발췌):

```csharp
          // 워커 진입 직후. 구세대(구부트·종료 후)는 아무것도 보고하지 않는다 (T-02-14).
          if (gen != _transportGeneration) { return; }

          // ① 로그인
          if (!TrySetState(gen, SessionState.LoggingIn, "LoginReq 송신")) { return; }
          _loginRespEvent.Reset();
          if (!Client.Instance.SendLogin(_userId, _password, _broker)) { ... Fail("LoginReq 송신 실패"); return; }

          bool loginArrived = _loginRespEvent.WaitOne(LOGIN_RESP_TIMEOUT_MS);
          if (gen != _transportGeneration) { return; }
          if (!loginArrived) { Fail("LoginResp 타임아웃 (5초)"); return; }

          // 서버가 명시적으로 거부한 로그인은 재시도해도 결과가 같다 ...
          // 자동 재접속을 살려 두면 백오프마다 같은 거부를 되풀이해
          // 서버 로그를 도배한다 (T-09-07) — 그래서 Fail 이 아니라 FailNoRetry 다.
          if (!_lastLoginSuccess) { FailNoRetry("로그인 거부: " + _lastLoginMessage); return; }

          // ② 활성 계좌 일괄 선언 (A2 — 건별 대기 없이 연속 송신, 응답은 매번 현재 목록 전체)
          if (!TrySetState(gen, SessionState.DeclaringAccounts, ...)) { return; }
          _accountsMatchedEvent.Reset();
          _missingAccounts = new List<string>(_accountNos);
          for (int i = 0; i < targets.Count; i++)
            if (!Client.Instance.SendUpdateAccountNo("1", targets[i])) { ... }

          bool accountsMatched = _accountsMatchedEvent.WaitOne(ACCOUNT_RESP_TIMEOUT_MS);
          if (gen != _transportGeneration) { return; }
          // 선언한 계좌 중 하나라도 서버 목록에 없으면 실패다 (D-08, T-02-13).
          if (!accountsMatched) { Fail(string.Format("계좌 선언 미확인 (5초): {0}", ...)); return; }

          // ③ 운용 준비 완료. "성공"의 기준은 TCP 접속이 아니라 여기다 (Pattern 2).
          Client.Instance.ResetReconnectAttempts();
          if (!TrySetState(gen, SessionState.Ready, ...)) { return; }
          _hasBeenReady = true;
          _bootPhase = false;
```

**TS 이식 체크리스트 (플랜 태스크로 그대로 쓸 것):**
- [ ] 상태 enum **6+2종을 처음부터 전부 선언**(`idle/connecting/logging_in/declaring/ready/reconnecting/manual_required/failed`) — 나중에 상태를 추가하지 않는다.
- [ ] `#generation` 증가 지점 5곳 고정, 모든 async 콜백 진입부·await 재개부에 `if (gen !== this.#generation) return;`
- [ ] `LOGIN_RESP_TIMEOUT_MS = 5000` / `ACCOUNT_RESP_TIMEOUT_MS = 5000` (`AbortSignal.timeout` 또는 `Promise.race`)
- [ ] **로그인 거부 = `FailNoRetry`** — 재접속 루프 중단 + `session_rejected` 상태 프레임(D-16)
- [ ] 비밀번호는 세션 객체 private 필드에만. 로그·상태 프레임·에러 메시지에 절대 미포함
- [ ] D-25 게이트 전(현행 스키마)에는 `DeclaringAccounts` 를 "선언할 계좌 0건 → 즉시 Ready" 축약 경로로만 구현

---

### A-10. `relay/src/dma/session-manager.ts` (userId → 세션, 5분 유예)

**Analog:** `server/src/kiwoom/tokenStore.ts` (L5, L19-53)

**TTL 캐시 + "왜 재사용/왜 갱신"을 로그로 남기는 규약**:

```ts
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 만료 5분 전 refresh (D-27)
...
/**
 * 키움 OAuth2 token 발급 + Supabase kiwoom_tokens cache.
 * ...
 * Flow:
 *   1. SELECT from kiwoom_tokens (token_type)
 *   2. 만료 5분+ 남으면 그대로 재사용 (axios 미호출)
 *   3. 만료 임박 or 캐시 부재 → POST /oauth2/token → upsert
 */
  if (cached) {
    const expiresAt = new Date(cached.expires_at);
    const remainMs = expiresAt.getTime() - Date.now();
    if (remainMs > TOKEN_REFRESH_THRESHOLD_MS) {
      logger.info({ remainMs }, "reusing cached Kiwoom token");
      return { accessToken: cached.access_token, expiresAt };
    }
    logger.info({ remainMs }, "Kiwoom token expiring soon — refreshing");
  } else {
    logger.info("Kiwoom token cache empty — issuing new token");
  }
```

**이식 형태:** `SESSION_GRACE_MS = 5 * 60 * 1000`(D-15). `acquire(userId)` / `release(userId)`
참조계수 → 0 이 되면 `setTimeout(SESSION_GRACE_MS)` 예약, 유예 중 재연결이 오면 타이머 취소하고
같은 세션 재사용(로그: `"reusing live DMA session"` / `"grace expired — closing DMA session"`).
**무로그 fail-safe 금지** — 종료·재사용·유예 취소 3경로 전부 로깅(자동 메모리).

---

### A-11. `relay/src/ws/fanout.ts` (WebSocket 팬아웃 + 첫 메시지 인증)

**Analog:** `server/src/routes/chat.ts` (인증 순서·keepalive·finally 규율) + `require-auth.ts`

**"스트림 헤더 쓰기 전에 인증을 끝낸다" 규율** (`server/src/routes/chat.ts` L26-28, L51-85):

```ts
 * 모든 라우트 requireAuth() — SSE 헤더 쓰기 전 401(Pattern 3, T-14-02). SSE 는
 * X-Accel-Buffering:no + 15s keepalive(Cloud Run Pitfall 2) + close→abort + done 보장.
 * CHAT_DISABLED kill-switch 503(헤더 전, T-14-04). 에러는 next(e)/generic — error.message 미노출(V7).
```

```ts
chatRouter.post("/", chatRateLimit, requireAuth(), async (req, res, next) => {
  const parsed = ChatPostBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    next(ValidationFailed(`${issue.path.join(".")}: ${issue.message}`));
    return;
  }
  ...
  // 클라이언트 연결 종료(시트 닫힘) 전파 — SSE 전송만 멈추고 생성/저장은 계속(D-06)
  const clientAbort = new AbortController();
  req.on("close", () => clientAbort.abort());
  ...
  // 15s keepalive — 프록시 유휴 타임아웃 방지 (전문가 병렬 대기 침묵 구간)
  const keepalive = setInterval(() => {
    if (!res.writableEnded) res.write(": keepalive\n\n");
  }, 15_000);
```

**정리(cleanup)는 반드시 `finally`** (L104-110):

```ts
  } finally {
    clearInterval(keepalive);
    if (!res.writableEnded) {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    }
  }
```

**wss 로 옮길 때의 대응표:**

| chat SSE | relay wss |
|----------|-----------|
| `requireAuth()` 미들웨어(헤더 전 401) | 업그레이드 후 **첫 메시지 `{t:"auth"}`** + 5초 authTimer → `close(4401)` (D-11) |
| `ChatPostBody.safeParse` → `ValidationFailed` | `ws/protocol.ts` zod 파싱 실패 → `close(4400)` |
| `setInterval` 15s keepalive | `setInterval` 30s ws ping + `isAlive` pong 패턴 |
| `req.on("close", abort)` | `ws.on("close", () => hub.release(...))` — **구독 참조계수 해제 누락 금지** |
| `finally { clearInterval; res.end() }` | `finally`/`close` 핸들러에서 타이머·참조계수·세션 release 전부 정리 |

**추가(analog 없음, RESEARCH Pattern 6):** `ws.bufferedAmount` 백프레셔 감시 →
임계 초과 연속 N회면 **그 연결만** `terminate()`. DMA 수신 경로에서 `await` 금지(D-32).

---

### A-12. `relay/src/ws/protocol.ts` (수신 메시지 zod 스키마)

**Analog:** `server/src/schemas/chat.ts` (전문 L1-37)

```ts
import { z } from "zod";

/**
 * Phase 14 — 챗 입력 검증 (CHAT-01, T-14-05a Input Validation / V5).
 *
 * message 길이 상한·conversationId uuid·stockCode 6자리 정규식으로 PostgREST/Anthropic
 * 바인딩 전에 형식을 검증해 프롬프트 인젝션·오류 입력 표면을 축소한다 (home/search 톤).
 */
export const ChatPostBody = z.object({
  message: z.string().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
  stockCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type ChatPostBodyT = z.infer<typeof ChatPostBody>;
```

**이식 형태:** `RelayInbound = z.discriminatedUnion("t", [AuthMsg, SubMsg, UnsubMsg])`.
`isin: z.string().length(12)`, `ex: z.enum(["KRX","NXT"])`. 스키마 파일은 zod 만 두고,
**계약 타입은 `@gh-radar/shared` 에서 import** 한다(RESEARCH §Claude's Discretion 권장안).

---

### A-13. `relay/src/order/order-api.ts` (내부 HTTP)

**Analog:** `server/src/app.ts` (미들웨어 스택 순서) + `server/src/routes/chat.ts`(라우트 형태)

**미들웨어 결선 순서** (`server/src/app.ts` L41-88):

```ts
export function createApp(deps: AppDeps): Express {
  const app = express();

  // 1) Cloud Run: 단일 proxy 신뢰 (RESEARCH Pitfall 1)
  app.set("trust proxy", 1);

  // deps 주입 (라우터가 req.app.locals 로 접근)
  app.locals.supabase = deps.supabase;
  ...
  // 2) request-id (pino 바인딩 위해 가장 먼저)
  app.use(requestId());
  // 3) pino-http
  app.use(httpLogger());
  // 4) helmet (보안 헤더)
  app.use(helmet());
  // 5) CORS
  app.use(cors(corsOptions()));
  // 6) body parser (16kb)
  app.use(express.json({ limit: "16kb" }));
  // 7) rate-limit on /api
  app.use("/api", apiRateLimiter());

  // 8) 라우터 결선 (Wave 3)
  app.use("/api/health", healthRouter);
  ...
  // 9) 404 fallback
  app.use(notFoundHandler);
  // 10) error handler (마지막)
  app.use(errorHandler);

  return app;
}
```

**relay OrderApi 차이:** CORS 불요(내부 전용), rate-limit 불요(Cloud Run 만 호출),
대신 **공유 비밀 헤더 검사 미들웨어**를 body parser 직후에 넣는다(불일치 시 401, 본문 미노출).
`/healthz` 는 비밀 없이 통과(Caddy → uptime check 대상, PII·계좌번호 미포함).
`app.locals` DI 로 `sessionManager`/`supabase` 주입 — 테스트에서 fake 를 넣기 위함(chat.route.test.ts 선례).

---

### A-14. `relay/src/store/credentials.ts` · `relay/src/store/orders.ts`

**Analog:** `server/src/services/supabase.ts` (전문 L1-26) + `workers/master-sync/src/pipeline/upsert.ts`

**서비스롤 클라이언트 — `auth.getUser` 겸용이 검증된 패턴** (`server/src/services/supabase.ts`):

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 서비스롤 Supabase 클라이언트 (RLS bypass).
 *
 * Phase 14 (D-02): requireAuth 미들웨어가 이 클라의 `auth.getUser(jwt)` 로 사용자 JWT 를
 * 검증한다 — 서비스롤 키로 생성된 클라도 `auth.getUser` 는 전달된 access_token 을 Supabase
 * Auth 서버로 검증 위임하므로 정상 동작한다(서비스롤 권한과 무관). 데이터 read/write 는
 * `WHERE user_id` 명시 필터로 소유권을 강제한다(chat-history).
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
```

→ relay 도 **클라이언트 1개**로 `auth.getUser(토큰 검증)` + `dma_credentials/dma_orders` 접근을 모두 처리한다.

**쓰기 경로 — 에러 로그 후 throw** (`workers/master-sync/src/pipeline/upsert.ts` L31-40):

```ts
  const { error } = await supabase
    .from("stocks")
    .upsert(dbRows, { onConflict: "code" });

  if (error) {
    logger.error({ error }, "upsertMasters failed");
    throw error;
  }
```

**relay 주의(D-32 / RESEARCH Anti-pattern):** `dma_orders` update 는 **DMA 수신 콜백에서 직접 await 하지 않는다.**
콜백은 큐에 push 만 하고 별도 tick 워커가 flush 한다 — 게이트웨이 송신 큐가 차면 서버가 연결을 끊는다.

---

### A-15. `relay/src/auth/verify-token.ts`

**Analog:** `server/src/middleware/require-auth.ts` (전문 L1-41)

```ts
import type { RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 14 (D-02) — gh-radar 서버 최초의 사용자 인증 미들웨어. 챗 라우트에만 적용.
 *
 * `Authorization: Bearer <supabase access_token>` 를 `supabase.auth.getUser(jwt)` 로
 * 검증한다(서명·만료·revoke 처리는 supabase-js 내장 — 신규 JWT 의존성 0). 성공 시
 * `req.userId` 를 설정하고 next() 로 위임한다 (T-14-02 Spoofing mitigate).
 */
export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "로그인이 필요합니다." },
      });
      return;
    }

    const supabase = req.app.locals.supabase as SupabaseClient;
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "세션이 만료되었습니다." },
      });
      return;
    }

    req.userId = data.user.id;
    next();
  };
}
```

**relay 이식:** express 미들웨어가 아니라 **순수 함수** `verifyToken(supabase, token): Promise<string | null>`
로 뽑아 wss `{t:"auth"}` 핸들러가 호출한다(D-10, jose 미사용). 실패 시 `ws.close(4401)`.
`dma_credentials` 조회는 **분리된 두 번째 단계** — 없으면 `close` 가 아니라 연결 유지 + `unauthorized` 상태 프레임(D-12).

---

### A-16. relay 테스트 (`relay/tests/**`, `relay/src/dma/__tests__/**`)

**Analog 1 — 순수 유닛 (fake 주입):** `server/src/middleware/__tests__/require-auth.test.ts` L1-30

```ts
import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAuth } from "../require-auth";

/**
 * requireAuth 미들웨어 유닛 테스트 (D-02, T-14-02 Spoofing mitigate).
 *
 * fake `req.app.locals.supabase.auth.getUser` 를 vi.fn 으로 주입해
 * JWT 검증 4케이스(무헤더 / Bearer 부재 / getUser error / 유효 토큰)를 검증한다.
 */
function makeReq(authHeader: string | undefined, getUser?: ReturnType<typeof vi.fn>): Request {
  const supabase = { auth: { getUser: getUser ?? vi.fn(async () => ({ data: { user: null }, error: new Error("boom") })) } };
  return {
    header: (name: string) => (name.toLowerCase() === "authorization" ? authHeader : undefined),
    app: { locals: { supabase } },
  } as unknown as Request;
}
```

**Analog 2 — 라우트 통합 (supertest + hoisted mock):** `server/src/routes/__tests__/chat.route.test.ts` L15-21, L38-45

```ts
const { handleChatStreamMock } = vi.hoisted(() => ({
  handleChatStreamMock: vi.fn(async () => {}),
}));
vi.mock("../../services/chat-service", () => ({
  handleChatStream: handleChatStreamMock,
}));
...
/** auth.getUser + conversations 테이블을 지원하는 최소 supabase mock. */
function makeSupabase(opts: { user?: { id: string } | null; conversations?: any[] }) {
  return {
    auth: {
      getUser: async (_token: string) =>
        opts.user ? { data: { user: opts.user }, error: null }
                  : { data: { user: null }, error: { message: "invalid token" } },
    },
```

**Analog 3 — 스트림 청크 reader mock:** `webapp/src/lib/__tests__/chat-sse.test.ts` L30-44

```ts
/** 문자열 청크 배열을 Uint8Array 로 순차 방출하는 reader mock. */
function readerFromChunks(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    read: async () => {
      if (i < chunks.length) return { done: false as const, value: encoder.encode(chunks[i++]) };
      return { done: true as const, value: undefined };
    },
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}
```

→ `relay/tests/helpers/fake-gateway.ts` 는 `node:net` `createServer` 로 같은 사상(청크 경계를
테스트가 지정) — **프레임 결합/분할·쓰레기 프레임 주입·강제 종료**를 한 헬퍼가 제공한다.

---

### B-1. `server/src/routes/orders.ts` (신규 컨트롤러)

**Analog:** `server/src/routes/chat.ts`

**라우터 선언 + 라우트 전용 rate-limit + requireAuth 조합** (L31-51):

```ts
/** 라우트 전용 rate-limit — /api(200/60s) 위에 챗 POST 만 추가 강화(T-14-04 비용 방어). */
const chatRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "", 64),
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: "RATE_LIMITED", message: "채팅 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    });
  },
});

export const chatRouter: RouterT = Router();

chatRouter.post("/", chatRateLimit, requireAuth(), async (req, res, next) => {
```

**GET 계열의 try/catch → next(e) 형태** (L114-134):

```ts
chatRouter.get("/conversations", requireAuth(), async (req, res, next) => {
  try {
    const parsed = ConversationListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    const data: ConversationRow[] = await listConversations(supabase, req.userId!, parsed.data.stockCode);
    // 코드베이스 규약: list 엔드포인트는 bare array 반환(scanner/themes/news 동일).
    res.json(data);
  } catch (e) {
    next(e);
  }
});
```

**`/api/orders` 구현 순서 (D-12/D-20/D-22 를 이 뼈대에 맵핑):**
1. `ordersRateLimit` (주문은 챗보다 더 엄격하게 — 값은 재량)
2. `requireAuth()` → `req.userId`
3. `OrderPostBody.safeParse` → 실패 시 `next(ValidationFailed(...))`
4. allowlist: `dma_credentials` 존재 조회 → 없으면 403 (`errors.ts` 헬퍼 신설)
5. `stocks` 에서 `isin`·`market` 조회 (`stocks.ts` L106-113 의 `maybeSingle()` + `StockNotFound(code)` 선례)
6. `dma_orders` insert(요청 행)
7. relay 내부 HTTP 릴레이 (`AbortSignal.timeout(5000)`)
8. 응답 매핑 + `dma_orders` update

---

### B-2. `server/src/errors.ts` (수정)

**Analog:** 자기 자신 L39-53 (Phase 08 에서 같은 방식으로 확장한 선례)

```ts
// Phase 08 — discussion 새로고침 cooldown / 프록시 예산 / 프록시 미주입 helpers.
export const DiscussionRefreshCooldown = (seconds: number) =>
  new ApiError(429, "DISCUSSION_REFRESH_COOLDOWN", `잠시 후 다시 시도해주세요 (${seconds}s)`);
export const ProxyBudgetExhausted = () =>
  new ApiError(503, "PROXY_BUDGET_EXHAUSTED", "오늘 토론방 새로고침 한도가 모두 소진되었습니다");
export const ProxyUnavailable = () =>
  new ApiError(503, "PROXY_UNAVAILABLE", "토론방 프록시 설정이 없습니다");
```

**추가할 헬퍼 (RESEARCH Pattern 10 의 매핑표 그대로):**

```ts
// Phase 15 — DMA 주문 릴레이 (RELAY-02).
export const DmaNotAllowed = () => new ApiError(403, "DMA_NOT_ALLOWED", "…");
export const SessionNotReady = () => new ApiError(409, "SESSION_NOT_READY", "호가창을 먼저 열어 주세요");
export const OrderTimeout = () => new ApiError(504?, "ORDER_TIMEOUT", "…");   // ※ 아래 주의
export const RelayUnavailable = () => new ApiError(502, "RELAY_UNAVAILABLE", "…");
```

> ⚠️ RESEARCH Pattern 10 은 타임아웃을 "**504 가 아니라** `ORDER_TIMEOUT`" 으로 못박았다 —
> "보냈는지 안 보냈는지 모른다"가 진실이므로 UI 는 "결과 확인 중"을 표시한다. 상태코드는 플랜에서
> 확정하되 **실패로 단정하는 문구를 쓰지 않는다**(UI-SPEC C9 "5초 지연 = 중립, 실패로 단정 금지").

---

### B-3. `server/src/services/relay-client.ts` (신규)

**Analog:** `server/src/kiwoom/client.ts` (전문 L1-15) + `server/src/server.ts` L42-63(https 가드·미설정 경고)

```ts
import axios, { type AxiosInstance } from "axios";

/**
 * server 측 키움 REST API axios client (worker 패턴 mirror — Plan 04).
 *
 * 각 호출 시 caller 가 headers (authorization Bearer, api-id) 를 지정.
 * client 자체에는 Bearer 미주입 — token 이 매 호출 동적 (Supabase kiwoom_tokens cache).
 */
export function createKiwoomClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 10_000,
    headers: { "content-type": "application/json;charset=utf-8" },
  });
}
```

**미설정 시 graceful degradation + 프로토콜 가드** (`server/src/server.ts` L42-63):

```ts
// Phase 08 — Bright Data Web Unlocker client (on-demand discussion refresh).
// BRIGHTDATA_API_KEY 미설정 시 brightdataClient=undefined → POST /discussions/refresh 만 503.
// T-09 (MITM): brightdataUrl 이 https 가 아니면 throw.
let brightdataClient = undefined;
if (config.brightdataApiKey) {
  if (!config.brightdataUrl.startsWith("https://")) {
    throw new Error(`BRIGHTDATA_URL must be https (got: ${config.brightdataUrl})`);
  }
  brightdataClient = axios.create({ baseURL: config.brightdataUrl, timeout: 30_000, ... });
} else {
  logger.warn("BRIGHTDATA_API_KEY not set — POST /discussions/refresh will return 503");
}
```

**relay 판:** `RELAY_INTERNAL_URL` 은 **평문 http 허용**(VPC 내부, D-08)이므로 https 가드 대신
`10.10.0.0/26` 사설 대역 가드 + `X-Relay-Secret` 헤더 주입, `timeout: 5000`(D-22).
`RELAY_INTERNAL_URL`/`RELAY_ORDER_SECRET` 미설정 시 client=undefined → `/api/orders` 만 503.

---

### C-1. `packages/shared/src/relay.ts` (신규 계약)

**Analog:** `packages/shared/src/chat.ts` (L1-35)

```ts
/**
 * Phase 14 — AI 애널리스트 챗봇 (멀티에이전트) 공유 계약 (CHAT-01).
 *
 * server · webapp 가 공유하는 챗 도메인 타입의 단일 진실 소스.
 * ...
 * 인터페이스-우선: 이후 서버(P03~P06)와 웹앱(P07~P10)이 이 계약에 대해 병렬 구현한다.
 * ChatSSEEventMap 은 SSE 프로토콜의 단일 진실 소스 (RESEARCH Pattern 6).
 *
 * DB 는 snake_case (supabase/migrations/{ts}_chat.sql) — server 순수함수가
 * row → 아래 camelCase 타입으로 변환한다.
 */

/** 진행 스텝퍼(D-04/C5) 한글 라벨. UI-SPEC Copywriting 과 일치. */
export const SPECIALIST_LABELS: Record<SpecialistId, string> = {
  quote: "시세·수급 전문가",
  ...
};
```

**핵심 규약 3가지 (그대로 이식):**
1. 파일 상단 주석에 "**누가 소비하는 단일 진실 소스인지**" 명시 — relay 는 3자(server·webapp·relay).
2. **UI 라벨 상수를 계약에 둔다** (`SPECIALIST_LABELS` 선례) → 연결 상태 6+2종 한글 라벨을
   `RELAY_STATE_LABELS` 로 shared 에 두면 UI-SPEC §Copywriting 과 브라우저 switch 중복이 사라진다(D-36 사상).
3. **DB snake_case ↔ 타입 camelCase 변환 책임이 어디인지** 주석으로 고정.

**barrel 등록** (`packages/shared/src/index.ts` L10-19 형식):

```ts
export type {
  SpecialistId,
  ChatRole,
  ...
} from "./chat";
export { SPECIALIST_TOOL_NAMES, SPECIALIST_LABELS } from "./chat";
```

**`stock.ts` 에 `isin` 추가 지점** (`packages/shared/src/stock.ts` L23-37) — 각 필드에 **KRX 원본 필드명 주석**을 다는 규약:

```ts
export type StockMaster = {
  code: string;
  name: string;
  market: Market;
  sector: string | null;           // KRX 응답에 업종 정보 없음 — 현재 NULL, ...
  kosdaqSegment: string | null;    // KOSDAQ 소속부(...). KOSPI 는 NULL.
  securityType: SecurityType;      // 종목구분 (보통주/구형우선주/...) — KRX `KIND_STKCERT_TP_NM`
  securityGroup: string;           // 증권그룹 (주권/부동산투자회사/...) — KRX `SECUGRP_NM`
  englishName: string | null;      // KRX `ISU_ENG_NM` (선택)
```

→ `isin: string | null;   // KRX 'ISU_CD' 표준코드 12자 — DMA 게이트웨이 키(D-28)`

---

### D-1. `supabase/migrations/*_dma_credentials.sql` · `*_dma_orders.sql`

**Analog:** `supabase/migrations/20260514120100_create_kiwoom_tokens.sql` (전문 L1-34)

```sql
-- ============================================================
-- Phase 09.1 Plan 01: kiwoom_tokens CREATE (D-26, D-27, D-28)
--
-- 결정 근거 (09.1-CONTEXT.md / 09.1-RESEARCH.md §5.2 Migration 2):
--   D-26: schema = (token_type PK, access_token, expires_at, fetched_at)
--   D-35 / MEMORY feedback_supabase_rpc_revoke:
--         REVOKE FROM PUBLIC + REVOKE FROM anon, authenticated 둘 다 명시 필수
--         (Supabase 플랫폼 auto-grant 가 PUBLIC 만 REVOKE 시 회귀 위험)
--   T-09.1-02: access_token 평문 저장 — RLS service_role only, 24h 짧은 lifetime
--
-- Push 시점: Wave 4 cutover 의 첫 push (worker production live 직전).
-- ============================================================

BEGIN;

CREATE TABLE public.kiwoom_tokens (
  token_type   text PRIMARY KEY,                    -- "live" / "mock"
  access_token text NOT NULL,
  expires_at   timestamptz NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role only (worker + server 양쪽 SELECT/UPSERT)
ALTER TABLE public.kiwoom_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.kiwoom_tokens FROM PUBLIC;
REVOKE ALL ON public.kiwoom_tokens FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kiwoom_tokens TO service_role;

COMMIT;
```

**`dma_credentials` 는 이 파일을 거의 그대로 복사한다** — D-18 의 "RLS 활성 + 정책 0개, 서비스롤만"이
정확히 이 형태다. `REVOKE ... FROM anon, authenticated` **명시 2줄 누락 금지**(자동 메모리
`feedback_supabase_rpc_revoke` — 플랫폼 auto-grant 가 PUBLIC-only REVOKE 를 덮어쓴다).

**`dma_orders` 는 FK/인덱스를 `chat_conversations` 선례에서 가져온다** (`20260702170000_chat_conversations.sql` L38-47):

```sql
CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_code  text REFERENCES stocks(code) ON DELETE SET NULL,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_user_stock ON conversations (user_id, stock_code, updated_at DESC);
```

→ `dma_orders`: `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`,
`stock_code text REFERENCES stocks(code) ON DELETE SET NULL`,
인덱스 `(user_id, created_at DESC)` — D-24 "오늘 주문 목록 복원" 쿼리 형태.
단 **RLS 정책은 0개**(`kiwoom_tokens` 형) — 웹앱은 PostgREST 직접 접근 없이 server REST 로만 읽는다.

**`stocks.isin` 컬럼 추가 analog:** `20260417120200_news_description.sql` (전문 L1-20)

```sql
-- ============================================================
-- Phase 07.1 — news_articles.description 컬럼 추가.
-- ...
-- 영향 범위:
--   - nullable 컬럼 추가 → 기존 1,103 행은 description=NULL 로 유지 (backfill 없음).
-- ============================================================

ALTER TABLE news_articles
  ADD COLUMN IF NOT EXISTS description text;
```

→ `ALTER TABLE stocks ADD COLUMN IF NOT EXISTS isin text;` + `CREATE INDEX IF NOT EXISTS idx_stocks_isin ON stocks (isin);`
(주석에 "백필은 master-sync 1회 실행" 명시 — Integration Points).
`stocks` 는 **공개 읽기 테이블**이므로 새 정책이 필요하면 `TO anon, authenticated` 둘 다 명시
(`20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql` L12-17 이 정확히 이 함정을 고친 선례).

---

### E-1. `workers/master-sync/` (ISIN 백필)

**Analog:** 자기 자신 — `map.ts` L17-41, `upsert.ts` L15-33

**map.ts (KRX row → 도메인)**:

```ts
export function krxToMasterRow(r: KrxBaseInfoRow): StockMaster {
  if (!r.ISU_SRT_CD) {
    throw new Error(`KRX row missing ISU_SRT_CD: ${JSON.stringify(r)}`);
  }
  ...
  return {
    code: r.ISU_SRT_CD,
    name: r.ISU_ABBRV ?? r.ISU_NM ?? r.ISU_SRT_CD,
    market: r.market as Market,
    ...
  };
}
```

**upsert.ts (도메인 → DB snake_case)**:

```ts
  const dbRows = [...deduped.values()].map((m) => ({
    code: m.code,
    name: m.name,
    market: m.market,
    sector: m.sector,
    kosdaq_segment: m.kosdaqSegment,
    ...
  }));

  const { error } = await supabase
    .from("stocks")
    .upsert(dbRows, { onConflict: "code" });
```

**필드는 이미 타입에 존재한다** (`workers/master-sync/src/krx/fetchBaseInfo.ts` L4):

```ts
export type KrxBaseInfoRow = {
  ISU_CD?: string;              // 표준코드 KR로 시작 12자
  ISU_SRT_CD?: string;          // 단축코드 6자 — code 필수
```

→ 변경은 정확히 **3줄**: `map.ts` 에 `isin: r.ISU_CD ?? null,`, `upsert.ts` 에 `isin: m.isin,`,
`shared/stock.ts` 의 `StockMaster` 에 `isin`. 그 뒤 재배포 + 1회 실행(백필).
**단축코드→ISIN 산술 유도 금지**(D-28) — 우선주에서 어긋난다.

---

### F-1. `webapp/src/components/stock/stock-detail-client.tsx` (4탭 재구성)

**Analog:** 자기 자신 L126-163 — 현재 섹션이 세로로 나열된 배치를 **탭 패널로 옮기기만** 한다(내용 무변경, D-02a):

```tsx
  return (
    <div className="space-y-8">
      <StockHero stock={stock} />
      <div className="flex items-center justify-between gap-3">
        {updatedAtLabel && (
          <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)] mono">
            {updatedAtLabel}
          </span>
        )}
        <Button onClick={() => void load()} disabled={isRefreshing} variant="outline"
          aria-label="새로고침" aria-busy={isRefreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </Button>
      </div>
      <StockDailyChartSection code={stock.code} refreshSignal={isRefreshing} />
      <StockStatsGrid stock={stock} />
      ...
      <StockThemeChips stockCode={stock.code} />
      <StockLimitUpSection stockCode={stock.code} />
      <StockComovementSection stockCode={stock.code} />
      <div className="space-y-6">
        <StockNewsSection stockCode={stock.code} />
        <StockDiscussionSection stockCode={stock.code} />
      </div>
    </div>
  );
```

**재배치 맵 (UI-SPEC P3):** `차트`=`StockDailyChartSection` / `종목정보`=`StockStatsGrid`·`StockThemeChips`·`StockLimitUpSection`·`StockComovementSection` / `뉴스토론`=`StockNewsSection`·`StockDiscussionSection` / `호가주문`=신규.
`StockHero` + 갱신시각·새로고침 행은 **탭 밖 공통 영역**으로 남긴다.

**보존해야 할 기존 규율 (이 파일에서 잃기 쉬움):**
- L49-52 주석 — `notFound()` 를 useEffect 안에서 throw 하지 않고 state 플래그로 승격
- L86-93 — `setStockContext` 발행/언마운트 해제 (챗 FAB 라벨 연동)
- L108, L124 — 초기 로딩 스켈레톤 2경로

**컨테이너 폭 분기 지점** (`webapp/src/app/stocks/[code]/page.tsx` L19-25):

```tsx
  return (
    <AppShell sidebar={<AppSidebar />}>
      <div className="mx-auto w-full max-w-4xl">
        <StockDetailClient code={code} />
      </div>
    </AppShell>
  );
```

→ UI-SPEC P2 는 "호가주문 탭만 넓은 컨테이너(좌우 24px), 나머지 `max-w-4xl`" 이므로
`max-w-4xl` 을 page 에서 제거하고 **탭 패널별로** 적용하거나, 호가주문 패널만 negative-margin 으로
확장한다(플랜에서 택일 — page.tsx 는 `'use client'` + `use(params)` 형태를 유지).

---

### F-2. `webapp/src/components/stock/stock-orderbook-section.tsx` (섹션 셸)

**Analog:** `webapp/src/components/stock/stock-comovement-section.tsx`

**섹션 파일 상단 규약 — 무엇을·어디에·색 규칙·빈/에러 상태를 주석으로 박제** (L1-25):

```tsx
'use client';

/**
 * StockComovementSection — UI-SPEC §Component Structure (Phase 11 COMV-01, 채택안 변형 C).
 *
 * 종목 상세(/stocks/[code]) StockThemeChips 바로 다음에 마운트되는 신규 클라이언트 컴포넌트.
 * ...
 * ★ LOCKED 색 규칙 (UI-SPEC):
 *   - 동반율(confD0) 등 확률/비율 = 중립 --fg (빨강/파랑 금지).
 *   - 실시간 등락률만 방향색 (--up/--down/--flat).
 *   - 모든 색은 globals.css oklch 토큰만 (차트 아님 → 직접 사용). 신규 토큰/하드코딩 0.
 *
 * 빈 상태(후보 0) → "동반상승 데이터 부족" 박스. 에러 → 섹션 조용히 숨김(null, error.message
 * 미노출 — theme-chips/daily-chart quiet fallback 선례, T-11-18).
 */
```

**종목 간 내비게이션 state sticky 방어 — 호가창에서 특히 치명적** (L280-305):

```tsx
  useEffect(() => {
    // 종목 간 내비게이션(같은 동적 라우트 → remount 없이 props 갱신)에서 state sticky 방지 (WR-04):
    //   - hasError 리셋 없으면 한 번 실패 후 모든 종목에서 섹션 영구 숨김.
    //   - candidates/expanded 리셋 없으면 새 fetch 완료 전 이전 종목 후보 stale 노출.
    setLoaded(false);
    setHasError(false);
    setExpanded(false);
    setCandidates([]);
    const controller = new AbortController();
    void (async () => { ... })();
    return () => controller.abort();
  }, [stockCode]);
```

> **호가창 적용:** 종목 전환 시 이전 종목의 호가/체결/구독을 반드시 리셋 + `{t:"unsub"}` 전송.
> 리셋 누락 = **다른 종목 호가로 주문하는 사고**. 위 주석 형식을 그대로 옮겨 이유를 박제할 것.

**방향색 헬퍼 — 국내 관례** (L47-51):

```tsx
/** 실시간 등락률 방향색 (한국 관례: 상승 빨강 / 하락 파랑 / 보합 중립). */
function liveColor(v: number | null): string {
  if (v == null || v === 0) return 'text-[var(--flat)]';
  return v > 0 ? 'text-[var(--up)]' : 'text-[var(--down)]';
}
```

**잔량 바 — 호가 사다리 바의 직접 선례** (L93-103):

```tsx
        {bar != null && (
          <span aria-hidden="true" className="block h-[5px] overflow-hidden rounded-full bg-[var(--muted)]">
            <span className="block h-full rounded-full bg-[var(--primary)]" style={{ width: `${barPct(bar)}%` }} />
          </span>
        )}
```

**빈 상태 박스** (L334-345):

```tsx
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
          <CircleOff aria-hidden="true" className="mx-auto mb-2 size-[22px] text-[var(--muted-fg)]" />
          <p className="text-[length:var(--t-base)] font-bold">동반상승 데이터 부족</p>
          <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">...</p>
        </div>
```

> ⚠️ **차이 1개:** comovement 는 에러 시 `return null`(조용히 숨김)이지만, 호가창은 UI-SPEC C1 이
> "**섹션 자체를 숨기지 않는다**"로 못박았다 — `unauthorized`/에러도 게이트 카드(C13)로 렌더한다.

---

### F-3. `webapp/src/lib/use-relay-socket.ts` (wss 훅)

**Analog:** `webapp/src/lib/chat-sse.ts`

**토큰 취득 경로 — `getSession().access_token` (verbatim 재사용 대상)** (L116-138):

```ts
export async function streamChat(
  params: StreamChatParams,
  onEvent: ChatSSEEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (!session) {
    // D-01 — UI 가 로그인 게이트를 표시한다.
    throw new ChatStreamError("LOGIN_REQUIRED", "로그인이 필요합니다.");
  }

  const resp = await fetch(`${resolveBaseUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    ...
```

**에러 코드로 UI 를 분기시키는 전용 에러 클래스** (L26-42):

```ts
/** streamChat 에러 구분용 코드. UI 가 로그인 게이트/세션만료/비활성/일반 에러를 분기. */
export type ChatStreamErrorCode =
  | "LOGIN_REQUIRED" | "SESSION_EXPIRED" | "CHAT_DISABLED" | "STREAM_ERROR";

/** 챗 스트림 실패를 표현하는 통합 에러. `code` 로 UI 분기(D-01 로그인 게이트 등). */
export class ChatStreamError extends Error {
  readonly code: ChatStreamErrorCode;
  constructor(code: ChatStreamErrorCode, message: string) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
  }
}
```

**파서는 깨진 프레임을 throw 하지 않고 스킵** (L62-79):

```ts
      } else if (line.startsWith("data: ") && eventType) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(eventType as ChatSSEEventType, data as ChatSSEEventMap[ChatSSEEventType]);
        } catch {
          // ignore JSON parse errors — 깨진 data 라인은 스킵(T-14-08)
        }
        eventType = "";
      }
```

**URL 해석 — `.trim()` 필수** (`webapp/src/lib/api.ts` L20-31):

```ts
export function resolveBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (raw && raw.length > 0) return raw;

  if (!warnedMissingBaseUrl) {
    warnedMissingBaseUrl = true;
    console.warn(
      `[gh-radar] NEXT_PUBLIC_API_BASE_URL 미설정 — 개발용 ${DEV_FALLBACK_BASE_URL} 로 fallback. ...`,
    );
  }
  return DEV_FALLBACK_BASE_URL;
}
```

→ `resolveRelayWsUrl()` 도 **동일하게 `.trim()` + 1회 경고 + 로컬 fallback `ws://localhost:8090/ws`**(D-41).
자동 메모리 `feedback_vercel_env_paste_newline` — Vercel paste 의 trailing newline 이 클라 번들을 깨뜨린 전례가 있다.

---

### F-4. `webapp/src/lib/orders-api.ts` (인증 REST 클라이언트)

**Analog:** `webapp/src/lib/chat-api.ts` L1-40 — **`authFetch` 를 그대로 복제**한다

```ts
/**
 * Phase 14 Plan 07 — 챗 대화관리 API 래퍼 (CHAT-01, D-13).
 *
 * 대화 목록/상세/삭제는 JSON 응답이므로 lib/api.ts 의 `apiFetch`(Phase 2 envelope +
 * 8s 타임아웃)를 재사용한다. SSE 스트리밍(POST /api/chat)만 chat-sse.ts 의 raw fetch 로 분리
 * ...
 */
async function authFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const {
    data: { session },
  } = await createClient().auth.getSession();

  if (!session) {
    throw new ApiClientError({
      code: "UNAUTHENTICATED",
      message: "로그인이 필요합니다.",
      status: 401,
    });
  }
```

**서버 에러 envelope → `ApiClientError.code` 로 UI 분기** (`webapp/src/lib/api.ts` L139-156):

```ts
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || '요청이 실패했습니다';
    let details: unknown = undefined;
    try {
      const body = (await response.json()) as (Partial<ApiErrorBody> & { retry_after_seconds?: number }) | undefined;
      if (body?.error?.code) code = body.error.code;
      if (body?.error?.message) message = body.error.message;
      ...
    } catch { /* envelope 파싱 실패 — 기본 코드/메시지 유지 */ }
    throw new ApiClientError({ code, message, status: response.status, requestId, details });
  }
```

→ 주문 패널은 `err.code` 로 `SESSION_NOT_READY`(409) / `DMA_NOT_ALLOWED`(403) / `ORDER_TIMEOUT` /
`RELAY_UNAVAILABLE` 을 분기해 UI-SPEC §Copywriting 문구를 고른다.
⚠️ 주문 타임아웃 5초 > `apiFetch` 기본 8초 타임아웃 안이지만, **`timeoutMs` 를 명시**해 서버 5초 대기와의
경계를 코드에 남길 것.

---

### F-5. 호가창 하위 컴포넌트 (`webapp/src/components/orderbook/*`)

| 신규 파일 | 재사용할 기존 코드 |
|-----------|---------------------|
| `orderbook-ladder.tsx` | `stock-comovement-section.tsx` L93-103(잔량 바) · `ui/number.tsx`(모든 숫자 진입점) · globals.css `.mono`/`.num` |
| `trade-tape.tsx` | `stock-comovement-section.tsx` L245-263(칩 행 렌더) · `--up-bg`/`--down-bg` |
| `order-panel.tsx` + `확인 다이얼로그` | `webapp/src/components/chat/delete-conversation-dialog.tsx` |
| `account-panel.tsx` | `ui/table.tsx` + globals.css `.tbl-wrap`(`webapp/src/app/design/_sections/numbers.tsx` L98·L135 사용례) |
| `relay-status-bar.tsx` | `stock-hero.tsx` L58(`<Badge variant="outline">`) |
| `orderbook-skeleton.tsx` | `stock-daily-chart-skeleton.tsx` |

**되돌릴 수 없는 액션 다이얼로그** (`delete-conversation-dialog.tsx` L3-16, L41-80):

```tsx
/**
 * Phase 14 Plan 10 — 대화 삭제 확인 다이얼로그 (C11, CHAT-01, T-14-11).
 *
 * shadcn Dialog 로 hard delete(messages FK CASCADE) 전 확인을 강제한다. Copywriting 은
 * 14-UI-SPEC Destructive 계약 verbatim: `이 대화를 삭제할까요?` / `삭제한 대화는 되돌릴 수
 * 없어요.` / `삭제`(destructive) · `취소`(outline). 되돌릴 수 없는 파괴적 액션이므로 명시
 * 확인 없이는 삭제하지 않는다(실수 삭제 방지).
 *
 * 제어형 컴포넌트: `conversation` 이 non-null 이면 열림. 부모가 open 상태를 소유한다.
 */
export function DeleteConversationDialog({ conversation, onOpenChange, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const handleDelete = async () => {
    if (!conversation || deleting) return;      // ← 중복 제출 가드
    setDeleting(true);
    setError(false);
    try {
      await deleteConversation(conversation.id);
      onDeleted(conversation.id);
    } catch {
      // 서버 404/500/네트워크 실패 — unhandled rejection 방지 + 피드백 표시 (WR-05).
      setError(true);
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) setError(false); // 닫힘 시 에러 리셋 — 재오픈 시 깨끗한 상태.
    onOpenChange(open);
  };

  return (
    <Dialog open={conversation !== null} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>이 대화를 삭제할까요?</DialogTitle>
          <DialogDescription>삭제한 대화는 되돌릴 수 없어요.</DialogDescription>
        </DialogHeader>
```

**주문 확인 다이얼로그가 이 선례에서 반드시 가져올 것:** ① `if (submitting) return` 중복 제출 가드
② `catch` 에서 unhandled rejection 방지 + 인라인 피드백 ③ 닫힘 시 에러 리셋
④ **기본 포커스 = 취소 버튼**(UI-SPEC C12 — delete 다이얼로그와 다른 점, 신규 요건).

**숫자 렌더 진입점** (`webapp/src/components/ui/number.tsx` L24-36):

```tsx
/**
 * `<Number>` — UI-SPEC §5 계약 (locale `ko-KR` 고정, Geist Mono + tabular-nums).
 *
 * 모든 숫자 렌더링 진입점은 이 컴포넌트를 통과해야 한다. 포맷별 규칙은 UI-SPEC §5.2,
 * 색상 매핑(up/down/flat)은 §5.3, 기본 스타일 `.mono` 유틸은 globals.css §2.2 에 정의.
 */
```

> ⚠️ **`--up`/`--down` 은 oklch** (`webapp/src/styles/globals.css` L39-43 라이트 / L110-114 다크).
> 호가창은 DOM/CSS 렌더이므로 토큰 직접 사용이 정상이나, 만약 캔버스 계열 렌더러를 도입하면
> **hex 변환 필수**(자동 메모리 `feedback_lightweight_charts_oklch`).

**`ui/tabs.tsx` 는 저장소에 없다** — shadcn 공식 registry 에서 신규 설치.
설치 후 파일 형태는 `ui/toggle-group.tsx` L1-8 과 같아야 한다(`"use client"` + `radix-ui` 배럴 import + `cn`):

```tsx
"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/components/ui/toggle"
```

`webapp/components.json` 은 `"registries": {}` (3rd-party 없음) · `style: radix-nova` · `iconLibrary: lucide` —
**서드파티 registry 를 추가하지 않는다**(UI-SPEC §Registry Safety).

---

### F-6. webapp 테스트 (unit · component · E2E)

**컴포넌트 테스트** — `webapp/src/components/stock/__tests__/stock-comovement-section.test.tsx` L1-30:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Phase 11 Plan 05 — StockComovementSection 컴포넌트 단위 테스트 (COMV-01).
 * ...
 * 경로 주의: vitest include = src/**.test.{ts,tsx} 이므로 plan 의 webapp/tests/components/
 * 가 아니라 프로젝트 컨벤션(co-located __tests__)에 배치 (Rule 3 — 테스트 실행 보장).
 */

const fetchStockComovementMock = vi.fn();
vi.mock('@/lib/comovement-api', () => ({
  fetchStockComovement: (...args: unknown[]) => fetchStockComovementMock(...args),
}));

import { StockComovementSection } from '../stock-comovement-section';
```

> **경로 규칙 (플랜이 자주 틀리는 곳):** webapp 테스트는 `src/**/__tests__/` **co-located**.
> `webapp/tests/` 에 두면 vitest include 에 안 걸려 조용히 실행되지 않는다.

**E2E — 섹션 마운트 검증형** (`webapp/e2e/specs/stock-detail-chart.spec.ts` L1-46):

```ts
import { test, expect } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { mockNewsApi, buildNewsList } from '../fixtures/news';

/**
 * Phase 09.2 — DATA-03 차트 섹션 E2E.
 *
 * 스코프:
 *   - /stocks/005930 진입 시 차트 섹션이 Hero ↓ / StatsGrid ↑ 위치에 mount 되는지
 *   ...
 * 비검증 (Manual Verification — VALIDATION.md):
 *   - 캔들 픽셀 정확성 / 한국식 색상 시각 / 다크모드 토글 / 모바일 가독성
 */

test.describe('Phase 09.2 — 차트 섹션 (DATA-03)', () => {
  test('/stocks/005930 — 차트 섹션 마운트 + range 4종 + timeframe 3종 표시', async ({ page }) => {
    await mockStockApi(page);
    await mockNewsApi(page, { code: '005930', list: buildNewsList('005930', 5) });
    await page.goto('/stocks/005930');

    // Hero 가 먼저 보여야 후속 차트 섹션도 mount (StockDetailClient 의 isInitialLoading 분기)
    await expect(page.getByRole('heading', { name: '삼성전자' })).toBeVisible();

    const section = page.getByTestId('stock-daily-chart-section');
    await expect(section).toBeVisible();
    ...
    for (const range of ['1Y', '2Y', '3Y', '5Y']) {
      await expect(page.getByRole('tab', { name: range })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: '3Y' })).toHaveAttribute('aria-selected', 'true');
```

→ **탭 회귀 E2E(D-02a)의 직접 본보기.** `getByRole('tab', { name: '차트' })` + `aria-selected` 로
4탭 진입·기본 탭·기존 섹션 렌더를 검증한다. 딥링크는 `page.goto('/stocks/005930?tab=orderbook')`.

**E2E — 로그인/비로그인 게이트 분기형** (`webapp/e2e/specs/chat.spec.ts` L29-60):

```ts
// ── Test 1: 비로그인 게이트 (파일-레벨 분리 대신 describe-레벨 storageState 초기화) ──
test.describe('Phase 14 — 챗 비로그인 게이트 (D-01)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context }) => {
    // 워커 재사용 시 누수 쿠키 제거(auth-guards.spec 동형).
    await context.clearCookies();
  });
```

→ 호가창 `권한 없음` 게이트(C13) E2E 가 그대로 쓸 패턴. baseURL 은 `http://localhost:3100`(dev.sh 규약).

---

### G-1. `scripts/setup-relay-iam.sh`

**Analog:** `scripts/setup-intraday-sync-iam.sh`

**gcloud 가드(모든 인프라 스크립트 공통 머리)** (L18-40):

```bash
# Section 1: gcloud guard (candle-sync mirror)
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: export GCP_PROJECT_ID=gh-radar" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]]; then
  echo "ERROR: active gcloud configuration is '$ACTIVE_CONFIG', expected '$EXPECTED_CONFIG'" >&2
  echo "Hint: gcloud config configurations activate $EXPECTED_CONFIG" >&2
  exit 1
fi
...
echo "✓ gcloud guard: config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT"
```

**멱등 리소스 생성 패턴 (describe → 없으면 create → 확인 출력)** (L61-84):

```bash
# 3.1 VPC
if ! gcloud compute networks describe "$VPC_NAME" >/dev/null 2>&1; then
  echo "▶ creating VPC: $VPC_NAME (custom subnet mode)..."
  gcloud compute networks create "$VPC_NAME" --subnet-mode=custom
fi
echo "✓ VPC ready: $VPC_NAME"
...
# 3.3 Reserved Static External IP
if ! gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "▶ reserving Static IP: $STATIC_IP_NAME..."
  gcloud compute addresses create "$STATIC_IP_NAME" --region="$REGION"
fi
STATIC_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format='value(address)')
echo "✓ Static IP reserved: $STATIC_IP"
```

**API enable 도 멱등** (L43-51) — relay 는 `compute`·`secretmanager`·`artifactregistry`·`iap`·`monitoring` 추가.
`setup-relay-iam.sh` 는 **기존 VPC/서브넷을 만들지 않고 존재만 확인**한다(이미 있음, 실측).
신규 생성 대상: relay SA + Secret 3개 + 외부/내부 고정 IP + 방화벽 3규칙.

---

### G-2. `scripts/deploy-relay.sh`

**Analog:** `scripts/deploy-intraday-sync.sh`

**선행 리소스 검증 → 변수 → build → push → 배포 → 알림 정책** 6구간 구조. 핵심 발췌:

**Artifact Registry 태깅** (L49-58):

```bash
# Section 2: 변수
JOB=gh-radar-intraday-sync
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/intraday-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/intraday-sync:latest"
: "${SUPABASE_URL:?SUPABASE_URL must be set (export or .env.deploy)}"
echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"
```

**amd64 강제 빌드** (L60-71):

```bash
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/intraday-sync/Dockerfile \
  -t "$IMAGE" -t "$IMAGE_LATEST" .
```

**알림 정책 update-or-create (멱등) + 채널 ID 정규화** (L149-175):

```bash
# Section 7: Alert policy (idempotent — update-or-create)
ALERT_FILE="ops/alert-intraday-sync-failure.yaml"
if [[ -f "$ALERT_FILE" ]]; then
  : "${NOTIFICATION_CHANNEL_ID:?NOTIFICATION_CHANNEL_ID must be set for alert policy}"
  # gcloud monitoring 은 notificationChannels 에 full resource name 을 요구 — ID 만 주어지면 정규화.
  CHANNEL_RESOURCE="$NOTIFICATION_CHANNEL_ID"
  case "$CHANNEL_RESOURCE" in
    projects/*) ;;
    *) CHANNEL_RESOURCE="projects/${EXPECTED_PROJECT}/notificationChannels/${NOTIFICATION_CHANNEL_ID}" ;;
  esac
  RESOLVED_YAML=$(mktemp)
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${CHANNEL_RESOURCE}|g" "$ALERT_FILE" > "$RESOLVED_YAML"

  EXISTING_POLICY=$(gcloud alpha monitoring policies list \
    --filter="displayName=gh-radar-intraday-sync-failure" --format='value(name)' 2>/dev/null | head -1)

  if [[ -n "$EXISTING_POLICY" ]]; then
    gcloud alpha monitoring policies update "$EXISTING_POLICY" --policy-from-file="$RESOLVED_YAML" >/dev/null
  else
    gcloud alpha monitoring policies create --policy-from-file="$RESOLVED_YAML" >/dev/null
  fi
  rm -f "$RESOLVED_YAML"
  echo "✓ Alert policy ready"
fi
```

**relay 차이:** Cloud Run 배포 대신 **VM 에 IAP SSH 로 `docker pull` + `docker run --restart=always`**.
알림 정책은 Job 실패 메트릭이 아니라 **uptime check**(`https://dma.jx1.io/healthz`) 기반이므로
`ops/alert-relay-down.yaml` 의 `conditions[].conditionThreshold.filter` 를 바꿔야 한다.
**필수 env**: `GCP_PROJECT_ID` + `SUPABASE_URL` + `NOTIFICATION_CHANNEL_ID`(자동 메모리 `reference_deploy_worker_env`).

**`scripts/deploy-server.sh` 수정 지점** (L143-144) — 델리미터 `^@^` 규칙:

```bash
  --set-env-vars="^@^NODE_ENV=production@LOG_LEVEL=info@SUPABASE_URL=${SUPABASE_URL}@...@APP_VERSION=${SHA}@DISCUSSION_CLASSIFY_ENABLED=${DISCUSSION_CLASSIFY_ENABLED:-false}" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,...,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest"
```

→ `@RELAY_INTERNAL_URL=http://10.10.0.5:8091` 를 env 문자열에 append,
`RELAY_ORDER_SECRET=gh-radar-relay-order-secret:latest` 를 `--update-secrets` 에 append.
**`--set-env-vars` 는 env 를 전량 치환**하므로 하나라도 빠지면 재배포마다 초기화된다
(deploy-intraday-sync.sh L91 의 경고 주석과 동일 함정).

---

### G-3. `scripts/smoke-relay.sh`

**Analog:** `scripts/smoke-intraday-sync.sh`

**INV 러너 골격** (L1-33):

```bash
#!/usr/bin/env bash
set -uo pipefail
# -e 끄고 개별 invariant 추적
...
PASS=0
FAIL=0
declare -a FAILED_INVS

check() {
  local name="$1"; shift
  echo -n "  $name ... "
  if "$@" >/dev/null 2>&1; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
    FAILED_INVS+=("$name")
  fi
}
```

**서브커맨드 분기(부분 검증)** (L35-40):

```bash
case "${1:-}" in
  --check-scheduler)
    check "Scheduler ENABLED + cron '* 8-15 * * 1-5' Asia/Seoul" bash -c "
      STATE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      ...
    "
```

**종료 요약** (tail):

```bash
echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
```

→ RESEARCH §Validation Architecture 의 INV-1~8 을 이 `check()` 로 감싼다.
`--check-isin`(백필 null 카운트) 서브커맨드는 위 `--check-scheduler` 형태를 그대로 따른다.
**INV-7 은 "실패해야 PASS"** (`nc -z -w3 <공인IP> 8091` 이 실패해야 내부 포트가 닫힌 것) — `check()` 에
`bash -c "! nc ..."` 로 부정을 명시할 것.

---

### G-4. `ops/alert-relay-down.yaml`

**Analog:** `ops/alert-intraday-sync-failure.yaml` (전문 L1-27)

```yaml
displayName: gh-radar-intraday-sync-failure
documentation:
  content: |
    Cloud Run Job `gh-radar-intraday-sync` 의 실행 실패를 감지.
    DATA-02 (Phase 09.1) — 5분 윈도우에 실패 1건 이상 시 즉시 알림.
    원인 추정: 키움 401 (token/credential) / 429 (rate limit) / MIN_EXPECTED 가드 위반 / Supabase 장애.
  mimeType: text/markdown
conditions:
  - displayName: intraday-sync failed execution count > 0
    conditionThreshold:
      filter: |
        resource.type = "cloud_run_job"
        AND resource.labels.job_name = "gh-radar-intraday-sync"
        AND metric.type = "run.googleapis.com/job/completed_execution_count"
        AND metric.labels.result = "failed"
      comparison: COMPARISON_GT
      thresholdValue: 0
      duration: 0s
      aggregations:
        - alignmentPeriod: 300s
          perSeriesAligner: ALIGN_SUM
combiner: OR
enabled: true
notificationChannels:
  - "${NOTIFICATION_CHANNEL_ID}"
alertStrategy:
  autoClose: 1800s
```

**유지할 규약:** `documentation.content` 에 **원인 추정 목록**을 반드시 적는다(호출받은 사람이 즉시 분기).
`notificationChannels` 는 리터럴이 아니라 `"${NOTIFICATION_CHANNEL_ID}"` 플레이스홀더(배포 스크립트가 sed 치환).
relay 판 filter 는 uptime check 기반 — `metric.type = "monitoring.googleapis.com/uptime_check/check_passed"`.

---

### G-5. `scripts/dma-credentials.ts` (관리자 수기 등록)

**Analog:** `webapp/scripts/seed-test-user.ts` (L1-45)

```ts
#!/usr/bin/env tsx
/**
 * E2E 테스트 유저 seeder — dev Supabase 프로젝트에 Playwright 용 고정 계정 1명을 멱등 생성.
 *
 * 실행:
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   E2E_TEST_EMAIL=e2e@gh-radar.local \
 *   E2E_TEST_PASSWORD=... \
 *   pnpm exec tsx scripts/seed-test-user.ts
 *
 * 필수 환경변수:
 *   SUPABASE_URL                  - 프로젝트 URL
 *   SUPABASE_SERVICE_ROLE_KEY     - service_role key (webapp runtime 에서 금지 — seeder 전용)
 * ...
 * 동작:
 *   - 유저가 이미 존재하면 skip (exit 0)
 *   - 존재하지 않으면 createUser({ email_confirm: true }) 후 출력 (exit 0)
 *   - 실패 시 에러 메시지 출력 + exit 1
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
...
if (!url || !serviceKey || !password) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_TEST_PASSWORD");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

**이식 규율:** shebang `#!/usr/bin/env tsx` + 주석에 **실행 명령·필수 env·동작(멱등/exit code)** 3블록.
DMA 비밀번호는 **인자·env 로 받지 말고 stdin/prompt** 로 받아 shell history 에 남기지 않는다.
AES 키는 Secret Manager 에서 읽고(`gh-radar-dma-cred-key`), 평문·키를 stdout 에 출력하지 않는다(D-18).

---

## Shared Patterns

### S-1. 에러 envelope `{error:{code,message}}` — server·relay 전 경로 단일 형식

**Source:** `server/src/errors.ts` L1-10 · `server/src/middleware/error-handler.ts` L1-33
**Apply to:** `server/src/routes/orders.ts`, `relay/src/order/order-api.ts`, `webapp/src/lib/orders-api.ts`

```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

```ts
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reqLog = (req as unknown as { log?: { warn: Function; error: Function } }).log;

  if (err instanceof ApiError) {
    reqLog?.warn({ err: { code: err.code, message: err.message }, code: err.code }, "api error");
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  ...
  reqLog?.error({ err }, "unhandled error");
  const isProd = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isProd ? "Internal server error" : err?.message ?? "unknown",
    },
  });
};
```

**규율:** 프로덕션에서 `err.message` 를 사용자에게 노출하지 않는다. relay 내부 HTTP 도 같은 envelope 를 쓰면
server 가 relay 응답을 그대로 재매핑하기 쉽다(RESEARCH Pattern 10 매핑표).

### S-2. rate-limit — 전역 + 라우트별 2층

**Source:** `server/src/middleware/rate-limit.ts` (전문 L1-21) · `server/src/routes/chat.ts` L32-43
**Apply to:** `server/src/routes/orders.ts`

```ts
export function apiRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 200,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "", 64),
    skip: (req) => req.path.startsWith("/health"),
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests, retry later." } });
    },
  });
}
```

주문은 **비용이 아니라 오주문 방어**가 목적이므로 챗(20/60s)보다 더 낮게 잡되, 사용자 1명이 정상적으로
연타할 수 있는 범위는 남긴다(값은 플랜 재량, `keyGenerator` 는 IP 가 아니라 `req.userId` 기준을 검토).

### S-3. Supabase 신규 테이블 — RLS role 명시 + REVOKE 명시

**Source:** `supabase/migrations/20260514120100_create_kiwoom_tokens.sql` L27-32 ·
`supabase/migrations/20260515163000_fix_stock_daily_ohlcv_rls_authenticated.sql` L1-17
**Apply to:** `dma_credentials`, `dma_orders`, `stocks.isin`

- 비공개(서비스롤 전용) 테이블: `ENABLE ROW LEVEL SECURITY` + **정책 0개** + `REVOKE ALL FROM PUBLIC`
  + `REVOKE ALL FROM anon, authenticated` + `GRANT ... TO service_role`.
- 공개 읽기 테이블에 정책을 추가할 일이 생기면 **`TO anon, authenticated` 둘 다 명시**
  (`TO anon` 만 쓰면 로그인 사용자가 default-deny 로 0행 — 위 fix 마이그레이션이 그 사고의 기록).

### S-4. 인증 — `supabase.auth.getUser(token)` 단일 방식

**Source:** `server/src/middleware/require-auth.ts` L29-38 · `server/src/services/supabase.ts` L3-9
**Apply to:** `server/src/routes/orders.ts`(미들웨어 재사용), `relay/src/auth/verify-token.ts`(순수함수 이식)

jose/JWKS 로컬 검증은 **deferred**(D-10) — 두 진입점(REST·wss)이 같은 방식을 쓰므로 revoke·만료가 즉시 반영된다.

### S-5. "무로그 fail-safe 금지" — 드롭·스킵 경로에 카운터와 이유를 남긴다

**Source:** gh-trade `Client.cs` L1988-2005 (`TakeCount` Warning) · `PacketCodec.cs` L104-107 주석 ·
자동 메모리 `feedback_silent_failure_max_tokens`
**Apply to:** `relay/src/dma/codec.ts`, `envelope.ts`, `dma-client.ts`, `ws/fanout.ts`

- 프레임 드롭: `droppedFrameCount` 누적 + 선두 64B hex 덤프 + `msg_type`.
- 벡터 절단: `label`·실제 건수·상한을 warn 로그.
- ws 백프레셔 terminate: 사유·`bufferedAmount`·userId 로그.
- 조용한 `return`/`catch {}` 금지 — "간헐적으로 호가가 안 옴"의 원인 추적 불가를 만든다.

### S-6. 파일 상단 docblock 규약 (전 코드베이스 공통)

`server/src/routes/chat.ts` L18-29 · `stock-comovement-section.tsx` L3-25 ·
`20260702170000_chat_conversations.sql` L1-33 이 모두 같은 형식이다:

1. **Phase/Plan 번호 + 요구사항 ID** (예: `Phase 15 Plan 04 — RELAY-01`)
2. **무엇을 하는지 한 문단**
3. **결정 근거를 D-번호로 역참조** (`D-13`, `T-15-xx`)
4. **하지 않는 것 / 함정** (예: "SSE 는 헤더 쓴 뒤 상태코드 변경 불가")

플랜 태스크는 새 파일마다 이 4블록 docblock 을 산출물로 요구할 것 — 이 저장소의 사실상 표준이다.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `relay/src/generated/**` (StockDMA.ts · stock-dma.ts · stock-dma/*.ts 38개 · StockDMA.fbs 사본) | generated | — | gh-trade `server/scripts/sync-relay-schema.sh` 산출물. **손으로 만들거나 고치지 않는다**(D-26). 선행 조건: `relay/` 디렉터리 존재 + `pnpm-workspace.yaml` 등록 + `pnpm install`(가드 0) |
| `infra/relay/startup.sh` | infra | — | gh-radar 최초 IaaS. VM 0대 · 방화벽 0개 실측. RESEARCH Pattern 7(멱등 startup-script 항목표) + 메타데이터 서버 토큰 → Secret Manager 무의존 curl 경로를 정본으로 사용 |
| `infra/relay/Caddyfile` | config | — | 저장소에 리버스 프록시 설정 선례 없음. RESEARCH Pattern 9(4줄 Caddyfile + `stream_close_delay` 경고) 사용 |
| `infra/relay/openconnect@.service` | config | — | 저장소에 systemd 유닛 선례 없음. Mac `/usr/local/sbin/kbvpn-connect` 의 실인자만 참조(비밀번호 값 제외), 재시도 상한은 `Restart=on-failure` + `StartLimitBurst`(무한 재시도 금지 D-16) |

**추가 주의 — analog 는 있으나 "부분"인 것:**
- `relay/src/hub/subscription-hub.ts` — gh-radar 에 참조계수/스냅샷 캐시 선례가 없다. gh-trade `Client.cs`
  시세 소비부는 상한 가드만 제공하고 refcount 는 없다. **RESEARCH Pattern 5 를 설계 정본**으로 삼고,
  키에 `userId` 포함(D-13) · 재구독은 Hub 소유 키 집합 순회(브라우저 상태 비의존)를 불변식으로 못박을 것.
- `webapp/e2e/fixtures/relay.ts` — `webapp/e2e/fixtures/chat.ts` 는 본 매핑에서 열람하지 않았다.
  플랜 실행 시 `fixtures/mock-api.ts`·`fixtures/chat.ts` 를 먼저 읽고 route-mock 규약을 확인할 것.

---

## Metadata

**Analog search scope:**
`server/src/**`, `server/tests/**`, `packages/shared/src/**`, `webapp/src/{lib,components,app,styles}/**`,
`webapp/e2e/**`, `webapp/scripts/**`, `workers/master-sync/src/**`, `scripts/**`, `ops/**`,
`supabase/migrations/**`, 루트 config(`pnpm-workspace.yaml`·`tsconfig.base.json`·`package.json`·`dev.sh`),
형제 저장소 `/Users/alex/repos/gh-trade/{client/Services/DMA,server/scripts}` (읽기 전용)

**Files scanned:** 62 (gh-radar 56 · gh-trade 6)
**Pattern extraction date:** 2026-09-05

**플랜 작성 시 반드시 함께 볼 것:**
- `15-CONTEXT.md` §Canonical References — D-번호 결정 정본
- `15-RESEARCH.md` §Recommended Project Structure · §Pattern 1~11 · §Pitfall 1~15 · §Validation Architecture
- `15-UI-SPEC.md` §Component Inventory · §Copywriting Contract — 호가창 UI 계약 정본
- **[BLOCKING] 게이트 2건:** ① D-03 kbs124 VPN 선검증 ② D-25 gh-trade Phase 17 완료 후 `sync-relay-schema.sh` 재실행
