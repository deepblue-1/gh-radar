"use client";

/**
 * AlertToasts — 작업대 이벤트 알림 토스트 스택 (quick-260923-pgu · 2026-09-23 목업 ③ 변형 A).
 *
 * ① 결정 갱신 — Phase 15 D-36 · Phase 18 D-27 「토스트 없음 — 인라인 role=status」 를 사용자가
 *   목업 게이트에서 뒤집었다(③A). **라이브러리 없이** 자체 구현하고 컨테이너는 status 역할 ·
 *   polite 라이브 영역이다. 컨테이너는 알림이 없어도 늘 선다 — live 영역은 내용이 들어오기 전에
 *   있어야 낭독된다.
 *
 * ② 위치 — 토스트는 **뷰포트 오버레이**라 여기만 뷰포트 미디어 쿼리(`max-[699px]`,
 *   `TOAST_PHONE_BELOW`)를 쓴다: 데스크톱 우하단 · 폰 상단 전폭. D-28 카드 컨테이너 쿼리 규칙
 *   (`globals.css` §2.2b)과 별개다. 앱 셸이 아니라 `/trading` 작업대 루트 안에만 마운트된다.
 *   z-50 은 폰 더티 바(z-40) · 공용 패널(z-20) 위다.
 *
 * ③ 수명 — TTL 6초(폰 4초) · 호버 중 정지 · 떠나면 2.5초 · 묶음 병합으로 `at` 이 바뀌면 다시 잰다.
 *   최대 4개 정리는 훅(`mergeAlert`)이 이미 했다 — 여기서는 받은 대로 그린다.
 *
 * ④ 문구 표는 `trading-alerts.ts` 한 곳이다 — 여기서 문장을 만들지 않는다. 텍스트 노드로만 그린다
 *   (거부 사유 원문 포함 · T-pgu-01).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

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
}

/** 이 뷰포트가 폰 배치인가 — 마운트 시점에 한 번 읽는다(SSR 에는 창이 없다). */
function toastTtl(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return TOAST_TTL_MS;
  return window.matchMedia(`(max-width: ${TOAST_PHONE_BELOW - 1}px)`).matches
    ? TOAST_TTL_PHONE_MS
    : TOAST_TTL_MS;
}

export function AlertToasts({ alerts, onOpen, onDismiss }: AlertToastsProps) {
  return (
    <div
      data-slot="alert-toasts"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-3 bottom-[calc(12px+var(--app-safe-bottom))] z-50 flex w-[min(340px,calc(100%-24px))] flex-col gap-2 max-[699px]:top-[calc(12px+var(--app-safe-top))] max-[699px]:right-3 max-[699px]:bottom-auto max-[699px]:left-3 max-[699px]:w-auto"
    >
      {alerts.map((a) => (
        <ToastItem key={a.id} alert={a} onOpen={onOpen} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  alert: a,
  onOpen,
  onDismiss,
}: {
  alert: TradingAlert;
  onOpen: (a: TradingAlert) => void;
  onDismiss: (id: string) => void;
}) {
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
