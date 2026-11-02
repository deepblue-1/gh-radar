/**
 * Phase 37 (D-11) 5창구 B9 표 — 선택 틱 시점(수신순) 마지막 B9 그대로. 상위 5 밖은 null · 추정 · 배분 없음.
 * 합성 B9 는 레이아웃 오프셋(단계 i 시작 = 23 + 78·(i−1))대로 ASCII 고정폭 바이트를 만든다.
 */
import { describe, expect, it } from "vitest";
import { decodeFields } from "../ticks/decode";
import { concatBytes, encodeRecord } from "../ticks/framing";
import { B9_LAYOUT } from "../ticks/layouts";
import { TEAM_MEMBERS, TEAM_MEMBER_LABEL, lastB9Of, memberTableAt } from "../ticks/members";
import { TAG_CODE, buildTickIndex, payloadOf, recvOrderOf } from "../ticks/record-index";
import { readTicksZst } from "./helpers/tick-digest";

function put(b: Uint8Array, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
}

interface Lv {
  sell: [string, number, number];
  buy: [string, number, number];
}

function b9Msg(levels: Lv[]): Uint8Array {
  const b = new Uint8Array(414).fill(32);
  put(b, 0, "B9");
  put(b, 2, "01S");
  put(b, 5, "KR7101360006");
  put(b, 17, "000001");
  levels.forEach((lv, k) => {
    const s = 23 + 78 * k;
    put(b, s, lv.sell[0]);
    put(b, s + 5, String(lv.sell[1]).padStart(12, "0"));
    put(b, s + 17, String(lv.sell[2]).padStart(22, "0"));
    put(b, s + 39, lv.buy[0]);
    put(b, s + 44, String(lv.buy[1]).padStart(12, "0"));
    put(b, s + 56, String(lv.buy[2]).padStart(22, "0"));
  });
  return b;
}

function a3Msg(seq: number): Uint8Array {
  const b = new Uint8Array(186).fill(48);
  put(b, 0, "A3");
  put(b, 2, "01S");
  put(b, 5, String(seq).padStart(8, "0"));
  put(b, 13, "G1");
  return b;
}

const SYN: Lv[] = [
  { sell: ["00005", 9_000, 90_000_000], buy: ["00012", 500, 5_050_000] },
  { sell: ["00017", 4_000, 40_000_000], buy: ["00036", 400, 4_000_000] },
  { sell: ["00001", 1_000, 10_100_000], buy: ["00044", 300, 3_000_000] },
  { sell: ["00030", 900, 9_000_000], buy: ["00050", 200, 2_000_000] },
  { sell: ["00040", 800, 8_000_000], buy: ["00054", 100, 1_000_000] },
];

describe("TEAM_MEMBERS", () => {
  it("다섯 창구 코드 · 라벨(teamflow.py TEAM 순서)", () => {
    expect([...TEAM_MEMBERS]).toEqual(["00001", "00003", "00008", "00002", "00012"]);
    expect(TEAM_MEMBERS.map((m) => TEAM_MEMBER_LABEL[m])).toEqual(["교보", "한국", "유진", "신한", "NH"]);
  });
});

describe("memberTableAt · lastB9Of — 합성", () => {
  const t0 = 1_791_000_000_000_000_000n;
  // rec 순서: A3 · B9(SYN) · A3 · B9(빈) — 수신은 rec 1 이 rec 0 보다 먼저
  const recs: [bigint, Uint8Array][] = [
    [t0 + 20n, a3Msg(1)],
    [t0 + 10n, b9Msg(SYN)],
    [t0 + 30n, a3Msg(2)],
    [t0 + 40n, b9Msg([])],
  ];
  const buf = concatBytes(recs.map(([t, m]) => encodeRecord(t, m)));
  const index = buildTickIndex(buf, "krx");
  const recvOrder = recvOrderOf(index);

  it("lastB9Of — 수신 자리 p 이하 마지막 B9 rec", () => {
    expect(Array.from(recvOrder)).toEqual([1, 0, 2, 3]);
    expect(Array.from(lastB9Of(index, recvOrder))).toEqual([1, 1, 1, 3]);
    const none = buildTickIndex(concatBytes([encodeRecord(t0, a3Msg(1)), encodeRecord(t0 + 1n, b9Msg(SYN))]), "krx");
    expect(Array.from(lastB9Of(none, recvOrderOf(none)))).toEqual([-1, 1]);
  });

  it("교보 매도 3단 · NH 매수 1단 · 나머지 null · B9 수신 시각", () => {
    const t = memberTableAt(buf, index, 1)!;
    expect(t.recvNs).toBe(t0 + 10n);
    expect(t.b9Rec).toBe(1);
    expect(t.rows).toEqual([
      { member: "00001", label: "교보", sell: { qty: 1_000, value: 10_100_000 }, buy: null },
      { member: "00003", label: "한국", sell: null, buy: null },
      { member: "00008", label: "유진", sell: null, buy: null },
      { member: "00002", label: "신한", sell: null, buy: null },
      { member: "00012", label: "NH", sell: null, buy: { qty: 500, value: 5_050_000 } },
    ]);
  });

  it("B9 없음(-1) · B9 가 아닌 rec → null · 빈 B9 → 다섯 행 모두 null", () => {
    expect(memberTableAt(buf, index, -1)).toBeNull();
    expect(memberTableAt(buf, index, 0)).toBeNull();
    const empty = memberTableAt(buf, index, 3)!;
    expect(empty.rows.every((r) => r.sell === null && r.buy === null)).toBe(true);
  });
});

describe("memberTableAt — raw20k 09시 실 B9", () => {
  const buf = readTicksZst("raw20k-0900.ticks.zst");
  const index = buildTickIndex(buf, "krx");

  it("전 B9 — 표 값 = decodeFields(B9) 단계 값", () => {
    let seen = 0;
    for (let i = 0; i < index.n; i++) {
      if (index.tag[i] !== TAG_CODE.B9 || index.ok[i] !== 1) continue;
      seen += 1;
      const row = decodeFields(B9_LAYOUT, payloadOf(buf, index, i), index.recvNs[i]!, "krx");
      const t = memberTableAt(buf, index, i)!;
      expect(t.rows.length).toBe(5);
      for (const r of t.rows) {
        for (const side of ["sell", "buy"] as const) {
          let want: { qty: number; value: number } | null = null;
          for (let lv = 1; lv <= 5; lv++) {
            if (String(row[`lv${lv}_${side}_member`]).trim() === r.member) {
              want = { qty: Number(row[`lv${lv}_${side}_qty`]), value: Number(row[`lv${lv}_${side}_value`]) };
            }
          }
          expect(r[side]).toEqual(want);
        }
      }
    }
    expect(seen).toBe(105);
  });
});
