/**
 * Phase 15 Plan 05 → Phase 16 Plan 16 — relay 내부 HTTP 표면.
 * **`/healthz` + 공유 비밀 관문, 그 둘뿐이다.**
 *
 * 이 포트(8091)는 **Cloud Run 만 부른다**. 방화벽이 서브넷 출발지로 이미 좁혀 두었고
 * (15-06/15-07), 여기서는 그 절반인 애플리케이션 측 방어 — `X-Relay-Secret` 헤더 —
 * 를 담당한다. 네트워크와 애플리케이션 어느 한쪽이 뚫려도 다른 쪽이 남는 구조다 (D-19/D-22).
 *
 * ★ **주문 라우트는 여기에 없다** (D-02). `POST /internal/orders` 와 그에 딸린 대기 큐·
 * 타이머·요청 스키마는 16-08 에서 `ws/order-handler.ts` 로 이식됐고, 16-10 이 브라우저
 * 호출부를, 16-16 이 server 의 호출부(`services/relay-client.ts`)를 지웠다. 마지막 호출자가
 * 사라진 지금 이 라우트를 남겨 두면 그것은 아무도 쓰지 않는 **주문 실행 공격면**일 뿐이다
 * (T-16-11). 판정 함수(`statusOf`/`filledQtyOf`)와 5초 상한은 `order/notice-status.ts`
 * 에 있고 wss 경로가 그것을 쓴다 — 이 파일과 함께 지워지지 않는다.
 *
 * 관문은 **남긴다.** `/healthz` 가 살아 있는 한 그 외의 모든 경로는 비밀 없이 404 조차
 * 받아서는 안 된다 — 경로 존재 여부가 새는 것도 정보다. `RELAY_ORDER_SECRET` 을 required
 * 로 두는 이유가 이것이다 (CONTEXT deferred).
 *
 * 미들웨어 순서 (`server/src/app.ts` 규약을 내부 전용으로 축약):
 *   1. `express.json({limit:"16kb"})`
 *   2. **공유 비밀 관문** — `/healthz` 만 예외
 *   3. `/healthz`
 *   4. 404
 *   5. errorHandler (반드시 마지막)
 *
 * 두지 않는 것과 그 이유:
 *   - 교차 출처 허용 설정(CORS): 브라우저가 이 포트를 부르지 않는다. 시세도 주문도
 *     8090 wss 다. 허용 목록을 두면 "브라우저가 직접 불러도 된다"는 잘못된 신호가 된다.
 *   - 요청량 제한: 호출자가 uptime check 뿐이라 사용자 단위 제한의 의미가 없다.
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
 *   S-1      에러는 `{error:{code,message}}` 단일 형식이다. 프로덕션에서 `err.message`
 *            는 노출하지 않는다.
 */
import { timingSafeEqual } from "node:crypto";
import os from "node:os";
import express, { type Express, type ErrorRequestHandler, type RequestHandler } from "express";

