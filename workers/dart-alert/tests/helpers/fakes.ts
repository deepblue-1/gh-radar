import { PREV_DAY_MARK_PREFIX, runCollector, type CollectorDeps, type CollectorExit, type CollectorLog } from "../../src/collector";
import type { DartAlertMode } from "../../src/config";
import { DartApiError, type DartRow } from "../../src/dart/client";
import { LeaseLostError, type LeaseResult, type OutageAction } from "../../src/db";
import type { ClaimedRow, InsertedRow, InsertItem, MarkInput } from "../../src/lap";
import type { SendResult } from "../../src/telegram/client";
import { buildWatches, DEFAULT_B001_KINDS, type DartKeyId, type JudgeOptions, type Watch, type WatchId } from "../../src/watches";

/**
 * Phase 43-05 — 수집기 가짜 의존성 묶음(43-06 이 재사용 · 확장한다).
 *
 * - 가짜 시계: `sleep` · `advance` 가 시계를 앞당긴다(실제로 기다리지 않음). sleep 횟수 상한을 넘으면 던져서
 *   잘못 만든 루프가 끝없이 돌지 않게 한다(43-03 에서 RED 골격 루프가 멈추지 않은 사고 대비).
 *   `abortAt` 에 닿으면 AbortSignal 을 abort(SIGTERM 흉내).
 * - 가짜 DB: 43-02 `DartAlertDb`(+ usage · strikes) 모양을 메모리로 — 마이그레이션 RPC 계약 그대로:
 *   임대(비었거나 만료됐거나 내 것이면 잡음 · fresh = 직전 보유자가 나와 다름 · fresh 때 오늘 sending → pending ·
 *   지난 날 pending/sending → expired · 내 임대면 p_last_ok 병합) · 넣기 ON CONFLICT 무시(새 행만 반환) ·
 *   차례(오늘 · pending 이고 기한 지남 + 내 sending 중 송신 기한 90초 지난 것은 stale 로 다시 · 우선순위 → 처음 본 순) ·
 *   기록(내 sending 만) · 장애 open/notice/close. 넣기 · 차례 · 기록 · 장애는 가짜 시계로 `lease_until` 이 지났거나
 *   보유자가 다르면 43-02 `LeaseLostError` 를 던진다(RPC 의 55000 과 같음).
 *   ※ workers/dart-alert/tsconfig.json 의 include 가 `src` 뿐이라 `pnpm run typecheck` 는 이 파일을 보지 않는다 —
 *     타입 묶음은 tsc 를 tests 까지 넓혀 돌릴 때 확인된다(43-05 SUMMARY 참고).
 * - 가짜 DART: 감시 대상 · 시각별 응답(피드 = 「이 시각부터 목록에 보이는 행」) · 상태 코드 · 지연 · 호출 기록.
 *   피드 행은 기본적으로 「그 호출 시각의 KST 날짜를 조회하는 호출」 에만 보이고, `day`(YYYYMMDD)를 주면 그 날짜 조회에만
 *   보인다(아침 전날 확인 · 261113-rn7).
 * - 가짜 텔레그램: 결과 대본 · 건별 지연 · 보낸 글 기록 · switchChat 기록.
 * - 시간선(timeline): DART 호출 · 텔레그램 송신을 일어난 순서(seq)로 남긴다 — 「같은 바퀴 안 송신」 단언용.
 */

/** KST 벽시계 → epoch ms. 2026-11-16 = 월요일 · 2026-11-14 = 토요일 */
export const kst = (ymd: string, hms: string): number => Date.parse(`${ymd}T${hms}+09:00`);
export const MON = "2026-11-16";
export const SAT = "2026-11-14";

const KST_OFFSET_MS = 9 * 3_600_000;

/** epoch ms → KST YYYY-MM-DD */
export function kstIsoDate(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── 시간선 ────────────────────────────────────────────────────────────
export interface TimelineEvent {
  seq: number;
  at: number;
  kind: "dart" | "probe" | "send";
  detail: string;
}

export interface Timeline {
  events: TimelineEvent[];
  push(at: number, kind: TimelineEvent["kind"], detail: string): number;
}

export function timeline(): Timeline {
  const events: TimelineEvent[] = [];
  return {
    events,
    push(at, kind, detail) {
      const seq = events.length + 1;
      events.push({ seq, at, kind, detail });
      return seq;
    },
  };
}

// ── 가짜 시계 ─────────────────────────────────────────────────────────
export interface FakeClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** 일하는 데 걸린 시간 흉내(DART · 텔레그램 지연) */
  advance(ms: number): void;
  abort(): void;
  readonly signal: AbortSignal;
  readonly sleeps: number;
}

export interface FakeClockOptions {
  /** 이 시각에 닿으면 abort(SIGTERM 흉내) */
  abortAt?: number;
  /** sleep 호출 상한 — 넘으면 던진다(끝없는 루프 방지). 13시간 실행은 약 47,000번 */
  maxSleeps?: number;
}

