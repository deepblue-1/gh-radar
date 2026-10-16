"use client";

/**
 * AlertToasts — 작업대 이벤트 알림 토스트 스택 (quick-260923-pgu · 2026-09-23 목업 ③ 변형 A).
 *
 * ① 결정 갱신 — Phase 15 D-36 · Phase 18 D-27 「토스트 없음 — 인라인 role=status」 를 사용자가
 *   목업 게이트에서 뒤집었다(③A). **라이브러리 없이** 자체 구현하고 컨테이너는 status 역할 ·
 *   polite 라이브 영역이다. 컨테이너는 알림이 없어도 늘 선다 — live 영역은 내용이 들어오기 전에
 *   있어야 낭독된다.
 *
 * ② 위치 — 토스트는 **뷰포트 오버레이**라 여기만 뷰포트 미디어 쿼리(`max-[699px]` 폭,
 *   `TOAST_PHONE_BELOW` TTL)를 쓴다. D-28 카드 컨테이너 쿼리 규칙(`globals.css` §2.2b)과 별개다.
 *   배치는 모든 뷰포트 상단 · 앱 헤더 바로 아래다 — 상단 식 `3.5rem + --app-safe-top + 8px` 의
 *   3.5rem 은 app-header `h-14`(56px)이고 `--app-safe-top` 은 헤더 `pt` 와 같은 변수라, 헤더(z-30)와
 *   검색·메뉴를 덮지 않는다(헤더 높이 토큰이 없어 app-shell aside `top` 식처럼 인라인한다).
 *   ≥700(iPad 세로·가로 · 데스크톱)은 우측 12px · 폭 340px, 폰(<700)은 좌우 12px 전폭이다.
 *   앱 셸이 아니라 `/trading` 작업대 루트 안에만 마운트된다. z-50 은 시트와 같은 층이고 폰 더티 바
 *   (z-40) · 공용 패널(z-20) 위다 — 헤더(z-30)는 z 순서가 아니라 자리로 비켜 선다.
 *   스택 순서 — 최신이 맨 위(앵커에 가장 가까운 자리 · DOM 첫째)다. `mergeAlert` 는 최신을 배열
 *   끝에 붙이므로 렌더에서만 역순으로 돌린다(키는 `id` 그대로라 재정렬이 재마운트·TTL 재시작이
 *   아니다). `flex-col-reverse` 는 쓰지 않는다 — 화면 순서와 DOM·탭 순서가 어긋난다.
 *   결정 출처: quick-260928-cs1 — iPad 사용자 요청 「오른쪽 상단이 좋아」(이전엔 데스크톱 오른쪽
 *   아래 · 폰은 헤더 위를 덮는 상단이었다).
 *
 * ③ 수명 — TTL 6초(폰 4초) · 호버 중 정지 · 떠나면 2.5초 · 묶음 병합으로 `at` 이 바뀌면 다시 잰다.
 *   최대 4개 정리는 훅(`mergeAlert`)이 이미 했다 — 여기서는 받은 대로 그린다.
 *
 * ④ 문구 표는 `trading-alerts.ts` 한 곳이다 — 여기서 문장을 만들지 않는다. 텍스트 노드로만 그린다
 *   (거부 사유 원문 포함 · T-pgu-01).
 *
 * ⑤ 계좌 줄 (Phase 32 D-03 · UI-SPEC S4) — 토스트는 작업대 계좌와 **무관하게 전부** 뜬다(숨은 계좌 것 포함).
 *   본문 버튼 안 줄 순서: ① 제목 ② 계좌 줄(`account` 파트 · 11/400 `--muted-fg` · 「계좌 {전체 라벨}」 —
 *   `accountFullLabelOf`(D-12) · 목록 밖 계좌는 번호만) ③ 기존 부제. 알림 계좌가 지금 작업대 계좌와 다르고 목록
 *   안이면 계좌 줄 오른쪽 끝에 「이 계좌 보기 ›」(11/600 `--primary` · `›` aria-hidden) — 별도 버튼이 아니다(토스트
 *   전체 클릭이 그 계좌로 바꾸고 카드로 간다 · 힌트는 그 결과를 말한다). 계좌 없는 알림(돌파)은 줄이 없다.
 *   계좌 줄 · 힌트는 본문 버튼 안이라 버튼 접근 이름에 들어간다.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RelayAccount } from "@gh-radar/shared";

import { accountFullLabelOf } from "@/lib/account-label";

import {
  ALERT_TITLE_SUFFIX,
  alertIcon,
  alertSubtitle,
  alertWho,
  TOAST_LEAVE_MS,
  TOAST_PHONE_BELOW,
  TOAST_TTL_MS,
  TOAST_TTL_PHONE_MS,
  type TradingAlert,
} from "@/lib/trading-alerts";

export interface AlertToastsProps {
  alerts: readonly TradingAlert[];
  /** 본문 클릭 — 작업대가 카드를 펼치고 탭을 옮긴 뒤 이 알림을 닫는다. */
  onOpen: (a: TradingAlert) => void;
  onDismiss: (id: string) => void;
  /** relay 계좌 목록 — 계좌 줄 글자(`accountFullLabelOf`)의 원천 · 「이 계좌 보기」 는 이 목록 안 계좌만(⑤). */
  accounts: readonly RelayAccount[];
  /** 지금 작업대 계좌 — 알림 계좌가 이 값과 다를 때만 「이 계좌 보기 ›」(⑤). */
  currentAccountNo: string;
}

/** 이 뷰포트가 폰 배치인가 — 마운트 시점에 한 번 읽는다(SSR 에는 창이 없다). */
function toastTtl(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return TOAST_TTL_MS;
  return window.matchMedia(`(max-width: ${TOAST_PHONE_BELOW - 1}px)`).matches
    ? TOAST_TTL_PHONE_MS
    : TOAST_TTL_MS;
}

