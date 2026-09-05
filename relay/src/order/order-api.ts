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
import { z } from "zod";

import type { CreateOrderResponse, DmaOrderStatus, RelayAccount } from "@gh-radar/shared";

import { logger } from "../logger.js";
import type { SessionStats } from "../dma/session-manager.js";
import type { HubOrderEvent } from "../hub/subscription-hub.js";
import type { OrderUpdate } from "../store/orders.js";
import {
  MAX_ACCOUNT_NO_LEN,
  OrderBuildError,
  buildDirectOrderReq,
  maskAccountNo,
  type ParsedOrderResp,
} from "../dma/envelope.js";

// ============================================================
// 계약
// ============================================================

/** 비밀 없이 통과하는 유일한 경로. 값을 두 곳에 적지 않으려고 상수로 둔다. */
const HEALTH_PATH = "/healthz";

/** 주문 라우트 경로. 테스트·server 클라이언트와 값을 공유한다. */
const ORDERS_PATH = "/internal/orders";

/**
 * 첫 `OrderResp(51)` 대기 상한(ms) = 5초 (D-22).
 *
 * 이 시간을 넘긴 것은 **실패가 아니라 "결과를 모름"** 이다 (Pitfall 9). 주문은 이미
 * 나갔을 수 있으므로 여기서 "실패"라고 말하면 사용자가 재주문해 중복 체결이 난다.
 */
export const ORDER_RESP_TIMEOUT_MS = 5_000;

/** 주문 라우트가 세션에 요구하는 최소 표면. `DmaSession` 이 그대로 만족한다. */
export interface OrderApiSession {
  /** 운용 준비 여부. false 면 주문을 보내지 않는다 (D-15). */
  readonly isReady: boolean;
  /**
   * **주문 허용 계좌의 유일한 원천** (T-15-01).
   *
   * 15-15 가 서버 응답과 대조해 확정한 목록이다. 브라우저로 내려간 상태 프레임의 계좌
   * 사본을 믿으면 안 된다 — 그것은 복사본이고, 요청 바디의 `accountNo` 는 애초에
   * 신뢰 대상이 아니다.
   */
  readonly allowedAccounts: RelayAccount[];
  send(payload: Uint8Array): boolean;
}

/** `SessionManager` 중 이 모듈이 쓰는 부분만. 테스트가 스텁을 넣을 수 있게 좁힌다. */
export interface OrderApiSessions {
  stats(): SessionStats;
  /** 참조계수를 건드리지 않는 조회. 없으면 409 다 — lazy 로그인을 하지 않는다 (D-15). */
  get(userId: string): OrderApiSession | undefined;
}

/** 주문 통보의 출처. `SubscriptionHub` 가 그대로 만족한다. */
export interface OrderNoticeSource {
  on(event: "order", listener: (e: HubOrderEvent) => void): unknown;
}

/** `dma_orders` 갱신 큐 중 이 모듈이 쓰는 부분만. **동기 O(1) 여야 한다** (D-32). */
export interface OrderQueue {
  enqueueUpdate(update: OrderUpdate): void;
}