export function fakeClock(start: number, o: FakeClockOptions = {}): FakeClock {
  let t = start;
  let sleeps = 0;
  const max = o.maxSleeps ?? 300_000;
  const ac = new AbortController();
  const tick = (ms: number) => {
    t += Math.max(0, ms);
    if (o.abortAt !== undefined && t >= o.abortAt && !ac.signal.aborted) ac.abort();
  };
  return {
    now: () => t,
    async sleep(ms: number) {
      sleeps += 1;
      if (sleeps > max) throw new Error(`fake clock: sleep cap ${max} exceeded (runaway loop?)`);
      tick(ms);
    },
    advance: tick,
    abort: () => ac.abort(),
    signal: ac.signal,
    get sleeps() {
      return sleeps;
    },
  };
}

// ── 로그 기록기 ───────────────────────────────────────────────────────
export interface LogLine {
  level: "info" | "warn" | "error";
  obj: Record<string, unknown>;
  msg: string;
}

export function logRecorder() {
  const lines: LogLine[] = [];
  const mk =
    (level: LogLine["level"]) =>
    (obj: Record<string, unknown>, msg?: string): void => {
      lines.push({ level, obj, msg: msg ?? "" });
    };
  const log: CollectorLog = { info: mk("info"), warn: mk("warn"), error: mk("error") };
  return {
    log,
    lines,
    /** msg 가 같은 줄 수(level 을 주면 그 level 만) */
    count: (msg: string, level?: LogLine["level"]) =>
      lines.filter((l) => l.msg === msg && (level === undefined || l.level === level)).length,
    find: (msg: string) => lines.find((l) => l.msg === msg),
    text: () => JSON.stringify(lines),
  };
}

// ── DART 행 · 피드 ────────────────────────────────────────────────────
/** YYYY-MM-DD → YYYYMMDD */
const ymdOf = (isoDay: string) => isoDay.replace(/-/g, "");

/** 공개매수 신고서 행 — 접수번호 `{날짜}80{n 4자리}` */
export function tenderRow(n: number, day = MON, over: Partial<DartRow> = {}): DartRow {
  const ymd = ymdOf(day);
  return {
    corp_code: `0010${String(n).padStart(4, "0")}`,
    corp_name: `대상회사${n}`,
    stock_code: String(100_000 + n).slice(-6),
    corp_cls: "Y",
    report_nm: "공개매수신고서",
    rcept_no: `${ymd}80${String(n).padStart(4, "0")}`,
    flr_nm: `인수회사${n}`,
    rcept_dt: ymd,
    rm: "",
    ...over,
  };
}

/** 유상증자 주요사항보고서 행 — 접수번호 `{날짜}90{n 4자리}` · 제출인 = 회사 자신 */
export function rightsRow(n: number, day = MON, over: Partial<DartRow> = {}): DartRow {
  const ymd = ymdOf(day);
  return {
    corp_code: `0020${String(n).padStart(4, "0")}`,
    corp_name: `증자회사${n}`,
    stock_code: String(200_000 + n).slice(-6),
    corp_cls: "K",
    report_nm: "주요사항보고서(유상증자결정)",
    rcept_no: `${ymd}90${String(n).padStart(4, "0")}`,
    flr_nm: `증자회사${n}`,
    rcept_dt: ymd,
    rm: "코",
    ...over,
  };
}

/** 거래소 수시공시(I001) 행 — 접수번호 `{날짜}70{n 4자리}` · 제출인 = 회사 자신 */
export function exchangeRow(n: number, day = MON, over: Partial<DartRow> = {}): DartRow {
  const ymd = ymdOf(day);
  return {
    corp_code: `0030${String(n).padStart(4, "0")}`,
    corp_name: `공시회사${n}`,
    stock_code: String(300_000 + n).slice(-6),
    corp_cls: "Y",
    report_nm: "단일판매ㆍ공급계약체결",
    rcept_no: `${ymd}70${String(n).padStart(4, "0")}`,
    flr_nm: `공시회사${n}`,
    rcept_dt: ymd,
    rm: "유",
    ...over,
  };
}

/** 임원ㆍ주요주주 거래계획(D005) 행 — 접수번호 `{날짜}60{n 4자리}` · 제출인 = 임원(회사와 다름) */
export function tradePlanRow(n: number, day = MON, over: Partial<DartRow> = {}): DartRow {
  const ymd = ymdOf(day);
  return {
    corp_code: `0040${String(n).padStart(4, "0")}`,
    corp_name: `발행회사${n}`,
    stock_code: String(400_000 + n).slice(-6),
    corp_cls: "K",
    report_nm: "임원ㆍ주요주주특정증권등거래계획보고서",
    rcept_no: `${ymd}60${String(n).padStart(4, "0")}`,
    flr_nm: `임원${n}`,
    rcept_dt: ymd,
    rm: "코",
    ...over,
  };
}

