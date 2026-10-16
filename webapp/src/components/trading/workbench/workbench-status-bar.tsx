"use client";

/**
 * WorkbenchStatusBar — `/trading` 작업대의 **상단 줄** (Phase 32 D-05 · D-06 · D-07 · UI-SPEC S1 · 채택 목업
 * `.planning/phases/32-account-axis/reference/mockup-account-axis.html` ① A 「한 줄 필」).
 *
 * ① 배치 — 「트레이딩」 h1 자기 줄 → **이 카드 한 줄** → 보조 줄(`WorkbenchAuxLines` · 있을 때만)
 *   카드 안 왼쪽부터 계좌 셀렉트 → 서버키 칩 → 시세 알약 → 주문 알약 → (`ml-auto`) 컬럼 세그먼트. 카드는
 *   `flex-wrap` 이라 한 줄을 넘으면 뒤 항목부터 다음 줄로 내려가고, 세그먼트는 내려가도 오른쪽 끝에 선다.
 *   글자를 줄이거나 말줄임하지 않는다(셀렉트 내부 글자만 네이티브 `<select>` 가 자른다). 이 카드 자신이
 *   `workbench-status-bar` 슬롯 + `data-status` 루트다 — 다른 spec 5개의 준비 신호다(Pitfall 4).
 *
 * ② 뺀 것 (D-06) — 「정규」 · 예약 창 배지 · 알림음 아이콘(→ /me 설정 「이 기기」 카드 · D-15) · 반영 시각 ·
 *   「다시 연결」 버튼(→ 주문 알약 안 텍스트 버튼 ⑤). relay 77 수신 · `queuedWindow` 상태 · 카드 안 예약 표시는
 *   그대로다(카드 · 호가 탭의 `affordanceOf` 몫). 이 파일은 여전히 **벽시계를 읽지 않는다**(D-22 · D-27).
 *
 * ③ ★ 컬럼 세그먼트는 격자 1열 고정 폭(`wb` < 680)에서 **DOM 에서 뺀다** (UI-SPEC S1 · 사용자 확인 2026-10-13)
 *   `display:none` 만으로 숨기지 않는다 — 작업대가 `wb` 컨테이너 폭으로 판정한 값(prop 이름은 `phoneBand` 지만
 *   뜻은 「격자 1열 고정」, §2.2b 「격자 열 수 경계」 680 — 카드 밴드 첫 경계 685 와 다르다)이 `true` 면 조건부
 *   렌더로 빠진다. 폭을 아직 모르는 첫 페인트(`null`)에만 CSS 폴백(`hidden @min-[680px]/wb:inline-flex`)이
 *   받친다. 목업 폰 390 의 「아래 줄 세그먼트」 는 이 이유로 그리지 않는다 — D-05 의 「아래 줄」 은 680 이상에서
 *   넘칠 때의 `flex-wrap` 줄바꿈이다(RESEARCH Pitfall 7).
 *
 * ④ 계좌 셀렉트 (`AccountPill` · D-25 로 작업대 파일 안 그대로)
 *   옵션 글자 = `accountFullLabelOf`(D-12 「번호 · 상품명 · 서버키」 · 빈 칸 생략). 고른 계좌에 `serverKey` 가
 *   있으면 셀렉트 바로 오른쪽에 서버키 칩 1개(29-30 채택 A). 계좌 선택의 **뜻**은 작업대 스코프다(32-04 D-01 — 고른
 *   계좌의 카드 · VI 스트립만 보이고 새 카드도 이 계좌로 열린다 · `ACCOUNT_PILL_TITLE`).
 *
 * ⑤ 오류 채널 (S1 error)
 *   relay 끊김/재연결은 주문 알약 **하나**가 말한다(● 색 + 상태어). 자동 재연결 중에는 버튼이 없다. 자동 복구를
 *   포기한 상태(작업대가 `onReconnect` 를 넘길 때 = `UNRECOVERABLE_STATES`)에만 보이는 상태어가 「끊김」 이 되고
 *   (점 · 글자 `--destructive`) 바로 뒤에 「 · 」 + 「다시 연결」 텍스트 버튼(`workbench-reconnect` · `--primary`)이
 *   선다. 정확한 상태어(「회선 단절」 등)는 sr-only 「 — {상태어}」 와 `title` 로 남는다(정보 손실 없음). 버튼은
 *   `workbench-dma` 라이브 영역 **밖의 형제**다 — 라이브 영역이 버튼 글자를 낭독하지 않게. 둘을 감싼 `inline-flex`
 *   묶음이 시각상 한 알약이다. `unauthorized` 는 `UNRECOVERABLE_STATES` 밖이라 「권한 없음」 · 링크 없음.
 *
 * ⑥ ★ 배지 2축 — 「시세」 · 「주문」 (Phase 26 D-01 · D-04 · 26-13 채택안 안 B 점형)
 *   판정은 `quotePillOf` · `orderPillOf`(`lib/quote-state.ts`) 한 곳이고 My page 상태줄도 같은 함수를 쓴다.
 *   - 시세 알약(`workbench-quote`)은 주문 알약 앞에 서고, relay 가 시세 상태를 모르면(`quoteState === null`)
 *     **없다**. 정상 「● 시세」 · 끊김 「● 시세 HH:MM:SS~ 멈춤」(점 · 상태어 `--destructive`). 구독 한도는
 *     칩이 아니라 이 알약의 `title` 이다.
 *   - 주문 알약은 옛 DMA 필 자리(`workbench-dma` · `aria-live` 유지 — a11y e2e 가 이 슬롯을 본다)이고 사용자
 *     DMA 세션만 말한다. ready 면 「● 주문」 뿐, 그 밖은 `RELAY_STATE_LABELS` 문구(⑤ 규율 그대로).
 *   - 시세가 끊겨도 호가 · 체결 숫자는 흐리지도 비우지도 않는다(D-04 — 끊긴 시각은 이 알약에만).
 *   - 상태 적색은 `--destructive` 다. 가격 방향 토큰(`--up`)을 상태에 쓰지 않는다.
 *
 * ⑦ 보조 줄 — `WorkbenchAuxLines` (Phase 29-39 G-1 · gh-trade-84 ② · Phase 32 D-06 으로 카드 밖)
 *   원천은 relay 상태 프레임 계좌 항목의 `staleStrategies` · `movedFrom`(29-36) — **표시 전용**이다. 주문 허용 ·
 *   계좌 대조 · 전략 등록 판정에 쓰지 않는다(relay allowedAccounts 가 정본).
 *   - 끄기 미확인 경고(gh-trade-84 ②(가)) — 고른 계좌에 `staleStrategies` 가 있으면 경고색 한 줄. 닫기가 없다 —
 *     사라지는 조건은 relay 의 다음 상태 프레임(필드 없음)뿐이다. 한 계좌가 여러 옛 서버에 남기면 relay 가
 *     `otherServers` 를 실어 「옛 서버 KB120 외 1개 서버 …」 로 말한다(29-52 GC-12).
 *   - 되돌아옴 안내(gh-trade-84 ② 추가) — 고른 계좌에 `movedFrom` 이 있으면 「클라(OCX) 대사」 안내 한 줄 · × 로
 *     그 (계좌, movedFrom) 조합을 이 탭 안에서 닫는다(로컬 상태 · 저장 안 함).
 *   - 상단 줄 카드 **밖, 바로 아래**(작업대 `workbench-head` 안 · 카드와 4px · 좌우 4px 들여쓰기). 필드가 없으면
 *     요소 0 — 머리 높이는 상단 줄만큼이다.
 */

