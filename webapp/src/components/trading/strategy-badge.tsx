import type { RelayExchange, RelayLimitChaser } from "@gh-radar/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Phase 16 Plan 11 — 전략 상태 배지 6종 + 거래소 태그 2종의 **단일 정의 지점**
 * (16-UI-SPEC §전략 상태 배지 6종 · N7).
 *
 * ⚠️ **에코의 `buyEnabled`/`sellEnabled` 는 설정값이 아니라 무장(armed) 상태다.**
 *    서버는 `cfg.buyEnabled && buyArmed` 를 실어 보낸다. 발주가 나가 게이트가 소진되면
 *    `false` 로 온다 — 「내가 켰는데 서버가 껐다」가 아니라 **「발주가 나갔다」**는 뜻이다
 *    (16-RESEARCH Pitfall 10). 그래서 `buyEnabled === false` 하나로 「꺼짐」을 그리면
 *    사용자는 자기 스위치가 임의로 꺼졌다고 읽는다. 직전 발주 이력(`hadOrder`)이 있으면
 *    **「발주됨」**으로 문구를 갈라 준다.
 *
 * ⚠️ **「꺼짐」류 배지를 만들지 않는다.** 매수·매도·취소 게이트가 전부 꺼지면 서버가
 *    `crud:"D"` 로 정규화해 전략 자체가 목록에서 사라진다(D-08). 즉 「전부 꺼진 전략」은
 *    화면에 존재할 수 없으므로, 그 상태를 위한 배지를 두면 영원히 렌더되지 않는 죽은
 *    분기가 남는다. 단위 테스트가 라벨 표에 그런 값이 끼어들지 않는지 감시한다.
 *
 * **색·형태·텍스트 3중**(WCAG 1.4.1) — 색만으로 구분하지 않는다. 채운 도트 / 속 빈 도트
 * 가 형태 축이고, 배지 텍스트만으로도 상태가 읽힌다.
 *
 * 이 파일이 「단일 지점」인 이유: 같은 배지를 사이드바 VI 항목 · My page 전략 현황 행 ·
 * 상따 상태줄 3곳이 쓴다. `RELAY_STATE_LABELS` 가 연결 상태 문구를 계약 한 곳에 둔 것과
 * 같은 규율이다 — 표면마다 매핑을 다시 쓰면 세 벌이 갈린다.
 */

/** 배지 종류. 거래소 태그는 KRX/NXT 가 **시각이 다르므로**(테두리형 / 채움) 종류를 나눈다. */
export type StrategyBadgeKind =
  | "buyOn"
  | "fired"
  | "sellWait"
  | "sellWatch"
  | "viRun"
  | "viStop"
  | "exchangeKrx"
  | "exchangeNxt";

/** 렌더 단위 1건. `label` 을 값으로 들고 다녀 소비자가 문구를 다시 만들지 않게 한다. */
export interface StrategyBadgeItem {
  kind: StrategyBadgeKind;
  label: string;
}

/** 배지 문구 정본. UI-SPEC §전략 상태 배지 6종 표 그대로. */
export const STRATEGY_BADGE_LABELS: Record<StrategyBadgeKind, string> = {
  buyOn: "매수ON",
  fired: "발주됨",
  sellWait: "매도대기",
  sellWatch: "매도감시",
  viRun: "가동",
  viStop: "중지",
  exchangeKrx: "KRX",
  exchangeNxt: "NXT",
};

/** 도트 형태 — 색 없이도 상태가 갈리는 **형태 축**이다. */
type DotShape = "solid" | "hollow" | "none";

interface BadgeStyle {
  /** `ui/badge.tsx` variant. */
  variant: "up" | "down" | "secondary" | "outline";
  dot: DotShape;
  /** 도트 색 토큰. `none` 이면 쓰이지 않는다. */
  dotToken: string;
  /** `variant` 만으로 표현되지 않는 보정(중립 배지의 `--muted` 면 등). */
  extra?: string;
}

/** 중립(회색) 배지 3종이 공유하는 면. `variant="flat"` 는 `--flat` 을 쓰므로 쓰지 않는다. */
const NEUTRAL_FACE = "bg-[var(--muted)] text-[var(--muted-fg)] border-transparent";

