/**
 * Phase 28 (28-01) — 상한가 특징 85 표시 순수 함수 (카드 탭 「상한가」 9칸 · 탭 제목 접미).
 *
 * WinForms `BuildLimitFeatureCells` · `FormatEok` · `FormatDuration` 동형(gh-trade LimitChaserForm.cs 3738-3866) —
 * 서버 값 그대로 · **단위 변환 · 비율만** 한다(D-19). .NET 의 「0 에서 먼 쪽」 반올림(`ToString("N1")` ·
 * `"+0.0;-0.0;0.0"`)을 정수 산술로 재현한다 — JS `toFixed` 는 이진 근사값으로 반올림해 115,000,000원을
 * 「1.1억」 으로 적는다(WinForms 「1.2억」 · RESEARCH Pitfall 6).
 *
 * 색은 tone 으로만 돌려준다 — CSS 변수 적용은 컴포넌트 책임이다(`limit-up-format.ts` 규율).
 * 28-07 — 10초 · 창구 행(칸 4~9) · 폰 밴드 문구(`narrow`) · 툴팁(`ApplyLimitFeatureTable`)을 채웠다. 같은 숫자 함수를
 * kind 15 문장(28-09)과 보고서(28-12/13)가 다시 쓴다 — shared 순수 함수 1벌.
 * 28-09 — 관찰자 저널 kind 15 행(StrategyEvent 칸에 85 필드를 실은 것)을 85 이름으로 되돌리는 `limitFeatureOfStrategyEvent` ·
 * 창구 `message` 파서(total) · 주문로그 한 줄 조각 `limitFeatureLogParts`(UI-SPEC ②-2 정본 — WinForms 에 kind 15 분기 없음).
 * quick-261006-ide — gh-trade gp8 · f1j 동형: 지금 행 → 툴팁 첫 줄(상태 줄), 누적 행(이번 잠김 매도 · 취소 · 위험도) ·
 * 잠김 경과 머리(`limitFeatureRowHeads` — 누적 행 머리를 「m:ss」 로 덮는다).
 */

import { memberName } from "./member-codes";
import type { RelayExchange, RelayLimitFeatureMember, RelayLimitFeatureMsg } from "./relay";
import type { StrategyEventRow } from "./strategy-event";

/** 칸 색 축 — `--up` · `--down` · `--fg` · `--muted-fg` · `--faint`. */
export type LimitFeatureTone = "up" | "down" | "fg" | "muted" | "faint";

/** 9칸 표의 칸 1개. 굵기는 늘 보통이다(WinForms 표는 칸을 모두 보통 굵기로 그린다 — quick-261006-ide). */
export type LimitFeatureCell = {
  text: string;
  tone: LimitFeatureTone;
  /** 폰 밴드 문구(카드 `lc` < 첫 경계) — 잠김 중 10초 행 칸 2 · 3 만. null = 모든 밴드에서 `text`. */
  narrow: string | null;
};

/** 탭 트리거 접미 「 · 잠김 43초」 / 「 · 깨짐」 의 조각. */
export type LimitFeatureTabSuffix = { text: string; tone: "up" | "fg" };

/** 「1,234」 — ko-KR 도 같은 쉼표지만 런타임 로캘 데이터에 기대지 않게 en-US 로 고정한다. */
const GROUP = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const DASH = "—";

/** 천 단위 쉼표 정수 (.NET `N0`). */
export function formatGroup(n: number): string {
  return GROUP.format(n);
}

/**
 * 원 → 「17.3억」 (.NET `(krw / 1e8).ToString("N1") + "억"`). 0 → 「0」. 억 미만도 소수 한 자리 억(「0.0억」).
 * 십분위 정수(`krw / 1e7`)로 반올림한다 — `krw` 는 정수라 .5 경계가 정확히 표현된다(0 에서 먼 쪽 = 양수의 올림).
 */
export function formatEok(krw: number): string {
  if (krw === 0) return "0";
  const tenths = Math.floor((krw + 5_000_000) / 10_000_000);
  return `${formatGroup(Math.trunc(tenths / 10))}.${tenths % 10}억`;
}

