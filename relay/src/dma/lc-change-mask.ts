/**
 * quick-261030-kpg — 상따 `SetLimitChaser.change_mask`(id 85 · vt 174 · gh-trade Phase 44) 계산.
 *
 * 웹 lc.set 의 `changed`(사람이 이번 제출에서 손댄 칸 이름 · gh-trade D-05)를 shared 비트 표
 * (`LC_CHANGE_MASK_FIELDS` — 인덱스 = 비트)로 uint64 로 바꾸고, 짝 수량 비트(gh-trade D-10)를 더한다.
 */
import { LC_CHANGE_MASK_FIELDS, isLcChangeMaskField, type LcChangeMaskField } from "@gh-radar/shared";

/** 이름 → 비트. 모듈 로드 시 한 번 만든다. */
const BIT_OF: ReadonlyMap<LcChangeMaskField, bigint> = new Map(
  LC_CHANGE_MASK_FIELDS.map((f, i) => [f.key, 1n << BigInt(i)] as const),
);

/** 짝 수량 규칙 한 행. `control` 은 WinForms 컨트롤 이름(인계 노트 ③ D-10 원문 추적용). */
export interface LcChangeMaskPairRule {
  readonly control: string;
  readonly from: LcChangeMaskField;
  readonly adds: readonly LcChangeMaskField[];
  /** true 면 cfg 의 그 불리언이 false(= OFF 로 바뀐 제출)일 때만 적용한다. */
  readonly whenOff?: true;
}

/**
 * gh-trade D-10 짝 수량 규칙 16행 — 「서버는 칸마다 독립 반영이고 묶음 책임은 보내는 쪽(= relay)」.
 *
 * - 웹 `buildCfg` 는 수량을 「금액 ÷ 그 칸의 가격」 으로 다시 계산해 싣는다. 그래서 금액 · 가격 칸 비트에는 그 수량 비트가
 *   따라와야 서버가 새 수량을 쓴다(비트가 없으면 서버는 에코가 보여 준 옛 수량을 유지한다).
 *   금액 → 짝 수량 1칸 · 매수가격 → 수량 3칸(선 · 줄 · 후 주문) · 매수 비교가 → 수량 5칸 · 매도 비교가 → 수량 3칸.
 * - 추적 OFF 는 기준선 대신 금액 환산 수량으로 돌아가므로 금액 · 수량 둘 다 세운다(ON 은 파생 없음).
 * - 체크 칸에는 파생이 없다.
 * - webapp 이 아니라 relay 에 두는 이유: 웹은 사람이 손댄 칸 이름만 보내고 마스크는 relay 한 곳이 만든다(gh-trade D-10) —
 *   shared 에 두면 webapp 이 마스크를 계산하는 두 번째 경로가 생긴다.
 */
export const LC_CHANGE_MASK_PAIR_RULES: readonly LcChangeMaskPairRule[] = [
  { control: "numBuyOrderAmount", from: "buyOrderAmount", adds: ["buyOrderQty"] },
  { control: "numBuyWatchQty", from: "buyWatchAmount", adds: ["buyWatchQty"] },
  { control: "numBuyMinTradeQty", from: "buyMinTradeAmount", adds: ["buyMinTradeQty"] },
  { control: "numAddBuyOrderAmount", from: "extraBuyOrderAmount", adds: ["extraBuyOrderQty"] },
  { control: "numAddBuyMinQty", from: "extraBuyMinAmount", adds: ["extraBuyMinQty"] },
  { control: "numAddBuyMaxQty", from: "extraBuyMaxAmount", adds: ["extraBuyMaxQty"] },
  { control: "numPostBuyOrderAmount", from: "postBuyOrderAmount", adds: ["postBuyOrderQty"] },
  { control: "numPostBuyFloorQty", from: "postBuyFloorAmount", adds: ["postBuyFloorQty"] },
  { control: "numSellWatchQty", from: "sellWatchAmount", adds: ["sellWatchQty"] },
  { control: "numSellMinTradeQty", from: "sellMinTradeAmount", adds: ["sellMinTradeQty"] },
  { control: "numCancelQty", from: "cancelWatchAmount", adds: ["cancelWatchQty"] },
  { control: "numBuyOrderPrice", from: "buyOrderPrice", adds: ["buyOrderQty", "extraBuyOrderQty", "postBuyOrderQty"] },
  {
    control: "numBuyWatchPrice",
    from: "buyWatchPrice",
    adds: ["buyWatchQty", "buyMinTradeQty", "extraBuyMinQty", "extraBuyMaxQty", "postBuyFloorQty"],
  },
  { control: "numSellWatchPrice", from: "sellWatchPrice", adds: ["sellWatchQty", "sellMinTradeQty", "cancelWatchQty"] },
  {
    control: "chkSellQtyTrack",
    from: "sellQtyTrackEnabled",
    adds: ["sellWatchAmount", "sellWatchQty"],
    whenOff: true,
  },
  {
    control: "chkCancelByTracking",
    from: "cancelQtyTrackEnabled",
    adds: ["cancelWatchAmount", "cancelWatchQty"],
    whenOff: true,
  },
];

/**
 * `changed` → `{ mask, unknown }`.
 *
 * - 비트 표 안의 이름은 자기 비트를 세우고, 표 밖 이름은 `unknown` 에 (중복 없이 · 처음 본 순서) 담는다.
 *   모르는 이름이 있을 때의 폴백(마스크 미적재 · warn)은 호출부(fanout — userId 를 아는 쪽)가 정한다.
 * - 짝 규칙(`LC_CHANGE_MASK_PAIR_RULES`)은 **사람 이름 집합 기준으로 한 번만** 적용한다(전이 적용 없음 — 추적 OFF 규칙이
 *   금액 · 수량을 둘 다 명시한다). `whenOff` 규칙은 `cfg` 의 그 불리언이 false 일 때만.
 * - 빈 배열 = `{ mask: 0n, unknown: [] }`. 순수 함수 — 로그를 남기지 않는다.
 */
export function lcChangeMaskOf(
  changed: readonly string[],
  cfg: { sellQtyTrackEnabled: boolean; cancelQtyTrackEnabled: boolean },
): { mask: bigint; unknown: string[] } {
  const touched = new Set<LcChangeMaskField>();
  const unknown: string[] = [];
  for (const name of changed) {
    if (isLcChangeMaskField(name)) touched.add(name);
    else if (!unknown.includes(name)) unknown.push(name);
  }
  let mask = 0n;
  for (const f of touched) mask |= BIT_OF.get(f)!;
  for (const rule of LC_CHANGE_MASK_PAIR_RULES) {
    if (!touched.has(rule.from)) continue;
    if (rule.whenOff === true && cfg[rule.from as keyof typeof cfg] !== false) continue;
    for (const a of rule.adds) mask |= BIT_OF.get(a)!;
  }
  return { mask, unknown };
}
