/**
 * quick-261018-rfy — kind 16 `AccumSignal`(매집감지 · gh-trade Phase 34) 행 → 이름 풀기.
 *
 * 정본 = 인박스 `docs/inbox/from-gh-trade/261018-accum-signal.md` 「kind 16 — 43칸 매핑 표」(gh-trade
 * `server/src/market/publish/AccumSignal.cpp` `FillJournalSlot` 과 한 칸도 다르지 않다). 칸이 정본이다 —
 * `message` 는 칸에 없는 값(`since` 등록 거래일 · `reg` 등록 시각 · `th` 세 번째 조각 시총 상한 · `day` 당일 순수량 ·
 * 가격 범위 · `recent` 등록 임계 조각 수 · 창 초)만 읽고 `st`/`end`/`cyc`/`carry`/`row`/`our`/`warn`/`nxt` 는 칸과 대조하지 않는다.
 *
 * quick-261019-j1w — 인박스 `261019-accum-sell-warn` (나): `hasRemaining` = sell_warn(모든 행 종류) ·
 * `condMetric` = min(sell_warns, 255) · `queueCase` 5 = 매도 경보 에지(켜짐 · 꺼짐 즉시 1행 — 종료 행 4 가
 * 같이 나가면 4 만 내고 그 행의 hasRemaining false 가 꺼짐을 알린다). message 끝 `|warn=<0|1>` 은 사람용이라 읽지 않는다.
 *
 * quick-261022-ozx — 인박스 `261022-accum-nxt-team-burst`(gh-trade Phase 37 · NXT 팀 주문 합산): buy_* · sell_*(따라서
 * netKrw · netQty · avgPx)는 KRX+NXT 합산이고 exchange 는 "KRX" 그대로(뜻만 합산 포지션). 0 고정이던 두 칸이 NXT 몫
 * 금액이다 — errorVolume = nxt_buy_krw → `nxtBuyKrw` · remainingVolume = nxt_sell_krw → `nxtSellKrw`(옛 행 0).
 * message 끝 `|nxt=<buy_krw>/<sell_krw>/<buy_qty>/<sell_qty>` 는 읽지 않는다 — 금액은 칸이 정본이고 수량은 쓰지 않는다
 * (사용자 결정).
 *
 * quick-261024-uov — 인박스 `261024-accum-hidden-carry10` 「추가 — 매집 종료 end_reason 4」: cancel_reason 4 = 매집 종료
 * (짧은 말 「종료」). 매퍼 변경 없음(칸을 그대로 옮긴다) — 문구와 주석만.
 *
 * quick-261025-uf2 — 인박스 `261025-accum-day-axis` ③(gh-trade Phase 39 · 당일 축): snap_len 3 행만
 * snap_qty[2] = day_buy_krw · snap_cum[2] = day_sell_krw · accept_latency_us = day_avg_px(kind 16 에서만 이 뜻) —
 * 길이 2(옛 행)는 「당일 값 없음」 이라 null(acceptLatencyUs 0 고정 칸을 평단 0 으로 읽지 않는다). message 새 꼴
 * `since|reg|st|end|cyc|carry|row|our|th|day|recent|nxt(2)` — `day=<net_qty>/<lo_px>/<hi_px>` · `recent=<pieces>/<sec>` 를
 * 읽는다. `|warn=` 은 삭제됐고(has_remaining 칸이 정본) `|nxt=` 는 수량 둘만(금액은 칸이 정본)이라 둘 다 계속 읽지 않는다.
 *
 * 입력은 이미 숫자화된 `StrategyEventRow`(REST 매퍼 · wss 푸시 공용)라 값 보정이 없다. 유일한 기본값은 길이가
 * 모자란 `snapQty`/`snapCum` 원소의 0 이다. 당일 칸(셋째 원소 · 평단)은 둘 다 길이 3 이 아니면 0 이 아니라 null 이다.
 */
import { STRATEGY_EVENT_KIND, type StrategyEventRow } from "./strategy-event";

