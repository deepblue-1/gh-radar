"use client";

/**
 * WorkbenchStatusBar — `/trading` 작업대의 **상태줄** (UI-SPEC §레이아웃 계약 2 · §상태줄 문구표 ·
 * D-04 · D-05 · D-17 · D-22 · E1, TRADE-09). 정본은 채택 목업 `18-workbench-mockup.html`
 * `.stat`(마크업 `:729-740` · CSS `:258-270`).
 *
 * ① 옛 상따 상태줄(`limit-chaser-client.tsx` `StatusBar`)의 **페이지 축 부분**만 왔다
 *   DMA 필 · 반영 시각이 여기로 오고, 래치 LED 3칩은 18-06 이 **카드 헤더**로 가져갔다(판정 함수
 *   `latchLedStateOf` 는 하나 그대로다). 이 줄은 특정 전략을 말하지 않는다 — 페이지 전체
 *   (돌파 · VI 발동 · 거래 종목 · 77 구간 · 알림 · 단 수)를 말한다.
 *
 * ② ★ 이 파일은 **벽시계를 읽지 않는다** (D-22 · D-27)
 *   77 구간 배지는 `queuedWindowBadgeOf`(카드·호가 탭의 `affordanceOf` 와 같은 원천 `queuedWindow`)
 *   한 함수가 판정한다. `queuedWindow === undefined` = 「모름」 = **배지 없음** — 「정규」로
 *   위장하지 않는다. 「반영 시각」은 작업대가 서버 push 를 받은 시각을 문자열로 내려주고 여기서는
 *   그대로 쓴다(첫 push 전이면 「반영 —」).
 *
 * ③ ★ 단 수 세그먼트는 폰 밴드(page <700)에서 **DOM 에서 뺀다** (UI-SPEC §접근성 계약)
 *   `display:none` 만으로 숨기지 않는다 — 작업대가 `wb` 컨테이너 폭으로 판정한 `phoneBand` 가
 *   `true` 면 조건부 렌더로 빠진다. 폭을 아직 모르는 첫 페인트(`null`)에만 CSS 폴백
 *   (`hidden @min-[700px]/wb:inline-flex`)이 받친다. 폰 밴드 격자는 저장값과 무관하게 1단이다
 *   (격자 쪽 CSS 가 `data-cols` 를 700 이상에서만 적용한다).
 *
 * ④ 이 기기 전용 알림 2종이 나란히 선다 (Q-1 채택값)
 *   - 돌파 알림음(D-17) — 기본 꺼짐. 자동재생이 막혀 있으면 「클릭해 활성화」. `resumeToneContext`
 *     는 **클릭 핸들러 안에서만** 부른다(제스처 밖 `resume()` 은 브라우저가 무시한다).
 *   - VI 마감알림 — 옛 VI 카드의 스위치를 **옮긴 것**이다(기능 제거 0). 읽기/쓰기·권한 요청·거부
 *     사유 문구는 `vi-alert.ts` 경로 그대로이고, 거부되면 꺼진 채 사유를 인라인 `role="status"`
 *     로 말한다(조용한 실패 금지).
 *
 * ⑤ 오류 채널 (E1 error)
 *   relay 끊김/재연결은 DMA 필 **하나**가 말한다(● 색 + 라벨). 자동 재연결 중에는 버튼이 없다.
 *   자동 복구를 포기한 상태(작업대가 `onReconnect` 를 넘길 때)에만 「다시 연결」이 선다 — 18-10
 *   호가 탭 상태줄과 같은 규율. 주문·설정 오류는 이 줄이 아니라 해당 폼의 인라인 `role="status"` 몫이다.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Volume2, VolumeX } from "lucide-react";
import type { RelayAccount, RelayQueuedWindowMsg } from "@gh-radar/shared";
import { RELAY_STATE_LABELS } from "@gh-radar/shared";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isTonePlaybackBlocked, resumeToneContext } from "@/lib/alert-tone";
import {
  readTonePref,
  writeColsPref,
  writeTonePref,
  type TradingCols,
} from "@/lib/breakout-list";
import { queuedWindowBadgeOf } from "@/lib/queued-window";
import type { RelayStatus } from "@/lib/use-relay-socket";
import {
  readViAlertEnabled,
  requestViAlertPermission,
  writeViAlertEnabled,
} from "@/lib/vi-alert";
import { cn } from "@/lib/utils";

/** 임계·재무장 — UI-SPEC §상태줄 문구표 원문(서버 상수 `ThresholdPct 20` · 재무장 −2%p). */
export const WORKBENCH_THRESHOLD_TEXT = "임계 20% · 재무장 −2%p";