/** 거래소 시장조치(I003) 행 — 접수번호 `{날짜}50{n 4자리}` · 코스닥 · 제출인 = 거래소(회사와 다름) */
export function marketActionRow(n: number, day = MON, over: Partial<DartRow> = {}): DartRow {
  const ymd = ymdOf(day);
  return {
    corp_code: `0050${String(n).padStart(4, "0")}`,
    corp_name: `조치회사${n}`,
    stock_code: String(500_000 + n).slice(-6),
    corp_cls: "K",
    report_nm: "주권매매거래정지              (주식의 병합, 분할 등 전자등록 변경, 말소)",
    rcept_no: `${ymd}50${String(n).padStart(4, "0")}`,
    flr_nm: "코스닥시장본부",
    rcept_dt: ymd,
    rm: "코",
    ...over,
  };
}

/** 최대주주 소유주식 변동(I004) 행 — 접수번호 `{날짜}40{n 4자리}` · 유가 · 제출인 = 회사 자신 */
export function holderChangeRow(n: number, day = MON, over: Partial<DartRow> = {}): DartRow {
  const ymd = ymdOf(day);
  return {
    corp_code: `0060${String(n).padStart(4, "0")}`,
    corp_name: `지분회사${n}`,
    stock_code: String(600_000 + n).slice(-6),
    corp_cls: "Y",
    report_nm: "최대주주등소유주식변동신고서              ",
    rcept_no: `${ymd}40${String(n).padStart(4, "0")}`,
    flr_nm: `지분회사${n}`,
    rcept_dt: ymd,
    rm: "유",
    ...over,
  };
}

/** 이 시각(from)부터 그 감시 대상 목록에 보이는 행 */
export interface FeedItem {
  watch: WatchId;
  from: number;
  row: DartRow;
  /** 이 날짜(YYYYMMDD) 조회에만 보인다 — 없으면 호출 시각의 KST 날짜 조회에만(기존 시험 그대로) */
  day?: string;
}

// ── 가짜 DART ────────────────────────────────────────────────────────
/** 한 번의 응답 — status `000`(기본 · rows 가 있으면) · `013` · 오류 코드 · `network`(응답 없음) */
export interface DartReply {
  rows?: DartRow[];
  status?: string;
  /** 이 호출이 걸리는 시간(가짜 시계를 앞당김) */
  delayMs?: number;
  /** 이 호출이 쓴 호출 수(쪽 넘김 흉내) — 기본 1 */
  calls?: number;
  /** probe 응답의 total_count */
  total?: number;
  /** 이 오류를 그대로 던진다(HTTP 차단 신호처럼 본문 status 로 못 만드는 실패 — 리뷰 WR-03) */
  error?: DartApiError;
}

export interface DartCtx {
  watch: Watch;
  day: string;
  now: number;
  /** 전체 list 호출 순번(1부터) */
  n: number;
  /** 그 감시 대상의 호출 순번(1부터) */
  watchN: number;
  /** 전 쪽 조회(아침 전날 확인)인가 */
  fullRead: boolean;
}

export interface DartCall {
  seq: number;
  at: number;
  endAt: number;
  watch: WatchId;
  day: string;
  status: string;
  rows: number;
  fullRead: boolean;
}

export interface FakeDartOptions {
  feed?: FeedItem[];
  /** 돌려준 필드만 기본(피드)을 덮는다 — undefined 면 기본 그대로 */
  reply?: (c: DartCtx) => DartReply | undefined;
  probe?: (c: { day: string; now: number; n: number; key: DartKeyId }) => DartReply | undefined;
  /** 모든 호출 공통 지연 */
  delayMs?: number;
  /** 호출 상한 — 넘으면 던진다 */
  maxCalls?: number;
}

function toResult(status: string, rows: DartRow[], calls: number): { rows: DartRow[]; calls: number } {
  if (status === "000") return { rows, calls };
  if (status === "013") return { rows: [], calls };
  if (status === "network") {
    const e = new DartApiError(0, null, "transient", "ECONNRESET");
    e.calls = calls;
    throw e;
  }
  const e = new DartApiError(200, status, undefined, `status ${status}`);
  e.calls = calls;
  throw e;
}

