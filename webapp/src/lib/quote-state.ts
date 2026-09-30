/**
 * 상태줄 배지 2축 — 「시세」 · 「주문」 필 판정 (Phase 26 D-01 · D-04 · 26-13 채택안 안 B 점형).
 *
 * 정본: `.planning/phases/26-shared-quote-feed/reference/quote-badge-mockup.html` 머리 주석
 * 「26-14 정본 목록」. 문구 · 톤을 이 파일 밖에서 다시 짓지 않는다 — 작업대 상태줄
 * (`workbench-status-bar.tsx`)과 My page 상태줄(`me-client.tsx` MeStatusBar)이 **이 두 함수만** 부른다
 * (`queuedWindowBadgeOf` 선례 · D-36 사상 — 같은 상태가 화면마다 두 이름을 갖지 않게).
 *
 * ① 두 축은 원천이 다르다 (D-01)
 *   시세 = relay 시세 전용 공유 연결(`quote.state` 프레임) · 주문 = 사용자 DMA 세션(`state` 프레임 →
 *   `status` · `statusLabel`). 시세만 끊기면 시세 필만 적색이고 주문 필은 자기 상태를 그대로 말한다.
 *
 * ② ★ 시세 모름(`quoteState === null`)이면 필이 **없다**
 *   relay 가 quote 연결을 모르면(비활성 · 판정 전) 프레임을 보내지 않는다. 「live」 로도 「down」 으로도
 *   위장하지 않는다(journal.state 규율 · 거짓 확정 금지). 구독 한도가 와 있어도 필이 없으면 title 도 없다.
 *
 * ③ ★ stale 표식은 이 필 하나뿐이다 (D-04)
 *   down 이어도 호가 · 체결 숫자는 흐리지도 비우지도 않는다(`isStale` 판정 불변). 끊긴 시각은 `since`
 *   (ISO) → KST `HH:MM:SS` 로 이 필에만 싣는다. 파싱할 수 없는 값은 시각 없이 「멈춤」 — 받은 문자열을
 *   그대로 그리지 않는다(T-26-25).
 *
 * ④ 보이는 상태어는 **이상할 때만** 붙는다 (안 B)
 *   정상이면 「● 시세」 · 「● 주문」 뿐이다. 점은 `aria-hidden` 이라 스크린리더에는 `srDetail`
 *   (「실시간」 — `RELAY_STATE_LABELS.ready` 재사용)을 `sr-only` 로 붙인다. 새 문구가 아니다.
 *
 * ⑤ 구독 한도는 칩이 아니라 시세 필 `title` 이다 (안 B · 메모 ③)
 *   `subLimit` 최신 1건만. 종목명의 원천은 호출부의 라벨(`IsinLabel`)이고, 모르면 ISIN 원문을 쓴다
 *   (`isin-labels.ts` (a) — 지어내지 않는다). 계좌 · 사용자 식별자는 싣지 않는다(T-26-26).
 */

import { RELAY_STATE_LABELS, formatKstMs } from "@gh-radar/shared";
import type { RelayQuoteStateMsg, RelaySubLimitMsg } from "@gh-radar/shared";

import type { IsinLabel } from "@/lib/isin-labels";
import type { RelayStatus } from "@/lib/use-relay-socket";

/** 시세 필 — 필 하나가 그릴 전부. */
export interface QuotePill {
  /** 점 · 상태어 톤. `ok` = `--led-armed` · `down` = `--destructive`. */
  tone: "ok" | "down";
  /** 접두 — 늘 「시세」(`--muted-fg`). */
  label: "시세";
  /** 보이는 상태어(굵게). live 면 없다 · down 이면 「HH:MM:SS~ 멈춤」 또는 「멈춤」. */
  detail: string | null;
  /** 보이는 상태어가 없을 때만 — 스크린리더용 상태어(`sr-only`). */
  srDetail: string | null;
  /** 구독 한도 문구(`subLimit` 최신 1건). 없으면 null → title 없음. */
  title: string | null;
}

