import { describe, it, expect } from "vitest";
// RED — computeComovement 는 Plan 03 이 구현. 현재 미존재라 import 실패로 전체 suite RED.
import { computeComovement } from "./computeComovement";
import type { CoMovementCandidate } from "@gh-radar/shared";

// ============================================================
// RESEARCH §검증 fixture — ground truth (probe 2026-06-11)
//   한국석유 004090 ↔ 흥구석유 024060: D0 동반 7, ≥10% 바 동반 9
//   광전자 017900 ↔ 이노 215790: 12
//   휴림에이텍 078590 ↔ 휴림로봇 090710: 9 (테마 미태깅 가능 → co-surge only)
//
// computeComovement(themeRows, cosurgeRows, anchorThemes, quoteByCode, k):
//   - themeRows:    ThemeComovementRow[]  (앵커 활성 테마의 멤버 통계 — 앵커 행 포함)
//   - cosurgeRows:  CosurgeEdgeRow[]      (앵커 이웃 페어 — 앵커가 a 또는 b)
//   - anchorThemes: { id: string; name: string }[]  (앵커 활성 테마 메타 — 칩 라벨)
//   - quoteByCode:  Map<string, { name; market; changeRate }>  (실시간 + 표시 메타)
//   - k:            TOP-K 클램프
//   반환: CoMovementCandidate[] (앵커 자신 제외, 결합점수 desc)
// ============================================================

const ANCHOR = "004090"; // 한국석유

// snake_case row shapes — Plan 03 의 SELECT 출력 계약을 테스트가 먼저 정의
type ThemeComovementRow = {
  theme_id: string;
  stock_code: string;
  ignite_days: number;
  member_count: number;
  conf_d0: number;
  conf_d1: number;
  lift: number | null;
  avg_ret: number | null;
};
type CosurgeEdgeRow = {
  code_a: string;
  code_b: string;
  co_count: number;
  lift: number | null;
  avg_pair_ret: number | null;
};

function themeRow(p: Partial<ThemeComovementRow> & { theme_id: string; stock_code: string }): ThemeComovementRow {
  return {
    ignite_days: 10,
    member_count: 10,
    conf_d0: 0.5,
    conf_d1: 0.2,
    lift: 2,
    avg_ret: 18,
    ...p,
  };
}
function edge(code_a: string, code_b: string, co_count: number, lift = 2, avg = 18): CosurgeEdgeRow {
  // 무향 정규화 — code_a < code_b 강제 (DB CHECK 동형)
  const [a, b] = code_a < code_b ? [code_a, code_b] : [code_b, code_a];
  return { code_a: a, code_b: b, co_count, lift, avg_pair_ret: avg };
}
function quote(name: string, market: "KOSPI" | "KOSDAQ", changeRate: number | null) {
  return { name, market, changeRate };
}
const quotes = () =>
  new Map<string, { name: string; market: "KOSPI" | "KOSDAQ"; changeRate: number | null }>([
    [ANCHOR, quote("한국석유", "KOSPI", 16)],
    ["024060", quote("흥구석유", "KOSDAQ", 12)],
    ["017900", quote("광전자", "KOSDAQ", 8)],
    ["215790", quote("이노", "KOSDAQ", 7)],
    ["078590", quote("휴림에이텍", "KOSDAQ", null)],
    ["090710", quote("휴림로봇", "KOSDAQ", 9)],
  ]);

const TID = "11111111-1111-4111-8111-111111111111";
const TID2 = "22222222-2222-4222-8222-222222222222";