export function fakeDart(clock: FakeClock, o: FakeDartOptions = {}, tl: Timeline = timeline()) {
  const feed = o.feed ?? [];
  const max = o.maxCalls ?? 50_000;
  const listCalls: DartCall[] = [];
  const probeCalls: { seq: number; at: number; day: string; status: string; key: DartKeyId }[] = [];
  const perWatch = new Map<WatchId, number>();

  const api: CollectorDeps["dart"] = {
    async list(watch, day, opts) {
      const n = listCalls.length + 1;
      if (n > max) throw new Error(`fake dart: list call cap ${max} exceeded`);
      const watchN = (perWatch.get(watch.id) ?? 0) + 1;
      perWatch.set(watch.id, watchN);
      const at = clock.now();
      const fullRead = opts?.fullRead === true;
      const rep = o.reply?.({ watch, day, now: at, n, watchN, fullRead }) ?? {};
      const callDay = kstIsoDate(at).replace(/-/g, "");
      const rows = rep.rows ?? feed.filter((f) => f.watch === watch.id && f.from <= at && (f.day ?? callDay) === day).map((f) => f.row);
      const status = rep.status ?? (rows.length > 0 ? "000" : "013");
      clock.advance(rep.delayMs ?? o.delayMs ?? 0);
      const seq = tl.push(at, "dart", `${watch.id}:${rep.error ? `error ${rep.error.code}` : status}`);
      listCalls.push({ seq, at, endAt: clock.now(), watch: watch.id, day, status: rep.error?.code ?? status, rows: rows.length, fullRead });
      if (rep.error) {
        rep.error.calls = rep.calls ?? 1;
        throw rep.error;
      }
      return toResult(status, rows, rep.calls ?? 1);
    },
    async probe(day, key) {
      const n = probeCalls.length + 1;
      if (n > max) throw new Error(`fake dart: probe call cap ${max} exceeded`);
      const at = clock.now();
      const rep = o.probe?.({ day, now: at, n, key }) ?? {};
      clock.advance(rep.delayMs ?? o.delayMs ?? 0);
      const status = rep.status ?? "000";
      const seq = tl.push(at, "probe", status);
      probeCalls.push({ seq, at, day, status, key });
      toResult(status, [], rep.calls ?? 1);
      return { total: rep.total ?? 0, calls: rep.calls ?? 1 };
    },
  };

  return {
    api,
    listCalls,
    probeCalls,
    callsOf: (w: WatchId) => listCalls.filter((c) => c.watch === w),
  };
}

// ── 가짜 텔레그램 ────────────────────────────────────────────────────
export interface SentMessage {
  seq: number;
  at: number;
  endAt: number;
  text: string;
  chatId: string;
  plain: boolean;
  result: SendResult;
}

export interface FakeTelegramOptions {
  chatId?: string;
  /** 결과 대본 — undefined 면 ok(message_id 1000 + n) */
  reply?: (c: { text: string; n: number; now: number; chatId: string; plain: boolean }) => SendResult | undefined;
  /** 건별 지연(가짜 시계를 앞당김) */
  delayMs?: number | ((n: number) => number);
  maxSends?: number;
}

export function fakeTelegram(clock: FakeClock, o: FakeTelegramOptions = {}, tl: Timeline = timeline()) {
  let chatId = o.chatId ?? "-100111";
  const max = o.maxSends ?? 10_000;
  /** 보낸 시도 전부(실패 포함) */
  const sent: SentMessage[] = [];
  const switches: string[] = [];

  const api: CollectorDeps["telegram"] = {
    async send(text, opts) {
      const n = sent.length + 1;
      if (n > max) throw new Error(`fake telegram: send cap ${max} exceeded`);
      const at = clock.now();
      const plain = opts?.plain === true;
      clock.advance(typeof o.delayMs === "function" ? o.delayMs(n) : (o.delayMs ?? 0));
      const result: SendResult = o.reply?.({ text, n, now: at, chatId, plain }) ?? { kind: "ok", messageId: 1000 + n };
      const seq = tl.push(at, "send", text.split("\n")[0] ?? "");
      sent.push({ seq, at, endAt: clock.now(), text, chatId, plain, result });
      return result;
    },
    switchChat(id) {
      switches.push(id);
      chatId = id;
    },
  };

  /** 공시 알림 글(📢)만 — 장애 글(⚠ · ✅) · 시험 글 제외 */
  const alerts = () => sent.filter((s) => s.text.startsWith("📢"));
  /** 장애 짝 글만 — 「⚠ 공시 알림이 멈췄습니다」 · 「✅ 공시 알림 다시 동작」 */
  const notices = () => sent.filter((s) => s.text.startsWith("⚠") || s.text.startsWith("✅"));
  return { api, sent, switches, texts: () => sent.map((s) => s.text), alerts, notices };
}

// ── 가짜 DB ──────────────────────────────────────────────────────────
export type FakeRowStatus = "pending" | "sending" | "sent" | "seeded" | "expired";

export interface FakeDbRow extends InsertItem {
  status: FakeRowStatus;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  claimed_by: string | null;
  /** 차례가 찍는 송신 기한(43-02 · 90초) */
  claim_until: number | null;
  first_seen_at: number;
  sent_at: number | null;
  telegram_message_id: number | null;
  seed: boolean;
}

