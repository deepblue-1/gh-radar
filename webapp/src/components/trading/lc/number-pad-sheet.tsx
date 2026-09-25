'use client';

/**
 * Phase 20 (D-13 · D-16 · D-17 · D-23 · D-05~D-07) — 공용 키패드 바텀시트.
 *
 * 터치 기기(`useEditMode() === 'sheet'`)의 값 편집 표면이다. 상따 설정(`purpose='apply'`,
 * 「{필드명} 적용」)과 수동주문 상자(`purpose='fill'`, 「{필드명} 입력」)가 문구만 바꿔 같이 쓴다.
 * 일반어 「확인」 단독 버튼은 두지 않는다(D-23).
 *
 * ① 조립 — `ui/sheet.tsx` 를 쓰지 않는다
 *   그 파일은 oklch 스크림 · blur · 닫기 X · 전폭 bottom 을 강제한다(RESEARCH Q3). 그래서
 *   `radix-ui` Dialog 를 직접 조립한다. `Dialog.Portal` 기본 컨테이너가 `document.body` 라
 *   카드의 `container-type` 조상(§2.2b) 밖에 서고, `position:fixed` 가 뷰포트 기준이 된다.
 *
 * ② 폭·위치 — `min()` 한 식뿐
 *   `w-[min(440px,calc(100vw-20px))]` + `inset-x-0 mx-auto` 가운데 — 폰은 좌우 10px, 넓은 터치
 *   화면은 440 가운데(D-13). 뷰포트 브레이크포인트 분기는 없다. 가운데를 transform 이 아니라
 *   margin 으로 잡아 등장 슬라이드(transform)와 다투지 않게 한다. 하단
 *   `max(10px, env(safe-area-inset-bottom))` 는 지금 `viewport-fit` 이 없어 실효 10px 이다 —
 *   전역 레이아웃(`app/layout.tsx` viewport)은 건드리지 않는다.
 *
 * ③ 포커스 — 제어형이라 수동 복원
 *   트리거 없는 제어형 Dialog 는 Radix 가 복귀 대상을 모른다(RESEARCH Pitfall 6). 열 때는
 *   콘텐츠 컨테이너(`tabIndex=-1`)에, 닫힐 때는 `returnFocusRef`(연 행)로 되돌린다.
 *
 * ④ 버퍼 — 열린 사이 덮지 않는다(D-07)
 *   `open` 이 false→true 로 바뀔 때만 `padInit(initialValue)` 로 새로 시작하고, 그때의
 *   `serverValue` 를 기억한다. 열린 사이 서버 값이 바뀌면 입력은 그대로 두고 「지금 ○○」 만
 *   갱신하며 「다른 단말에서 바뀌었어요」 를 보인다.
 *
 * ⑤ 반영 중 잠금(D-05) — 칩 · 키패드 · 「닫기」 · Esc · 바깥 누름 · 물리 키 전부 막는다.
 *
 * ⑥ 이 컴포넌트는 스스로 전송하지 않는다 — `onConfirm(값)` 만 부른다. 전송(상따 `commit`)과
 *   주문은 호출부 몫이다. 호가 단위·상한가 위반은 **보정하지 않고** 잠근 뒤 이유만 말한다(D-15).
 *   ★ ETP·분류 불명 종목(`ctx.tickRule`)의 호가 단위 위반은 잠그지 않고 경고 한 줄만 둔다(D-15a ·
 *     `padWarning`) — 수동주문 마우스 인라인(`manual-order-price-issue`)과 같은 모양(글자색 destructive ·
 *     `role=status`)이다. 상한가 초과는 분류와 무관하게 잠근다.
 *
 * 시트에는 입력칸(input 요소)이 없다 — 디스플레이는 `<output>`, 키패드는 버튼 12개라 소프트
 * 키보드가 뜨지 않는다. 물리 키(태블릿 외장 키보드)는 콘텐츠 `onKeyDown` 이 받는다.
 */
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Dialog } from 'radix-ui';
import { Delete } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  PAD_CHIPS,
  applyPadChip,
  canConfirmPad,
  formatPadDisplay,
  padChipDisabled,
  padInit,
  padIssue,
  padKey,
  padValue,
  padWarning,
  type PadCtx,
  type PadKey,
  type PadState,
  type PadUnit,
} from '@/lib/numpad';
import { LC_COMMIT_TEXT } from './use-lc-field-commit';

