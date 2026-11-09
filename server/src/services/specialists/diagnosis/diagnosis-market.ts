import zlib from "node:zlib";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  concatBytes,
  decodeAny,
  fmtTickTime,
  isKrxHoliday,
  iterRecords,
  kstDateIso,
  parseTickTime,
  splitZstdFrames,
  TICK_FMT,
  type FieldValue,
} from "@gh-radar/shared";

import { ApiError } from "../../../errors.js";
import { logger } from "../../../logger.js";
import type { TickConvertTrigger } from "../../tick-convert-trigger.js";
import { fetchLiveBytes, type LiveFetchMemoEntry, type LiveUnavailableReason } from "../../tick-live-fetch.js";
import type { TickgwClient } from "../../tickgw-client.js";
import { openTickGridForServer, requestTickConvert, TICK_GRID_BUCKET } from "../../ticks.js";

/**
 * Phase 39 — 진단 전문가의 시세 도구 엔진(D-05 ~ D-08 · D-12). 모델 도구 배선(`get_market_ticks`)은 39-07 이 이 모듈을 부른다.
 *
 * 입력 `{isin, exchange, date, from, to}` → 텍스트 하나. **원본 A3/B6 전문을 한 줄씩** 시간(수신)순으로 섞어 준다 —
 * 서버는 버스트 묶기 · 단일가 판정 같은 요약을 하지 않는다(D-06: 요약하면 모델이 근거를 잃는다).
 *
 * ── 경로 ──────────────────────────────────────────────────────────
 *   지난 날짜  `tick_open_for_user`(openTickGridForServer) → 격자가 있으면 서버가 Storage 에서 받아(브라우저 경유 없음)
 *             프레임마다 스트리밍으로 풀어 창만 남긴다(512Mi · 하루치를 통째로 풀지 않는다 · RESEARCH Pitfall 3).
 *             격자가 없으면 기존 `requestTickConvert`(하루 상한 공유)를 걸고 기다리지 않고 「변환 중 · 약 N분 뒤 다시 물어 주세요」.
 *   오늘       tickgw 당일 경로(`/api/ticks/live` 와 같은 tickgw · fetchLiveBytes 상태표) — 이어붙인 zstd 프레임은 지난 날짜와
 *             같은 스트리밍 해제(windowOfCompressed)로 프레임마다 푼다. 08:00 전 · 휴장 · 경로 꺼짐 · 응답 없음 · 대기열 20초 초과 · 그 시각 기록 없음이면 「자료 없음: <사유>」
 *             (거짓 시세를 짓지 못하게). 같은 (isin, ex) 재호출은 실행 단위 memo 로 증분만 받는다.
 *
 * ── 상한(D-05) ────────────────────────────────────────────────────
 *   창은 최대 60초 · 400건. 넘으면 앞에서부터 자르고 「잘렸음: …」 을 붙인다. 응답 첫 줄은 범례, 끝 줄은 틱 보기 링크
 *   (서버가 만든다 · t = 창 첫 레코드 수신 시각). 진단문 안의 틱 링크는 39 UAT 뒤 설계로 **모델이 짓는다** — 도구 결과의
 *   시각으로 쓰이는 자리에 바로 붙인다(프롬프트 [출력 모양] 4번 · 주문로그 시각이면 1초 앞으로 — 뷰어는 수신 시각 기준).
 *
 * ── 비용(SC-5) ───────────────────────────────────────────────────
 *   우리 tickgw · 우리 Storage · 우리 RPC 만 부른다 — 외부 원본 fetch 0.
 *
 * throw 하지 않는다 — 모든 실패는 `source: "none"` + `자료 없음: <사유>` 텍스트 + 서버 로그.
 */

export type MarketTicksInput = {
  isin: string;
  exchange: "KRX" | "NXT";
  /** `YYYY-MM-DD` (KST). */
  date: string;
  /** `HH:MM:SS` 또는 `HH:MM:SS.mmm` (KST · 거래소 시각 기준 창). */
  from: string;
  to: string;
};