export interface FakeLease {
  holder: string | null;
  until: number;
}

export interface LeaseCall {
  n: number;
  at: number;
  holder: string;
  ttlS: number;
  lastOk: Record<string, string> | undefined;
}

export interface FakeDbOptions {
  /** 이 실행의 보유자(넣기 · 차례 · 기록 · 장애의 p_holder) */
  holder: string;
  lease?: FakeLease;
  lastOk?: Record<string, string>;
  outage?: { since: string | null; reason: string | null; notice: string | null };
  /** 키 1 사용량 · 한도 의심 표시(opendart_list · opendart_list_quota_strike) */
  used?: number;
  strikes?: number;
  /** 키 2 사용량 · 한도 의심 표시(opendart_list_k2 · opendart_list_k2_quota_strike — 261113-rn7) */
  used2?: number;
  strikes2?: number;
  rows?: FakeDbRow[];
  /** 임대 RPC 대본 — Error 면 던지고, 결과면 그대로, undefined 면 계약대로 */
  leaseAcquire?: (c: LeaseCall) => LeaseResult | Error | undefined;
  /** 넣기 · 차례 · 기록 · 장애 직전 훅(던지면 그 RPC 가 실패 · DB 변화 없음). 기록(mark)은 접수번호를 준다 */
  before?: (fn: string, now: number, info?: RpcInfo) => void;
  /** 넣기 · 차례 · 기록 · 장애가 DB 에 반영된 **뒤** 훅(던지면 응답 유실 흉내 — 반영은 남는다 · 43-06). 넣기는 접수번호들을 준다 */
  after?: (fn: string, now: number, info?: RpcInfo) => void;
}

export interface RpcInfo {
  rceptNo?: string;
  /** 넣기 — 이번 호출이 넣으려는 접수번호들(행 값 거절 흉내 · 리뷰 WR-01) */
  rceptNos?: string[];
}

/** 미리 넣어 둘 행 — InsertItem 에 상태 기본값을 채운다 */
export function dbRow(item: InsertItem, over: Partial<FakeDbRow> = {}): FakeDbRow {
  return {
    ...item,
    status: "pending",
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
    claimed_by: null,
    claim_until: null,
    first_seen_at: 0,
    sent_at: null,
    telegram_message_id: null,
    seed: false,
    ...over,
  };
}

/** 기본 설정의 감시 대상 전부(여섯 — D004 · B001 · I003 · I001 · I004 · D005) */
export const ALL_WATCHES: Watch[] = buildWatches({ b001Kinds: DEFAULT_B001_KINDS });
/**
 * 키 1 감시 대상(공개매수 D004 매 바퀴 · 주요사항보고서 B001 09:00 전 매 바퀴 · 뒤 10초 칸 — 261113-rn7). `harness` 기본값 —
 * 기존 수집기 · 장애 · 모드 시험의 호출 수 단언(바퀴 역학)과 「쓰는 키가 전부 멈춤」 길은 이 둘로 잰다. 키 2 감시 대상이 든
 * 실행은 `watches` 를 명시해 넘긴다.
 */
export const KEY1_WATCHES: Watch[] = ALL_WATCHES.filter((w) => w.key === 1);
/** 키 2 감시 대상(넷 — I003 · I001 · I004 · D005) */
export const KEY2_WATCHES: Watch[] = ALL_WATCHES.filter((w) => w.key === 2);

/** DART 행 → 넣기 원소 */
export function itemOf(row: DartRow, watch: WatchId, late = false): InsertItem {
  const d = row.rcept_dt;
  return {
    rcept_no: row.rcept_no,
    watch,
    priority: ALL_WATCHES.find((w) => w.id === watch)?.priority ?? 1,
    rcept_dt: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
    corp_cls: row.corp_cls,
    corp_name: row.corp_name,
    stock_code: row.stock_code,
    report_nm: row.report_nm,
    flr_nm: row.flr_nm,
    late,
  };
}

/** 43-02 송신 기한 */
export const FAKE_CLAIM_DEADLINE_MS = 90_000;

