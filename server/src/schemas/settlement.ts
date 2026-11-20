import { z } from "zod";
import { kstDateIso, personAllowedFor } from "@gh-radar/shared";

/**
 * Phase 44 (44-05) — 정산 거래 쓰기 입력 검증. 위반은 RPC · relay 전에 400 `VALIDATION_FAILED`(RPC 0회 · relay 0회).
 *
 * - 금액(D-09): 원 단위 정수 · 0 보다 큼 · 10,000(만원) 배수 · 7자리 만원(99,999,990,000원) 이하.
 * - 종류별 칸 모양(D-05 · D-07 · DB CHECK 와 같은 규칙):
 *     출자          = 사람 · 받은 계좌 / 보낸 계좌 · 경로 없음
 *     수익 출금 · 원금 회수 = 사람 · 뺀 계좌 / 받은 계좌 · 경로 없음
 *     계좌 옮김      = 사람 없음 · 보낸 계좌 ≠ 받은 계좌 · 경로
 * - D-29: 출자 · 원금 회수의 사람은 그 계좌 묶음 비율에 있는 사람(shared `personAllowedFor`).
 * - D-12: 날짜는 KST 오늘 이후 불가(shared `kstDateIso` — UTC 날짜는 00:00 ~ 09:00 KST 에 하루 틀린다).
 * 업무 규칙 문장은 `custom` 이슈 — 라우트가 경로 접두 없이 문장만 돌려준다. DB(RPC · CHECK)도 같은 조합을 다시 막는다.
 */

const AccKeySchema = z.enum(["kbG", "kyH", "kyG", "kbH"]);
const PersonSchema = z.enum(["H", "G", "J"]);
const KindSchema = z.enum(["withdraw_profit", "withdraw_principal", "contribute", "move"]);
const ViaSchema = z.enum(["transfer", "corp_service"]);

/** 7자리 만원 상한(99,999,990,000원) — 안전 정수 안. */
export const SETTLEMENT_MAX_AMOUNT_KRW = 99_999_990_000;

export const SETTLEMENT_TEXT_PERSON_NOT_IN_POOL =
  "심쥬니는 현중 · 근형 묶음 계좌에 출자 · 원금 회수를 적을 수 없어요";
export const SETTLEMENT_TEXT_FUTURE_DATE = "미래 날짜는 적을 수 없어요";
export const SETTLEMENT_TEXT_BAD_SHAPE = "거래 값이 규칙에 맞지 않아요";
export const SETTLEMENT_TEXT_SAME_ACC = "보낸 계좌와 받은 계좌가 같아요";

/** `YYYY-MM-DD` 이고 실제 있는 날짜(2026-02-30 같은 값은 DB 가 22007 로 터지기 전에 거부). */
const TxDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 예요")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "없는 날짜예요");

export const SettlementLedgerBodySchema = z
  .object({
    txDate: TxDateSchema,
    kind: KindSchema,
    who: PersonSchema.nullable(),
    fromAcc: AccKeySchema.nullable(),
    toAcc: AccKeySchema.nullable(),
    via: ViaSchema.nullable(),
    amountKrw: z
      .number()
      .int()
      .positive()
      .max(SETTLEMENT_MAX_AMOUNT_KRW)
      .refine((n) => n % 10_000 === 0, "금액은 만원 단위예요"),
    memo: z.string().max(100).default(""),
    reflect: z.boolean(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const bad = (path: string, message = SETTLEMENT_TEXT_BAD_SHAPE) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (b.kind === "contribute") {
      if (b.who === null) bad("who");
      if (b.toAcc === null) bad("toAcc");
      if (b.fromAcc !== null) bad("fromAcc");
      if (b.via !== null) bad("via");
    } else if (b.kind === "move") {
      if (b.who !== null) bad("who");
      if (b.fromAcc === null) bad("fromAcc");
      if (b.toAcc === null) bad("toAcc");
      if (b.via === null) bad("via");
      if (b.fromAcc !== null && b.fromAcc === b.toAcc) bad("toAcc", SETTLEMENT_TEXT_SAME_ACC);
    } else {
      if (b.who === null) bad("who");
      if (b.fromAcc === null) bad("fromAcc");
      if (b.toAcc !== null) bad("toAcc");
      if (b.via !== null) bad("via");
    }
    const acc = b.kind === "contribute" ? b.toAcc : b.kind === "withdraw_principal" ? b.fromAcc : null;
    if (acc !== null && b.who !== null && !personAllowedFor(b.kind, acc, b.who)) {
      bad("who", SETTLEMENT_TEXT_PERSON_NOT_IN_POOL);
    }
    if (b.txDate > kstDateIso()) bad("txDate", SETTLEMENT_TEXT_FUTURE_DATE);
  });

export type SettlementLedgerBodyT = z.infer<typeof SettlementLedgerBodySchema>;

/** DELETE /settlement/ledger/:id — 「예수금에도 반영」(켜면 그 거래가 넣어 둔 증감을 되돌린다). */
export const SettlementDeleteBodySchema = z.object({ reflect: z.boolean() }).strict();

/** 경로 `:id` — 양의 정수. */
export const settlementIdParam = z.object({ id: z.coerce.number().int().positive() });