/** 1 매집중 · 2 매도중 · 3 종료(청산 · 기동 정합 · 이월 만료 · 매집 종료). */
export type AccumState = 1 | 2 | 3;

/** kind 16 행 1건을 이름으로 푼 값(팀 매집 누적 상태 전체 — 델타 아님). 금액 단위 원 · 수량 단위 주. */
export type AccumSignal = {
  isin: string;
  exchange: string;
  /** 6자 단축코드 — 조회 RPC `stocks` 조인(라이브 푸시는 relay 가 채운 값). 없으면 null. */
  stockCode: string | null;
  /** KST 거래일 `YYYY-MM-DD` — 날짜 거름용. */
  tradeDate: string;
  gateway: string;
  /** 행을 만든 시각(분 경계 틱 · 복원 = 기동 · 종료 = 청산 시각). 「갱신」 표시 · 최신 판정 정본. */
  gwTimeMs: number;
  state: AccumState;
  /** 0 없음 · 1 청산(1억 미만 숨김 — 같은 cycle 로 재등장 가능) · 2 서버 재기동 때 복원 안 됨 · 3 이월 10일 만료 · 4 매집 종료(청산 뒤 순매수가 등록 뒤 최고의 −30% 이하 — 같은 사이클 두 번째 종료 행 · 장중 팀 주문에서만 · 88 없음 · 다음 등록은 cycle + 1). */
  endReason: number;
  /** 사이클 번호(첫 사이클 1 · 청산 뒤 재등장은 같은 번호 · 만료 · 기동 정합 · 매집 종료 뒤 새 등록만 +1). */
  cycle: number;
  /** 이월 일수(0 = 이월 안 함). */
  carryDays: number;
  /** buy_* · sell_* · net_* · 평단은 KRX+NXT 합산(gh-trade Phase 37 부터). */
  buyQty: number;
  buyKrw: number;
  sellQty: number;
  sellKrw: number;
  netQty: number;
  /** 팀 순매수 금액(매수 − 매도 · 음수 가능) · KRX+NXT 합산. */
  netKrw: number;
  /** NXT 팀 매수 금액(원) — buyKrw 안에 든 NXT 몫 · 칸 errorVolume · gh-trade Phase 37 · 옛 행 0. */
  nxtBuyKrw: number;
  /** NXT 팀 매도 금액(원) — sellKrw 안에 든 NXT 몫 · 칸 remainingVolume · 옛 행 0. */
  nxtSellKrw: number;
  /** 팀 매수 평단. */
  avgPx: number;
  /** 매집 구간 하한 · 상한. */
  loPx: number;
  hiPx: number;
  /** 등록 순간 가격. */
  regPx: number;
  /** 이 사이클 최고 순매수 금액. */
  peakNetKrw: number;
  /** 매집중 → 매도중 전환 횟수. */
  sellPhases: number;
  /** 이 사이클 매수 SMP 주문의 한 가격 최대 조각 수. */
  maxSame: number;
  mcapKrw: number;
  /** 이 서버 주문 체결이라 팀 누적에서 뺀 수량(서버마다 다를 수 있는 유일한 값). */
  ourExcludedQty: number;
  /** 지금 KRX 체결가(없으면 마지막 팀 체결가 · 종료 행 = 마지막 팀 체결가 · 복원 행 = 등록가). */
  lastPx: number;
  /** 등락률 × 100(부호 포함 · 종료 · 복원 행 0). */
  rateBp: number;
  /** 행 종류 — 1 분당 · 2 거래일 첫 스냅샷 · 3 복원 스냅샷 · 4 종료 · 5 매도 경보 에지. */
  row: number;
  /** 지금 매도 경보 중(칸 hasRemaining) — 매집중에서만 켜진다(서버 규칙). */
  sellWarn: boolean;
  /** 이 사이클 경보 횟수(칸 condMetric · 서버가 255 로 자름) — 새 사이클 0 · 청산 뒤 재등장 · 06:00 이월 유지 · 재기동 0. */
  sellWarns: number;
  /** 등록 거래일 `YYYY-MM-DD`(message `since=`). 모양이 틀리면 null. */
  sinceDate: string | null;
  /** 등록 시각 `HH:MM:SS`(message `reg=`). 모양이 틀리면 null. */
  regTime: string | null;
  /** 서버 등록 임계 — 순매수 금액 · 한 가격 조각 수(snapCum) · 시총 상한(message `th=` 세 번째 조각 · 모양이 틀리면 null). */
  thNetKrw: number;
  thMinSame: number;
  thMaxMcapKrw: number | null;
  // ── 당일 축(quick-261025-uf2 · 인박스 261025-accum-day-axis ③) — 옛 행(snap 길이 2 · message 키 없음)은 null ──
  /** 당일 팀 매수 금액(원 · snapQty[2]) — 우리 체결 제외 · 06:00 · 새 사이클 · 종료 프레임 직전 0. */
  dayBuyKrw: number | null;
  /** 당일 팀 매도 금액(원 · snapCum[2]) — 우리 체결 제외 · 06:00 · 새 사이클 · 종료 프레임 직전 0. */
  daySellKrw: number | null;
  /** 당일 팀 순매수 금액(매수 − 매도 · 파생 · 음수 가능). */
  dayNetKrw: number | null;
  /** 당일 팀 매수 평단(acceptLatencyUs — kind 16 에서만 이 뜻) · 0 = 당일 매수 없음. */
  dayAvgPx: number | null;
  /** 당일 팀 순수량(주 · message `day=` 첫 조각 · 음수 가능). */
  dayNetQty: number | null;
  /** 당일 팀 매수 주문 가격 최저 · 최고(message `day=` 둘째 · 셋째) · 0 = 당일 매수 없음. */
  dayLoPx: number | null;
  dayHiPx: number | null;
  /** 서버 등록 임계 — 최근 `thRecentSec` 초 팀 매수 조각 수 합(message `recent=` 첫 조각) · 0 = 옛 서버. */
  thRecentPieces: number | null;
  /** 서버 등록 임계 — 위 창 초(message `recent=` 둘째 조각) · 0 = 옛 서버. */
  thRecentSec: number | null;
};