export function fakeDb(clock: FakeClock, o: FakeDbOptions) {
  const holder = o.holder;
  const rows = new Map<string, FakeDbRow>((o.rows ?? []).map((r) => [r.rcept_no, { ...r }]));
  const state = {
    lease: { ...(o.lease ?? { holder: null, until: 0 }) } as FakeLease,
    lastOk: { ...(o.lastOk ?? {}) } as Record<string, string>,
    outage: { ...(o.outage ?? { since: null, reason: null, notice: null }) },
    used: o.used ?? 0,
    pendingUsage: 0,
    strikes: o.strikes ?? 0,
    used2: o.used2 ?? 0,
    pendingUsage2: 0,
    strikes2: o.strikes2 ?? 0,
  };
  const calls = {
    leaseAcquire: [] as LeaseCall[],
    leaseRelease: [] as { at: number; holder: string }[],
    readState: [] as number[],
    insert: [] as { at: number; items: InsertItem[]; seed: boolean; inserted: number }[],
    claim: [] as { at: number; limit: number; claimed: number }[],
    mark: [] as { at: number; rceptNo: string; r: MarkInput; ok: boolean }[],
    outage: [] as { at: number; action: OutageAction; reason?: string; since?: string }[],
    usageAdd: [] as { at: number; n: number; key: DartKeyId }[],
    usageFlush: [] as { at: number; key: DartKeyId }[],
    strikesRecord: [] as { at: number; key: DartKeyId }[],
    countUnsent: [] as { at: number; day: string; unsent: number }[],
    /** usage · strikes · countUnsent 가 받은 날짜 인자(리뷰 WR-56 — 결선이 날짜를 버리지 않는지) */
    dayArgs: [] as { fn: string; at: number; day: string }[],
  };
  /** 오늘 KST `YYYY-MM-DD` 가 아닌 날짜 인자 — harness.run() 이 끝나면 비어 있어야 한다 */
  const badDays: { fn: string; day: unknown; want: string }[] = [];
  /** 넣기 · 차례 · 기록 · 장애에서 던진 LeaseLostError */
  const leaseLost: { fn: string; at: number }[] = [];

  const today = () => kstIsoDate(clock.now());
  /** 운영 카운터는 KST 날짜 키(usage_date) — 꼴이 다르거나 오늘이 아니면 던지고 기록한다(수집기가 삼켜도 run() 이 잡는다) */
  const checkDay = (fn: string, day: unknown) => {
    const want = today();
    calls.dayArgs.push({ fn, at: clock.now(), day: String(day) });
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day !== want) {
      badDays.push({ fn, day, want });
      throw new Error(`fake db ${fn}: 날짜 인자 '${String(day)}' 가 오늘 KST(${want}) 가 아니다`);
    }
  };
  /** 키 인자는 1 · 2 만 — 결선이 키를 버리면(undefined) 던진다(261113-rn7) */
  const checkKey = (fn: string, key: unknown) => {
    if (key !== 1 && key !== 2) {
      badDays.push({ fn, day: `key=${String(key)}`, want: "key 1|2" });
      throw new Error(`fake db ${fn}: 키 인자 '${String(key)}' 가 1 · 2 가 아니다`);
    }
  };
  const guard = (fn: string, info?: RpcInfo) => {
    const now = clock.now();
    o.before?.(fn, now, info);
    if (state.lease.holder !== holder || state.lease.until <= now) {
      leaseLost.push({ fn, at: now });
      throw new LeaseLostError(fn);
    }
  };

  /** 장애 RPC 의 DB 반영(43-02 · 20261113400000 계약) — after 훅이 반영 뒤에 걸리게 따로 둔다(리뷰 IN-50) */
  const applyOutage = (now: number, action: OutageAction, reason?: string, sinceIso?: string) => {
    calls.outage.push({ at: now, action, ...(reason !== undefined ? { reason } : {}), ...(sinceIso !== undefined ? { since: sinceIso } : {}) });
    const s = state.outage;
    if (action === "open") {
      // 43-02: 이미 열려 있고 notice 가 pending(연 실행이 글을 못 남기고 죽음)이면 처음 시각으로 opened true 를 한 번 더
      if (s.since !== null) return s.notice === "pending" ? { opened: true, since: s.since } : { opened: false };
      // 리뷰 IN-01 p_since — [now − 1일, now] 로 잘라 맞춤 · 없으면 now(마이그레이션 20261113400000 과 같은 규칙)
      const asked = sinceIso === undefined ? now : Date.parse(sinceIso);
      s.since = new Date(Math.min(now, Math.max(Number.isFinite(asked) ? asked : now, now - 86_400_000))).toISOString();
      s.reason = reason ?? null;
      s.notice = "pending";
      return { opened: true, since: s.since };
    }
    if (action === "notice") {
      if (s.since === null || s.notice !== "pending") return { noticed: false };
      s.notice = reason ?? null;
      return { noticed: true };
    }
    if (s.since === null) return { closed: false };
    const out = { closed: true, notify: s.notice === "sent", since: s.since };
    state.outage = { since: null, reason: null, notice: null };
    return out;
  };

  const db: CollectorDeps["db"] = {
    async leaseAcquire(h, ttlS, lastOk) {
      const now = clock.now();
      const call: LeaseCall = { n: calls.leaseAcquire.length + 1, at: now, holder: h, ttlS, lastOk: lastOk ? { ...lastOk } : undefined };
      calls.leaseAcquire.push(call);
      const scripted = o.leaseAcquire?.(call);
      if (scripted instanceof Error) throw scripted;
      if (scripted) return scripted;

      const L = state.lease;
      if (!(L.holder === null || L.until <= now || L.holder === h)) return { held: false, fresh: false, reclaimed: 0, expired: 0 };
      const fresh = L.holder !== h;
      let reclaimed = 0;
      let expired = 0;
      if (fresh) {
        const d = today();
        for (const r of rows.values()) {
          if (r.rcept_dt === d && r.status === "sending") {
            r.status = "pending";
            r.claimed_by = null;
            r.claim_until = null;
            r.next_attempt_at = now;
            r.last_error = "reclaimed_after_takeover";
            reclaimed += 1;
          } else if (r.rcept_dt < d && (r.status === "pending" || r.status === "sending")) {
            r.status = "expired";
            expired += 1;
          }
        }
      }
      state.lease = { holder: h, until: now + ttlS * 1000 };
      if (lastOk) Object.assign(state.lastOk, lastOk);
      return { held: true, fresh, reclaimed, expired };
    },

    async leaseRelease(h) {
      calls.leaseRelease.push({ at: clock.now(), holder: h });
      if (state.lease.holder !== h) return false;
      state.lease = { holder: null, until: 0 };
      return true;
    },

    async readState() {
      calls.readState.push(clock.now());
      return {
        lastOk: { ...state.lastOk },
        outage: { since: state.outage.since, reason: state.outage.reason, notice: state.outage.notice },
      };
    },

    async insert(items, seed) {
      guard("dart_alert_insert", { rceptNos: items.map((i) => i.rcept_no) });
      const now = clock.now();
      const out: InsertedRow[] = [];
      for (const it of items) {
        if (rows.has(it.rcept_no)) continue;
        rows.set(it.rcept_no, dbRow(it, { status: seed ? "seeded" : "pending", next_attempt_at: now, first_seen_at: now, seed }));
        out.push({ rcept_no: it.rcept_no, late: it.late });
      }
      calls.insert.push({ at: now, items: items.map((i) => ({ ...i })), seed, inserted: out.length });
      o.after?.("dart_alert_insert", now, { rceptNos: items.map((i) => i.rcept_no) });
      return out;
    },

    async claim(limit) {
      guard("dart_alert_claim");
      const now = clock.now();
      const d = today();
      const picked = [...rows.values()]
        .filter(
          (r) =>
            r.rcept_dt === d &&
            ((r.status === "pending" && r.next_attempt_at <= now) ||
              (r.status === "sending" && r.claimed_by === holder && r.claim_until !== null && r.claim_until <= now)),
        )
        .sort((a, b) => a.priority - b.priority || a.first_seen_at - b.first_seen_at || a.rcept_no.localeCompare(b.rcept_no))
        .slice(0, limit);
      const out = picked.map((r) => {
        const stale = r.status === "sending";
        if (stale) r.last_error = "reclaimed_stale_claim";
        r.status = "sending";
        r.claimed_by = holder;
        r.claim_until = now + FAKE_CLAIM_DEADLINE_MS;
        r.attempts += 1;
        const row: ClaimedRow & { stale: boolean } = {
          rcept_no: r.rcept_no,
          watch: r.watch,
          corp_cls: r.corp_cls,
          corp_name: r.corp_name,
          stock_code: r.stock_code,
          report_nm: r.report_nm,
          flr_nm: r.flr_nm,
          late: r.late,
          attempts: r.attempts,
          first_seen_at: new Date(r.first_seen_at).toISOString(),
          stale,
        };
        return row;
      });
      calls.claim.push({ at: now, limit, claimed: out.length });
      o.after?.("dart_alert_claim", now);
      return out;
    },

    async mark(rceptNo, r) {
      guard("dart_alert_mark", { rceptNo });
      const now = clock.now();
      const row = rows.get(rceptNo);
      const ok = row !== undefined && row.status === "sending" && row.claimed_by === holder;
      calls.mark.push({ at: now, rceptNo, r: { ...r }, ok });
      if (!ok || !row) return false;
      if (r.ok) {
        row.status = "sent";
        row.sent_at = now;
        row.telegram_message_id = r.messageId;
        row.last_error = null;
      } else {
        row.status = "pending";
        row.claimed_by = null;
        row.claim_until = null;
        row.next_attempt_at = now + r.retryInS * 1000;
        row.last_error = r.error;
      }
      o.after?.("dart_alert_mark", now, { rceptNo });
      return true;
    },

    async outage(action, reason, sinceIso) {
      guard("dart_alert_outage");
      const now = clock.now();
      const res = applyOutage(now, action, reason, sinceIso);
      o.after?.("dart_alert_outage", now);
      return res;
    },

    async countUnsent(day) {
      checkDay("countUnsent", day);
      const unsent = [...rows.values()].filter((r) => r.rcept_dt === day && (r.status === "pending" || r.status === "sending")).length;
      calls.countUnsent.push({ at: clock.now(), day, unsent });
      return unsent;
    },


    usage: {
      read: async (d, key) => {
        checkDay("usage.read", d);
        checkKey("usage.read", key);
        return key === 2 ? state.used2 : state.used;
      },
      add: (n, key) => {
        checkKey("usage.add", key);
        calls.usageAdd.push({ at: clock.now(), n, key });
        if (key === 2) state.pendingUsage2 += n;
        else state.pendingUsage += n;
      },
      flush: async (d, key) => {
        checkDay("usage.flush", d);
        checkKey("usage.flush", key);
        calls.usageFlush.push({ at: clock.now(), key });
        if (key === 2) {
          if (state.pendingUsage2 === 0) return null;
          state.used2 += state.pendingUsage2;
          state.pendingUsage2 = 0;
          return state.used2;
        }
        if (state.pendingUsage === 0) return null;
        state.used += state.pendingUsage;
        state.pendingUsage = 0;
        return state.used;
      },
    },

    strikes: {
      read: async (d, key) => {
        checkDay("strikes.read", d);
        checkKey("strikes.read", key);
        return key === 2 ? state.strikes2 : state.strikes;
      },
      record: async (d, key) => {
        checkDay("strikes.record", d);
        checkKey("strikes.record", key);
        calls.strikesRecord.push({ at: clock.now(), key });
        if (key === 2) return ++state.strikes2;
        return ++state.strikes;
      },
    },
  };

  return {
    db,
    rows,
    state,
    calls,
    leaseLost,
    badDays,
    /** usage.add 합 — key 를 주면 그 키 것만 */
    usageAdded: (key?: DartKeyId) => calls.usageAdd.filter((c) => key === undefined || c.key === key).reduce((s, c) => s + c.n, 0),
    /** 다른 실행이 임대를 가져감 */
    steal: (other: string, until: number) => {
      state.lease = { holder: other, until };
    },
    statusOf: (rceptNo: string) => rows.get(rceptNo)?.status,
  };
}

