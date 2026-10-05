import { z } from "zod";
import { SHORT_CODE_RE } from "@gh-radar/shared";

/**
 * Phase 15 Plan 17 — DMA 주문 입력 검증 (RELAY-02, D-20 / T-15-50).
 *
 * **형식 검사만 한다.** 금액·수량에 정책 상한을 두지 않는다 — 사용자가 v1 무한도를
 * 선택했고(D-20), 확인 다이얼로그는 웹앱 몫이다. 여기서 거르는 것은 게이트웨이가
 * 해석할 수 없는 형태뿐이다: 6자 단축코드, 양의 정수 수량·가격, 화이트리스트 3종.
 * relay 도 같은 규율로 한 번 더 검사한다 — 두 벌인 이유는 조립 단계가 **모든** 호출
 * 경로의 마지막 관문이어야 하기 때문이다.
 *
 * ⚠️ **게이트웨이 종목 키를 바디에서 받지 않는다** (T-15-50 Tampering). 브라우저가
 * 12자 표준코드를 직접 실어 보낼 수 있으면 화면에 보이는 종목과 실제로 나가는 주문이
 * 달라진다. 서버가 `code` 로 `stocks` 를 조회해 채운다 (D-28).
 *
 * ⚠️ `accountNo` 의 **소유권 최종 판정은 relay** 가 세션 계좌 목록으로 한다 (T-15-01).
 * 여기서는 길이·문자만 본다.
 */

/**
 * 주문 접수 바디 스키마.
 *
 * ⚠️ **더 이상 어떤 라우트에도 결선돼 있지 않다** (Phase 16 Plan 16 / D-02). `POST
 * /api/orders` 는 제거됐고 접수 형식 검사의 정본은 relay 의 `RelayOrderNewSchema`
 * (16-03)다. 이 스키마가 남은 이유는 `__tests__/stockCode.test.ts` 의 KRX 영문 포함
 * 단축코드 회귀(quick-260908-fis)가 여기에 걸려 있어서다 — **이 값을 새 경로의 근거로
 * 쓰지 말 것.** 두 벌이 되는 순간 한쪽만 고쳐진다.
 *
 * `orderType:"C"`(취소)는 원주문번호가 필수다 — `superRefine` 이 그 조합을 강제한다.
 * 취소 수량은 미체결 잔량 전부이며 0 은 스키마가 먼저 막는다 (D-21 / Pitfall 7).
 */
export const OrderPostBody = z
  .object({
    /**
     * 6자 단축코드. 사용자에게 보이는 그 코드다.
     * KRX 숫자 6자리 소진으로 2025년부터 영문이 섞인다(예: 채비 `0011T0`) — 숫자 전용이 아니다.
     */
    code: z.string().regex(SHORT_CODE_RE),
    /** 계좌번호. 세션 계좌 목록 대조는 relay 소관. */
    accountNo: z.string().min(1).max(12),
    /** 거래소 (D-04). */
    exchange: z.enum(["KRX", "NXT"]),
    /** "B"=매수 "S"=매도. */
    side: z.enum(["B", "S"]),
    /** "N"=신규 "C"=취소. 정정("M")은 v1 범위 밖 (D-21). */
    orderType: z.enum(["N", "C"]),
    /** 취소 시 원주문번호. 신규는 없다. */
    orgOrderNo: z.string().min(1).max(20).optional(),
    /** 주문수량. **상한 없음** (D-20). 0·음수·소수는 거부. */
    qty: z.number().int().positive(),
    /** 주문가격(원). **상한 없음** (D-20). 보통가 고정이므로 0 은 거부. */
    price: z.number().int().positive(),
  })
  .superRefine((v, ctx) => {
    if (v.orderType === "C" && (v.orgOrderNo ?? "") === "") {
      ctx.addIssue({
        code: "custom",
        path: ["orgOrderNo"],
        message: "취소 주문에는 원주문번호가 필요합니다.",
      });
    }
  });
export type OrderPostBodyT = z.infer<typeof OrderPostBody>;

/**
 * `GET /api/orders` 쿼리 — 하루치 주문 목록 (D-24).
 * `date` 없으면 KST 기준 오늘. 형식은 `YYYY-MM-DD`.
 */
export const OrderListQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type OrderListQueryT = z.infer<typeof OrderListQuery>;

/**
 * Phase 25 D-02 — `GET /api/orders/:id/events` 경로 파라미터. `:id` 는 묶음 첫 통보 행(`dma_account_orders.id`)이다.
 * 게이트웨이 · 거래일 · 계좌는 RPC 가 이 행에서 읽는다 — 클라가 계좌를 싣지 않는다(T-25-13).
 */
export const OrderEventsParams = z.object({
  id: z.string().uuid(),
});
export type OrderEventsParamsT = z.infer<typeof OrderEventsParams>;

/** 묶음 구성원 주문번호 상한 — 클릭 1회 = RPC 1회 입력 크기 상한(T-25-15). */
export const MAX_ORDER_EVENTS_ORDER_NOS = 100;
/** 주문번호 1개 — 1~20자 영숫자(예약 주문 Q-ID 10자 포함). 게이트웨이 정규화값 그대로라 앞 0 을 건드리지 않는다. */
const ORDER_NO_RE = /^[A-Za-z0-9]{1,20}$/;

/**
 * Phase 25 D-02 — `GET /api/orders/:id/events` 쿼리. `orderNos=a,b,c`(쉼표 분리 · 1~100개 · 각 1~20자 영숫자) →
 * `string[]`. 생략하면 `[]` — RPC 가 행 자신의 주문번호 하나로 대체한다(단건 펼침). 사용자 id · 계좌는 받지 않는다
 * (정의되지 않은 키는 zod 가 버린다 — T-19-17).
 */
export const OrderEventsQuery = z.object({
  orderNos: z
    .string()
    .optional()
    .transform((v, ctx): string[] => {
      if (v === undefined) return [];
      const nos = v.split(",");
      if (nos.length > MAX_ORDER_EVENTS_ORDER_NOS) {
        ctx.addIssue({ code: "custom", message: `주문번호는 최대 ${MAX_ORDER_EVENTS_ORDER_NOS}개입니다.` });
        return z.NEVER;
      }
      if (nos.some((n) => !ORDER_NO_RE.test(n))) {
        ctx.addIssue({ code: "custom", message: "주문번호는 1~20자 영숫자여야 합니다." });
        return z.NEVER;
      }
      return nos;
    }),
});
export type OrderEventsQueryT = z.infer<typeof OrderEventsQuery>;

/**
 * Phase 25 D-07 — `GET /api/strategy-events` 쿼리 (창 분리 페이지 과거일 이동 · 작업대 주문로그 탭 복원).
 * `GET /api/orders` 와 **같은 `date` 규칙**(생략 = KST 오늘 · `YYYY-MM-DD`)이라 `OrderListQuery` 를 확장한다 —
 * 두 목록의 날짜 규칙이 갈라지지 않게. 실재 검사(`2026-02-30` → 400)는 `resolveTradeDate` 가 한다.
 */
export const StrategyEventsQuery = OrderListQuery.extend({
  /**
   * Phase 28 D-18 — `"1"` 이면 kind 15(상한가 특징)를 싣는다. 기본(생략 · `"0"`)은 제외 — 하루 수천~1만 행이
   * 주문로그 기본 응답에 섞이지 않게. 그 밖의 값은 400.
   */
  lf: z.enum(["0", "1"]).optional(),
});
export type StrategyEventsQueryT = z.infer<typeof StrategyEventsQuery>;