export type MarketDeps = {
  supabase: SupabaseClient;
  userId: string;
  tickgw?: TickgwClient;
  trigger?: TickConvertTrigger;
  dailyCap: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * 한 진단 실행 단위 메모 — 키 `${isin}|${ex}` → 그 키의 **마지막 받기** Promise(끝나면 누적 엔트리 · 실패면 그 앞 엔트리).
 * 결과가 아니라 Promise 를 넣어 같은 라운드 병렬 호출이 앞 받기를 기다렸다가 증분만 받게 한다(IN-03 · tickgw 활성 키
 * 8개 경쟁 Pitfall 4 를 불필요하게 늘리지 않는다). 프로세스 전역 캐시로 쓰지 않는다(512Mi).
 */
export type MarketMemo = Map<string, Promise<LiveFetchMemoEntry | undefined>>;

export type MarketTicksResult = {
  text: string;
  records: number;
  truncated: boolean;
  source: "live" | "grid" | "none";
};

/** N — 한 호출 창 상한(ms). */
export const MARKET_WINDOW_MAX_MS = 60_000;
/** M — 한 호출 레코드 상한(건). 토큰 실측(measure-diagnosis-tokens.ts)으로 정한다. */
export const MARKET_MAX_RECORDS = 400;
/** tickgw 대기열(queued) 최대 대기(ms) — 넘으면 「자료 없음: 당일 시세 대기열」. */
export const LIVE_WAIT_MAX_MS = 20_000;

/** 응답 첫 줄 — 한 줄 포맷의 칸 뜻(RESEARCH §Pattern 5 원문). */
export const MARKET_LEGEND =
  "범례: 시각 A3 체결가 수량 b{bs: 1매도 2매수 _공백=단일가} s{세션} 매도1/매수1 c누적 #msg_seq | 시각 B6 s{세션} A 매도1~5(가격x잔량) | B 매수1~5 T총매도/총매수 E예상가x예상량 #msg_seq";

const NS_PER_MS = 1_000_000n;
/**
 * 수신 시각 기준 창 앞 여유 — 수신은 거래소 처리 뒤라 거래소 시각보다 크게 앞설 수 없다(시계 어긋남 ms 단위).
 * 이보다 앞선 레코드는 디코딩하지 않고 건너뛴다.
 */
const RECV_SLACK_NS = 5_000n * NS_PER_MS;
/**
 * 수신 시각 기준 창 뒤 여유 — 수신 지연(엣지 끊김 뒤 재전송 등)은 수 초를 넘을 수 있어 앞 여유보다 넉넉히 둔다.
 * 이보다 늦게 받은 레코드는 디코딩하지 않고 건너뛴다(멈추지는 않는다 — WR-04).
 */
const RECV_LATE_SLACK_NS = 60_000n * NS_PER_MS;

const ISIN_RE = /^[A-Z0-9]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 자료를 못 준 응답 — `text` 는 완성 문구(「자료 없음: <사유>」 · 「변환 중 · …」) 그대로. */
const none = (text: string): MarketTicksResult => ({
  text,
  records: 0,
  truncated: false,
  source: "none",
});

// ── 한 줄 포맷 ───────────────────────────────────────────────────────

const val = (v: FieldValue | undefined): string => (v === null || v === undefined ? "?" : String(v));

/** time12 원문 `HHMMSSuuuuuu` → `HH:MM:SS.uuuuuu`. 12자리 숫자가 아니면 원문 그대로(지어내지 않는다). */
function time12(v: FieldValue | undefined): string {
  const s = typeof v === "string" ? v : "";
  if (!/^\d{12}$/.test(s)) return s === "" ? "?" : s;
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}.${s.slice(6, 12)}`;
}

/**
 * A3 한 건 → `HH:MM:SS.uuuuuu A3 체결가 수량 b<bs> s<세션> 매도1/매수1 c누적 #msg_seq`.
 * bs 공백(`parseStr` 가 오른쪽 공백을 지워 `""`)은 `b_` — 사라지지 않게 한다(단일가 판정 근거 · Pitfall 5).
 * 숫자에 천 단위 쉼표를 넣지 않는다(토큰 · 골든 일치).
 */
export function formatA3Line(row: Record<string, FieldValue>): string {
  const bs = typeof row.final_bs_code === "string" ? row.final_bs_code : "";
  return [
    time12(row.trade_time),
    "A3",
    val(row.trade_price),
    val(row.trade_qty),
    `b${bs === "" ? "_" : bs}`,
    `s${val(row.session_id)}`,
    `${val(row.ask1_px)}/${val(row.bid1_px)}`,
    `c${val(row.cum_volume)}`,
    `#${val(row.msg_seq)}`,
  ].join(" ");
}

/** B6 한 건 → `HH:MM:SS.uuuuuu B6 s<세션> A 매도1~5(가격x잔량) | B 매수1~5 T총매도/총매수 E예상가x예상량 #msg_seq`. */
export function formatB6Line(row: Record<string, FieldValue>): string {
  const ask: string[] = [];
  const bid: string[] = [];
  for (let i = 1; i <= 5; i++) {
    ask.push(`${val(row[`ask${i}_px`])}x${val(row[`ask${i}_qty`])}`);
    bid.push(`${val(row[`bid${i}_px`])}x${val(row[`bid${i}_qty`])}`);
  }
  return [
    time12(row.proc_time),
    "B6",
    `s${val(row.session_id)}`,
    "A",
    ...ask,
    "|",
    "B",
    ...bid,
    `T${val(row.total_ask_qty)}/${val(row.total_bid_qty)}`,
    `E${val(row.est_price)}x${val(row.est_qty)}`,
    `#${val(row.msg_seq)}`,
  ].join(" ");
}

/**
 * 틱 전문 뷰어 경로 — webapp `tickUrlOf` 와 같은 직렬화 순서(isin · d · ex · t) · ex 기본 KRX 생략.
 * 값은 모두 검증된 문자 집합(대문자 · 숫자 · `:` · `.`)이라 인코딩하지 않는다(모델 · 사람이 읽기 쉬운 그대로).
 */
export function tickViewerPath(p: { isin: string; d: string; ex: "KRX" | "NXT"; t: string }): string {
  const q = [`isin=${p.isin}`, `d=${p.d}`];
  if (p.ex === "NXT") q.push("ex=NXT");
  q.push(`t=${p.t}`);
  return `/analytics/ticks?${q.join("&")}`;
}

// ── 창 ───────────────────────────────────────────────────────────────

const TAG_A = 0x41;
const TAG_B = 0x42;
const TAG_3 = 0x33;
const TAG_6 = 0x36;

/**
 * 창 수집기 — 파일 순서대로 레코드를 받아 거래소 시각(`trade_time_ns` · `proc_time_ns`)이 [from, to] 안인 A3/B6 만 줄로 남긴다.
 * 격자(스트리밍) · tickgw(프레임별) 두 경로가 같은 수집기를 써서 같은 줄을 만든다.
 *
 * 수신 시각으로 **일찍 멈추지 않는다**(39 REVIEW WR-04) — 파일이 recv_ns 비감소라는 보장이 없다(격자는 여러 sources 를
 * 합치고 · 당일 바이트는 프레임을 이어붙인다 · shared `recvOrderOf` 도 비단조를 명시적으로 다룬다). 수신 순서가 한 번
 * 뒤집히면 그 뒤 창 안 레코드를 통째로 버리게 되므로, 창 밖 레코드는 건너뛰기만 하고 끝까지 본다. 파일은 종목 하나의
 * 하루치라 끝까지 훑어도 싸다(창 밖은 디코딩하지 않는다). 멈추는 것은 레코드 상한(M)뿐이다.
 */
class TickWindow {
  readonly lines: string[] = [];
  firstRecvNs: bigint | null = null;
  firstExNs: bigint | null = null;
  lastExNs: bigint | null = null;
  /** 레코드 상한(M)에 닿아 멈췄다. */
  cappedByCount = false;

  constructor(
    private readonly isin: string,
    private readonly label: "KRX" | "NXT",
    private readonly fromNs: bigint,
    private readonly toNs: bigint,
  ) {}

  /** 레코드 1건. false = 레코드 상한(M)에 닿았다 — 호출자는 읽기를 멈춘다. 창 밖은 늘 true(건너뜀). */
  push(recvNs: bigint, payload: Uint8Array): boolean {
    if (recvNs > this.toNs + RECV_LATE_SLACK_NS) return true;
    if (recvNs < this.fromNs - RECV_SLACK_NS) return true;
    const t0 = payload[0];
    const t1 = payload[1];
    const isA3 = t0 === TAG_A && t1 === TAG_3;
    const isB6 = t0 === TAG_B && t1 === TAG_6;
    if (!isA3 && !isB6) return true;
    const { table, row } = decodeAny(payload, recvNs, this.label);
    if (table !== "a3" && table !== "b6") return true;
    if (row.isin !== this.isin) return true;
    const exRaw = table === "a3" ? row.trade_time_ns : row.proc_time_ns;
    const exNs = typeof exRaw === "bigint" ? exRaw : recvNs;
    if (exNs < this.fromNs || exNs > this.toNs) return true;
    if (this.lines.length >= MARKET_MAX_RECORDS) {
      this.cappedByCount = true;
      return false;
    }
    this.lines.push(table === "a3" ? formatA3Line(row) : formatB6Line(row));
    if (this.firstRecvNs === null) this.firstRecvNs = recvNs;
    if (this.firstExNs === null || exNs < this.firstExNs) this.firstExNs = exNs;
    if (this.lastExNs === null || exNs > this.lastExNs) this.lastExNs = exNs;
    return true;
  }
}

/** 풀린 레코드 바이트 조각을 꼬리 잇기로 먹인다. 반환 = 남은 꼬리(잘린 레코드) · 멈춤 여부. */
function feed(win: TickWindow, tail: Uint8Array, chunk: Uint8Array): { tail: Uint8Array; stop: boolean } {
  const buf = tail.length > 0 ? concatBytes([tail, chunk]) : chunk;
  let end = 0;
  for (const r of iterRecords(buf)) {
    if (!win.push(r.recvNs, buf.subarray(r.off, r.off + r.len))) return { tail: new Uint8Array(0), stop: true };
    end = r.off + r.len;
  }
  return { tail: buf.slice(end), stop: false };
}

/**
 * 이어붙인 zstd 압축 바이트 → 창. 프레임마다 스트리밍으로 풀며(Node zstd 는 첫 프레임만 푼다 · 프레임 하나를 통째로
 * 풀어 들지 않는다) 레코드 꼬리를 프레임 경계 너머로 잇는다. 레코드 상한에 닿으면 스트림을 닫고 멈춘다.
 */
async function windowOfCompressed(win: TickWindow, compressed: Uint8Array): Promise<void> {
  let tail: Uint8Array = new Uint8Array(0);
  for (const frame of splitZstdFrames(compressed)) {
    const dec = zlib.createZstdDecompress();
    dec.end(frame);
    try {
      for await (const chunk of dec as AsyncIterable<Buffer>) {
        const r = feed(win, tail, new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
        if (r.stop) return;
        tail = r.tail;
      }
    } finally {
      dec.destroy();
    }
  }
}

function zstdSupported(): boolean {
  return typeof zlib.createZstdDecompress === "function";
}

/** 당일 수집 구멍(`X-Tick-Complete: false`) 표시 — 모델이 「그 시각엔 체결이 없었다」 는 거짓 근거를 만들지 않게(WR-05). */
export const LIVE_INCOMPLETE_NOTE = "자료 일부 누락: 당일 수집에 구멍이 있음 — 줄이 없는 구간을 체결 없음으로 보지 마세요";
const LIVE_INCOMPLETE_EMPTY_TEXT = "자료 없음: 그 시각 시세 기록 없음(당일 수집에 구멍이 있어 체결 없음으로 볼 수 없음)";

/** 창 → 응답 텍스트(범례 · 줄 · 잘림 문구 · 누락 표시 · 틱 보기 링크). 창이 비면 null. */
function renderWindow(
  win: TickWindow,
  input: MarketTicksInput,
  d8: string,
  windowCut: boolean,
  incomplete = false,
): { text: string; records: number; truncated: boolean } | null {
  if (win.lines.length === 0 || win.firstRecvNs === null) return null;
  const truncated = windowCut || win.cappedByCount;
  const out = [MARKET_LEGEND, ...win.lines];
  if (truncated) {
    const first = fmtTickTime(win.firstExNs!);
    const last = fmtTickTime(win.lastExNs!);
    out.push(
      `잘렸음: 요청 ${input.from}~${input.to} 중 ${first}~${last} 까지 ${win.lines.length}건 — 범위를 좁혀 다시 부르세요`,
    );
  }
  if (incomplete) out.push(LIVE_INCOMPLETE_NOTE);
  out.push(`[틱 보기](${tickViewerPath({ isin: input.isin, d: d8, ex: input.exchange, t: fmtTickTime(win.firstRecvNs) })})`);
  return { text: out.join("\n"), records: win.lines.length, truncated };
}

// ── 경로 ─────────────────────────────────────────────────────────────

type Prepared = { d8: string; fromNs: bigint; toNs: bigint; windowCut: boolean };

function prepare(input: MarketTicksInput): Prepared | MarketTicksResult {
  if (!ISIN_RE.test(input.isin)) return none("자료 없음: ISIN 형식이 잘못됨(대문자 · 숫자 12자)");
  if (input.exchange !== "KRX" && input.exchange !== "NXT") return none("자료 없음: 거래소는 KRX 또는 NXT");
  if (!DATE_RE.test(input.date)) return none("자료 없음: 날짜 형식이 잘못됨(YYYY-MM-DD)");
  const fromNs = parseTickTime(input.from, input.date);
  const toNs0 = parseTickTime(input.to, input.date);
  if (fromNs === null || toNs0 === null) return none("자료 없음: 시각 형식이 잘못됨(HH:MM:SS 또는 HH:MM:SS.mmm)");
  if (fromNs > toNs0) return none("자료 없음: 시각 범위가 잘못됨(from ≤ to)");
  const maxNs = BigInt(MARKET_WINDOW_MAX_MS) * NS_PER_MS;
  const windowCut = toNs0 - fromNs > maxNs;
  return { d8: input.date.replaceAll("-", ""), fromNs, toNs: windowCut ? fromNs + maxNs : toNs0, windowCut };
}

/** 변환 대기 문구 — eta 가 있으면 올림 분, 없으면 「잠시」. */
function convertingText(etaS: number | undefined): string {
  return typeof etaS === "number" && Number.isFinite(etaS) && etaS > 0
    ? `변환 중 · 약 ${Math.ceil(etaS / 60)}분 뒤 다시 물어 주세요`
    : "변환 중 · 잠시 뒤 다시 물어 주세요";
}

/**
 * 격자 없음 → 기존 요청 변환(D-08 ② · 37 D-03)을 그대로 건다 — 하루 상한(`TICK_REQUEST_DAILY_CAP`) · (날짜, 거래소)당 Job 1회
 * 판정은 RPC 안이라 웹 틱뷰어와 공유된다. **기다리지 않는다**(진단 마감 150초 · 변환은 수 분). 90일 밖도 같은 경로(37 D-04).
 * 반환 `"grid_ready"` = 그사이 격자가 생겼다(경합) — 호출자가 한 번 다시 연다.
 */
async function requestConvert(
  deps: MarketDeps,
  q: { d: string; isin: string; ex: "KRX" | "NXT" },
  openEtaS: number,
): Promise<MarketTicksResult | "grid_ready"> {
  let res: Awaited<ReturnType<typeof requestTickConvert>>;
  try {
    res = await requestTickConvert(deps.supabase, deps.userId, q, { trigger: deps.trigger, dailyCap: deps.dailyCap });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    // 원인은 로그에만 — 사용자(모델) 문구에 원문을 싣지 않는다.
    logger.warn(
      { diagnosis: { tool: "market", d: q.d, ex: q.ex, status: e.status, code: e.code }, cause: e.cause },
      "[chat] diagnosis market: 요청 변환 실패",
    );
    if (e.status === 429) return none("자료 없음: 오늘 변환 한도 소진");
    if (e.status === 503) return none("자료 없음: 변환 경로 꺼짐");
    if (e.status === 502) return none("자료 없음: 변환 요청 실패");
    if (e.status === 403) return none("자료 없음: DMA 계좌 매핑 없음");
    throw e;
  }
  if (res.grid_ready) return "grid_ready";
  if (res.not_uploaded) return none("자료 없음: 원본 업로드 전(매일 22:00 업로드 · 23:30 뒤 변환)");
  // 방금 깨웠거나(triggered) 이미 진행 중(request) — 어느 쪽이든 「약 N분 뒤」.
  return none(convertingText(res.eta_s ?? openEtaS));
}

async function pastPath(input: MarketTicksInput, deps: MarketDeps, p: Prepared): Promise<MarketTicksResult> {
  const q = { d: p.d8, isin: input.isin, ex: input.exchange };
  let opened = await openTickGridForServer(deps.supabase, deps.userId, q);
  if (!opened.access) return none("자료 없음: DMA 계좌 매핑 없음");
  if (!opened.grid) {
    const c = await requestConvert(deps, q, opened.etaS);
    if (c !== "grid_ready") return c;
    opened = await openTickGridForServer(deps.supabase, deps.userId, q); // 경합 — 한 번만 다시 연다
    if (!opened.access) return none("자료 없음: DMA 계좌 매핑 없음");
    if (!opened.grid) return none(convertingText(opened.etaS));
  }
  const { objectPath, fmt } = opened.grid;
  if (fmt !== TICK_FMT) return none(`자료 없음: 격자 형식 미지원(${fmt})`);

  const dl = await deps.supabase.storage.from(TICK_GRID_BUCKET).download(objectPath);
  if (dl.error || !dl.data) {
    logger.warn({ diagnosis: { tool: "market", d: p.d8, ex: input.exchange, storage: dl.error?.message } }, "[chat] diagnosis market: 격자 내려받기 실패");
    return none("자료 없음: 격자 내려받기 실패");
  }
  const compressed = new Uint8Array(await dl.data.arrayBuffer());
  const win = new TickWindow(input.isin, input.exchange, p.fromNs, p.toNs);
  await windowOfCompressed(win, compressed);
  const r = renderWindow(win, input, p.d8, p.windowCut);
  if (!r) return none("자료 없음: 그 시각 시세 기록 없음(그 종목 미기록일 수 있음)");
  return { ...r, source: "grid" };
}

/** tickgw 사유 → 사용자(모델) 문구. 원문 · 상태 코드는 로그에만. */
const LIVE_REASON_TEXT: Record<LiveUnavailableReason, string> = {
  UNREACHABLE: "자료 없음: 당일 시세 경로 응답 없음(UNREACHABLE)",
  AUTH: "자료 없음: 당일 시세 경로 인증 실패",
  QUEUED: "자료 없음: 당일 시세 대기열(잠시 뒤 다시)",
  BLOCKED: "자료 없음: 당일 시세 차단",
  CONFLICT: "자료 없음: 당일 시세 응답이 계속 바뀜(잠시 뒤 다시)",
  TIMEOUT: "자료 없음: 당일 시세 응답 지연(잠시 뒤 다시)",
  BAD_RESPONSE: "자료 없음: 당일 시세 응답 형식 오류",
};

const KST_OFFSET_MS = 9 * 3600_000;

/** 오늘(KST)이 장 전(08:00 전) · 주말 · KRX 휴장이면 true — tickgw 를 부르지 않는다. */
function closedNow(now: Date, todayIso: string): boolean {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const dow = kst.getUTCDay();
  if (dow === 0 || dow === 6 || isKrxHoliday(todayIso)) return true;
  return kst.getUTCHours() < 8;
}

async function todayPath(
  input: MarketTicksInput,
  deps: MarketDeps,
  p: Prepared,
  memo: MarketMemo,
  now: () => Date,
  todayIso: string,
): Promise<MarketTicksResult> {
  if (!deps.tickgw) return none("자료 없음: 당일 시세 경로 꺼짐(TICKS_LIVE_UNAVAILABLE)");
  if (closedNow(now(), todayIso)) return none("자료 없음: 장 시작 전/휴장");

  const key = `${input.isin}|${input.exchange}`;
  const clock = () => now().getTime();
  const tickgw = deps.tickgw;
  // 앞 받기(병렬 호출이면 아직 진행 중)를 기다려 그 offsetEnd 부터 증분만 받는다.
  const prev = memo.get(key);
  const fetched = (async () => {
    const base = prev ? await prev : undefined;
    return fetchLiveBytes(
      tickgw,
      { isin: input.isin, ex: input.exchange },
      {
        deadlineAt: clock() + LIVE_WAIT_MAX_MS,
        memo: base,
        sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
        clock,
      },
    );
  })();
  // 다음 호출은 이 받기가 끝난 뒤의 엔트리로 잇는다 — 실패면 앞 엔트리를 그대로 넘긴다(메모 사슬이 reject 하지 않게).
  memo.set(
    key,
    fetched.then(
      async (r) => (r.kind === "ok" ? r.entry : prev ? await prev : undefined),
      () => undefined,
    ),
  );
  const got = await fetched;
  if (got.kind === "unavailable") {
    logger.warn({ diagnosis: { tool: "market", ex: input.exchange, reason: got.reason } }, "[chat] diagnosis market: 당일 시세 못 받음");
    return none(LIVE_REASON_TEXT[got.reason]);
  }

  // 지난 날짜 경로와 같은 비동기 스트리밍 해제(IN-02) — 동기 해제는 하루 누적 프레임을 푸는 동안 이벤트 루프를 붙잡아
  // 같은 인스턴스의 다른 SSE · API 응답을 멈춘다.
  const win = new TickWindow(input.isin, input.exchange, p.fromNs, p.toNs);
  await windowOfCompressed(win, got.entry.bytes);
  if (got.incomplete) {
    logger.info({ diagnosis: { tool: "market", ex: input.exchange } }, "[chat] diagnosis market: 당일 시세 불완전(X-Tick-Complete false)");
  }
  const out = renderWindow(win, input, p.d8, p.windowCut, got.incomplete);
  if (!out) {
    return none(got.incomplete ? LIVE_INCOMPLETE_EMPTY_TEXT : "자료 없음: 그 시각 시세 기록 없음(그 종목 미기록일 수 있음)");
  }
  return { ...out, source: "live" };
}

/**
 * 시세 도구 본체 — 입력 하나 → 텍스트 하나. throw 하지 않는다.
 * `memo` 는 한 진단 실행 단위(같은 (isin, ex) 를 여러 번 부를 때 tickgw 증분만 받는다).
 */
export async function getMarketTicksText(
  input: MarketTicksInput,
  deps: MarketDeps,
  memo: MarketMemo,
): Promise<MarketTicksResult> {
  try {
    const p = prepare(input);
    if ("source" in p) return p;
    if (!zstdSupported()) {
      logger.error({ node: process.versions.node }, "[chat] diagnosis market: 서버 Node 에 zstd 가 없다(≥ 22.15 필요)");
      return none("자료 없음: 서버 zstd 미지원");
    }
    const now = deps.now ?? (() => new Date());
    const today = kstDateIso(now());
    if (input.date < today) return await pastPath(input, deps, p);
    if (input.date === today) return await todayPath(input, deps, p, memo, now, today);
    return none("자료 없음: 미래 날짜");
  } catch (e) {
    logger.error(
      { diagnosis: { tool: "market", isin: input.isin, ex: input.exchange, date: input.date }, err: e instanceof Error ? e.message : String(e) },
      "[chat] diagnosis market: 시세 조회 실패",
    );
    return none("자료 없음: 시세 조회 실패");
  }
}