const BADGE_STYLES: Record<StrategyBadgeKind, BadgeStyle> = {
  buyOn: { variant: "up", dot: "solid", dotToken: "var(--up)" },
  fired: {
    variant: "secondary",
    dot: "solid",
    dotToken: "var(--muted-fg)",
    extra: NEUTRAL_FACE,
  },
  sellWait: {
    variant: "secondary",
    dot: "hollow",
    dotToken: "var(--muted-fg)",
    extra: NEUTRAL_FACE,
  },
  sellWatch: { variant: "down", dot: "solid", dotToken: "var(--down)" },
  viRun: { variant: "up", dot: "solid", dotToken: "var(--up)" },
  viStop: {
    variant: "secondary",
    dot: "hollow",
    dotToken: "var(--muted-fg)",
    extra: NEUTRAL_FACE,
  },
  exchangeKrx: {
    variant: "outline",
    dot: "none",
    dotToken: "",
    extra: "text-[var(--muted-fg)]",
  },
  exchangeNxt: {
    variant: "secondary",
    dot: "none",
    dotToken: "",
    extra: NEUTRAL_FACE,
  },
};

/** 배지 1건을 만든다. 문구를 호출부가 짓지 않게 하는 유일한 생성구다. */
function makeBadge(kind: StrategyBadgeKind): StrategyBadgeItem {
  return { kind, label: STRATEGY_BADGE_LABELS[kind] };
}

/**
 * 상따 전략 1건 → 상태 배지 목록 (**순수 함수**).
 *
 * `hadOrder` 는 「직전에 매수 발주가 나간 적이 있는가」다. 와이어 필드가 아니라 화면이
 * 주문 통보(51)로 아는 사실이라 호출부가 넘긴다. 없으면 「발주됨」을 만들지 않는다 —
 * 한 번도 발주된 적 없는 전략을 「발주됨」으로 쓰면 거짓말이 된다.
 *
 * 순서는 **매수 → 매도** 고정이다. 사이드바 원 아이콘의 좌=매수·우=매도 배치와 같은
 * 축이라, 두 표면을 오갈 때 눈이 다시 학습하지 않는다.
 */
export function strategyBadgesOf(
  item: RelayLimitChaser & { hadOrder?: boolean },
): StrategyBadgeItem[] {
  const out: StrategyBadgeItem[] = [];

  if (item.buyEnabled) {
    out.push(makeBadge("buyOn"));
  } else if (item.hadOrder === true) {
    // 무장이 풀린 이유가 「발주」임을 아는 유일한 경우다 (Pitfall 10).
    out.push(makeBadge("fired"));
  }

  // 래치가 섰으면 무장 여부와 무관하게 「매도감시」가 이긴다 — 진입 확인이 끝났다는
  // 사실이 대기 여부보다 상위 정보다.
  if (item.sellEntryLatched) {
    out.push(makeBadge("sellWatch"));
  } else if (item.sellEnabled) {
    out.push(makeBadge("sellWait"));
  }

  return out;
}

/** VI 가동/중지 배지 (**순수 함수**). VI 는 계좌당 1건이라 배열이 아니라 1건이다. */
export function viBadgeOf(run: boolean): StrategyBadgeItem {
  return makeBadge(run ? "viRun" : "viStop");
}

/** 거래소 태그 (**순수 함수**). 상태가 아니라 분류라 도트가 없다. */
export function exchangeBadgeOf(exchange: RelayExchange): StrategyBadgeItem {
  return makeBadge(exchange === "NXT" ? "exchangeNxt" : "exchangeKrx");
}

export interface StrategyBadgeProps {
  badge: StrategyBadgeItem;
  className?: string;
}

/**
 * 배지 1건 렌더. 도트는 `aria-hidden` — 텍스트가 이미 상태를 말하므로 스크린리더가
 * 형태를 두 번 읽을 이유가 없다.
 */
export function StrategyBadge({ badge, className }: StrategyBadgeProps) {
  const style = BADGE_STYLES[badge.kind];

  return (
    <Badge
      variant={style.variant}
      data-slot="strategy-badge"
      data-kind={badge.kind}
      className={cn("gap-1 px-[5px]", style.extra, className)}
    >
      {style.dot !== "none" && (
        <span
          aria-hidden="true"
          data-dot={style.dot}
          className={cn(
            "block shrink-0 rounded-full",
            style.dot === "solid" ? "size-[5px]" : "size-[7px] border-[1.5px]",
          )}
          style={
            style.dot === "solid"
              ? { background: style.dotToken }
              : { background: "transparent", borderColor: style.dotToken }
          }
        />
      )}
      {badge.label}
    </Badge>
  );
}