describe("computeComovement — 결합 점수/타이트니스/dedup/후행/표본배지 (RED, Plan 03 구현)", () => {
  // Test A — 양쪽 경로 evidence: 흥구석유가 테마(conf_d0 높음) + co-surge 9회 → 상위
  it("A: 테마+co-surge 양쪽 evidence 후보가 candidates[0]", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }), // 앵커 자신 (anchor_rel 추출용)
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.7, conf_d1: 0.2 }),
    ];
    const cosurgeRows: CosurgeEdgeRow[] = [edge(ANCHOR, "024060", 9)];
    const out = computeComovement(themeRows, cosurgeRows, [{ id: TID, name: "정유" }], quotes(), 8);
    expect(out[0].code).toBe("024060");
    expect(out[0].coSurgeCount).toBe(9);
    expect(out[0].sharedThemes).toEqual([{ id: TID, name: "정유" }]);
    // 앵커 자신은 후보에서 제외
    expect(out.some((c: CoMovementCandidate) => c.code === ANCHOR)).toBe(false);
  });

  // Test B — 타이트니스: 작은 테마(3) 멤버 > 큰 테마(70) 멤버 (1/sqrt(member_count) 가중)
  it("B: conf_d0 동일 시 member_count 작은 테마 멤버가 strength 더 큼", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
      themeRow({ theme_id: TID2, stock_code: ANCHOR, conf_d0: 0.6 }),
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.5, member_count: 3 }),
      themeRow({ theme_id: TID2, stock_code: "017900", conf_d0: 0.5, member_count: 70 }),
    ];
    const out = computeComovement(
      themeRows,
      [],
      [{ id: TID, name: "소형테마" }, { id: TID2, name: "대형테마" }],
      quotes(),
      8,
    );
    const small = out.find((c: CoMovementCandidate) => c.code === "024060")!;
    const big = out.find((c: CoMovementCandidate) => c.code === "017900")!;
    expect(small.strength).toBeGreaterThan(big.strength);
  });

  // Test C — co-surge only (테마 없음): coSurgeCount 채워지고 sharedThemes=[] (D-03 분리)
  it("C: co-surge 전용 경로 → sharedThemes 빈 배열 + coSurgeCount 채움", () => {
    const cosurgeRows: CosurgeEdgeRow[] = [edge("078590", "090710", 9)];
    // 앵커가 078590 인 시나리오
    const out = computeComovement([], cosurgeRows, [], quotes(), 8);
    const hyu = out.find((c: CoMovementCandidate) => c.code === "090710" || c.code === "078590")!;
    expect(hyu.sharedThemes).toEqual([]);
    expect(hyu.coSurgeCount).toBe(9);
  });

  // Test D — 후행형: conf_d1 > conf_d0 AND conf_d1 >= 0.3 만 isTrailing
  it("D: conf_d1 > conf_d0 AND conf_d1 >= 0.3 후보만 isTrailing=true", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.2, conf_d1: 0.4 }), // 후행
      themeRow({ theme_id: TID, stock_code: "017900", conf_d0: 0.5, conf_d1: 0.2 }), // 동반
    ];
    const out = computeComovement(themeRows, [], [{ id: TID, name: "정유" }], quotes(), 8);
    const trailing = out.find((c: CoMovementCandidate) => c.code === "024060")!;
    const sync = out.find((c: CoMovementCandidate) => c.code === "017900")!;
    expect(trailing.isTrailing).toBe(true);
    expect(sync.isTrailing).toBe(false);
  });

  // Test E — dedup: 양쪽 경로 등장 종목은 candidates 에 1번, evidence 합집합
  it("E: 양쪽 경로 종목은 1회만 + evidence 합집합 (code key dedup)", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.7 }),
    ];
    const cosurgeRows: CosurgeEdgeRow[] = [edge(ANCHOR, "024060", 9)];
    const out = computeComovement(themeRows, cosurgeRows, [{ id: TID, name: "정유" }], quotes(), 8);
    const dups = out.filter((c: CoMovementCandidate) => c.code === "024060");
    expect(dups.length).toBe(1);
    expect(dups[0].sharedThemes.length).toBeGreaterThan(0);
    expect(dups[0].coSurgeCount).toBe(9);
  });

  // Test F — sampleConfidence: ignite_days >= 8 → high, 5~7 → low
  it("F: ignite_days >= 8 high, 5~7 low", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.5, ignite_days: 9 }),
      themeRow({ theme_id: TID, stock_code: "017900", conf_d0: 0.5, ignite_days: 6 }),
    ];
    const out = computeComovement(themeRows, [], [{ id: TID, name: "정유" }], quotes(), 8);
    expect(out.find((c: CoMovementCandidate) => c.code === "024060")!.sampleConfidence).toBe("high");
    expect(out.find((c: CoMovementCandidate) => c.code === "017900")!.sampleConfidence).toBe("low");
  });

  // Test G — k 클램프 + 결합점수 desc 정렬
  it("G: k 클램프 + strength desc 정렬", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
      ...["024060", "017900", "215790", "078590", "090710"].map((c, i) =>
        themeRow({ theme_id: TID, stock_code: c, conf_d0: 0.9 - i * 0.1 }),
      ),
    ];
    const out = computeComovement(themeRows, [], [{ id: TID, name: "정유" }], quotes(), 3);
    expect(out.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].strength).toBeGreaterThanOrEqual(out[i].strength);
    }
  });

  // Test H — 앵커 참여도 가중 (R3): anchor_rel = sqrt(ANCHOR_REL_FLOOR + (1-FLOOR)·anchor_conf_d0)
  it("H: 앵커 conf_d0 높은 테마 후보가 strength 더 큼 (anchor_rel 가중)", () => {
    const themeRows: ThemeComovementRow[] = [
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.8 }), // 앵커가 테마1 에서 강함
      themeRow({ theme_id: TID2, stock_code: ANCHOR, conf_d0: 0.02 }), // 테마2 에서 거의 무관
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.5, member_count: 10 }),
      themeRow({ theme_id: TID2, stock_code: "017900", conf_d0: 0.5, member_count: 10 }),
    ];
    const out = computeComovement(
      themeRows,
      [],
      [{ id: TID, name: "강한테마" }, { id: TID2, name: "약한테마" }],
      quotes(),
      8,
    );
    const strong = out.find((c: CoMovementCandidate) => c.code === "024060")!;
    const weak = out.find((c: CoMovementCandidate) => c.code === "017900")!;
    expect(strong.strength).toBeGreaterThan(weak.strength);
  });
});