/** 계좌 필 `title` — 상태줄 계좌는 **신규 카드의 기본값**일 뿐이다(Q-3 채택값). */
export const ACCOUNT_PILL_TITLE =
  "새로 추가하는 카드의 기본 계좌예요 · 이미 있는 카드는 자기 계좌를 유지해요";

const COLS: readonly TradingCols[] = [1, 2, 3];

/** 점멸 도트를 쓰는 진행 상태 — 옛 상따·VI 상태줄과 같은 집합이다. */
const PROGRESS_STATES: ReadonlySet<RelayStatus> = new Set<RelayStatus>([
  "idle",
  "connecting",
  "logging_in",
  "declaring",
]);

export interface WorkbenchStatusBarProps {
  status: RelayStatus;
  statusLabel: string;
  /** 돌파 스트립이 **실제로 그린** 행 수(지운·이탈 행 제외) — 스트립과 같은 값이어야 한다. */
  breakoutCount: number;
  /** 30초 강조 중인 신규 돌파 수. 0 이면 「신규」 필이 없다. */
  breakoutNewCount: number;
  viCount: number;
  /** 미확인(접수 ∧ 미체크) VI 주문 수. 0 이면 「미확인」 필이 없다. */
  viUnconfirmedCount: number;
  cardCount: number;
  /** 77 창 힌트. `undefined` = 모름 → 배지 없음(②). */
  queuedWindow: RelayQueuedWindowMsg | undefined;
  /** 서버 push 반영 시각 `HH:MM:SS`. `null` = 아직 없음 → 「반영 —」. */
  appliedAt: string | null;
  cols: TradingCols;
  onColsChange: (cols: TradingCols) => void;
  /** 페이지(`wb`) 폭이 폰 밴드인가. `true` 면 세그먼트를 DOM 에서 뺀다. `null` = 아직 모름(③). */
  phoneBand: boolean | null;
  /** VI 마감알림 토글이 바뀌었다(작업대가 마감 타이머를 건다/푼다). */
  onViAlertChange?: (on: boolean) => void;
  /** 자동 복구를 포기한 상태에서만 넘긴다 — 있으면 「다시 연결」(⑤). */
  onReconnect?: () => void;
  className?: string;
}