import { useState } from "react";
import { X } from "lucide-react";
import type { RelayAccount, RelayQuoteStateMsg, RelaySubLimitMsg } from "@gh-radar/shared";

import { accountFullLabelOf } from "@/lib/account-label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { writeColsPref, type TradingCols } from "@/lib/breakout-list";
import type { IsinLabel } from "@/lib/isin-labels";
import { orderPillOf, quotePillOf } from "@/lib/quote-state";
import type { RelayStatus } from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

/**
 * 계좌 셀렉트 `title` — Phase 32 D-01 — 상단 줄 계좌 = 작업대 스코프(카드 · VI 스트립이 이 계좌 것만 보인다).
 * 옛 문구 「이미 있는 카드는 자기 계좌를 유지해요」 는 거짓이 됐다(다른 계좌 카드는 숨는다).
 */
export const ACCOUNT_PILL_TITLE =
  "작업대에 보일 계좌예요 · 새로 추가하는 카드도 이 계좌로 열려요";

const COLS: readonly TradingCols[] = [1, 2, 3];

/** 보조 줄 문구(⑦ · 해요체). */
export const WORKBENCH_STATUS_TEXT = {
  /**
   * 끄기 미확인 경고 — `count` null = 몇 건인지 모름. `otherServers` 가 있으면(한 계좌가 여러 옛 서버에 남김 · 29-52 GC-12)
   * 「외 N개 서버」 를 붙인다(`count` 는 그 서버들의 합 · relay 가 정한다). 없거나 비면 종전 문구.
   */
  staleStrategies: (serverKey: string, count: number | null, otherServers?: readonly string[]) =>
    `옛 서버 ${serverKey}${otherServers !== undefined && otherServers.length > 0 ? ` 외 ${otherServers.length}개 서버` : ""} 활성 전략 ${count === null ? "몇 건인지 모름" : `${count}건`} — 끄지 못했어요 · 클라(OCX)에서 끄세요`,
  /** 되돌아옴 안내 — 옛 서버 → 지금 주문 서버. */
  movedFrom: (from: string, to: string) =>
    `주문 서버 ${from} → ${to} — 옛 서버 잔고 · 미체결은 클라(OCX) 대사로 맞추세요`,
} as const;