export function AlertToasts({ alerts, onOpen, onDismiss, accounts, currentAccountNo }: AlertToastsProps) {
  return (
    <div
      data-slot="alert-toasts"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-[calc(3.5rem+8px+var(--app-safe-top))] right-3 z-50 flex w-[min(340px,calc(100%-24px))] flex-col gap-2 max-[699px]:left-3 max-[699px]:w-auto"
    >
      {[...alerts].reverse().map((a) => (
        <ToastItem
          key={a.id}
          alert={a}
          onOpen={onOpen}
          onDismiss={onDismiss}
          accounts={accounts}
          currentAccountNo={currentAccountNo}
        />
      ))}
    </div>
  );
}

function ToastItem({
  alert: a,
  onOpen,
  onDismiss,
  accounts,
  currentAccountNo,
}: {
  alert: TradingAlert;
  onOpen: (a: TradingAlert) => void;
  onDismiss: (id: string) => void;
  accounts: readonly RelayAccount[];
  currentAccountNo: string;
}) {
  // ⑤ 계좌 줄 — 목록 안이면 전체 라벨, 밖이면 번호만(전환할 수 없어 힌트도 없다).
  const account =
    a.accountNo === undefined || a.accountNo === ""
      ? undefined
      : accounts.find((x) => x.accountNo === a.accountNo);
  const showHint = account !== undefined && a.accountNo !== currentAccountNo;
  const [ttl] = useState(toastTtl);
  const [hovered, setHovered] = useState(false);
  /** 호버를 떠난 뒤인가 — 떠난 뒤의 타이머는 `TOAST_LEAVE_MS` 다. 새 이벤트(`at`)가 오면 풀린다. */
  const leaveMode = useRef(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // 묶음 병합으로 새 조각이 오면 전체 TTL 부터 다시 — 타이머 효과보다 먼저 선언한다.
  useEffect(() => {
    leaveMode.current = false;
  }, [a.at]);

  useEffect(() => {
    if (hovered) return;
    const t = setTimeout(
      () => onDismissRef.current(a.id),
      leaveMode.current ? TOAST_LEAVE_MS : ttl,
    );
    return () => clearTimeout(t);
  }, [a.id, a.at, hovered, ttl]);

  return (
    <div
      data-slot="alert-toast"
      data-kind={a.kind}
      onClick={() => onOpen(a)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        leaveMode.current = true;
        setHovered(false);
      }}
      className={
        "pointer-events-auto grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-[var(--r-md)] border border-l-4 border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-[12px] text-[var(--fg)] shadow-[0_12px_32px_oklch(0_0_0/0.14)] motion-safe:animate-[wb-toast-in_.18s_ease-out] " +
        "data-[kind=accept]:border-l-[var(--primary)] data-[kind=fill]:border-l-[var(--led-armed)] data-[kind=modify]:border-l-[var(--flat)] data-[kind=cancel]:border-l-[var(--flat)] data-[kind=reject]:border-l-[var(--destructive)] data-[kind=vi]:border-l-[var(--led-latent)] data-[kind=breakout]:border-l-[var(--new-bd)]"
      }
    >
      <span
        aria-hidden
        data-part="icon"
        className="inline-flex size-[22px] items-center justify-center rounded-full bg-[var(--muted)] text-[10px] font-extrabold"
      >
        {alertIcon(a.kind)}
      </span>
      {/* 본문은 버튼이다 — 키보드로도 열린다. 클릭은 바깥 div 로 올라가 `onOpen` 한 번. */}
      <button
        type="button"
        data-part="text"
        className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left text-[12px] leading-snug text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        <b className="font-bold">{alertWho(a)}</b> {ALERT_TITLE_SUFFIX[a.kind]}
        {a.count > 1 && (
          <span
            data-part="count"
            className="mono ml-1 inline-block rounded-full bg-[var(--accent)] px-[5px] text-[10px] font-bold text-[var(--accent-fg)]"
          >
            {a.count}건
          </span>
        )}
        {a.accountNo !== undefined && a.accountNo !== "" && (
          <span
            data-part="account"
            className="flex items-start gap-2 text-[11px] leading-4 font-normal text-[var(--muted-fg)] break-keep"
          >
            <span className="min-w-0">
              계좌 {account !== undefined ? accountFullLabelOf(account) : a.accountNo}
            </span>
            {showHint && (
              <span
                data-part="account-hint"
                className="ml-auto whitespace-nowrap font-semibold text-[var(--primary)]"
              >
                이 계좌 보기 <span aria-hidden="true">›</span>
              </span>
            )}
          </span>
        )}
        <span data-part="sub" className="block text-[11px] text-[var(--muted-fg)]">
          {alertSubtitle(a)}
        </span>
      </button>
      <button
        type="button"
        aria-label="알림 닫기"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(a.id);
        }}
        className="cursor-pointer border-0 bg-transparent px-0.5 text-[12px] text-[var(--muted-fg)] hover:text-[var(--fg)]"
      >
        ✕
      </button>
      <div data-part="bar" className="col-span-full h-0.5 overflow-hidden rounded-sm bg-[var(--border)]">
        <i
          key={a.at}
          style={
            {
              "--ttl": `${ttl}ms`,
              animationPlayState: hovered ? "paused" : undefined,
            } as CSSProperties
          }
          className="block h-full w-full bg-[var(--primary)] motion-safe:animate-[wb-toast-drain_var(--ttl)_linear_forwards]"
        />
      </div>
    </div>
  );
}
