/**
 * Phase 28 (28-01) — 상한가 특징 85 표시 순수 함수 (카드 탭 「상한가」 9칸 · 탭 제목 접미).
 *
 * WinForms `BuildLimitFeatureCells` · `FormatEok` · `FormatDuration` 동형(gh-trade LimitChaserForm.cs 3738-3866) —
 * 서버 값 그대로 · **단위 변환 · 비율만** 한다(D-19). .NET 의 「0 에서 먼 쪽」 반올림(`ToString("N1")` ·
 * `"+0.0;-0.0;0.0"`)을 정수 산술로 재현한다 — JS `toFixed` 는 이진 근사값으로 반올림해 115,000,000원을
 * 「1.1억」 으로 적는다(WinForms 「1.2억」 · RESEARCH Pitfall 6).
 *
 * 색은 tone 으로만 돌려준다 — CSS 변수 적용은 컴포넌트 책임이다(`limit-up-format.ts` 규율).
 * 10초 · 창구 행(칸 4~9)은 28-07 이 채운다 — 이 플랜에서는 「—」(faint)다.
 */

import type { RelayLimitFeatureMsg } from "./relay";

/** 칸 색 축 — `--up` · `--down` · `--fg` · `--muted-fg` · `--faint`. */
export type LimitFeatureTone = "up" | "down" | "fg" | "muted" | "faint";

/** 9칸 표의 칸 1개. */
export type LimitFeatureCell = {
  text: string;
  tone: LimitFeatureTone;
  /** 600 굵기 — 지금 행 「잠김 N초째」 만. */
  strong: boolean;
  /** 폰 밴드 문구(28-07 이 10초 행에서 채운다). null = 모든 밴드에서 `text`. */
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

  // 10초 · 창구 행 — 28-07 이 WinForms 갈래(우세 % 짝수 반올림 · 잔량 신규/취소 · 창구명 · 깨짐확률)로 채운다.
  const rest = Array.from({ length: 6 }, () => ({ ...EMPTY_CELL }));
  return [...now, ...rest];
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