/** 초 → 60초 이상이면 「M분 S초」, 아니면 「S초」 (잠김 경과 · 소진 공용 — WinForms `FormatDuration`). */
export function formatDuration(s: number): string {
  return s >= 60 ? `${Math.trunc(s / 60)}분 ${s % 60}초` : `${s}초`;
}

/**
 * 초 → 누적 행 머리용 짧은 시계 「m:ss」, 1시간 이상이면 「h:mm:ss」(잠김 경과 — WinForms `FormatClock` 동형).
 * 음수는 0 으로 본다.
 */
export function formatClock(s: number): string {
  const v = s < 0 ? 0 : Math.trunc(s);
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (v >= 3600) return `${Math.trunc(v / 3600)}:${p2(Math.trunc((v % 3600) / 60))}:${p2(v % 60)}`;
  return `${Math.trunc(v / 60)}:${p2(v % 60)}`;
}

/**
 * 등락률 bp → 「+26.8%」 (.NET `(bp / 100.0).ToString("+0.0;-0.0;0.0") + "%"`). 십분위 정수로 0 에서 먼 쪽 반올림,
 * 반올림 결과가 0 이면 세 번째 구역 「0.0%」(부호 없음 — −0.04% 도 「0.0%」).
 */
export function formatRatePct(rateBp: number): string {
  const t = Math.sign(rateBp) * Math.floor((Math.abs(rateBp) + 5) / 10);
  if (t === 0) return "0.0%";
  const a = Math.abs(t);
  return `${t > 0 ? "+" : "-"}${Math.trunc(a / 10)}.${a % 10}%`;
}

/**
 * 100·part/total 을 .NET `Math.Round` 기본(MidpointRounding.ToEven — 짝수 반올림)으로 (WinForms 「우세 NN%」).
 * 정수 입력이라 몫 · 나머지 산술로 .5 경계를 정확히 판정한다. `total` > 0 이어야 한다.
 */
export function roundPctHalfEven(part: number, total: number): number {
  const num = part * 100;
  const q = Math.floor(num / total);
  const r = num - q * total;
  if (2 * r > total) return q + 1;
  if (2 * r === total) return q % 2 === 1 ? q + 1 : q;
  return q;
}

/**
 * 주 → |q| ≥ 1만이면 「+5.2만」(.NET `(q / 10000.0).ToString("+0.0;-0.0") + "만"` — 0 에서 먼 쪽), 그보다 작으면
 * 「+3,200」 · 「-2,300」 · 0 → 「0」(.NET `"+#,0;-#,0;0"`). WinForms `FormatManQty` 동형.
 */
export function formatManQty(qty: number): string {
  const a = Math.abs(qty);
  if (a >= 10_000) {
    const t = Math.floor((a + 500) / 1000);
    return `${qty < 0 ? "-" : "+"}${Math.trunc(t / 10)}.${t % 10}만`;
  }
  if (qty > 0) return `+${formatGroup(qty)}`;
  if (qty < 0) return `-${formatGroup(a)}`;
  return "0";
}

/** bp(≥ 0) → 「18.3」 (.NET `(bp / 100.0).ToString("0.0")` — 십분위 정수로 0 에서 먼 쪽). */
function formatBpPct1(bp: number): string {
  const t = Math.floor((bp + 5) / 10);
  return `${Math.trunc(t / 10)}.${t % 10}`;
}

/** 창구 목록에서 회원번호가 있는 첫 원소 — 없으면 null (WinForms `FirstMember`). */
function firstMember(list: readonly RelayLimitFeatureMember[] | null | undefined): RelayLimitFeatureMember | null {
  if (!list) return null;
  for (const m of list) if (m && m.memberNo) return m;
  return null;
}

/**
 * 10초 행 칸 1 — 「매도 우세 NN%」(down) / 「매수 우세 NN%」(up) / 「매수·매도 반반」 / 「체결 없음」. 큰 쪽 10초 체결 ÷ 합 ×
 * 100 짝수 반올림. 9칸과 kind 15 문장(색 없이 글자만)이 같은 갈래를 쓴다.
 */
