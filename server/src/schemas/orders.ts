import { z } from "zod";

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
 * `POST /api/orders` 바디.
 *
 * `orderType:"C"`(취소)는 원주문번호가 필수다 — `superRefine` 이 그 조합을 강제한다.
 * 취소 수량은 미체결 잔량 전부이며 0 은 스키마가 먼저 막는다 (D-21 / Pitfall 7).
 */
export const OrderPostBody = z
  .object({
    /** 6자 단축코드. 사용자에게 보이는 그 코드다. */
    code: z.string().regex(/^\d{6}$/),
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