/** 상태 배지 문구 — gh-trade 클라 동형. 종료 사유 1~4 는 배지 하나 「청산」(사유는 `ACCUM_END_REASON_LABELS` 툴팁). */
export const ACCUM_STATE_LABELS: Readonly<Record<AccumState, string>> = {
  1: "매집중",
  2: "매도중",
  3: "청산",
};

/** 종료 사유 문구(`endReason`) — 행 툴팁용. 0(없음)은 표에 없다. */
export const ACCUM_END_REASON_LABELS: Readonly<Record<number, string>> = {
  1: "청산 — 순매수 1억 미만(다시 1억 이상이면 같은 사이클로 재등장)",
  2: "서버 재기동 때 복원 안 됨",
  3: "이월 10일 만료",
  4: "매집 종료 — 청산 뒤 순매수가 사이클 최고의 −30% 이하(최고 10억 → −3억)",
};

/** message `k=v|k=v…` → Map. 키 순서는 보지 않는다. */
function parseAccumMessage(message: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!message) return out;
  for (const part of message.split("|")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    out.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return out;
}

function sinceDateOf(v: string | undefined): string | null {
  if (!v || !/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

function regTimeOf(v: string | undefined): string | null {
  if (!v || !/^\d{6}$/.test(v)) return null;
  return `${v.slice(0, 2)}:${v.slice(2, 4)}:${v.slice(4, 6)}`;
}

function thMaxMcapOf(v: string | undefined): number | null {
  if (!v) return null;
  const parts = v.split("/");
  if (parts.length !== 3 || !/^\d+$/.test(parts[2])) return null;
  return Number(parts[2]);
}

/** `day=<net_qty>/<lo_px>/<hi_px>` — 정확히 3조각 · 첫 조각 음수 허용 · 가격은 음 아닌 정수. 아니면 전부 null. */
function dayOf(v: string | undefined): [number, number, number] | null {
  if (!v) return null;
  const parts = v.split("/");
  if (parts.length !== 3 || !/^-?\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1]) || !/^\d+$/.test(parts[2])) return null;
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** `recent=<pieces>/<sec>` — 정확히 2조각 · 둘 다 음 아닌 정수. 아니면 전부 null. */
function recentOf(v: string | undefined): [number, number] | null {
  if (!v) return null;
  const parts = v.split("/");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  return [Number(parts[0]), Number(parts[1])];
}

function isAccumState(n: number): n is AccumState {
  return n === 1 || n === 2 || n === 3;
}

/**
 * kind 16 행 → `AccumSignal`. kind ≠ 16 · isin 빈 문자열 · state ∉ {1, 2, 3} 이면 null(표시할 수 없는 행).
 * message 가 비었거나 키가 깨지면 `sinceDate` · `regTime` · `thMaxMcapKrw` · `dayNetQty` · `dayLoPx` · `dayHiPx` ·
 * `thRecentPieces` · `thRecentSec` 만 null 이고 나머지 칸은 그대로다. 당일 칸 4값은 snapQty · snapCum 둘 다 길이 3 일 때만.
 */
export function accumSignalOf(row: StrategyEventRow): AccumSignal | null {
  if (row.kind !== STRATEGY_EVENT_KIND.AccumSignal) return null;
  if (!row.isin) return null;
  const state = row.qty;
  if (!isAccumState(state)) return null;
  const msg = parseAccumMessage(row.message);
  const hasDay = row.snapQty.length >= 3 && row.snapCum.length >= 3;
  const dayBuyKrw = hasDay ? row.snapQty[2] : null;
  const daySellKrw = hasDay ? row.snapCum[2] : null;
  const day = dayOf(msg.get("day"));
  const recent = recentOf(msg.get("recent"));
  return {
    isin: row.isin,
    exchange: row.exchange,
    stockCode: row.stockCode,
    tradeDate: row.tradeDate,
    gateway: row.gateway,
    gwTimeMs: row.gwTimeMs,
    state,
    endReason: row.cancelReason,
    cycle: row.expectedCum,
    carryDays: row.entryRound,
    buyQty: row.evQtyBefore,
    buyKrw: row.limitBidQty,
    sellQty: row.evQtyAfter,
    sellKrw: row.bid1Qty,
    netQty: row.evTradeQty,
    netKrw: row.condThreshold,
    nxtBuyKrw: row.errorVolume,
    nxtSellKrw: row.remainingVolume,
    avgPx: row.evPrice,
    loPx: row.snapQty[0] ?? 0,
    hiPx: row.snapQty[1] ?? 0,
    regPx: row.bid1Price,
    peakNetKrw: row.askQtyAtLimit,
    sellPhases: row.resultCode,
    maxSame: row.aheadQty,
    mcapKrw: row.baseCum,
    ourExcludedQty: row.immediateFillQty,
    lastPx: row.price,
    rateBp: row.condActual,
    row: row.queueCase,
    sellWarn: row.hasRemaining,
    sellWarns: row.condMetric,
    sinceDate: sinceDateOf(msg.get("since")),
    regTime: regTimeOf(msg.get("reg")),
    thNetKrw: row.snapCum[0] ?? 0,
    thMinSame: row.snapCum[1] ?? 0,
    thMaxMcapKrw: thMaxMcapOf(msg.get("th")),
    dayBuyKrw,
    daySellKrw,
    dayNetKrw: dayBuyKrw !== null && daySellKrw !== null ? dayBuyKrw - daySellKrw : null,
    dayAvgPx: hasDay ? row.acceptLatencyUs : null,
    dayNetQty: day ? day[0] : null,
    dayLoPx: day ? day[1] : null,
    dayHiPx: day ? day[2] : null,
    thRecentPieces: recent ? recent[0] : null,
    thRecentSec: recent ? recent[1] : null,
  };
}