/** 보조 줄 양식(⑦) — 경고색 한 줄 · 줄 전체 폭 · 잘림 대신 줄바꿈. */
const AUX_LINE = "m-0 min-w-0 basis-full text-[11px] leading-[1.45] break-keep text-[var(--led-latent)]";

export interface WorkbenchStatusBarProps {
  status: RelayStatus;
  statusLabel: string;
  /** 시세 전용 공유 연결 상태(⑥). `null` = relay 가 모름 → 시세 알약 없음. */
  quoteState: RelayQuoteStateMsg | null;
  /** 구독 한도 거부 최신 1건(⑥). `null` = 없음 → 시세 알약 title 없음. */
  subLimit: RelaySubLimitMsg | null;
  /** `subLimit.i` 의 표시 라벨(종목명 · 단축코드). 모르면 생략 — 문구가 ISIN 원문을 쓴다. */
  subLimitLabel?: IsinLabel;
  /** 계좌 셀렉트 목록(④). 비면 「계좌 확인 중…」 1옵션 · 비활성. */
  accounts: readonly RelayAccount[];
  /** 셀렉트가 고른 계좌번호(④). */
  accountNo: string;
  onAccountChange: (accountNo: string) => void;
  cols: TradingCols;
  onColsChange: (cols: TradingCols) => void;
  /** `wb` 폭이 격자 1열 고정(< 680)인가. `true` 면 세그먼트를 DOM 에서 뺀다. `null` = 아직 모름(③). */
  phoneBand: boolean | null;
  /** 자동 복구를 포기한 상태에서만 넘긴다 — 있으면 「끊김 · 다시 연결」(⑤). */
  onReconnect?: () => void;
  className?: string;
}