// ── 한 묶음 ──────────────────────────────────────────────────────────
export const HOLDER = "exec-1:abcd1234";

export interface HarnessOptions {
  start: number;
  mode?: DartAlertMode;
  budget?: number;
  holder?: string;
  abortAt?: number;
  maxSleeps?: number;
  watches?: Watch[];
  judge?: JudgeOptions;
  /**
   * 오늘 아침 전날 확인을 이미 했다고 깔아 둘까(기본 true — 시작 날짜로 감시 대상 전부의 `prevday:<id>` 를 db lastOk 앞에 깐다 ·
   * 기존 시험이 전날 조회를 하지 않게). false 면 깔지 않아 첫 성공 조회 때 직전 평일을 조회한다(261113-rn7).
   */
  prevDayDone?: boolean;
  db?: Omit<FakeDbOptions, "holder">;
  dart?: FakeDartOptions;
  telegram?: FakeTelegramOptions;
}

export function harness(o: HarnessOptions) {
  const clock = fakeClock(o.start, { abortAt: o.abortAt, maxSleeps: o.maxSleeps });
  const tl = timeline();
  const logs = logRecorder();
  const holder = o.holder ?? HOLDER;
  const marks =
    o.prevDayDone === false ? {} : Object.fromEntries(ALL_WATCHES.map((w) => [`${PREV_DAY_MARK_PREFIX}${w.id}`, kstIsoDate(o.start)]));
  const db = fakeDb(clock, { ...(o.db ?? {}), lastOk: { ...marks, ...(o.db?.lastOk ?? {}) }, holder });
  const dart = fakeDart(clock, o.dart ?? {}, tl);
  const telegram = fakeTelegram(clock, o.telegram ?? {}, tl);
  const deps: CollectorDeps = {
    cfg: { dailyBudget: o.budget ?? 15_000, mode: o.mode ?? "auto" },
    log: logs.log,
    clock,
    sleep: (ms) => clock.sleep(ms),
    signal: clock.signal,
    holder,
    watches: o.watches ?? KEY1_WATCHES,
    judge: o.judge ?? { b001Corrections: "include" },
    db: db.db,
    dart: dart.api,
    telegram: telegram.api,
  };
  return {
    deps,
    clock,
    timeline: tl,
    logs,
    db,
    dart,
    telegram,
    run: async (): Promise<CollectorExit> => {
      const exit = await runCollector(deps);
      // 수집기가 DB 오류를 warn 으로 삼켜도 날짜 결선 어긋남은 테스트를 떨어뜨린다(리뷰 WR-56)
      if (db.badDays.length > 0) throw new Error(`fake db 날짜 인자 어긋남: ${JSON.stringify(db.badDays)}`);
      return exit;
    },
  };
}

export type Harness = ReturnType<typeof harness>;
