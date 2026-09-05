/**
 * Phase 15 Plan 05 — RELAY-01/RELAY-03. relay 내부 HTTP 표면 (`/healthz` + 공유 비밀 관문).
 *
 * 이 포트(8091)는 **Cloud Run 만 부른다**. 방화벽이 서브넷 출발지로 이미 좁혀 두었고
 * (15-06/15-07), 여기서는 그 절반인 애플리케이션 측 방어 — `X-Relay-Secret` 헤더 —
 * 를 담당한다. 네트워크와 애플리케이션 어느 한쪽이 뚫려도 다른 쪽이 남는 구조다 (D-19/D-22).
 *
 * 미들웨어 순서 (`server/src/app.ts` 규약을 내부 전용으로 축약):
 *   1. `express.json({limit:"16kb"})`
 *   2. **공유 비밀 관문** — `/healthz` 만 예외
 *   3. 라우터
 *   4. 404
 *   5. errorHandler (반드시 마지막)
 *
 * 두지 않는 것과 그 이유:
 *   - 교차 출처 허용 설정(CORS): 브라우저가 이 포트를 부르지 않는다. 시세는 8090 wss 고
 *     주문은 Cloud Run 이 중계한다. 허용 목록을 두면 "브라우저가 직접 불러도 된다"는
 *     잘못된 신호가 된다.
 *   - 요청량 제한: 호출자가 Cloud Run 하나뿐이라 사용자 단위 제한의 의미가 없다.
 *     외부에서 오는 요청은 방화벽에서 이미 끊긴다.
 *   - TLS: Caddy 가 종단한다 (D-05). 이 프로세스는 인증서를 다루지 않는다.
 *
 * 결정 근거:
 *   T-15-06  헤더 비교는 **`crypto.timingSafeEqual` 상수시간**이다. `===` 는 첫 불일치
 *            바이트에서 즉시 반환하므로 응답시간으로 비밀을 한 글자씩 복원할 수 있다.
 *            길이가 다르면 `timingSafeEqual` 이 throw 하므로 길이 검사를 먼저 한다.
 *   T-15-22  `/healthz` 는 비밀 없이 통과하는 **유일한 경로**다(Caddy 경유 uptime check
 *            대상). 그래서 페이로드를 `{status, vpn, dma, version, sessionCount}` 로
 *            제한한다 — 사용자 식별자·DMA user_id·계좌 정보는 어느 필드에도 넣지 않는다
 *            (RESEARCH Open Question 4 결론).
 *   S-1      에러는 `{error:{code,message}}` 단일 형식이다. server 가 relay 응답을 그대로
 *            재매핑할 수 있어야 한다. 프로덕션에서 `err.message` 는 노출하지 않는다.
 */
import { timingSafeEqual } from "node:crypto";
import express, { type Express, type ErrorRequestHandler, type RequestHandler } from "express";

import { logger } from "../logger.js";
import type { SessionStats } from "../dma/session-manager.js";

// ============================================================
// 계약
// ============================================================

/** 비밀 없이 통과하는 유일한 경로. 값을 두 곳에 적지 않으려고 상수로 둔다. */
const HEALTH_PATH = "/healthz";

/** `SessionManager` 중 이 모듈이 쓰는 부분만. 테스트가 스텁을 넣을 수 있게 좁힌다. */
export interface OrderApiSessions {
  stats(): SessionStats;
}

export type OrderApiDeps = {
  /** `RELAY_ORDER_SECRET` — server → relay 공유 비밀 (D-22). */
  relayOrderSecret: string;
  /** 이미지 빌드 시 주입된 `APP_VERSION`(GIT_SHA). */
  appVersion: string;
  nodeEnv: string;
  sessions: OrderApiSessions;
};

/**
 * `/healthz` 응답. **식별자를 담지 않는다** — 공개 경로이므로 필드를 늘릴 때마다
 * "이 값이 인터넷에 나가도 되는가"를 먼저 물어야 한다.
 */
export type HealthPayload = {
  status: "ok" | "degraded";
  /** 게이트웨이로 가는 회선(VPN 포함)이 통하는가. */
  vpn: boolean;
  /** DMA 세션이 운용 가능한 상태인가. */
  dma: boolean;
  version: string;
  /** 활성 세션 **수**. 누구인지는 담지 않는다. */
  sessionCount: number;
};

// ============================================================
// 에러 (S-1 — server 와 동일 envelope)
// ============================================================

