"use client";

/**
 * LimitChaserDefaultsSection — `/me` 「상따 기본설정」 섹션 (Phase 27 D-10 · D-12 · D-13 · 인박스 Q1/Q2 ·
 * 채택 목업 `reference/mockup-user-settings.html` 변형 C).
 *
 * ① 자리(D-10): 계정 카드 → 상태줄 → **이 섹션** → 전략 현황. DMA 게이트 화면에는 그리지 않는다(84 가 올 수 없다).
 *    상따 화면에는 진입점을 두지 않는다(⚙ 진입점은 Deferred).
 *
 * ② 값의 원천은 84 캐시(`useRelayContext().userSettings`) 하나다 — 3상태(77 `queuedWindow` 규율):
 *    - `undefined` = 84 를 아직 못 받았다 → 「불러오는 중」 · 행 흐림 · 편집 불가. 기본값을 지어내지 않는다.
 *    - `present: true`  = 서버 저장값 → 「서버 저장값」(ok).
 *    - `present: false` = 저장값 없음 → 「서버 저장값 없음 · 내장 기본값」(warn). 84 가 실은 내장 기본값을 그대로
 *      보이고, **42 를 자동으로 보내지 않는다**(인박스 Q2 — 이전 없음). 사용자가 행을 확정할 때만 42.
 *
 * ③ 행 문법은 상따 카드와 같다 — 「라벨 ─ 값 ›」 44px `SettingRow` · 방법 기본값은 27-04 `ChoiceRow`.
 *    새 입력 컴포넌트를 만들지 않는다. 카드 행의 폭 규칙(쉐브런 · 좌우 패딩)이 `@container/lc` 를 재므로 행 목록에
 *    같은 컨테이너 선언을 단다(`LC_CONTAINER_CLASS` — 문자열 재기재 금지).
 *
 * ④ 문구는 목업 원문 그대로다(D-13) — 칩 3 · 안내 3 은 `USER_SETTINGS_STATUS_TEXT` 한 곳.
 */

import {
  AUTO_SELL_METHOD_LABELS,
  AUTO_SELL_METHOD_ORDER,
  type RelayUserSettingsMsg,
  type RelayUserSettingsValues,
} from "@gh-radar/shared";

import { CARD } from "@/components/layout/page-layout";
import { LC_CONTAINER_CLASS } from "@/components/trading/card/strategy-card";
import { ChoiceRow, SettingRow } from "@/components/trading/lc/setting-group";
import type { PadUnit } from "@/lib/numpad";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";

export type UserSettingsKey = keyof RelayUserSettingsValues;

export type UserSettingsGroup = "매수 금액" | "후매수" | "매도" | "자동매도";

export interface UserSettingsRowSpec {
  key: UserSettingsKey;
  label: string;
  /** 숫자 행 단위 — 방법 기본값(3택)은 `null`. */
  unit: PadUnit | null;
  group: UserSettingsGroup;
  /** 행 식별자(`data-lc-field`) — `me-lc-` + 키 kebab. */
  id: string;
}

/** 묶음 순서(D-13 · 목업 `GROUPS`). */
export const USER_SETTINGS_GROUPS: readonly UserSettingsGroup[] = ["매수 금액", "후매수", "매도", "자동매도"];

/**
 * 11행 표(목업 `F` · `GROUPS` 그대로 · 금액 3칸은 만원 — 인박스 Q1). 순서 = 화면 순서. 범위는 여기 두지 않는다 —
 * shared `USER_SETTINGS_RANGES`(서버 42 범위 정본) 하나를 읽는다.
 */
export const USER_SETTINGS_ROWS: readonly UserSettingsRowSpec[] = [
  { key: "preBuyAmount", label: "선매수 금액", unit: "만원", group: "매수 금액", id: "me-lc-pre-buy-amount" },
  { key: "addBuyAmount", label: "추가매수 금액", unit: "만원", group: "매수 금액", id: "me-lc-add-buy-amount" },
  { key: "postBuyAmount", label: "후매수 금액", unit: "만원", group: "매수 금액", id: "me-lc-post-buy-amount" },
  { key: "postBuyMaxCount", label: "후매수 최대", unit: "회", group: "후매수", id: "me-lc-post-buy-max-count" },
  { key: "postBuyFloorQty", label: "후매수 하한잔량", unit: "주", group: "후매수", id: "me-lc-post-buy-floor-qty" },
  { key: "postBuyReboundPct", label: "후매수 반등", unit: "%", group: "후매수", id: "me-lc-post-buy-rebound-pct" },
  { key: "sellQtyTrackRatio", label: "매도 잔량추적", unit: "%", group: "매도", id: "me-lc-sell-qty-track-ratio" },
  { key: "autoSellPeriodSec", label: "매도 주기", unit: "초", group: "자동매도", id: "me-lc-auto-sell-period-sec" },
  {
    key: "auctionSellRatioPct",
    label: "동시호가 매도비율",
    unit: "%",
    group: "자동매도",
    id: "me-lc-auction-sell-ratio-pct",
  },
  {
    key: "autoSellRatioDefaultPct",
    label: "비율 기본값",
    unit: "%",
    group: "자동매도",
    id: "me-lc-auto-sell-ratio-default-pct",
  },
  {
    key: "autoSellMethodDefault",
    label: "방법 기본값",
    unit: null,
    group: "자동매도",
    id: "me-lc-auto-sell-method-default",
  },
];

