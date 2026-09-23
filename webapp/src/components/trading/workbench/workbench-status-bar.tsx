"use client";

/**
 * WorkbenchStatusBar — `/trading` 작업대의 **상태줄** (UI-SPEC §레이아웃 계약 2 · §상태줄 문구표 ·
 * D-04 · D-05 · D-17 · D-22 · E1, TRADE-09). 정본은 채택 목업 `18-workbench-mockup.html`
 * `.stat`(마크업 `:729-740` · CSS `:258-270`).
 *
 * ① 옛 상따 상태줄(18-13 삭제 · `StatusBar`)의 **페이지 축 부분**만 왔다
 *   DMA 필 · 반영 시각이 여기로 오고, 래치 LED 3칩은 18-06 이 **카드 헤더**로 가져갔다(판정 함수
 *   `latchLedStateOf` 는 하나 그대로다). 이 줄은 특정 전략을 말하지 않는다 — 페이지의 **핵심만**
 *   말한다: DMA 연결 · 77 구간 배지(알 때만) · 알림음 아이콘 · 반영 시각 · 단 수(목업
 *   `260923-bjb-mockup.html` `.stat`). 목록 개수는 각 스트립의 칩이 이미 말하므로 여기 두 번 적지
 *   않는다.
 *
 * ② ★ 이 파일은 **벽시계를 읽지 않는다** (D-22 · D-27)
 *   77 구간 배지는 `queuedWindowBadgeOf`(카드·호가 탭의 `affordanceOf` 와 같은 원천 `queuedWindow`)
 *   한 함수가 판정한다. `queuedWindow === undefined` = 「모름」 = **배지 없음** — 「정규」로
 *   위장하지 않는다. 「반영 시각」은 작업대가 서버 push 를 받은 시각을 문자열로 내려주고 여기서는
 *   그대로 쓴다. 보이는 글자는 맨 `HH:MM:SS`(첫 push 전이면 「—」)이고, 「반영」 접두는 `sr-only` ·
 *   `title` 이 말한다.
 *
 * ③ ★ 단 수 세그먼트는 격자 1열 고정 폭(page <680)에서 **DOM 에서 뺀다** (UI-SPEC §접근성 계약)
 *   `display:none` 만으로 숨기지 않는다 — 작업대가 `wb` 컨테이너 폭으로 판정한 값(prop 이름은
 *   `phoneBand` 지만 뜻은 「격자 1열 고정」, §2.2b 「격자 열 수 경계」 680 — 카드 밴드 700 과 다르다)이
 *   `true` 면 조건부 렌더로 빠진다. 폭을 아직 모르는 첫 페인트(`null`)에만 CSS 폴백
 *   (`hidden @min-[680px]/wb:inline-flex`)이 받친다. 그 아래 격자는 저장값과 무관하게 1단이다
 *   (격자 쪽 CSS 가 `data-cols` 를 680 이상에서만 적용한다).
 *
 * ④ 이 기기 전용 알림 — 돌파 알림음(D-17)
 *   기본 꺼짐. 아이콘 전용 버튼이고 이름은 `aria-label` · `title` 이 말한다. 자동재생이 막혀 있을
 *   때만 아이콘 옆에 「클릭해 활성화」 글자가 선다(실행 가능한 안내). `resumeToneContext` 는 **클릭 핸들러
 *   안에서만** 부른다(제스처 밖 `resume()` 은 브라우저가 무시한다).
 *   이력: VI 브라우저 알림 토글은 사용자 요청으로 기능째 제거했다(quick-260922-tqr).
 *
 * ⑤ 오류 채널 (E1 error)
 *   relay 끊김/재연결은 DMA 필 **하나**가 말한다(● 색 + 라벨). 자동 재연결 중에는 버튼이 없다.
 *   자동 복구를 포기한 상태(작업대가 `onReconnect` 를 넘길 때)에만 「다시 연결」이 선다 — 18-10
 *   호가 탭 상태줄과 같은 규율. 주문·설정 오류는 이 줄이 아니라 해당 폼의 인라인 `role="status"` 몫이다.
 */

import { useCallback, useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
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
import { cn } from "@/lib/utils";

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
  /** 77 창 힌트. `undefined` = 모름 → 배지 없음(②). */
  queuedWindow: RelayQueuedWindowMsg | undefined;
  /** 서버 push 반영 시각 `HH:MM:SS`. `null` = 아직 없음 → 「—」. */
  appliedAt: string | null;
  cols: TradingCols;
  onColsChange: (cols: TradingCols) => void;
  /** 페이지(`wb`) 폭이 폰 밴드인가. `true` 면 세그먼트를 DOM 에서 뺀다. `null` = 아직 모름(③). */
  phoneBand: boolean | null;
  /** 자동 복구를 포기한 상태에서만 넘긴다 — 있으면 「다시 연결」(⑤). */
  onReconnect?: () => void;
  className?: string;
}

export function WorkbenchStatusBar({
  status,
  statusLabel,
  queuedWindow,
  appliedAt,
  cols,
  onColsChange,
  phoneBand,
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

      <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <span data-slot="workbench-alerts" className="inline-flex items-center gap-1">
          <ToneToggle />
        </span>
        {onReconnect !== undefined && (
          <Button variant="outline" size="sm" className="h-6 px-2" onClick={onReconnect}>
            다시 연결
          </Button>
        )}
        <span data-testid="stat-applied" title="서버 반영 시각" className="mono whitespace-nowrap">
          <span className="sr-only">반영 </span>
          {appliedAt ?? "—"}
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
              phoneBand === null && "hidden @min-[680px]/wb:inline-flex",
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

/** 아이콘 버튼 — 목업 `.iconbtn`(26×24). 차단 안내 글자가 붙으면 옆으로 늘어난다. */
const ALERT_BTN =
  "inline-flex h-6 min-w-[26px] items-center justify-center gap-1 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11px] font-semibold whitespace-nowrap text-[var(--muted-fg)] hover:bg-[var(--muted)] aria-pressed:border-[var(--primary)] aria-pressed:text-[var(--fg)]";

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
      {needsGesture && "클릭해 활성화"}
    </button>
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
