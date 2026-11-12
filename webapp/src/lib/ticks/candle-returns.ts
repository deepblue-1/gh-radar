/**
 * 봉 차트 수익률 판 계산(Phase 42 D-13 ~ D-15 · UI-SPEC S6) — 순수 함수.
 *
 * ① 당일 수익률(보라 · 오른쪽 눈금) = 팀 거래정보 패널 「평단 대비 수익률」 과 **같은 함수** `teamKpiAt(team, session, rec).pnl.ret`
 *   의 시계열(정의를 새로 만들지 않는다 · 38 D-16). 값 = (실현 + 미실현) ÷ 누적 매수 금액(shared team-pnl `ret`).
 *   점 = 보기 창 그림 폭 1px 열마다 그 열 끝 시각의 마지막 틱 rec(앞 열과 같으면 건너뜀) + 보기 창 안 팀 체결 rec + 커서 rec —
 *   커서 x 에서 선이 패널 값을 정확히 지난다(RESEARCH Pitfall 6). 팀 첫 매수 전 · 매수 금액 0 이면 null(선 끊김).
 * ② 누적 수익률(회색 · 왼쪽 눈금) = (그 시각 가격 − 그 시각 누적 평단) ÷ 누적 평단 — **미실현만**. 누적 평단 `px` ≤ 0 · 첫 점 전은 끊김.
 *   **두 선의 정의가 다르다** — 당일은 매수 금액 대비 실현 + 미실현, 누적은 평단 대비 가격.
 * ③ 두 눈금 0% 맞춤(UI-SPEC S6 · Researcher Decision 7) — 선마다 위 · 아래 최대에 12% + 0.05%p 여유 → 0% 높이 비율 z ·
 *   두 선 중 큰 z 를 0.15 ~ 0.85 로 묶어 같이 쓰고 선마다 단위 = max(위 ÷ z, 아래 ÷ (1 − z)). 0% 선은 하나.
 * ④ 그리기는 컴포넌트(42-05 · 42-06 · 42-10) · 계산은 여기서 테스트가 잠근다.
 */

import type { View } from '@/lib/accum-chart';

import { teamKpiAt } from './team-model';
import { msOfNs, priceIdxAt, priceSeriesOf } from './tick-chart';
import type { TickSession } from './tick-session';

/** 수익률 점 — t = 수신 ms · v = 비율(0.032 = +3.2% · null = 끊김) · rec = 그 점 레코드(없으면 −1). */
export interface ReturnPoint {
  t: number;
  v: number | null;
  rec: number;
}

/** 그 rec 의 당일 팀 수익률 — 패널 「평단 대비 수익률」 과 같은 계산(rec −1 · 첫 매수 전 · 매수 0 이면 null). */
export function dayReturnAt(session: TickSession, rec: number): number | null {
  return rec < 0 ? null : (teamKpiAt(session.team, session, rec).pnl?.ret ?? null);
}

/** 보기 창 그림 폭 열마다 그 열 끝 시각 이하 마지막 가격 점 색인(앞 열과 같으면 건너뜀 · 가격 전이면 없음). */
function columnIdxOf(session: TickSession, view: View, plotW: number): number[] {
  const s = priceSeriesOf(session);
  const cols = Math.max(1, Math.ceil(plotW));
  const span = view.t1 - view.t0 || 1;
  const out: number[] = [];
  let prev = -2;
  for (let c = 0; c < cols; c++) {
    const i = priceIdxAt(s, view.t0 + ((c + 1) / cols) * span);
    if (i >= 0 && i !== prev) out.push(i);
    prev = i;
  }
  return out;
}

/**
 * 당일 수익률 점(t 오름차순 · 같은 t 는 거래소순) — 열 샘플 + 보기 창 안 팀 체결 rec + 커서 rec(−1 이면 없음).
 * 팀 체결이 하루에 하나도 없으면 []. 커서 rec 는 창 밖이어도 넣는다(값 띠 · 커서 점이 같은 값을 쓴다).
 */
export function dayReturnPointsOf(session: TickSession, view: View, plotW: number, cursorRec: number): ReturnPoint[] {
  const team = session.team;
  if (team.fills.length === 0) return [];
  const s = priceSeriesOf(session);
  const recv = session.index.recvNs;
  const recs = new Set<number>();
  for (const i of columnIdxOf(session, view, plotW)) recs.add(s.rec[i]!);
  for (const f of team.fills) {
    const ms = msOfNs(recv[f.rec]!);
    if (ms >= view.t0 && ms <= view.t1) recs.add(f.rec);
  }
  if (cursorRec >= 0) recs.add(cursorRec);
  const pos = session.exPos;
  return [...recs]
    .map((rec) => ({ t: msOfNs(recv[rec]!), v: dayReturnAt(session, rec), rec }))
    .sort((a, b) => a.t - b.t || pos[a.rec]! - pos[b.rec]!);
}
