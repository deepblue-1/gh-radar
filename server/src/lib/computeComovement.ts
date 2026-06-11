/**
 * Phase 11 — 동조 후보 결합 점수 순수함수 (COMV-01, RESEARCH §타이트니스/§두 경로 결합/§후행).
 *
 * 두 사전계산 경로를 병합·dedup·랭킹한다:
 *   1. 테마-풀링(theme_comovement) — 앵커의 활성 테마 멤버. conf_d0(동반율) + 타이트니스
 *      가중(1/sqrt(member_count)) + 앵커 참여도 가중(anchor_rel, R3).
 *   2. 글로벌 co-surge(cosurge_edges) — 앵커와 ≥10% 바를 함께 낸 이웃. v2: pairScore =
 *      (ws_sum/w_sum) × min(1, w_sum/W0) — 앵커 발화일 강도비율의 최근성 가중평균 × 표본보정.
 *
 * 종목코드(code) key 로 dedup — 한 종목이 양쪽 경로에 모두 있으면 evidence 합집합
 * (sharedThemes + coSurgeCount), strength = max(theme_combined, cosurge_combined) (D-03/D-10).
 *
 * IO 없음 — 호출자(routes/comovement.ts)가 row + 시세 Map 을 수집해 전달.
 *
 * 시그니처는 Plan 01 의 RED 테스트(server/src/lib/computeComovement.test.ts)가 정의한
 * 계약이 SOURCE OF TRUTH:
 *   computeComovement(themeRows, cosurgeRows, anchorThemes, quoteByCode, k, anchorCode?)
 *   - themeRows:    앵커 활성 테마들의 전 멤버 통계 (앵커 자신의 행 포함 — anchor_rel 추출용)
 *   - cosurgeRows:  앵커가 한쪽 끝인 co-surge 엣지 (무향 정규화 code_a < code_b)
 *   - anchorThemes: 앵커 활성 테마 메타 {id,name}[] (공유 테마 칩 라벨)
 *   - quoteByCode:  code → { name, market, changeRate } (실시간 + 표시 메타)
 *   - k:            TOP-K 클램프
 *   - anchorCode?:  앵커 종목코드 (라우트가 아는 진실값 — 명시 전달 권장).
 *                   미전달 시 row 에서 휴리스틱 추론(deriveAnchor) 폴백 (단위 테스트 호환).
 *                   프로덕션 라우트는 항상 명시 전달 — 다중 테마 교집합 추론 실패로 앵커가
 *                   자기 후보에 섞이는 회귀(004090 self-rank) 방지.
 */

import type { CoMovementCandidate, Market } from "@gh-radar/shared";
import { toNum, type ThemeComovementRow, type CosurgeEdgeRow } from "../mappers/comovement.js";

// ── 결합 점수 상수 (Plan 02 calibration 으로 조정 가능 — 11-CALIBRATION.md 참조) ───────
/** lift 정규화 상한. lift ∈ [0, LIFT_CAP] → [0,1]. fixture lift 9~32 관측. */
export const LIFT_CAP = 10;
/** avg_ret 정규화 분모(%). 30%/일 을 만점으로. */
export const AVG_RET_DIV = 30;
/**
 * co-surge 페어점수 v2 표본보정 분모(가중 발화일 합 W0).
 * pairScore = (ws_sum/w_sum) × min(1, w_sum/W0). w_sum 은 Σ power(0.5, 경과일/365):
 * 오늘 발화 1회면 w≈1.0, 1년 전 1회면 w≈0.5. W0=1.5 → 최근 1회짜리 우연(w≈1)이
 * min(1, 1/1.5)=0.67 로 감쇠해, 꾸준한 다수 동반(w_sum≥1.5, 보정 1.0)을 못 이긴다.
 * (기존 CO_SURGE_CAP=15 횟수 정규화는 폐기 — 강도·최근성 미반영이라 사용자 의도와 불일치.)
 */
export const CO_SURGE_W0 = 1.5;
/**
 * 앵커 참여도 가중 floor (R3). anchor_rel = sqrt(FLOOR + (1-FLOOR)·anchor_conf_d0).
 * 0.2 floor 로 앵커 미동참 테마도 ~0.45 배 기여(recall 붕괴 방지). 범위 ≈ [0.45, 1].
 */
export const ANCHOR_REL_FLOOR = 0.2;

type QuoteMeta = { name: string; market: Market; changeRate: number | null };

/** 누적 후보 — code key 로 양쪽 경로 evidence 를 합친다. */
type Acc = {
  code: string;
  themeCombined: number; // 테마 경로 결합점수 (없으면 0)
  cosurgeCombined: number; // co-surge 경로 결합점수 (없으면 0)
  bestConfD1: number; // 후행 판정용 (테마 경로 max conf_d1)
  bestConfD0Raw: number; // 표시 메트릭(raw 동반율) + 후행 판정용 (테마 경로 max conf_d0, anchor_rel 미적용)
  igniteDays: number; // 표본 배지용 (테마 경로 max ignite_days)
  sharedThemes: { id: string; name: string }[];
  coSurgeCount: number | null;
};