function tenSecondLead(msg: Pick<RelayLimitFeatureMsg, "sellLed10s" | "buyLed10s">): LimitFeatureCell {
  const led = msg.sellLed10s + msg.buyLed10s;
  if (led === 0) return cell("체결 없음");
  if (msg.sellLed10s > msg.buyLed10s) return cell(`매도 우세 ${roundPctHalfEven(msg.sellLed10s, led)}%`, "down");
  if (msg.buyLed10s > msg.sellLed10s) return cell(`매수 우세 ${roundPctHalfEven(msg.buyLed10s, led)}%`, "up");
  return cell("매수·매도 반반");
}

/**
 * 행 머리 3개(WinForms `LimitFeatureTable.RowHeaders` — quick-261006-gp8 이후 누적 · 10초 · 창구). 툴팁 줄 머리는 늘 이 기본
 * 머리다(잠김 경과로 덮은 머리가 아니다 — WinForms `GetRowHeader`).
 */
export const LIMIT_FEATURE_ROW_HEADERS = ["누적", "10초", "창구"] as const;

/** 표 행 머리 1개 — `elapsed` = 잠김 경과로 덮은 누적 행 머리(`--up` · 보통 굵기). */
export type LimitFeatureRowHead = { text: string; elapsed: boolean };

function cell(text: string, tone: LimitFeatureTone = "fg"): LimitFeatureCell {
  return { text, tone, narrow: null };
}

const EMPTY_CELL: LimitFeatureCell = { text: DASH, tone: "faint", narrow: null };

/**
 * 상태 줄 세 칸(옛 「지금」 행 — 표에는 그리지 않고 툴팁 첫 줄로만 간다, WinForms `BuildLimitFeatureCells` [0..2]).
 *   - lock 1: 「잠김 {dur}째」 · 「대기 {억}」 · 「소진 {dur}」(drain −1 → 「소진 —」)
 *   - lock 2: 「깨짐」 · 「대기 {억}」 · 「매도벽 {억}」(잘림 「+」)
 *   - 그 밖 : 「미도달 ({등락률})」 · 「매도벽 {억}」 · 「상한가 {원}」(upper 0 → 「상한가 —」)
 *   - 단일가: 칸 1 앞에 「단일가 · 」
 */
function limitFeatureStatus(msg: RelayLimitFeatureMsg): [string, string, string] {
  const wall = `매도벽 ${formatEok(msg.wallKrwVisible)}${msg.wallTruncated ? "+" : ""}`;
  let now: [string, string, string];
  if (msg.lockState === 1) {
    now = [
      `잠김 ${formatDuration(msg.lockElapsedS)}째`,
      `대기 ${formatEok(msg.qKrw)}`,
      `소진 ${msg.drainS < 0 ? DASH : formatDuration(msg.drainS)}`,
    ];
  } else if (msg.lockState === 2) {
    now = ["깨짐", `대기 ${formatEok(msg.qKrw)}`, wall];
  } else {
    now = [
      `미도달 (${formatRatePct(msg.rateBp)})`,
      wall,
      `상한가 ${msg.upperPx === 0 ? DASH : formatGroup(msg.upperPx)}`,
    ];
  }
  if (msg.auction) now[0] = `단일가 · ${now[0]}`;
  return now;
}

/**
 * 9칸(행 우선 — `row * 3 + col`: 누적 · 10초 · 창구). null(85 없음 · 아직 안 옴 · 구 서버 · 대상 밖 키 · 접힌 카드)이면
 * 9칸 모두 「—」(faint).
 *
 * 누적 행(WinForms quick-261006-f1j 원문 갈래 — 이번 잠김 누적 매도 · 취소 금액은 서버 값, 위험도는 두 서버 값의 비율):
 *   - 잠김 없음(lock 0, 또는 lock 2 이고 두 금액 모두 0): 「—」 ×3(fg)
 *   - 그 밖: 「매도 {억}」(down) · 「취소 {억}」(down) · 「위험도 NN%」(fg — lockSellKrw ÷ qKrw × 100 짝수 반올림,
 *     100% 초과 가능) / qKrw 0 → 「위험도 —」. lock 1 은 두 금액이 0 이어도 「매도 0」.
 */