export interface NumberPadSheetProps {
  open: boolean;
  /** 필드명(= 행 라벨). 확정 버튼 문구 「{title} 적용|입력」의 원천. */
  title: string;
  /** 필드별 설명 한 줄(UI-SPEC 카피 표). */
  description: string;
  unit: PadUnit;
  /** apply = 상따 설정(적용하면 호출부가 즉시 전송) · fill = 수동주문 상자(값만 채움). */
  purpose: 'apply' | 'fill';
  /** 열 때 버퍼의 시작 값. null = 빈 값. */
  initialValue: number | null;
  /** 「지금 ○○」 서버 값. null/undefined 면 표시하지 않는다. */
  serverValue?: number | null;
  ctx: PadCtx;
  status?: 'editing' | 'busy' | 'failed';
  /** 실패 문구(`LC_COMMIT_TEXT.failed` · `.disconnected`) — 상태 줄 alert. */
  failureText?: string | null;
  /** 그룹이 「감시 중」 — 적용하면 바로 반영된다는 안내 한 줄(D-05, 추가 확인은 없다). */
  armedNotice?: boolean;
  /** 호출부 검증(무장 불가 등). 문장을 돌려주면 확정을 잠그고 그 문장을 상태 줄에 보인다. */
  validate?: (value: number) => string | null;
  /** 닫힌 뒤 포커스를 돌려줄 요소(연 행). */
  returnFocusRef: { current: HTMLElement | null };
  onConfirm: (value: number) => void;
  onClose: () => void;
}

const KEYS: readonly { key: PadKey; label?: string }[] = [
  { key: '1' },
  { key: '2' },
  { key: '3' },
  { key: '4' },
  { key: '5' },
  { key: '6' },
  { key: '7' },
  { key: '8' },
  { key: '9' },
  { key: '00', label: '0 두 번' },
  { key: '0' },
  { key: 'back', label: '한 글자 지우기' },
];

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

type StatusLine =
  | { tone: 'alert'; text: string }
  | { tone: 'warn'; text: string }
  | { tone: 'status'; text: string; armed?: boolean }
  | null;