export class RelayApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RelayApiError";
  }
}

// ============================================================
// 공유 비밀 관문 (T-15-06)
// ============================================================

/**
 * 상수시간 문자열 비교.
 *
 * `timingSafeEqual` 은 **길이가 다르면 throw** 한다. 그래서 길이 검사를 먼저 하는데,
 * 길이 자체는 상수시간으로 감출 수 없는 정보다(응답 크기·연결 수명으로도 샌다).
 * 감춰야 하는 것은 **내용**이고, 그것을 이 함수가 보장한다.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `X-Relay-Secret` 검사 미들웨어.
 *
 * 실패 응답에 **기대값도, 받은 값도, 요청 본문도 싣지 않는다.** 로그에도 넣지 않는다 —
 * 실패 사유를 친절하게 알려 주는 것이 곧 오라클이 된다. 남기는 것은 경로와 헤더 유무뿐이다.
 */
function relaySecretGuard(expected: string): RequestHandler {
  return (req, _res, next) => {
    if (req.path === HEALTH_PATH) {
      next();
      return;
    }

    const header = req.get("x-relay-secret");
    if (header === undefined || !secretMatches(header, expected)) {
      logger.warn(
        { path: req.path, method: req.method, hasHeader: header !== undefined },
        "[order-api] 공유 비밀 불일치 — 401",
      );
      next(new RelayApiError(401, "UNAUTHORIZED_RELAY", "Unauthorized"));
      return;
    }

    next();
  };
}

// ============================================================
// 팩토리
// ============================================================

export function createOrderApi(deps: OrderApiDeps): Express {
  const app = express();
  const isProd = deps.nodeEnv === "production";

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use(relaySecretGuard(deps.relayOrderSecret));

  /**
   * 공개 상태 점검.
   *
   * `degraded` 판정: 활성 세션이 하나라도 있는데 **그중 Ready 가 0개**면 회선/게이트웨이
   * 쪽 문제로 본다. 세션이 0개면 게이트웨이에 아무것도 요구하지 않은 상태라 `ok` 다
   * (아무도 접속하지 않은 장 시작 전이 정상 상태여야 한다 — 테스트 ⑦).
   *
   * `vpn` 은 게이트웨이 TCP 도달성의 **근사**다. v1 은 실제 세션의 Ready 여부에서 파생하며
   * 능동 프로브(주기적 TCP connect)를 두지 않는다 — 아무도 접속하지 않은 시간에도 KB
   * 게이트웨이로 주기 트래픽을 만들게 되고, 그것은 D-27(실서버 접속은 사용자 지시가 있을
   * 때만)과 정면으로 어긋난다. 그래서 v1 의 `vpn` 과 `dma` 는 같은 신호에서 나온다.
   *
   * uptime check 규약(RESEARCH Assumption A7): **degraded 는 HTTP 503 으로 내려야 한다.**
   * 200 으로 내리면서 본문에만 "degraded" 를 적으면 Cloud Monitoring 의 기본 uptime check
   * 는 본문을 보지 않으므로 컨테이너 내부 장애가 영원히 감지되지 않는다.
   */
  app.get(HEALTH_PATH, (_req, res) => {
    const stats = deps.sessions.stats();
    const healthy = stats.sessionCount === 0 || stats.readyCount > 0;

    const payload: HealthPayload = {
      status: healthy ? "ok" : "degraded",
      vpn: healthy,
      dma: healthy,
      version: deps.appVersion,
      sessionCount: stats.sessionCount,
    };

    res.status(healthy ? 200 : 503).json(payload);
  });

  // TODO(D-25): 주문 라우트(`POST /internal/orders`)는 15-16 에서 추가한다.
  // gh-trade 17(users.toml 인증 + LoginResp 계좌 목록) 완료 + sync-relay-schema.sh
  // 재실행이 선행 조건이라 이 plan 에서는 관문과 상태 점검까지만 세운다.

  // 404 — 관문을 통과한 요청이 갈 곳이 없는 경우.
  app.use((_req, _res, next) => {
    next(new RelayApiError(404, "NOT_FOUND", "Route not found"));
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof RelayApiError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }

    logger.error({ err }, "[order-api] 처리되지 않은 오류");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        // 프로덕션에서 내부 메시지를 호출자에게 흘리지 않는다 (S-1).
        message: isProd ? "Internal server error" : ((err as Error)?.message ?? "unknown"),
      },
    });
  };
  app.use(errorHandler);

  return app;
}