export function limitFeatureCells(msg: RelayLimitFeatureMsg | null): LimitFeatureCell[] {
  if (msg === null) return Array.from({ length: 9 }, () => ({ ...EMPTY_CELL }));

  const noLock =
    msg.lockState === 0 || (msg.lockState === 2 && msg.lockSellKrw === 0 && msg.lockCancelKrw === 0);
  const cum: LimitFeatureCell[] = noLock
    ? [cell(DASH), cell(DASH), cell(DASH)]
    : [
        cell(`매도 ${formatEok(msg.lockSellKrw)}`, "down"),
        cell(`취소 ${formatEok(msg.lockCancelKrw)}`, "down"),
        cell(msg.qKrw === 0 ? `위험도 ${DASH}` : `위험도 ${roundPctHalfEven(msg.lockSellKrw, msg.qKrw)}%`),
      ];

  // 10초 행 — 체결 우세(큰 쪽 비율 · 짝수 반올림) · 잠김 중 잔량 신규/취소, 그 밖 체결 합.
  const led = msg.sellLed10s + msg.buyLed10s;
  const lead = tenSecondLead(msg);
  let ten: LimitFeatureCell[];
  if (msg.lockState === 1) {
    const n = msg.new10s > 0 ? `+${formatGroup(msg.new10s)}` : "0";
    const c = msg.cancel10s > 0 ? `-${formatGroup(msg.cancel10s)}` : "0";
    ten = [
      lead,
      { ...cell(`잔량 신규 ${n}`), narrow: `신규 ${msg.new10s > 0 ? formatManQty(msg.new10s) : "0"}` },
      { ...cell(`잔량 취소 ${c}`, "down"), narrow: `취소 ${msg.cancel10s > 0 ? formatManQty(-msg.cancel10s) : "0"}` },
    ];
  } else {
    ten = [lead, cell(`체결 ${formatGroup(led)}주`), cell(DASH)];
  }

  // 창구 행 — 매수 · 매도 상위 1(회원번호 있는 첫 원소) + 깨짐확률(모델 적용 중일 때만).
  const buy = firstMember(msg.memberBuy);
  const sell = firstMember(msg.memberSell);
  const win = [
    buy ? cell(`매수 ${memberName(buy.memberNo)} ${formatManQty(buy.dQty)}`, "up") : cell(`매수 ${DASH}`),
    sell ? cell(`매도 ${memberName(sell.memberNo)} ${formatManQty(sell.dQty)}`, "down") : cell(`매도 ${DASH}`),
    msg.modelState === 1 && msg.pBreakBp >= 0
      ? cell(`깨짐확률 ${formatBpPct1(msg.pBreakBp)}%`)
      : cell("깨짐확률 관찰 중", "muted"),
  ];
  return [...cum, ...ten, ...win];
}

/**
 * 표 행 머리 3개 — lock 1 이면 누적 행 머리를 잠김 경과 「m:ss」(`formatClock`, `elapsed: true`)로 덮는다(WinForms
 * `SetRowHeaderOverride(0, FormatClock(LockElapsedS), PriceUp)`). 그 밖 · null 은 기본 머리.
 */
export function limitFeatureRowHeads(msg: RelayLimitFeatureMsg | null): LimitFeatureRowHead[] {
  const heads = LIMIT_FEATURE_ROW_HEADERS.map((text) => ({ text: text as string, elapsed: false }));
  if (msg !== null && msg.lockState === 1) heads[0] = { text: formatClock(msg.lockElapsedS), elapsed: true };
  return heads;
}