export function NumberPadSheet({
  open,
  title,
  description,
  unit,
  purpose,
  initialValue,
  serverValue,
  ctx,
  status = 'editing',
  failureText,
  armedNotice = false,
  validate,
  returnFocusRef,
  onConfirm,
  onClose,
}: NumberPadSheetProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const busy = status === 'busy';

  const [pad, setPad] = useState<PadState>(() => padInit(initialValue));
  const [openedServer, setOpenedServer] = useState<number | null>(serverValue ?? null);
  const [prevOpen, setPrevOpen] = useState(open);
  // 닫힘 → 열림 전이에서만 새로 시작한다(렌더 중 파생 상태 갱신 — 이펙트 한 박자 지연 없음).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPad(padInit(initialValue));
      setOpenedServer(serverValue ?? null);
    }
  }

  const value = padValue(pad);
  const issue = padIssue(pad, unit, ctx) ?? (value !== null && validate ? validate(value) : null);
  const canConfirm = !busy && issue === null && canConfirmPad(pad, unit, ctx);

  const serverKnown = serverValue !== null && serverValue !== undefined;
  const otherDevice =
    purpose === 'apply' && !busy && serverKnown && openedServer !== null && serverValue !== openedServer;

  // 잠그지 않는 경고(D-15a) — 잠그는 위반이 없을 때만 선다.
  const warning = issue === null ? padWarning(pad, unit, ctx) : null;

  let line: StatusLine = null;
  if (issue) line = { tone: 'alert', text: issue };
  else if (!busy && failureText) line = { tone: 'alert', text: failureText };
  else if (warning) line = { tone: 'warn', text: warning };
  else if (otherDevice) line = { tone: 'status', text: LC_COMMIT_TEXT.otherDevice };
  else if (armedNotice) line = { tone: 'status', text: LC_COMMIT_TEXT.armed, armed: true };

  const confirmText = busy
    ? LC_COMMIT_TEXT.busy
    : status === 'failed'
      ? LC_COMMIT_TEXT.retry
      : `${title} ${purpose === 'apply' ? '적용' : '입력'}`;

  const confirm = () => {
    if (!canConfirm || value === null) return;
    onConfirm(value);
  };

  const press = (k: PadKey) => {
    if (busy) return;
    setPad((s) => padKey(s, k));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      press(e.key as PadKey);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      press('back');
    } else if (e.key === 'Enter') {
      // 버튼에 포커스가 있으면 그 버튼의 기본 동작(누르기)에 맡긴다 — 키보드 사용자가
      // 「닫기」에서 Enter 를 눌렀는데 적용이 나가면 안 된다.
      if (e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      confirm();
    }
  };

  const fresh = pad.fresh && pad.buf !== '';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-slot="numpad-overlay"
          className={cn(
            'fixed inset-0 z-50 bg-[var(--dim)]',
            'data-open:animate-in data-open:fade-in-0 data-open:duration-200',
            'data-closed:animate-out data-closed:fade-out-0 data-closed:duration-200',
          )}
        />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          data-slot="numpad-sheet"
          // Radix 는 모달을 형제 aria-hidden 으로만 표현한다 — 접근성 계약대로 명시한다.
          aria-modal="true"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'fixed inset-x-0 mx-auto bottom-[max(10px,env(safe-area-inset-bottom))] z-50',
            'w-[min(440px,calc(100vw-20px))] max-h-[calc(100dvh-20px)] overflow-y-auto',
            'rounded-[28px] bg-[var(--card)] px-5 pt-[22px] pb-4 outline-none',
            // 초기 포커스 자리인 컨테이너 자신에만 링을 걷는다(UI-SPEC 접근성 계약 「링 없음」).
            // `data-focus-ring="seamless"` 는 변수가 자식 버튼으로 상속돼 버튼 링까지 지우므로
            // 쓰지 않는다 — 컨테이너가 :focus-visible 일 때만 변수를 끈다.
            'focus-visible:[--focus-outline:none] focus-visible:[--focus-shadow:none]',
            // 등장 250ms translateY(120%) → 0 · reduced-motion 이면 이동 없이 opacity 150ms
            'data-open:animate-in data-open:ease-[ease]',
            'motion-safe:data-open:slide-in-from-bottom-[120%] motion-safe:data-open:duration-250',
            'motion-reduce:data-open:fade-in-0 motion-reduce:data-open:duration-150',
            'data-closed:animate-out data-closed:ease-[ease]',
            'motion-safe:data-closed:slide-out-to-bottom-[120%] motion-safe:data-closed:duration-250',
            'motion-reduce:data-closed:fade-out-0 motion-reduce:data-closed:duration-150',
          )}
        >
          <Dialog.Title className="mb-1 text-[20px] leading-tight font-bold text-[var(--fg)]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mb-[14px] text-[14px] text-[var(--muted-fg)]">
            {description}
          </Dialog.Description>

          <div className="mb-[10px] flex items-baseline gap-1 rounded-[16px] bg-[var(--muted)] px-4 py-[14px]">
            <output
              data-slot="numpad-display"
              aria-live="polite"
              className="flex min-w-0 items-baseline gap-1 tabular-nums"
            >
              <span className="inline-flex min-h-8 items-baseline">
                {/*
                  기준선 받침(20-07 시각 확인) — 값이 비면(수동주문 상자 첫 열림 · ⌫ 로 다 지움) 값 슬롯에 줄
                  상자가 없어 기준선이 사라지고, 단위 「원」이 캐럿 **위**로 떠올랐다. 같은 글자 크기의 폭 0
                  글자(ZWSP)를 늘 두어 기준선을 고정한다. 값 슬롯 글자는 그대로 비어 있고(검증 계약) 낭독에서 뺀다.
                */}
                <span aria-hidden="true" className="text-[26px] leading-8 font-bold">
                  {String.fromCharCode(0x200b)}
                </span>
                <span
                  data-slot="numpad-value"
                  data-fresh={fresh ? 'true' : 'false'}
                  className={cn(
                    'text-[26px] leading-8 font-bold text-[var(--fg)]',
                    fresh && 'rounded-[4px] bg-[color-mix(in_srgb,var(--primary)_32%,transparent)]',
                  )}
                >
                  {formatPadDisplay(pad)}
                </span>
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-[26px] w-0.5 self-center bg-[var(--primary)] motion-safe:animate-[numpad-caret_1s_steps(1)_infinite]"
                />
              </span>
              <span className="text-[18px] font-semibold text-[var(--fg-2)]">{unit}</span>
            </output>
            {serverValue !== null && serverValue !== undefined && (
              <span
                data-slot="numpad-server"
                className="ml-auto shrink-0 text-[12.5px] whitespace-nowrap text-[var(--muted-fg)] tabular-nums"
              >
                지금 {fmt(serverValue)}
                {unit}
              </span>
            )}
          </div>

          <p
            data-slot="numpad-status"
            className="-mt-1 mb-2 ml-0.5 min-h-4 text-[12.5px] leading-4 break-keep"
          >
            {line?.tone === 'alert' && (
              <span role="alert" className="text-[var(--destructive)]">
                {line.text}
              </span>
            )}
            {line?.tone === 'warn' && (
              <span role="status" data-tone="warn" className="text-[var(--destructive)]">
                {line.text}
              </span>
            )}
            {line?.tone === 'status' && (
              <span role="status" className="text-[var(--muted-fg)]">
                {line.armed && (
                  <span
                    aria-hidden="true"
                    className="mr-1.5 inline-block size-1.5 rounded-full bg-[var(--led-armed)] align-middle"
                  />
                )}
                {line.text}
              </span>
            )}
          </p>

          <div data-slot="numpad-chips" className="mb-3 flex flex-wrap gap-1.5">
            {PAD_CHIPS[unit].map((c) => (
              <button
                key={c.label}
                type="button"
                aria-label={c.ariaLabel}
                disabled={busy || padChipDisabled(c, ctx)}
                onClick={() => setPad((s) => applyPadChip(s, c, ctx))}
                className="h-8 touch-manipulation rounded-full bg-[var(--muted)] px-3 text-[13px] font-semibold text-[var(--fg-2)] disabled:opacity-40"
              >
                {c.label}
              </button>
            ))}
          </div>

          <div role="group" aria-label="숫자 키패드" className="mb-3 grid grid-cols-3 gap-0.5">
            {KEYS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-label={label}
                disabled={busy}
                onClick={() => press(key)}
                className="flex h-14 touch-manipulation items-center justify-center rounded-[12px] bg-transparent text-[24px] font-medium text-[var(--fg)] active:bg-[var(--muted)] disabled:opacity-40"
              >
                {key === 'back' ? <Delete aria-hidden="true" className="size-6" /> : key}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-14 flex-1 rounded-[16px] bg-[var(--muted)] text-[17px] font-semibold text-[var(--fg-2)] disabled:opacity-40"
            >
              닫기
            </button>
            <button
              type="button"
              data-slot="numpad-confirm"
              disabled={!canConfirm}
              onClick={confirm}
              // 채움 면 글자색은 `--destructive-fg`(흰색) — LOCKED 규칙(order-confirm-dialog ③)
              className="h-14 flex-1 rounded-[16px] bg-[var(--primary)] text-[17px] font-semibold text-[var(--destructive-fg)] disabled:opacity-40"
            >
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
