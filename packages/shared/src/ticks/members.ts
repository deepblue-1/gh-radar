/**
 * Phase 37 (D-11) 5창구 표 — 선택 틱 시점(수신순) 마지막 B9 그대로.
 *
 * 정본(2026-11-02 원문):
 *   gh-trade server/tools/analysis/tickana/teamflow.py:30 `TEAM = ("00001", "00003", "00008", "00002", "00012")`
 *     — 교보 · 한국 · 유진 · 신한 · NH(합의 규칙 1)
 *   gh-trade server/tools/analysis/tickana/teamflow.py `member_rows` — 단계 1..5 의 `lv{i}_{side}_member` 를 strip 해
 *     키로 쌓는다(같은 창구가 두 단에 있으면 뒤 단이 이긴다) · 상위 5 밖이면 그 쪽은 None
 *   gh-trade docs/analysis/team-flow.md §4 규칙 6 B9 · 「알려진 한계」 — B9 는 상위 5 매도/매수 창구의 보드 합산 누적값이라
 *     해상도가 거칠다
 *
 * 추정 · 배분은 하지 않는다 — 상위 5 밖 창구는 null(화면 「—」)이고, B9 수신 시각을 같이 준다(「B9 기준 HH:MM:SS」).
 */
import { decodeFields, type FieldValue } from "./decode";
import { B9_LAYOUT } from "./layouts";
import { TAG_CODE, payloadOf, type TickIndex } from "./record-index";

/** 팀 다섯 창구(teamflow.py TEAM 순서). */
export const TEAM_MEMBERS = ["00001", "00003", "00008", "00002", "00012"] as const;
export type TeamMember = (typeof TEAM_MEMBERS)[number];

export const TEAM_MEMBER_LABEL: Readonly<Record<TeamMember, string>> = {
  "00001": "교보",
  "00003": "한국",
  "00008": "유진",
  "00002": "신한",
  "00012": "NH",
};

/** 수신순 자리 p → p 이하 마지막 B9(ok) rec(없으면 -1). */
export function lastB9Of(index: TickIndex, recvOrder: Int32Array): Int32Array {
  const out = new Int32Array(recvOrder.length);
  let last = -1;
  for (let p = 0; p < recvOrder.length; p++) {
    const r = recvOrder[p]!;
    if (index.tag[r] === TAG_CODE.B9 && index.ok[r] === 1) last = r;
    out[p] = last;
  }
  return out;
}

/** 창구 한 줄 — 상위 5 밖인 쪽은 null. 수량(주) · 금액(원)은 B9 누적값 그대로. */
export interface MemberRow {
  member: string;
  label: string;
  sell: { qty: number; value: number } | null;
  buy: { qty: number; value: number } | null;
}

function num(v: FieldValue | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  return Number.NaN;
}

/** B9 rec → 다섯 창구 표. rec < 0 · B9 가 아님 · 길이 안 맞음이면 null. */
export function memberTableAt(
  buf: Uint8Array,
  index: TickIndex,
  b9Rec: number,
): { recvNs: bigint; b9Rec: number; rows: MemberRow[] } | null {
  if (b9Rec < 0 || b9Rec >= index.n || index.tag[b9Rec] !== TAG_CODE.B9 || index.ok[b9Rec] !== 1) return null;
  const row = decodeFields(B9_LAYOUT, payloadOf(buf, index, b9Rec), index.recvNs[b9Rec]!, index.label);
  const side = (s: "sell" | "buy"): Map<string, { qty: number; value: number }> => {
    const m = new Map<string, { qty: number; value: number }>();
    for (let lv = 1; lv <= 5; lv++) {
      const code = row[`lv${lv}_${s}_member`];
      if (typeof code !== "string" || code.trim() === "") continue;
      m.set(code.trim(), { qty: num(row[`lv${lv}_${s}_qty`]), value: num(row[`lv${lv}_${s}_value`]) });
    }
    return m;
  };
  const sell = side("sell");
  const buy = side("buy");
  return {
    recvNs: index.recvNs[b9Rec]!,
    b9Rec,
    rows: TEAM_MEMBERS.map((m) => ({
      member: m,
      label: TEAM_MEMBER_LABEL[m],
      sell: sell.get(m) ?? null,
      buy: buy.get(m) ?? null,
    })),
  };
}
