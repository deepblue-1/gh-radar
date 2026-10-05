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
 */

import { memberName } from "./member-codes";
import type { RelayLimitFeatureMember, RelayLimitFeatureMsg } from "./relay";

/** 칸 색 축 — `--up` · `--down` · `--fg` · `--muted-fg` · `--faint`. */
export type LimitFeatureTone = "up" | "down" | "fg" | "muted" | "faint";

/** 9칸 표의 칸 1개. */
export type LimitFeatureCell = {
  text: string;
  tone: LimitFeatureTone;
  /** 600 굵기 — 지금 행 「잠김 N초째」 만. */
  strong: boolean;
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

/** 행 머리 3개(WinForms `LimitFeatureTable.RowHeaders`) — 표 `<th>` 와 툴팁 줄 머리가 같은 글자를 쓴다. */
export const LIMIT_FEATURE_ROW_HEADERS = ["지금", "10초", "창구"] as const;

function cell(text: string, tone: LimitFeatureTone = "fg", strong = false): LimitFeatureCell {
  return { text, tone, strong, narrow: null };
}

const EMPTY_CELL: LimitFeatureCell = { text: DASH, tone: "faint", strong: false, narrow: null };

/**
 * 9칸(행 우선 — `row * 3 + col`: 지금 · 10초 · 창구). null(85 없음 · 아직 안 옴 · 구 서버 · 대상 밖 키 · 접힌 카드)이면
 * 9칸 모두 「—」(faint).
 *
 * 지금 행(WinForms 원문 갈래):
 *   - lock 1: 「잠김 {dur}째」(up · 600) · 「대기 {억}」 · 「소진 {dur}」(drain −1 → 「소진 —」)
 *   - lock 2: 「깨짐」 · 「대기 {억}」 · 「매도벽 {억}」(잘림 「+」)
 *   - 그 밖 : 「미도달 ({등락률})」 · 「매도벽 {억}」 · 「상한가 {원}」(upper 0 → 「상한가 —」)
 *   - 단일가: 칸 1 앞에 「단일가 · 」(같은 색 · 같은 굵기)
 */
export function limitFeatureCells(msg: RelayLimitFeatureMsg | null): LimitFeatureCell[] {
  if (msg === null) return Array.from({ length: 9 }, () => ({ ...EMPTY_CELL }));

  const wall = `매도벽 ${formatEok(msg.wallKrwVisible)}${msg.wallTruncated ? "+" : ""}`;
  let now: LimitFeatureCell[];
  if (msg.lockState === 1) {
    now = [
      cell(`잠김 ${formatDuration(msg.lockElapsedS)}째`, "up", true),
      cell(`대기 ${formatEok(msg.qKrw)}`),
      cell(`소진 ${msg.drainS < 0 ? DASH : formatDuration(msg.drainS)}`),
    ];
  } else if (msg.lockState === 2) {
    now = [cell("깨짐"), cell(`대기 ${formatEok(msg.qKrw)}`), cell(wall)];
  } else {
    now = [
      cell(`미도달 (${formatRatePct(msg.rateBp)})`),
      cell(wall),
      cell(`상한가 ${msg.upperPx === 0 ? DASH : formatGroup(msg.upperPx)}`),
    ];
  }
  if (msg.auction) now[0] = { ...now[0]!, text: `단일가 · ${now[0]!.text}` };

  // 10초 행 — 체결 우세(큰 쪽 비율 · 짝수 반올림) · 잠김 중 잔량 신규/취소, 그 밖 체결 합.
  const led = msg.sellLed10s + msg.buyLed10s;
  let lead: LimitFeatureCell;
  if (led === 0) lead = cell("체결 없음");
  else if (msg.sellLed10s > msg.buyLed10s) lead = cell(`매도 우세 ${roundPctHalfEven(msg.sellLed10s, led)}%`, "down");
  else if (msg.buyLed10s > msg.sellLed10s) lead = cell(`매수 우세 ${roundPctHalfEven(msg.buyLed10s, led)}%`, "up");
  else lead = cell("매수·매도 반반");
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
  return [...now, ...ten, ...win];
}

/** epoch ms → KST 「HH:mm:ss」(밀리초는 잘라낸다 — WinForms `FormatTimeKst(...).Substring(0, 8)`). 0 이하 → 「」. */
function formatTimeKstHms(epochMs: number): string {
  if (!(epochMs > 0)) return "";
  const sec = (((Math.floor((epochMs + 9 * 3_600_000) / 1000)) % 86_400) + 86_400) % 86_400;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(Math.trunc(sec / 3600))}:${p2(Math.trunc(sec / 60) % 60)}:${p2(sec % 60)}`;
}

/**
 * 표 툴팁(WinForms `ApplyLimitFeatureTable` 동형). 줄 3개 「{행 머리} {칸1} · {칸2} · {칸3}」(늘 **넓은 밴드 문구**) +
 * 4번째 줄 「HH:mm:ss 기준」(gwTimeMs KST) · 확률 적용 중(modelState 1 · pBreakBp ≥ 0 · pHorizonS > 0)이면
 * 「 · 깨짐확률은 N초 안」. 시각이 없으면 확률 꼬리만 「깨짐확률은 N초 안」 줄로. null(85 없음) → 「」.
 */
export function limitFeatureTooltip(msg: RelayLimitFeatureMsg | null): string {
  if (msg === null) return "";
  const cells = limitFeatureCells(msg);
  const lines = LIMIT_FEATURE_ROW_HEADERS.map(
    (h, r) => `${h} ${cells[r * 3]!.text} · ${cells[r * 3 + 1]!.text} · ${cells[r * 3 + 2]!.text}`,
  );
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