/** 주문 필 — 기존 DMA 필 자리(`data-slot="workbench-dma"`). */
export interface OrderPill {
  /** `ok` = `--led-armed` · `off` = `--flat`. */
  tone: "ok" | "off";
  /** 접두 — 늘 「주문」. */
  label: "주문";
  /** 보이는 상태어(굵게). ready 면 없다. */
  detail: string | null;
  /** 보이는 상태어가 없을 때만 — 스크린리더용 상태어. */
  srDetail: string | null;
  /** 진행 상태(첫 연결 · 로그인 · 계좌 확인)면 점멸. */
  pulse: boolean;
}

/** 점멸 도트를 쓰는 진행 상태 — 옛 상따 · VI 상태줄과 같은 집합이다. */
const PROGRESS_STATES: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  "idle",
  "connecting",
  "logging_in",
  "declaring",
]);

/** 사용자당 구독 한도(D-15) · 시세 공유 연결 업스트림 키 한도(D-11). 문구 전용 — 판정은 relay 몫이다. */
const USER_SUB_LIMIT = 200;
const GLOBAL_SUB_LIMIT = 2000;

/** ISO → KST `HH:MM:SS`. 파싱할 수 없으면 null(③). */
function kstClockOf(since: string | undefined): string | null {
  if (since === undefined || since === "") return null;
  const ms = Date.parse(since);
  if (!Number.isFinite(ms)) return null;
  return formatKstMs(ms).slice(0, 8);
}

/** 「{종목}({코드} · {거래소})」 — 모르는 조각은 빼고, 이름을 모르면 ISIN 원문(⑤). */
function subjectOf(limit: RelaySubLimitMsg, label: IsinLabel | undefined): string {
  const name = label?.name !== undefined && label.name !== "" ? label.name : undefined;
  const code = label?.code !== undefined && label.code !== "" ? label.code : undefined;
  const head = name ?? code ?? limit.i;
  const paren = name !== undefined && code !== undefined ? `${code} · ${limit.x}` : limit.x;
  return `${head}(${paren})`;
}

function subLimitTitleOf(limit: RelaySubLimitMsg, label: IsinLabel | undefined): string {
  const subject = subjectOf(limit, label);
  return limit.scope === "user"
    ? `구독 한도 — 내 구독 종목이 ${USER_SUB_LIMIT}개에 닿아 ${subject} 시세를 받지 못했어요. 쓰지 않는 카드를 닫으면 다시 받을 수 있어요.`
    : `구독 한도 — 시세 공유 연결이 전체 ${GLOBAL_SUB_LIMIT}종목에 닿아 ${subject} 시세를 받지 못했어요.`;
}

/**
 * 시세 필 판정 — 상태줄 두 곳의 단일 원천(①~⑤).
 *
 * @param subject `subLimit.i` 의 표시 라벨(종목명 · 단축코드). 모르면 생략.
 */
export function quotePillOf(
  quoteState: RelayQuoteStateMsg | null,
  subLimit: RelaySubLimitMsg | null,
  subject?: IsinLabel,
): QuotePill | null {
  if (quoteState === null) return null;
  const title = subLimit === null ? null : subLimitTitleOf(subLimit, subject);
  if (quoteState.s === "live") {
    return { tone: "ok", label: "시세", detail: null, srDetail: RELAY_STATE_LABELS.ready, title };
  }
  const clock = kstClockOf(quoteState.since);
  return {
    tone: "down",
    label: "시세",
    detail: clock === null ? "멈춤" : `${clock}~ 멈춤`,
    srDetail: null,
    title,
  };
}

/**
 * 주문 필 판정 — 사용자 DMA 세션 상태(①). ready 면 상태어 없음, 그 밖은 `RELAY_STATE_LABELS` 문구
 * (idle 첫 페인트의 빈 라벨은 `connecting` 문구로 읽는다).
 */
export function orderPillOf(status: RelayStatus, statusLabel: string): OrderPill {
  if (status === "ready") {
    return { tone: "ok", label: "주문", detail: null, srDetail: RELAY_STATE_LABELS.ready, pulse: false };
  }
  return {
    tone: "off",
    label: "주문",
    detail: statusLabel === "" ? RELAY_STATE_LABELS.connecting : statusLabel,
    srDetail: null,
    pulse: PROGRESS_STATES.has(status),
  };
}