export function WorkbenchStatusBar({
  status,
  statusLabel,
  quoteState,
  subLimit,
  subLimitLabel,
  accounts,
  accountNo,
  onAccountChange,
  cols,
  onColsChange,
  phoneBand,
  onReconnect,
  className,
}: WorkbenchStatusBarProps) {
  const quote = quotePillOf(quoteState, subLimit, subLimitLabel);
  const order = orderPillOf(status, statusLabel);
  // ⑤ 자동 복구 포기 = 작업대가 `onReconnect` 를 넘긴 상태. 정확한 상태어는 sr-only · title 로 남긴다.
  const broken = onReconnect !== undefined;
  const brokenDetail = order.detail ?? statusLabel;

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
        // 토스 B `.status-bar`(260924-vj1) — 카드 면 · 무테 · 16 radius · 10/16px 패딩. flex-wrap 이라 잘리지 않고 줄바꿈된다.
        "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--r-md)] border border-transparent bg-[var(--card)] px-4 py-2.5 text-[length:var(--t-caption)] text-[var(--muted-fg)]",
        className,
      )}
    >
      <AccountPill accounts={accounts} accountNo={accountNo} onChange={onAccountChange} />

      {quote !== null && (
        <span
          data-slot="workbench-quote"
          aria-live="polite"
          data-tone={quote.tone}
          title={quote.title ?? undefined}
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span
            aria-hidden="true"
            className={cn(
              "block size-[7px] shrink-0 rounded-full",
              quote.tone === "ok" ? "bg-[var(--led-armed)]" : "bg-[var(--destructive)]",
            )}
          />
          {quote.label}
          {quote.detail !== null && (
            <>
              {" "}
              <b
                className={cn(
                  "font-semibold",
                  quote.tone === "down" ? "text-[var(--destructive)]" : "text-[var(--fg)]",
                )}
              >
                {quote.detail}
              </b>
            </>
          )}
          {quote.srDetail !== null && <span className="sr-only"> {quote.srDetail}</span>}
        </span>
      )}

      <span data-slot="workbench-order" className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span
          data-slot="workbench-dma"
          aria-live="polite"
          title={broken ? brokenDetail : undefined}
          className="inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <span
            aria-hidden="true"
            data-tone={broken ? "down" : order.tone}
            className={cn(
              "block size-[7px] shrink-0 rounded-full",
              broken
                ? "bg-[var(--destructive)]"
                : order.tone === "ok"
                  ? "bg-[var(--led-armed)]"
                  : "bg-[var(--flat)]",
              !broken && order.pulse && "animate-pulse motion-reduce:animate-none",
            )}
          />
          {order.label}
          {broken ? (
            <>
              {" "}
              <b className="font-semibold text-[var(--destructive)]">끊김</b>
              <span className="sr-only"> — {brokenDetail}</span>
            </>
          ) : (
            order.detail !== null && (
              <>
                {" "}
                <b className="font-semibold text-[var(--fg)]">{order.detail}</b>
              </>
            )
          )}
          {order.srDetail !== null && <span className="sr-only"> {order.srDetail}</span>}
        </span>
        {broken && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              data-slot="workbench-reconnect"
              onClick={onReconnect}
              className="rounded-[var(--r)] font-semibold text-[var(--primary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
            >
              다시 연결
            </button>
          </>
        )}
      </span>

      {phoneBand !== true && (
        <ToggleGroup
          type="single"
          value={String(cols)}
          onValueChange={pickCols}
          aria-label="카드 단 수"
          data-slot="workbench-cols-segment"
          className={cn(
            "ml-auto h-6 gap-0 overflow-hidden rounded-full border border-transparent bg-[var(--muted)]",
            // 폭을 아직 모르는 첫 페인트만 CSS 가 받친다(③). 판정이 나면 위 조건부 렌더가 정본이다.
            phoneBand === null && "hidden @min-[680px]/wb:inline-flex",
          )}
        >
          {COLS.map((c) => (
            <ToggleGroupItem
              key={c}
              value={String(c)}
              className="h-6 min-w-0 rounded-full! bg-transparent px-[9px] text-[11px] font-semibold text-[var(--muted-fg)] data-[state=on]:bg-[var(--pill-on-bg)] data-[state=on]:text-[var(--pill-on-fg)]"
            >
              {c}단
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

/**
 * 상단 줄 카드 밖 보조 줄(⑦ · D-06) — 고른 계좌의 끄기 미확인 경고 · 되돌아옴 안내. 둘 다 없으면 `null`(요소 0).
 * 작업대가 `workbench-head` 안 상단 줄 바로 아래에 둔다(머리 `gap-2` 8px − `-mt-1` 4px = 카드와 4px).
 */
export function WorkbenchAuxLines({ account }: { account: RelayAccount | null }) {
  // 되돌아옴 안내를 닫은 (계좌, movedFrom) 조합 — 이 탭 로컬 · 저장 안 함(⑦).
  const [dismissedMoves, setDismissedMoves] = useState<ReadonlySet<string>>(() => new Set());
  const stale = account?.staleStrategies;
  // 안내는 옛 서버 · 지금 서버를 둘 다 알 때만 — relay 는 movedFrom 을 실을 때 serverKey 도 싣는다(29-36).
  const move =
    account?.movedFrom !== undefined && account.serverKey !== undefined
      ? {
          key: `${account.accountNo}|${account.movedFrom}`,
          text: WORKBENCH_STATUS_TEXT.movedFrom(account.movedFrom, account.serverKey),
        }
      : null;
  const showMove = move !== null && !dismissedMoves.has(move.key);
  if (stale === undefined && !showMove) return null;

  return (
    <div data-slot="workbench-aux-lines" className="-mt-1 flex min-w-0 flex-col gap-1 px-1">
      {stale !== undefined && (
        <p role="status" data-slot="workbench-stale-strategies" className={AUX_LINE}>
          {WORKBENCH_STATUS_TEXT.staleStrategies(stale.serverKey, stale.count, stale.otherServers)}
        </p>
      )}

      {showMove && (
        <p data-slot="workbench-moved-from" className={cn(AUX_LINE, "inline-flex items-start gap-1")}>
          <span className="min-w-0">{move.text}</span>
          <button
            type="button"
            aria-label="안내 닫기"
            title="안내 닫기"
            onClick={() => setDismissedMoves((prev) => new Set(prev).add(move.key))}
            className="-my-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-[var(--r)] text-[var(--muted-fg)] hover:bg-[var(--muted)] hover:text-[var(--fg)]"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </p>
      )}
    </div>
  );
}

export interface AccountPillProps {
  accounts: readonly RelayAccount[];
  accountNo: string;
  onChange: (accountNo: string) => void;
}

/**
 * 상단 줄 계좌 필 (목업 `.acct` `:728` · Phase 32 목업 ① A 에서 상단 줄 카드 맨 앞) — 상태줄 계좌 = **신규 카드의 기본 계좌**이자 VI 설정 2줄 ·
 * 공용 패널의 계좌 축이다(Q-2 · Q-3). 이미 등록된 카드는 자기 키의 계좌를 유지하며 이 값을 바꿔도
 * 움직이지 않는다 — 그 사실을 `title` 이 말한다.
 *
 * ★ 옛 상따 계좌 칩과 같은 네이티브 `<select>` 다(`appearance-none` 금지 — OS 선택 UI 를 잃는다).
 * ★ 계좌번호는 마스킹하지 않는다(D2 · S-5).
 * ★ 옵션 글자 = `accountFullLabelOf`(Phase 32 D-12 「번호 · 상품명 · 서버키」 · 빈 칸 생략) — 종전 인라인 조립
 *   (「번호 · 이름」 + 「 · 서버키」)과 같은 글자다. 고른 계좌에 `serverKey` 가 있으면 필 바로 옆에 서버 키 칩이 선다
 *   (④ · 29-30 채택 A — 목업 `.srvkey`).
 */
export function AccountPill({ accounts, accountNo, onChange }: AccountPillProps) {
  const serverKey = accounts.find((a) => a.accountNo === accountNo)?.serverKey;
  return (
    <>
      <select
        data-slot="workbench-account"
        aria-label="계좌"
        title={ACCOUNT_PILL_TITLE}
        value={accountNo}
        onChange={(e) => onChange(e.target.value)}
        disabled={accounts.length === 0}
        className="mono h-[26px] max-w-full min-w-0 rounded-full border border-transparent bg-[var(--muted)] px-2 text-[11px] text-[var(--fg)] disabled:opacity-50"
      >
        {accounts.length === 0 ? (
          <option value="">계좌 확인 중…</option>
        ) : (
          accounts.map((a) => (
            <option key={a.accountNo} value={a.accountNo}>
              {accountFullLabelOf(a)}
            </option>
          ))
        )}
      </select>
      {serverKey !== undefined && (
        <span
          data-slot="workbench-account-server"
          title="이 계좌의 주문 서버"
          className="mono inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--muted)] px-1.5 text-[10px] font-bold whitespace-nowrap text-[var(--fg-2)]"
        >
          {serverKey}
        </span>
      )}
    </>
  );
}