import { logger } from "../logger.js";
import { isGatewayLinkUp } from "../dma/link-health.js";
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
  /** `RELAY_ORDER_SECRET` — 내부 HTTP 표면의 공유 비밀 (D-22). */
  relayOrderSecret: string;
  /** 이미지 빌드 시 주입된 `APP_VERSION`(GIT_SHA). */
  appVersion: string;
  nodeEnv: string;
  sessions: OrderApiSessions;
  /** 게이트웨이 주소. `/healthz` 의 회선 판정 기준이다(패킷을 보내지 않는다). */
  dmaHost: string;
  /** 인터페이스 목록 주입구 — 테스트가 VPN 유무를 흉내낸다. */
  networkInterfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>;
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
  /**
   * **한 번이라도 Ready 였던** 세션 수. 누구인지는 담지 않는다 (식별자가 아니므로
   * T-15-22 위반이 아니다).
   *
   * `sessionCount:1, everReadyCount:0`(게이트웨이 부재) 과 `sessionCount:1,
   * everReadyCount:1`(게이트웨이 장애) 은 운영상 전혀 다른 상황인데 `sessionCount`
   * 만으로는 구분되지 않는다. 판정의 근거를 응답에서 읽을 수 있어야 한다 (16-21).
   */
  everReadyCount: number;
  /**
   * 생성 후 `STALE_SESSION_MS` 가 지나도록 **한 번도** Ready 가 아닌 세션 수. 누구인지는
   * 담지 않는다 — `sessionCount` 와 같은 취급이다(수는 있고 식별자는 없다).
   *
   * `everReadyCount:0` 하나만으로는 「게이트웨이가 아직 없는 환경」과 「장애 중에 relay 가
   * 재시작해 래치가 지워진 상태」가 같은 값으로 보인다. 이 필드가 그 둘을 응답에서 바로
   * 읽게 해 준다 (16-30 / GC-WR-07).
   */
  stalledCount: number;
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
   * `degraded` 판정 (15-05 원문 — 아래 ★ 2026-09-09 문단이 **대체한다**. 이 문단은
   * 판정의 유래를 남기기 위해 보존한다): 활성 세션이 하나라도 있는데 **그중 Ready 가
   * 0개**면 회선/게이트웨이 쪽 문제로 본다. 세션이 0개면 게이트웨이에 아무것도 요구하지
   * 않은 상태라 `ok` 다 (아무도 접속하지 않은 장 시작 전이 정상 상태여야 한다 — 테스트 ⑦).
   *
   * `vpn` 은 **회선 실측**이다 (2026-09-06 변경). 예전에는 `dma` 와 같은 신호(세션 Ready)
   * 에서 파생했는데, 그러면 **접속자가 0명일 때 VPN 이 완전히 죽어도 `ok`** 였다. uptime
   * check 는 본문이 아니라 상태코드만 보므로 알림이 영원히 울리지 않는다 — 그날 11:41 KST
   * VPN 정지를 아무 신호 없이 통과시킨 것이 이 결함이다.
   *
   * 능동 프로브(주기적 TCP connect)는 여전히 두지 않는다. 아무도 안 쓰는 시간에 KB 사내망
   * 트래픽을 만들면 D-27 과 어긋난다. 대신 `isGatewayLinkUp` 이 **로컬 인터페이스만** 읽어
   * (순수 syscall, 송신 0) 터널 유무를 본다. 그래서 접속자 0명이어도 즉시 감지된다.
   *
   * uptime check 규약(RESEARCH Assumption A7): **degraded 는 HTTP 503 으로 내려야 한다.**
   * 200 으로 내리면서 본문에만 "degraded" 를 적으면 Cloud Monitoring 의 기본 uptime check
   * 는 본문을 보지 않으므로 컨테이너 내부 장애가 영원히 감지되지 않는다.
   *
   * ★ 2026-09-09 변경 (16-21, gap 4) — **이 문단이 15-05 의 계약(「세션이 0건이거나
   * Ready 가 1건 이상이면 ok」)을 대체한다.** 판정의 기준축이 `sessionCount` 에서
   * `everReadyCount` 로 옮겨간다.
   *
   * 판정에서 **「한 번도 Ready 인 적 없는 세션」을 제외**한다. `DMA_HOST` 가 뜨지 않은
   * 환경(D-27 상 로컬 mock)에서는 로그인 사용자가 붙는 즉시 세션이 만들어지고 영원히
   * Ready 가 되지 않는다 — 그것은 relay 의 장애가 아니라 **게이트웨이가 애초에 없는
   * 상태**다. 그 구간을 503 으로 보고하면 uptime 이 상시 적색이 되고, 상시 적색은 곧
   * 알림 무시다. 그러면 진짜 장애도 함께 놓친다.
   *
   * **Ready 였다가 죽은 세션은 여전히 degraded 다.** `DmaSession#hasBeenReady` 래치가
   * 그 구분의 유일한 근거다 — 이것을 지우거나 되돌리면 진짜 게이트웨이 장애 탐지가
   * 함께 죽는다 (T-16-26).
   *
   * `vpn`(회선 실측)은 **바뀌지 않았다.** 접속자 0명일 때 터널이 죽으면 여전히
   * degraded 다 (2026-09-06 변경 유지). 세션 판정 완화가 회선 신호를 가리지 않는다.
   *
   * `sessionCount` 는 **판정에서 빠지고 페이로드에만 남는다**(진단용).
   *
   * ★ 2026-09-09 보강 (16-30 / GC-WR-07) — `hasBeenReady` 는 **프로세스 메모리 래치**다.
   * 게이트웨이 장애 중에 relay 가 재배포·OOM·크래시로 한 번 재시작하면 `everReadyCount`
   * 가 0 으로 초기화되어, 그 뒤로는 사용자가 아무리 붙어도 진짜 장애가 **영원히 `ok`** 로
   * 보고된다. 예전 규칙(`sessionCount > 0 && readyCount === 0` → degraded)이 잡던 사례가
   * 통째로 빠지는 자리다. `vpn` 은 인터페이스 존재만 보므로(터널은 살아 있고 게이트웨이
   * 프로세스만 죽은 경우) 이를 대체하지 못한다.
   *
   * 그래서 「생성 후 `STALE_SESSION_MS` 가 지나도록 한 번도 Ready 가 아닌 세션」
   * (`stalledCount`)을 함께 센다. 부팅 직후의 정상 구간은 그 유예가 흡수하므로 16-21 이
   * 얻은 면제는 그대로이고, 그 시간을 넘긴 미Ready 만 degraded 다.
   *
   * **이 문단은 위 16-21 문단을 되돌리지 않는다.** `everReadyCount === 0` 유예는 유지되고
   * 거기에 **시간 상한**이 붙을 뿐이다. 「Ready 였다가 죽은 세션은 여전히 degraded」와
   * 「`vpn` 은 세션과 독립」 두 문장도 그대로다.
   */
  const readInterfaces = deps.networkInterfaces ?? (() => os.networkInterfaces());

  app.get(HEALTH_PATH, (_req, res) => {
    const stats = deps.sessions.stats();
    // 두 신호를 **분리**한다. 회선은 접속자 수와 무관한 사실이고, 세션은 접속자가 있을
    // 때만 의미가 있다. 하나로 합치면 접속자 0명이 회선 장애를 가려 버린다.
    const linkUp = isGatewayLinkUp(deps.dmaHost, readInterfaces());
    // 「게이트웨이가 애초에 없는 환경」(everReadyCount 0) 은 장애가 아니다.
    // 「Ready 였다가 죽은 세션」(everReadyCount > 0, readyCount 0) 만 장애다 (16-21).
    // 단, 그 면제에는 **시간 상한**이 있다 — 재시작으로 래치가 지워진 진짜 장애가
    // 영원히 초록으로 남지 않도록 `stalledCount` 를 함께 본다 (16-30 / GC-WR-07).
    const sessionsOk =
      (stats.everReadyCount === 0 && stats.stalledCount === 0) || stats.readyCount > 0;
    const healthy = linkUp && sessionsOk;

    const payload: HealthPayload = {
      status: healthy ? "ok" : "degraded",
      vpn: linkUp,
      dma: sessionsOk,
      version: deps.appVersion,
      sessionCount: stats.sessionCount,
      everReadyCount: stats.everReadyCount,
      stalledCount: stats.stalledCount,
    };

    res.status(healthy ? 200 : 503).json(payload);
  });

  // 404 — 관문을 통과한 요청이 갈 곳이 없는 경우. 주문 경로도 여기로 떨어진다 (D-02).
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