/** epoch ms → KST 「HH:mm:ss」(밀리초는 잘라낸다 — WinForms `FormatTimeKst(...).Substring(0, 8)`). 0 이하 → 「」. */
function formatTimeKstHms(epochMs: number): string {
  if (!(epochMs > 0)) return "";
  const sec = (((Math.floor((epochMs + 9 * 3_600_000) / 1000)) % 86_400) + 86_400) % 86_400;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(Math.trunc(sec / 3600))}:${p2(Math.trunc(sec / 60) % 60)}:${p2(sec % 60)}`;
}

/**
 * 표 툴팁(WinForms `ApplyLimitFeatureTable` 동형). 첫 줄 = 상태 줄(옛 지금 행 세 칸 「 · 」 연결) · 이어 줄 3개
 * 「{기본 행 머리} {칸1} · {칸2} · {칸3}」(늘 **넓은 밴드 문구** · 머리는 경과로 덮지 않은 누적/10초/창구) +
 * 마지막 줄 「HH:mm:ss 기준」(gwTimeMs KST) · 확률 적용 중(modelState 1 · pBreakBp ≥ 0 · pHorizonS > 0)이면
 * 「 · 깨짐확률은 N초 안」. 시각이 없으면 확률 꼬리만 「깨짐확률은 N초 안」 줄로. null(85 없음) → 「」.
 */
export function limitFeatureTooltip(msg: RelayLimitFeatureMsg | null): string {
  if (msg === null) return "";
  const cells = limitFeatureCells(msg);
  const lines = [
    limitFeatureStatus(msg).join(" · "),
    ...LIMIT_FEATURE_ROW_HEADERS.map(
      (h, r) => `${h} ${cells[r * 3]!.text} · ${cells[r * 3 + 1]!.text} · ${cells[r * 3 + 2]!.text}`,
    ),
  ];
  const time = formatTimeKstHms(msg.gwTimeMs);
  const horizon = msg.modelState === 1 && msg.pBreakBp >= 0 && msg.pHorizonS > 0;
  if (time) lines.push(`${time} 기준${horizon ? ` · 깨짐확률은 ${msg.pHorizonS}초 안` : ""}`);
  else if (horizon) lines.push(`깨짐확률은 ${msg.pHorizonS}초 안`);
  return lines.join("\n");
}

/**
 * 탭 트리거 접미(D-04). lock 1 → 「잠김 {dur}」(up · 「째」 없음), lock 2 → 「깨짐」(fg), 그 밖 · null → null(접미 없음).
 */
export function limitFeatureTabSuffix(msg: RelayLimitFeatureMsg | null): LimitFeatureTabSuffix | null {
  if (msg === null) return null;
  if (msg.lockState === 1) return { text: `잠김 ${formatDuration(msg.lockElapsedS)}`, tone: "up" };
  if (msg.lockState === 2) return { text: "깨짐", tone: "fg" };
  return null;
}


// ── 28-09 — 관찰자 저널 kind 15 (분당 · 키당 1행) ──────────────────────────────────────────────────────

/** kind 15 `message` 의 창구 원소 1개 — 회원번호 · 그 쪽 비중 bp(0~10000). 수량은 없다(R-4). */
export type LimitFeatureMessageMember = { member: string; shareBp: number };

/** `parseLimitFeatureMessage` 결과. 형식이 깨진 조각은 빠지고(지어내지 않는다) `|m=<정수>` 가 없으면 modelState null. */
export type LimitFeatureMessage = {
  buy: LimitFeatureMessageMember[];
  sell: LimitFeatureMessageMember[];
  modelState: number | null;
};

const DIGITS = /^\d+$/;

/** `<회원>=<bp>` 1개 → 원소. `=` 가 정확히 하나 · 회원 비어 있지 않음 · bp 0~10000 정수만, 아니면 null. */
function parseMessageMember(el: string): LimitFeatureMessageMember | null {
  const parts = el.split("=");
  if (parts.length !== 2) return null;
  const [member, bp] = parts as [string, string];
  if (member === "" || !DIGITS.test(bp)) return null;
  const shareBp = Number(bp);
  return shareBp <= 10_000 ? { member, shareBp } : null;
}

/**
 * kind 15 `message` 파서 — `buy:<회원>=<bp>,…;sell:<회원>=<bp>,…|m=<model>`(gh-trade 인박스 261005 (B) · ASCII · 256B 경계).
 * **total** 이다(throw 없음): `|` 앞을 `;` 로 갈래(`buy:` · `sell:` 접두만), 갈래 안을 `,` 로 원소, 원소는 `=` 로 나눈다.
 * 256B 에서 잘린 꼬리는 버린다 — 종결자 `|` 가 없으면 마지막 갈래의 마지막 원소가 숫자 중간에서 잘렸을 수 있어
 * (「=7407」 → 「=74」) 형식이 맞아 보여도 버리고, `|` 뒤가 `m=<정수>` 가 아니면 modelState 는 null 이다.
 */
export function parseLimitFeatureMessage(message: string): LimitFeatureMessage {
  const out: LimitFeatureMessage = { buy: [], sell: [], modelState: null };
  if (typeof message !== "string" || message === "") return out;
  const bar = message.indexOf("|");
  const head = bar >= 0 ? message.slice(0, bar) : message;
  if (bar >= 0) {
    const tail = message.slice(bar + 1);
    if (tail.startsWith("m=") && DIGITS.test(tail.slice(2))) out.modelState = Number(tail.slice(2));
  }
  const segments = head.split(";");
  segments.forEach((seg, si) => {
    const side = seg.startsWith("buy:") ? out.buy : seg.startsWith("sell:") ? out.sell : null;
    if (side === null) return;
    const elements = seg.slice(seg.indexOf(":") + 1).split(",");
    // 종결자 없이 끝난 문자열의 마지막 원소 = 잘렸을 수 있는 꼬리.
    if (bar < 0 && si === segments.length - 1) elements.pop();
    for (const el of elements) {
      const m = parseMessageMember(el);
      if (m) side.push(m);
    }
  });
  return out;
}

/** 창구 원소 → 85 `MemberDelta` 모양(kind 15 에는 수량이 없다 — dQty · dValue 0, shareBp 만). */
function toFeatureMember(m: LimitFeatureMessageMember): RelayLimitFeatureMember {
  return { memberNo: m.member, dQty: 0, dValue: 0, shareBp: m.shareBp };
}

/**
 * kind 15 행 → 85 `RelayLimitFeatureMsg` 모양(숫자 슬롯 매핑표 = 특징 사전 ③ 그대로). 행에 없는 값(basePx · burstUpperLimit ·
 * memberDeltaPartial · modelSchemaVersion · pHorizonS · lockSellKrw · lockCancelKrw)은 0/false 다 — 누적 매도 · 취소는
 * kind 15 슬롯에 싣지 않는다(gh-trade 2026-10-06 결정, 슬롯 매핑 무변경). modelState = snap_qty 길이(원소 값은 의미 없다).
 * 9칸 숫자 함수와 kind 15 문장이 같은 표기를 쓰게 하는 다리다 — 값을 보정하지 않는다.
 */
export function limitFeatureOfStrategyEvent(row: StrategyEventRow): RelayLimitFeatureMsg {
  const members = parseLimitFeatureMessage(row.message);
  return {
    t: "limit.feature",
    i: row.isin,
    x: row.exchange as RelayExchange,
    gwTimeMs: row.gwTimeMs,
    featureSchema: 1,
    upperPx: row.evPrice,
    lastPx: row.price,
    rateBp: row.condActual,
    basePx: 0,
    qQty: row.limitBidQty,
    qKrw: row.evQtyBefore,
    wallKrwVisible: row.evQtyAfter,
    wallQtyHidden: row.askQtyAtLimit,
    wallTruncated: row.openAtLimit,
    sellLed10s: row.evTradeQty,
    buyLed10s: row.immediateFillQty,
    cancel10s: row.aheadQty,
    new10s: row.baseCum,
    auctionFill10s: row.expectedCum,
    drainS: row.condThreshold,
    lockState: row.entryRound,
    lockElapsedS: row.qty,
    burstUpperLimit: false,
    auction: row.hasRemaining,
    memberBuy: members.buy.map(toFeatureMember),
    memberSell: members.sell.map(toFeatureMember),
    memberDeltaPartial: false,
    modelState: row.snapQty.length > 0 ? 1 : 0,
    modelSchemaVersion: 0,
    pBreakBp: row.resultCode,
    pHorizonS: 0,
    lockSellKrw: 0,
    lockCancelKrw: 0,
  };
}

/** 창구 조각 한쪽 — 「매수 키움증권 74%」(상위 1 · share_bp ÷ 100 반올림) / 없으면 「매수 —」. */
function memberShareText(side: "매수" | "매도", list: readonly RelayLimitFeatureMember[]): string {
  const m = firstMember(list);
  return m ? `${side} ${memberName(m.memberNo)} ${Math.floor((m.shareBp + 50) / 100)}%` : `${side} ${DASH}`;
}

/** kind 15 주문로그 한 줄 조각 — lead(잠김 줄만 · 표면이 `--up` 600) + 나머지 본문. */
export type LimitFeatureLogParts = { lead: string | null; body: string };

/**
 * kind 15 행 → 주문로그 한 줄 조각(UI-SPEC ②-2 정본). 조각 구분자 「 · 」.
 *   - lock 1: lead 「잠김 {dur}」 · 본문 「잔량 {억}」 · 「매도벽 {억}{+}」 · 「소진 {dur 또는 —}」
 *   - lock 2: 「깨짐」 · 잔량 · 매도벽 · 소진 / 그 밖: 「미도달 ({등락률})」 · 매도벽 · 「상한가 {원 또는 —}」
 *   - 이어서 「10초 {우세}」 → 잠김이면 「신규 +N / 취소 -N」(0 이면 「0」), 그 밖 「체결 N주」 →
 *     「창구 매수 {회원사} NN% / 매도 …」 → 「깨짐확률 NN.N%」 / 「깨짐확률 관찰 중」
 *   - 단일가(auction): 잠김이면 lead 앞, 그 밖 본문 맨 앞 「단일가 · 」
 * 숫자 표기는 카드 9칸과 같은 함수다(「매도벽 0」 — R-1).
 */
export function limitFeatureLogParts(row: StrategyEventRow): LimitFeatureLogParts {
  const msg = limitFeatureOfStrategyEvent(row);
  const auction = msg.auction ? "단일가" : null;
  const remain = `잔량 ${formatEok(msg.qKrw)}`;
  const wall = `매도벽 ${formatEok(msg.wallKrwVisible)}${msg.wallTruncated ? "+" : ""}`;
  const drain = `소진 ${msg.drainS < 0 ? DASH : formatDuration(msg.drainS)}`;
  const locked = msg.lockState === 1;

  let lead: string | null = null;
  let head: Array<string | null>;
  if (locked) {
    lead = `${auction ? `${auction} · ` : ""}잠김 ${formatDuration(msg.lockElapsedS)}`;
    head = [remain, wall, drain];
  } else if (msg.lockState === 2) {
    head = [auction, "깨짐", remain, wall, drain];
  } else {
    head = [
      auction,
      `미도달 (${formatRatePct(msg.rateBp)})`,
      wall,
      `상한가 ${msg.upperPx === 0 ? DASH : formatGroup(msg.upperPx)}`,
    ];
  }

  const flow = locked
    ? `신규 ${msg.new10s > 0 ? `+${formatGroup(msg.new10s)}` : "0"} / 취소 ${msg.cancel10s > 0 ? `-${formatGroup(msg.cancel10s)}` : "0"}`
    : `체결 ${formatGroup(msg.sellLed10s + msg.buyLed10s)}주`;
  const prob =
    msg.modelState === 1 && msg.pBreakBp >= 0 ? `깨짐확률 ${formatBpPct1(msg.pBreakBp)}%` : "깨짐확률 관찰 중";

  const body = [
    ...head,
    `10초 ${tenSecondLead(msg).text}`,
    flow,
    `창구 ${memberShareText("매수", msg.memberBuy)} / ${memberShareText("매도", msg.memberSell)}`,
    prob,
  ]
    .filter((p): p is string => p !== null)
    .join(" · ");
  return { lead, body };
}
