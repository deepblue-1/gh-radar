'use client';

/**
 * LaunchServerChips — `/admin/launch` 제목 아래 · 탭 줄 위 발사 서버 칩 한 줄 (quick-261107-iep · 목업 D).
 *
 * ① 왜 여기서 고르나 — 주문 내역 · 경계 지도 두 탭이 같은 서버를 따른다. 칩 = KB120 · 교보119 · 교보112
 *   (shared `LAUNCH_SERVERS` 순 = 서버 레지스트리 순 · 글자 = `launchServerLabelOf`).
 *
 * ② 왜 `tablist` 가 아니라 radiogroup 인가 — 바로 아래가 탭 줄이다(「탭 안 탭」 회피). 키보드 문법은 My page
 *   계좌 칩(`MeAccountChips` ②)과 같은 WAI-ARIA radio group 한 벌(`radioKeyTargetOf`): roving tabindex ·
 *   ←/→/↑/↓ 는 이웃 칩으로 포커스를 옮기며 그 칩을 고른다(끝에서 반대편으로 돈다) · Home/End 처음/끝.
 *   포커스 이동 = 선택인 이유도 같다 — 서버 전환은 클라이언트 필터라 왕복이 없다.
 *
 * ③ 값은 스스로 쥐지 않는다 — 부모(`LaunchClient`)가 `?gw` 쿼리로 쥔다. 잠금 · 줄인 칩 기능은 이 화면에 필요 없어
 *   두지 않는다(계좌 칩과 갈리는 점). 모양(줄 · 칩 클래스)은 계좌 칩과 같은 꼴 + 글자 12.5px/600(목업 `.srvchips`).
 */

import { useRef, type KeyboardEvent } from 'react';

import { LAUNCH_SERVERS, launchServerLabelOf, type LaunchServer } from '@gh-radar/shared';

import { radioKeyTargetOf } from '@/lib/radio-keys';
import { cn } from '@/lib/utils';

export interface LaunchServerChipsProps {
  gw: LaunchServer;
  onGw: (gw: LaunchServer) => void;
}

export function LaunchServerChips({ gw, onGw }: LaunchServerChipsProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const pick = (next: LaunchServer): void => {
    if (next === gw) return;
    onGw(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const to = radioKeyTargetOf(e.key, at, buttons.length);
    if (to === null) return;
    e.preventDefault();
    const target = buttons[to];
    target?.focus();
    // 포커스 이동 = 선택(②). 같은 서버는 pick 가드가 무시한다.
    const next = LAUNCH_SERVERS.find((s) => s === target?.dataset.gw);
    if (next !== undefined) pick(next);
  };

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label="발사 서버"
      data-slot="launch-server-chips"
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {LAUNCH_SERVERS.map((key) => {
        const on = key === gw;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            data-slot="launch-server-chip"
            data-gw={key}
            tabIndex={on ? 0 : -1}
            onClick={() => pick(key)}
            className={cn(
              'inline-flex h-8 flex-none items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap',
              on
                ? 'bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]'
                : 'bg-[var(--muted)] text-[var(--muted-fg)]',
            )}
          >
            {launchServerLabelOf(key)}
          </button>
        );
      })}
    </div>
  );
}