export type OrderApiDeps = {
  /** `RELAY_ORDER_SECRET` — server → relay 공유 비밀 (D-22). */
  relayOrderSecret: string;
  /** 이미지 빌드 시 주입된 `APP_VERSION`(GIT_SHA). */
  appVersion: string;
  nodeEnv: string;
  sessions: OrderApiSessions;
  /** 주문 통보 출처(Hub). 없으면 주문 라우트를 열지 않는다. */
  orders?: OrderNoticeSource;
  /** `dma_orders` 갱신 큐. 없으면 주문 라우트를 열지 않는다. */
  orderStore?: OrderQueue;
  /** 첫 통보 대기 상한(ms). 테스트가 줄여 쓴다. */
  orderTimeoutMs?: number;
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
// 주문 요청 스키마 (D-20 — **형식 검사만**)
// ============================================================

/**
 * `POST /internal/orders` 바디.
 *
 * 금액·수량에 **정책 상한을 두지 않는다** (D-20 — 사용자가 v1 무한도를 선택했다).
 * 확인 다이얼로그는 웹앱 몫이고 relay 는 판단하지 않는다. 여기서 거르는 것은
 * 게이트웨이가 해석할 수 없는 형식뿐이다 — 12자 ISIN, 양의 정수, 화이트리스트 3종.
 *
 * `qty` 가 양수여야 한다는 것이 취소수량 0 을 막는 1차 방어다 (Pitfall 7).
 * 2차는 `buildDirectOrderReq` 의 throw 이고, 두 벌인 이유는 조립 단계가 **모든** 호출
 * 경로의 마지막 관문이어야 하기 때문이다.
 */
const OrderRequestSchema = z.object({
  userId: z.string().uuid(),
  /** server 가 insert 한 `dma_orders.id`. 상관의 1순위 키다 (A10). */
  orderRowId: z.string().uuid(),
  isin: z
    .string()
    .length(12)
    .regex(/^[A-Z]{2}[A-Z0-9]{10}$/),
  exchange: z.enum(["KRX", "NXT"]),
  market: z.enum(["K", "Q"]),
  side: z.enum(["B", "S"]),
  orderType: z.enum(["N", "C"]),
  orgOrderNo: z.string().min(1).max(20).optional(),
  qty: z.number().int().positive(),
  price: z.number().int().positive(),
  accountNo: z.string().min(1).max(MAX_ACCOUNT_NO_LEN),
});

type OrderRequest = z.infer<typeof OrderRequestSchema>;

/**
 * 통보 → `dma_orders.status`.
 *
 * @param requestedQty 주문수량. **모르면 `null`** 이다 — 접수 이후에 도착하는 통보는
 *                     대기 항목이 이미 사라져 원주문 수량을 알 수 없다.
 *
 * `notice_type` 이 비어 있는 구 서버 응답은 `result_code` 로만 판정한다 — 필드 부재를
 * 오류로 다루지 않는다 (fbs D-04).
 *
 * 체결("E")은 주문수량을 알 때만 상태를 정한다. 모르는 채로 "부분체결"이라고 적으면
 * **전량 체결된 주문이 화면에 부분체결로 남는다** — 지어내는 대신 `undefined` 를 돌려
 * `filled_qty` 만 갱신하고, 전량/부분 판정은 행의 `qty` 를 쥔 쪽(server·UI)에 맡긴다.
 */
function statusOf(notice: ParsedOrderResp, requestedQty: number | null): DmaOrderStatus | undefined {
  switch (notice.noticeType) {
    case "R":
      return "rejected";
    case "A":
      return "accepted";
    case "C":
      return "cancelled";
    case "M":
      // 정정은 v1 이 만들지 않지만(D-21) 세션 합류로 남의 통보가 올 수 있다. 접수로 읽는다.
      return "accepted";
    case "E":
      // 체결 통보의 `quantity` 는 체결수량이다 (서버 `useExecuted` 분기).
      if (requestedQty === null) return undefined;
      return notice.quantity >= requestedQty ? "filled" : "partially_filled";
    default:
      return notice.resultCode === 0 ? "accepted" : "rejected";
  }
}

/**
 * 통보에서 읽어야 할 체결수량. **체결 통보에서만** 의미가 있다.
 *
 * 접수·거부·취소확인의 `quantity` 는 **주문**수량이라(fbs 주석) 그것을 `filled_qty` 로
 * 쓰면 접수 즉시 "전량 체결"로 기록된다.
 */
function filledQtyOf(notice: ParsedOrderResp): number | undefined {
  return notice.noticeType === "E" ? notice.quantity : undefined;
}

/** 대기 중인 주문 1건. HTTP 응답을 만들 때까지 산다. */
type PendingOrder = {
  orderRowId: string;
  isin: string;
  qty: number;
  timer: NodeJS.Timeout;
  settle: (notice: ParsedOrderResp | null) => void;
};

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

  // ----------------------------------------------------------
  // 주문 라우트 (D-15 / D-20 / D-21 / D-22)
  // ----------------------------------------------------------

  if (deps.orders !== undefined && deps.orderStore !== undefined) {
    const orderStore = deps.orderStore;
    const timeoutMs = deps.orderTimeoutMs ?? ORDER_RESP_TIMEOUT_MS;

    /**
     * userId → 대기 중인 주문 FIFO.
     *
     * 사용자별로 나누는 것이 상관의 1차 격리다 — 통보는 그 사용자의 세션에서 왔으므로
     * 다른 사용자의 대기 주문과 섞일 수 없다. 그 안에서 ISIN 으로 다시 좁힌다.
     */
    const pending = new Map<string, PendingOrder[]>();

    /**
     * 통보 1건 처리. **대기 중인 주문을 찾으면 HTTP 응답**, 못 찾으면 이후 통보
     * (체결·취소확인)이므로 DB 갱신만 큐잉한다.
     *
     * 브라우저 푸시는 여기서 하지 않는다 — Hub 가 이미 `{t:"order"}` 를 그 userId 의
     * 소켓 집합에만 보냈다. 전송 경로를 두 벌 만들면 한쪽이 대상 선택을 틀리는 순간
     * 타인의 체결이 샌다 (T-15-02).
     */
    deps.orders.on("order", ({ userId, notice }: HubOrderEvent) => {
      const queue = pending.get(userId);
      const index = queue?.findIndex((p) => p.isin === notice.isin) ?? -1;

      if (queue === undefined || index < 0) {
        // 접수 이후의 통보다. `order_no` 로 행을 좁혀 갱신한다 (A10 셀렉터 2순위).
        orderStore.enqueueUpdate({
          orderNo: notice.orderNo,
          status: statusOf(notice, null),
          resultCode: notice.resultCode,
          noticeType: notice.noticeType,
          message: notice.message,
          filledQty: filledQtyOf(notice),
        });
        return;
      }

      const [entry] = queue.splice(index, 1);
      if (queue.length === 0) pending.delete(userId);
      entry?.settle(notice);
    });

    app.post(ORDERS_PATH, (req, res, next) => {
      const parsed = OrderRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        // 어느 필드가 왜 틀렸는지는 로그에만 남긴다 — 바디에는 계좌번호가 들어 있다.
        logger.warn({ issues: parsed.error.issues.map((i) => i.path.join(".")) }, "[order-api] 주문 요청 형식 위반");
        next(new RelayApiError(400, "VALIDATION_FAILED", "주문 요청 형식이 올바르지 않습니다."));
        return;
      }

      const body: OrderRequest = parsed.data;
      const logCtx = {
        userId: body.userId,
        // 로그에는 뒤 4자리를 가린다. 화면에는 전체를 보여 준다 (UI-SPEC D2 / T-15-15).
        accountNo: maskAccountNo(body.accountNo),
        isin: body.isin,
        orderType: body.orderType,
      };

      // ① 활성 Ready 세션이 있어야 한다. 여기서 대신 로그인하지 않는다 (D-15).
      const session = deps.sessions.get(body.userId);
      if (session === undefined || !session.isReady) {
        logger.warn({ ...logCtx, hasSession: session !== undefined }, "[order-api] 세션 미준비 — 409");
        next(
          new RelayApiError(409, "SESSION_NOT_READY", "실시간 세션이 없습니다. 호가창을 먼저 열어 주세요."),
        );
        return;
      }

      // ② **계좌 화이트리스트 대조** — relay 쪽 최후 방어선이다 (T-15-01 / D-20).
      //    원천은 `session.allowedAccounts`(서버 응답과 대조된 목록)뿐이다. 상태 프레임의
      //    계좌 사본이나 요청 바디를 근거로 삼으면 IDOR 이 그대로 열린다.
      const allowed = session.allowedAccounts.some((a) => a.accountNo === body.accountNo);
      if (!allowed) {
        logger.error(logCtx, "[order-api] 세션 계좌 목록 밖의 주문 시도 — 403");
        next(new RelayApiError(403, "ACCOUNT_NOT_ALLOWED", "이 세션에서 사용할 수 없는 계좌입니다."));
        return;
      }

      // ③ 취소는 원주문번호가 필수다. 수량 0 은 스키마가 이미 걸렀고(Pitfall 7),
      //    조립 단계가 마지막으로 한 번 더 막는다.
      if (body.orderType === "C" && (body.orgOrderNo ?? "") === "") {
        next(new RelayApiError(400, "VALIDATION_FAILED", "취소 주문에는 원주문번호가 필요합니다."));
        return;
      }

      let payload: Uint8Array;
      try {
        payload = buildDirectOrderReq({
          isin: body.isin,
          accountNo: body.accountNo,
          exchange: body.exchange,
          market: body.market,
          side: body.side,
          orderType: body.orderType,
          orgOrderNo: body.orgOrderNo,
          qty: body.qty,
          price: body.price,
        });
      } catch (err) {
        if (err instanceof OrderBuildError) {
          logger.warn({ ...logCtx, code: err.code }, "[order-api] 주문 조립 거부");
          next(new RelayApiError(400, "VALIDATION_FAILED", err.message));
          return;
        }
        next(err);
        return;
      }

      // ④ 대기 등록을 **송신보다 먼저** 한다. 통보가 송신 직후 동기적으로 돌아오는
      //    테스트·저지연 환경에서 순서가 뒤바뀌면 응답을 영원히 놓친다.
      const queue = pending.get(body.userId) ?? [];
      let settled = false;

      const finish = (notice: ParsedOrderResp | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(entry.timer);

        if (notice === null) {
          // 5초를 넘겼다 = **"보냈는지 안 보냈는지 모른다"** (Pitfall 9). "실패"로 단정하지
          // 않는다. 504 도 쓰지 않는다 — 그것은 "게이트웨이가 죽었다"는 뜻이고 호출자·인프라가
          // 재시도 대상으로 읽는다. 중복 주문이 나는 최악의 경로가 그것이다.
          // 202 = "접수했고 처리가 끝나지 않았다" 가 이 상황의 정확한 의미다.
          orderStore.enqueueUpdate({ orderRowId: body.orderRowId, status: "timeout" });
          logger.error({ ...logCtx, timeoutMs }, "[order-api] 첫 주문 통보 미수신 — 결과 확인 필요");
          res.status(202).json({
            error: {
              code: "ORDER_TIMEOUT",
              message: "주문 결과를 확인하지 못했습니다. 미체결 목록을 확인해 주세요.",
            },
          });
          return;
        }

        const status = statusOf(notice, body.qty) ?? "accepted";
        // 상관 1순위 키(`orderRowId`)로 좁히고, 이번에 알게 된 주문번호를 같이 채운다.
        orderStore.enqueueUpdate({
          orderRowId: body.orderRowId,
          orderNo: notice.orderNo,
          status,
          resultCode: notice.resultCode,
          noticeType: notice.noticeType,
          message: notice.message,
          filledQty: filledQtyOf(notice),
        });

        const payloadOut: CreateOrderResponse = {
          orderNo: notice.orderNo,
          resultCode: notice.resultCode,
          message: notice.message,
          status,
        };
        logger.info({ ...logCtx, status, noticeType: notice.noticeType }, "[order-api] 주문 통보 수신");
        res.status(200).json(payloadOut);
      };

      const timer = setTimeout(() => {
        const q = pending.get(body.userId);
        const at = q?.indexOf(entry) ?? -1;
        if (q !== undefined && at >= 0) {
          q.splice(at, 1);
          if (q.length === 0) pending.delete(body.userId);
        }
        finish(null);
      }, timeoutMs);
      // 종료 절차가 이 타이머에 매달리지 않게 한다 — 최대 5초짜리라 기다릴 이유가 없다.
      timer.unref?.();

      const entry: PendingOrder = {
        orderRowId: body.orderRowId,
        isin: body.isin,
        qty: body.qty,
        timer,
        settle: finish,
      };
      queue.push(entry);
      pending.set(body.userId, queue);

      // ⑤ 송신. 실패하면 대기를 즉시 걷어낸다 — 5초를 기다릴 이유가 없다.
      if (!session.send(payload)) {
        const q = pending.get(body.userId);
        const at = q?.indexOf(entry) ?? -1;
        if (q !== undefined && at >= 0) {
          q.splice(at, 1);
          if (q.length === 0) pending.delete(body.userId);
        }
        settled = true;
        clearTimeout(timer);
        logger.error(logCtx, "[order-api] 주문 송신 실패 — 게이트웨이 연결 없음");
        next(new RelayApiError(409, "SESSION_NOT_READY", "게이트웨이로 주문을 보내지 못했습니다."));
        return;
      }
      logger.info(logCtx, "[order-api] 주문 송신 — 첫 통보 대기");
    });
  } else {
    logger.warn({}, "[order-api] 주문 통보 출처·기록 큐 미주입 — 주문 라우트를 열지 않는다");
  }

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