/**
 * 앵커 종목코드 도출 — 테스트 계약이 anchorCode 를 인자로 받지 않으므로 row 에서 추론.
 *
 * 규칙: anchorThemes 가 있으면 "모든 anchorThemes 에 속한 종목"(교집합) = 앵커
 *       (라우트가 .eq("stock_code", anchor) 로 테마를 찾았으므로 앵커는 전 테마의 멤버).
 *       anchorThemes 가 비면(co-surge 전용) cosurge 엣지의 공통 노드 — 없으면 null.
 */
function deriveAnchor(
  themeRows: ThemeComovementRow[],
  anchorThemes: { id: string; name: string }[],
  cosurgeRows: CosurgeEdgeRow[],
): string | null {
  if (anchorThemes.length > 0) {
    const themeIds = new Set(anchorThemes.map((t) => t.id));
    // code → 속한 anchorTheme id 집합
    const themesByCode = new Map<string, Set<string>>();
    for (const r of themeRows) {
      if (!themeIds.has(r.theme_id)) continue;
      const s = themesByCode.get(r.stock_code) ?? new Set<string>();
      s.add(r.theme_id);
      themesByCode.set(r.stock_code, s);
    }
    // 모든 anchorThemes 에 속한 code = 앵커
    for (const [code, s] of themesByCode) {
      if (s.size === themeIds.size) return code;
    }
  }
  // co-surge 전용 — 모든 엣지의 공통 노드
  if (cosurgeRows.length > 0) {
    const counts = new Map<string, number>();
    for (const e of cosurgeRows) {
      counts.set(e.code_a, (counts.get(e.code_a) ?? 0) + 1);
      counts.set(e.code_b, (counts.get(e.code_b) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = -1;
    for (const [code, n] of counts) {
      if (n > bestN) {
        bestN = n;
        best = code;
      }
    }
    return best;
  }
  return null;
}

export function computeComovement(
  themeRows: ThemeComovementRow[],
  cosurgeRows: CosurgeEdgeRow[],
  anchorThemes: { id: string; name: string }[],
  quoteByCode: Map<string, QuoteMeta>,
  k: number,
  anchorCode?: string,
): CoMovementCandidate[] {
  // 라우트가 앵커 코드를 알면(프로덕션 경로) 그것이 진실값 — 휴리스틱 추론보다 우선.
  // 미전달 시(단위 테스트)만 row 에서 추론. 다중 테마 교집합 추론은 앵커 자기 멤버십
  // 행이 모든 anchorThemes 를 덮지 않으면 실패 → 앵커가 자기 후보에 포함되는 버그.
  const anchor = anchorCode ?? deriveAnchor(themeRows, anchorThemes, cosurgeRows);
  const themeNameById = new Map(anchorThemes.map((t) => [t.id, t.name]));

  // 1. 앵커 자신의 테마별 conf_d0 → anchor_rel 추출 (themeRows 에 앵커 행 포함).
  const anchorConfByTheme = new Map<string, number>();
  if (anchor) {
    for (const r of themeRows) {
      if (r.stock_code === anchor) {
        anchorConfByTheme.set(r.theme_id, toNum(r.conf_d0));
      }
    }
  }
  const anchorRel = (themeId: string): number => {
    const c = anchorConfByTheme.get(themeId) ?? 0;
    const x = ANCHOR_REL_FLOOR + (1 - ANCHOR_REL_FLOOR) * c;
    return Math.sqrt(Math.max(0, x));
  };

  const acc = new Map<string, Acc>();
  const ensure = (code: string): Acc => {
    let a = acc.get(code);
    if (!a) {
      a = {
        code,
        themeCombined: 0,
        cosurgeCombined: 0,
        bestConfD1: 0,
        bestConfD0Raw: 0,
        igniteDays: 0,
        sharedThemes: [],
        coSurgeCount: null,
      };
      acc.set(code, a);
    }
    return a;
  };

  // 2. 테마 경로 — 앵커 자신 제외, anchorThemes 에 속한 멤버만 집계.
  const anchorThemeIds = new Set(anchorThemes.map((t) => t.id));
  for (const r of themeRows) {
    if (r.stock_code === anchor) continue;
    if (anchorThemeIds.size > 0 && !anchorThemeIds.has(r.theme_id)) continue;
    const confD0 = toNum(r.conf_d0);
    const confD1 = toNum(r.conf_d1);
    const lift = toNum(r.lift);
    const avgRet = toNum(r.avg_ret);
    const memberCount = Number.isFinite(r.member_count) && r.member_count > 0 ? r.member_count : 1;
    const themeWeight = 1 / Math.sqrt(memberCount);
    // conf_d0_eff = conf_d0 · 타이트니스 · 앵커 참여도 (R3).
    const confD0Eff = confD0 * themeWeight * anchorRel(r.theme_id);
    const combined =
      0.5 * confD0Eff +
      0.2 * Math.min(1, lift / LIFT_CAP) +
      0.2 * Math.min(1, avgRet / AVG_RET_DIV) +
      0.1 * confD1;

    const a = ensure(r.stock_code);
    // conf_d0_eff(가중값)는 strength 랭킹에만 반영 — 표시 메트릭(confD0)은 raw 동반율(bestConfD0Raw) 사용 (WR-01).
    if (combined > a.themeCombined) a.themeCombined = Number.isFinite(combined) ? combined : 0;
    if (confD1 > a.bestConfD1) a.bestConfD1 = confD1;
    if (confD0 > a.bestConfD0Raw) a.bestConfD0Raw = confD0;
    if (Number.isFinite(r.ignite_days) && r.ignite_days > a.igniteDays) a.igniteDays = r.ignite_days;
    // 공유 테마 칩 (dedup by id)
    const tname = themeNameById.get(r.theme_id);
    if (tname && !a.sharedThemes.some((t) => t.id === r.theme_id)) {
      a.sharedThemes.push({ id: r.theme_id, name: tname });
    }
  }

  // 3. co-surge 경로 — 앵커 반대편 code. 테마 없는 종목도 후보로.
  //    v2: 앵커가 발화한 날 other 가 얼마나 따라갔나(강도비율)를 최근성 가중평균.
  //    pairScore = (ws_sum/w_sum) × min(1, w_sum/W0). 만점 1.0 (테마 경로와 동일).
  //    앵커가 code_a 면 a-방향 sums, code_b 면 b-방향 sums 사용 (앵커 발화일이 분자 기준일).
  for (const e of cosurgeRows) {
    const other = anchor ? (e.code_a === anchor ? e.code_b : e.code_a) : e.code_b;
    if (anchor && other === anchor) continue; // 자기 엣지(이론상 없음) 방어
    const coCount = Number.isFinite(e.co_count) ? e.co_count : 0;
    const lift = toNum(e.lift);
    const avgRet = toNum(e.avg_pair_ret);

    // 앵커 발화 방향 선택. anchor 미상(co-surge 전용 추론 폴백)이면 code_a 를 앵커로 가정.
    const anchorIsA = anchor ? e.code_a === anchor : true;
    const wSum = anchorIsA ? toNum(e.w_sum_a) : toNum(e.w_sum_b);
    const wsSum = anchorIsA ? toNum(e.ws_sum_a) : toNum(e.ws_sum_b);
    // pairScore = 강도비율(최근성 가중평균) × 표본보정. w_sum 0(≥15% 발화 0)이면 0.
    const pairScore =
      wSum > 0 ? (wsSum / wSum) * Math.min(1, wSum / CO_SURGE_W0) : 0;

    const combined =
      0.6 * pairScore +
      0.2 * Math.min(1, lift / LIFT_CAP) +
      0.2 * Math.min(1, avgRet / AVG_RET_DIV);

    const a = ensure(other);
    if (combined > a.cosurgeCombined) a.cosurgeCombined = Number.isFinite(combined) ? combined : 0;
    // coSurgeCount 는 표시용(칩 "직접동반 N회") — 최대 co_count (한 종목 다중 엣지면 max).
    if (a.coSurgeCount === null || coCount > a.coSurgeCount) a.coSurgeCount = coCount;
  }

  // 4. dedup 결과 → CoMovementCandidate. strength = max(theme, cosurge).
  const candidates: CoMovementCandidate[] = [];
  for (const a of acc.values()) {
    if (anchor && a.code === anchor) continue;
    const strengthRaw = Math.max(a.themeCombined, a.cosurgeCombined);
    const strength = Number.isFinite(strengthRaw) ? strengthRaw : 0;
    const meta = quoteByCode.get(a.code);
    const live = meta && meta.changeRate !== null && Number.isFinite(meta.changeRate)
      ? meta.changeRate
      : null;
    // 후행형 — 테마 경로 conf_d1 > conf_d0 AND conf_d1 >= 0.3 (co-surge 전용은 false).
    const isTrailing = a.bestConfD1 > a.bestConfD0Raw && a.bestConfD1 >= 0.3;
    const sampleConfidence: "high" | "low" = a.igniteDays >= 8 ? "high" : "low";

    candidates.push({
      code: a.code,
      name: meta?.name ?? a.code,
      market: (meta?.market ?? "KOSPI") as Market,
      liveChangeRate: live,
      // 표시 메트릭 = raw 동반율 (가중값 conf_d0_eff 가 아닌 — WR-01). co-surge 전용은 0 → UI sharedThemes=[] 로 "—".
      confD0: Number.isFinite(a.bestConfD0Raw) ? a.bestConfD0Raw : 0,
      strength,
      isTrailing,
      sharedThemes: a.sharedThemes,
      coSurgeCount: a.coSurgeCount,
      sampleConfidence,
    });
  }

  // 5. strength desc 정렬 → TOP-K.
  candidates.sort((x, y) => y.strength - x.strength);
  const limit = Math.max(0, Math.min(k, candidates.length));
  return candidates.slice(0, limit);
}
