/**
 * quick-261018-rfy — kind 16 `AccumSignal`(매집감지 · gh-trade Phase 34) 행 → 이름 풀기.
 *
 * 정본 = 인박스 `docs/inbox/from-gh-trade/261018-accum-signal.md` 「kind 16 — 43칸 매핑 표」(gh-trade
 * `server/src/market/publish/AccumSignal.cpp` `FillJournalSlot` 과 한 칸도 다르지 않다). 칸이 정본이다 —
 * `message` 는 칸에 없는 값(`since` 등록 거래일 · `reg` 등록 시각 · `th` 세 번째 조각 시총 상한)만 읽고
 * `st`/`end`/`cyc`/`carry`/`row`/`our` 는 칸과 대조하지 않는다.
 *
 * 입력은 이미 숫자화된 `StrategyEventRow`(REST 매퍼 · wss 푸시 공용)라 값 보정이 없다. 유일한 기본값은 길이가
 * 모자란 `snapQty`/`snapCum` 원소의 0 이다.
 */
import { STRATEGY_EVENT_KIND, type StrategyEventRow } from "./strategy-event";

/** 1 매집중 · 2 매도중 · 3 종료(청산 · 이월 탈락 · 이월 만료). */
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
  /** 0 없음 · 1 청산 · 2 이월 탈락 · 3 이월 만료. */
  endReason: number;
  /** 사이클 번호(청산 뒤 재등록마다 +1, 첫 사이클 1). */
  cycle: number;
  /** 이월 일수(0 = 이월 안 함). */
  carryDays: number;
  buyQty: number;
  buyKrw: number;
  sellQty: number;
  sellKrw: number;
  netQty: number;
  /** 팀 순매수 금액(매수 − 매도 · 음수 가능). */
  netKrw: number;
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
  /** 행 종류 — 1 분당 · 2 거래일 첫 스냅샷 · 3 복원 스냅샷 · 4 종료. */
  row: number;
  /** 등록 거래일 `YYYY-MM-DD`(message `since=`). 모양이 틀리면 null. */
  sinceDate: string | null;
  /** 등록 시각 `HH:MM:SS`(message `reg=`). 모양이 틀리면 null. */
  regTime: string | null;
  /** 서버 등록 임계 — 순매수 금액 · 한 가격 조각 수(snapCum) · 시총 상한(message `th=` 세 번째 조각 · 모양이 틀리면 null). */
  thNetKrw: number;
  thMinSame: number;
  thMaxMcapKrw: number | null;
};

/** 상태 배지 문구 — gh-trade 클라 동형. 종료 사유 1/2/3 은 배지 하나 「청산」(사유는 `ACCUM_END_REASON_LABELS` 툴팁). */
export const ACCUM_STATE_LABELS: Readonly<Record<AccumState, string>> = {
  1: "매집중",
  2: "매도중",
  3: "청산",
};

/** 종료 사유 문구(`endReason`) — 행 툴팁용. 0(없음)은 표에 없다. */
export const ACCUM_END_REASON_LABELS: Readonly<Record<number, string>> = {
  1: "청산",
  2: "이월 탈락",
  3: "이월 만료",
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

function isAccumState(n: number): n is AccumState {
  return n === 1 || n === 2 || n === 3;
}

/**
 * kind 16 행 → `AccumSignal`. kind ≠ 16 · isin 빈 문자열 · state ∉ {1, 2, 3} 이면 null(표시할 수 없는 행).
 * message 가 비었거나 키가 깨지면 `sinceDate` · `regTime` · `thMaxMcapKrw` 만 null 이고 나머지 칸은 그대로다.
 */
export function accumSignalOf(row: StrategyEventRow): AccumSignal | null {
  if (row.kind !== STRATEGY_EVENT_KIND.AccumSignal) return null;
  if (!row.isin) return null;
  const state = row.qty;
  if (!isAccumState(state)) return null;
  const msg = parseAccumMessage(row.message);
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
    sinceDate: sinceDateOf(msg.get("since")),
    regTime: regTimeOf(msg.get("reg")),
    thNetKrw: row.snapCum[0] ?? 0,
    thMinSame: row.snapCum[1] ?? 0,
    thMaxMcapKrw: thMaxMcapOf(msg.get("th")),
  };
}