export type UserSettingsStatus = "loading" | "present" | "absent";

/** 칩 · 안내 원문(D-13 · 목업 `section()` 그대로). */
export const USER_SETTINGS_STATUS_TEXT: Readonly<Record<UserSettingsStatus, { chip: string; note: string }>> = {
  loading: { chip: "불러오는 중", note: "DMA 세션이 준비되면 서버 설정(84)을 불러와요" },
  present: {
    chip: "서버 저장값",
    note: "새 전략 폼의 기본값이에요 · 매도 주기 · 동시호가 비율은 서버가 다음 주기부터 바로 써요",
  },
  absent: {
    chip: "서버 저장값 없음 · 내장 기본값",
    note: "아직 저장한 적이 없어요 · 저장하면 이 사용자(DMA 계정)의 모든 화면에 적용돼요",
  },
};

/** 칩 톤 — 목업 `.chip.ok/.warn` 결을 기존 LED 토큰으로(새 색 토큰 0). */
const CHIP_TONE_CLASS: Readonly<Record<UserSettingsStatus, string>> = {
  loading: "bg-[var(--muted)] text-[var(--muted-fg)]",
  present: "bg-[color-mix(in_srgb,var(--led-armed)_16%,transparent)] text-[var(--led-armed)]",
  absent: "bg-[color-mix(in_srgb,var(--led-latent)_18%,transparent)] text-[var(--led-latent)]",
};
const CHIP_TONE_ATTR: Readonly<Record<UserSettingsStatus, string>> = {
  loading: "loading",
  present: "ok",
  absent: "warn",
};

const METHOD_OPTIONS = AUTO_SELL_METHOD_ORDER.map((value) => ({
  value,
  label: AUTO_SELL_METHOD_LABELS[value] ?? String(value),
}));

export function userSettingsStatusOf(s: RelayUserSettingsMsg | undefined): UserSettingsStatus {
  if (s === undefined) return "loading";
  return s.present ? "present" : "absent";
}

export function LimitChaserDefaultsSection() {
  const { userSettings } = useRelayContext();
  const status = userSettingsStatusOf(userSettings);
  const loading = userSettings === undefined;
  const text = USER_SETTINGS_STATUS_TEXT[status];

  return (
    <section
      data-slot="me-lc-defaults"
      aria-labelledby="me-lc-defaults-title"
      className={cn(CARD, "flex min-w-0 flex-col px-2.5 pt-3 pb-1.5")}
    >
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-2 gap-y-1 px-1.5 pb-1.5">
        <h2 id="me-lc-defaults-title" className="text-[15px] font-semibold text-[var(--fg)]">
          상따 기본설정
        </h2>
        <span
          data-slot="me-lc-defaults-chip"
          data-tone={CHIP_TONE_ATTR[status]}
          className={cn(
            "rounded-full px-[7px] py-[2px] text-[11px] font-semibold whitespace-nowrap",
            CHIP_TONE_CLASS[status],
          )}
        >
          {text.chip}
        </span>
      </div>
      <p
        data-slot="me-lc-defaults-note"
        className="px-1.5 pt-0.5 pb-2 text-[12.5px] leading-[1.5] break-keep text-[var(--muted-fg)]"
      >
        {text.note}
      </p>

      <div
        data-slot="me-lc-defaults-rows"
        data-dim={loading ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        className={cn(LC_CONTAINER_CLASS, "min-w-0", loading && "opacity-45")}
      >
        {USER_SETTINGS_GROUPS.map((group) => (
          <div key={group} role="group" aria-label={group} className="min-w-0">
            <div
              data-slot="me-lc-defaults-group"
              className="px-1.5 pt-2.5 pb-0.5 text-[12px] font-semibold text-[var(--muted-fg)]"
            >
              {group}
            </div>
            {USER_SETTINGS_ROWS.filter((r) => r.group === group).map((row) => (
              <div key={row.key} data-slot="me-lc-defaults-row" data-label={row.label} className="min-w-0">
                {row.unit === null ? (
                  <ChoiceRow
                    id={row.id}
                    label={row.label}
                    value={userSettings?.[row.key] ?? 0}
                    options={METHOD_OPTIONS}
                    onSelect={() => {}}
                    a11yName={row.label}
                    description="새 전략의 자동매도 방법 초기값이에요"
                    disabled={loading}
                    segmentAlways
                  />
                ) : (
                  <SettingRow
                    id={row.id}
                    label={row.label}
                    unit={row.unit}
                    value={userSettings?.[row.key] ?? null}
                    disabled={loading}
                    editing={false}
                    onActivate={() => {}}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