export function WorkbenchStatusBar({
  status,
  statusLabel,
  breakoutCount,
  breakoutNewCount,
  viCount,
  viUnconfirmedCount,
  cardCount,
  queuedWindow,
  appliedAt,
  cols,
  onColsChange,
  phoneBand,
  onViAlertChange,
  onReconnect,
  className,
}: WorkbenchStatusBarProps) {
  const label = statusLabel === "" ? RELAY_STATE_LABELS.connecting : statusLabel;
  const badge = queuedWindowBadgeOf(queuedWindow);

  const pickCols = (value: string) => {
    const next = value === "2" ? 2 : value === "3" ? 3 : value === "1" ? 1 : null;
    // single 그룹은 선택된 항목을 다시 누르면 빈 값을 알린다 — 단 수가 「없음」인 격자는 없다.
    if (next === null) return;
    writeColsPref(next);
    onColsChange(next);
  };

  return (
    <div
      data-slot="workbench-status-bar"
      data-status={status}
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-1.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]",
        className,
      )}
    >
      <span data-slot="workbench-dma" aria-live="polite" className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span
          aria-hidden="true"
          data-tone={status === "ready" ? "ok" : "off"}
          className={cn(
            "block size-[7px] shrink-0 rounded-full",
            status === "ready" ? "bg-[var(--led-armed)]" : "bg-[var(--flat)]",
            PROGRESS_STATES.has(status) && "animate-pulse motion-reduce:animate-none",
          )}
        />
        DMA <b className="font-semibold text-[var(--fg)]">{label}</b>
      </span>

      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span data-testid="stat-breakout">
          돌파 <b className="font-semibold text-[var(--fg)]">{breakoutCount}</b>
        </span>
        {breakoutNewCount > 0 && <NewPill>신규 {breakoutNewCount}</NewPill>}
      </span>

      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span data-testid="stat-vi">
          VI 발동 <b className="font-semibold text-[var(--fg)]">{viCount}</b>
        </span>
        {viUnconfirmedCount > 0 && <NewPill>미확인 {viUnconfirmedCount}</NewPill>}
      </span>

      <span data-testid="stat-cards" className="whitespace-nowrap">
        거래 종목 <b className="font-semibold text-[var(--fg)]">{cardCount}</b>
      </span>

      <span className="whitespace-nowrap">{WORKBENCH_THRESHOLD_TEXT}</span>

      {badge !== null && (
        <span
          data-slot="workbench-window-badge"
          data-tone={badge.tone}
          className={cn(
            "inline-flex h-[18px] items-center rounded-full border px-[7px] text-[10px] font-bold whitespace-nowrap",
            badge.tone === "regular" && "border-[var(--border)] bg-[var(--card)] text-[var(--fg)]",
            badge.tone === "queued" && "border-[var(--new-bd)] bg-[var(--new-bg)] text-[var(--fg)]",
            badge.tone === "offhours" &&
              "border-transparent bg-[var(--accent)] text-[var(--accent-fg)]",
          )}
        >
          {badge.text}
        </span>
      )}

      <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        <span data-slot="workbench-alerts" className="inline-flex items-center gap-1">
          <ViAlertToggle onChange={onViAlertChange} />
          <ToneToggle />
        </span>
        {onReconnect !== undefined && (
          <Button variant="outline" size="sm" className="h-6 px-2" onClick={onReconnect}>
            다시 연결
          </Button>
        )}
        <span data-testid="stat-applied" className="mono whitespace-nowrap">
          반영 {appliedAt ?? "—"}
        </span>
        {phoneBand !== true && (
          <ToggleGroup
            type="single"
            value={String(cols)}
            onValueChange={pickCols}
            aria-label="카드 단 수"
            data-slot="workbench-cols-segment"
            className={cn(
              "h-6 gap-0 overflow-hidden rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)]",
              // 폭을 아직 모르는 첫 페인트만 CSS 가 받친다(③). 판정이 나면 위 조건부 렌더가 정본이다.
              phoneBand === null && "hidden @min-[700px]/wb:inline-flex",
            )}
          >
            {COLS.map((c) => (
              <ToggleGroupItem
                key={c}
                value={String(c)}
                className="h-6 min-w-0 rounded-none bg-transparent px-[9px] text-[11px] font-semibold text-[var(--muted-fg)] not-first:border-l not-first:border-[var(--border)] data-[state=on]:bg-[var(--accent)] data-[state=on]:text-[var(--accent-fg)]"
              >
                {c}단
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </span>
    </div>
  );
}

/** 「신규 M」·「미확인 M」 필 — 목업 `.newpill`. 색만이 아니라 **텍스트**가 말한다. */
function NewPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded-full border border-[var(--new-bd)] bg-[var(--new-bg)] px-[7px] text-[10px] font-bold whitespace-nowrap text-[var(--fg)]">
      {children}
    </span>
  );
}

const ALERT_BTN =
  "inline-flex h-6 items-center gap-1 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] hover:bg-[var(--muted)] aria-pressed:border-[var(--primary)] aria-pressed:text-[var(--fg)]";

/**
 * 돌파 알림음 토글 (D-17 · ④). 기본 꺼짐.
 *
 * - 꺼짐 → 클릭: 켜고 **그 클릭 안에서** 오디오 컨텍스트를 만들어 `resume()` 한다.
 * - 켜짐 ∧ 차단 → 클릭: 끄지 않는다. 활성화(`resume()`)만 한다 — 「클릭해 활성화」가 약속한 일이다.
 * - 켜짐 ∧ 정상 → 클릭: 끈다.
 */
function ToneToggle() {
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // 저장값·차단 상태는 마운트 후에 읽는다 — SSR HTML 과 첫 클라 렌더가 갈리면 하이드레이션이 깨진다.
  useEffect(() => {
    setOn(readTonePref() === "on");
    setBlocked(isTonePlaybackBlocked());
  }, []);

  const activate = useCallback(() => {
    void resumeToneContext().then(() => setBlocked(isTonePlaybackBlocked()));
  }, []);

  const onClick = () => {
    if (!on) {
      writeTonePref("on");
      setOn(true);
      activate();
      return;
    }
    if (blocked) {
      activate();
      return;
    }
    writeTonePref("off");
    setOn(false);
  };

  const needsGesture = on && blocked;
  const ariaLabel = needsGesture
    ? "돌파 알림음 — 클릭해 활성화 (이 기기만)"
    : on
      ? "돌파 알림음 끄기 (이 기기만)"
      : "돌파 알림음 켜기 (이 기기만)";

  return (
    <button
      type="button"
      data-slot="workbench-tone-toggle"
      aria-pressed={on}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={onClick}
      className={ALERT_BTN}
    >
      {on ? <Volume2 aria-hidden="true" className="size-3.5" /> : <VolumeX aria-hidden="true" className="size-3.5" />}
      {needsGesture ? "클릭해 활성화" : "알림음"}
    </button>
  );
}

/**
 * VI 마감알림 토글 (Q-1 · ④) — 옛 VI 카드 `AlertSwitch` 의 동작을 그대로 옮겼다.
 * 권한 요청은 **사용자가 켤 때만**. 거부되면 되돌리고 사유를 남긴다.
 */
function ViAlertToggle({ onChange }: { onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => setOn(readViAlertEnabled()), []);

  const onClick = async () => {
    if (on) {
      setOn(false);
      setReason(null);
      writeViAlertEnabled(false);
      onChange?.(false);
      return;
    }
    const result = await requestViAlertPermission();
    if (!result.ok) {
      setOn(false);
      setReason(result.reason);
      writeViAlertEnabled(false);
      onChange?.(false);
      return;
    }
    setOn(true);
    setReason(null);
    writeViAlertEnabled(true);
    onChange?.(true);
  };

  const ariaLabel = on ? "VI 마감 알림 끄기 (이 기기만)" : "VI 마감 알림 켜기 (이 기기만)";

  return (
    <>
      <button
        type="button"
        data-slot="workbench-vi-alert-toggle"
        aria-pressed={on}
        aria-label={ariaLabel}
        title="VI 해제 10초 전 브라우저 알림 (이 기기만)"
        onClick={() => void onClick()}
        className={ALERT_BTN}
      >
        {on ? <Bell aria-hidden="true" className="size-3.5" /> : <BellOff aria-hidden="true" className="size-3.5" />}
        마감알림
      </button>
      {reason !== null && (
        <span role="status" data-slot="workbench-vi-alert-reason" className="min-w-0 text-[11px] text-[var(--destructive)]">
          {reason}
        </span>
      )}
    </>
  );
}

export interface AccountPillProps {
  accounts: readonly RelayAccount[];
  accountNo: string;
  onChange: (accountNo: string) => void;
}

/**
 * 제목줄 계좌 필 (목업 `.acct` `:728`) — 상태줄 계좌 = **신규 카드의 기본 계좌**이자 VI 설정 2줄 ·
 * 공용 패널의 계좌 축이다(Q-2 · Q-3). 이미 등록된 카드는 자기 키의 계좌를 유지하며 이 값을 바꿔도
 * 움직이지 않는다 — 그 사실을 `title` 이 말한다.
 *
 * ★ 옛 상따 계좌 칩과 같은 네이티브 `<select>` 다(`appearance-none` 금지 — OS 선택 UI 를 잃는다).
 * ★ 계좌번호는 마스킹하지 않는다(D2 · S-5).
 */
export function AccountPill({ accounts, accountNo, onChange }: AccountPillProps) {
  return (
    <select
      data-slot="workbench-account"
      aria-label="계좌"
      title={ACCOUNT_PILL_TITLE}
      value={accountNo}
      onChange={(e) => onChange(e.target.value)}
      disabled={accounts.length === 0}
      className="mono h-[26px] max-w-full min-w-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--fg)] disabled:opacity-50"
    >
      {accounts.length === 0 ? (
        <option value="">계좌 확인 중…</option>
      ) : (
        accounts.map((a) => (
          <option key={a.accountNo} value={a.accountNo}>
            {a.accountNo} · {a.name}
          </option>
        ))
      )}
    </select>
  );
}
