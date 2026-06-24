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
  // v2 (20260611150000): 방향별 강도-최근성 누적. pairScore = ws_sum/w_sum × min(1, w_sum/W0).
  w_sum_a: number | null;
  ws_sum_a: number | null;
  w_sum_b: number | null;
  ws_sum_b: number | null;
  // 20260624140000: 최근 동반급등 히스토리 (날짜 desc, 최대 5건). d=날짜, ra=code_a%, rb=code_b%.
  recent_pairs: { d: string; ra: number; rb: number }[] | null;
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
// v2 edge — 방향별 w_sum/ws_sum 직접 지정. 기본값은 "강한 최근 동반"(비율 0.9, 충분한 표본)
// 으로 기존 테스트(A/C/E)의 강한 co-surge 의도를 보존. 무향 정규화 후 a/b 방향을
// 입력 code 순서 무관하게 일관 매핑(정규화로 a,b 가 바뀌어도 점수 동일하도록 양방향 동일값).
function edge(
  code_a: string,
  code_b: string,
  co_count: number,
  lift = 2,
  avg = 18,
  dir?: { w_a?: number; ws_a?: number; w_b?: number; ws_b?: number },
  recent_pairs: { d: string; ra: number; rb: number }[] | null = null,
): CosurgeEdgeRow {
  const [a, b] = code_a < code_b ? [code_a, code_b] : [code_b, code_a];
  // 기본: 양방향 강함 — w_sum=3(표본보정 만점), ws_sum=2.7(비율 0.9).
  return {
    code_a: a,
    code_b: b,
    co_count,
    lift,
    avg_pair_ret: avg,
    w_sum_a: dir?.w_a ?? 3,
    ws_sum_a: dir?.ws_a ?? 2.7,
    w_sum_b: dir?.w_b ?? 3,
    ws_sum_b: dir?.ws_b ?? 2.7,
    recent_pairs,
  };
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

  // Test I — 명시 anchorCode 전달 시 앵커 제외 (휴리스틱 추론 실패 회귀 방지).
  //   앵커 004090 이 다중 테마에 속하나 자기 멤버십 행이 일부 테마만 덮어
  //   교집합 추론(deriveAnchor)이 실패하는 프로덕션 시나리오. anchorCode 명시 전달로
  //   앵커가 자기 후보에 섞이지 않아야 한다 (004090 self-rank 회귀).
  it("I: anchorCode 명시 전달 → 추론 실패 케이스에도 앵커 제외", () => {
    const themeRows: ThemeComovementRow[] = [
      // 앵커는 TID 에서만 자기 행 존재 (TID2 멤버십 행 없음 → 교집합 추론 실패).
      themeRow({ theme_id: TID, stock_code: ANCHOR, conf_d0: 0.6 }),
      themeRow({ theme_id: TID, stock_code: "024060", conf_d0: 0.7 }),
      themeRow({ theme_id: TID2, stock_code: "017900", conf_d0: 0.6 }),
    ];
    const cosurgeRows: CosurgeEdgeRow[] = [edge(ANCHOR, "024060", 9)];
    const out = computeComovement(
      themeRows,
      cosurgeRows,
      [{ id: TID, name: "정유" }, { id: TID2, name: "남북경협" }],
      quotes(),
      8,
      ANCHOR, // ← 명시 앵커
    );
    // 앵커는 어떤 경로(테마/co-surge)로도 후보에 등장하면 안 됨.
    expect(out.some((c: CoMovementCandidate) => c.code === ANCHOR)).toBe(false);
    // 흥구석유는 정상 후보.
    expect(out.some((c: CoMovementCandidate) => c.code === "024060")).toBe(true);
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

  // ── v2 co-surge 점수 시나리오 (사용자 설계 피드백) ──

  // Test J — 최근성 가중: 같은 비율 0.9 라도 최근 동반(w 큼)이 오래된 동반(w 작음)보다 강함.
  //   앵커 004090(code_a). recent: w_a=3 ws_a=2.7 (비율 0.9, 최근 다수).
  //   old:    w_a=1.0 ws_a=0.9 (비율 0.9 동일하나 ~2년 전 1회분 → w_sum 작아 표본보정·강도 모두 하락).
  //   pairScore_recent = 0.9 × min(1,3/1.5)=0.9 ;  pairScore_old = 0.9 × min(1,1/1.5)=0.6.
  it("J: 동일 강도비율(0.9)이면 최근 동반(w 큼)이 오래된 동반보다 strength 큼", () => {
    const cosurgeRows: CosurgeEdgeRow[] = [
      edge(ANCHOR, "024060", 5, 2, 18, { w_a: 3, ws_a: 2.7, w_b: 3, ws_b: 2.7 }), // 최근 강함
      edge(ANCHOR, "017900", 5, 2, 18, { w_a: 1.0, ws_a: 0.9, w_b: 1.0, ws_b: 0.9 }), // 오래됨
    ];
    const out = computeComovement([], cosurgeRows, [], quotes(), 8, ANCHOR);
    const recent = out.find((c: CoMovementCandidate) => c.code === "024060")!;
    const old = out.find((c: CoMovementCandidate) => c.code === "017900")!;
    expect(recent.strength).toBeGreaterThan(old.strength);
  });

  // Test K — 표본보정(W0): 1회짜리 최근 우연(높은 비율이라도 w_sum 작음) <
  //   꾸준한 다수 동반(중간 비율이라도 w_sum 충분). 횟수/강도만으론 역전 못 하게 보정.
  //   fluke:  w_a=0.5 ws_a=0.5 (비율 1.0 우연 1회) → 1.0 × min(1,0.5/1.5)=0.333.
  //   steady: w_a=4 ws_a=2.8 (비율 0.7 꾸준 다수) → 0.7 × min(1,4/1.5)=0.7.
  it("K: 1회 최근 우연(W0 미달) < 꾸준한 다수 동반 (표본보정)", () => {
    const cosurgeRows: CosurgeEdgeRow[] = [
      edge(ANCHOR, "024060", 3, 2, 18, { w_a: 0.5, ws_a: 0.5, w_b: 0.5, ws_b: 0.5 }), // 우연 1회
      edge(ANCHOR, "017900", 9, 2, 18, { w_a: 4, ws_a: 2.8, w_b: 4, ws_b: 2.8 }), // 꾸준 다수
    ];
    const out = computeComovement([], cosurgeRows, [], quotes(), 8, ANCHOR);
    const fluke = out.find((c: CoMovementCandidate) => c.code === "024060")!;
    const steady = out.find((c: CoMovementCandidate) => c.code === "017900")!;
    expect(steady.strength).toBeGreaterThan(fluke.strength);
  });

  // Test L — recentCoSurge 방향 매핑: 앵커가 code_a/code_b 어느 쪽이든
  //   ra/rb → anchorRate/candidateRate 가 올바르게 정렬돼야 한다 (무향 정규화 보정).
  it("L: recentCoSurge 가 앵커 방향에 맞춰 anchorRate/candidateRate 로 변환", () => {
    // 앵커=code_a (ANCHOR '004090' < '024060'): candidateRate=rb, anchorRate=ra.
    const aSide: CosurgeEdgeRow[] = [
      edge(ANCHOR, "024060", 5, 2, 18, undefined, [
        { d: "2026-06-18", ra: 30, rb: 25 },
        { d: "2026-05-30", ra: 18, rb: 12 },
      ]),
    ];
    const outA = computeComovement([], aSide, [], quotes(), 8, ANCHOR);
    const candA = outA.find((c: CoMovementCandidate) => c.code === "024060")!;
    expect(candA.recentCoSurge).toEqual([
      { date: "2026-06-18", anchorRate: 30, candidateRate: 25 },
      { date: "2026-05-30", anchorRate: 18, candidateRate: 12 },
    ]);

    // 앵커=code_b ('000020' < ANCHOR '004090' → 후보가 code_a): candidateRate=ra, anchorRate=rb.
    const bSide: CosurgeEdgeRow[] = [
      edge("000020", ANCHOR, 5, 2, 18, undefined, [{ d: "2026-06-10", ra: 22, rb: 31 }]),
    ];
    const outB = computeComovement([], bSide, [], quotes(), 8, ANCHOR);
    const candB = outB.find((c: CoMovementCandidate) => c.code === "000020")!;
    expect(candB.recentCoSurge).toEqual([
      { date: "2026-06-10", anchorRate: 31, candidateRate: 22 },
    ]);
  });
});
