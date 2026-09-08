'use client';

/**
 * DirtyActionBar — 「수정」/「되돌리기」 하단 액션 바 (UI-SPEC A10 / B4, 상따·VI 공용).
 *
 * ① 무엇을 어디에
 *   화면 하단에 고정된다. **더티가 있을 때만 존재한다** — `dirtyCount === 0` 이면 `null` 을
 *   돌려주고 DOM 에 아무것도 남기지 않는다. 「0개 미반영」 상태의 빈 바를 남기면 그 바가
 *   화면 하단 40px 를 상시 잡아먹고, 사용자는 「무언가 반영되지 않았다」는 잘못된 인상을 받는다.
 *
 * ② ★ 이 파일의 존재 이유 = **값은 자동 반영되지 않는다**(D-06)
 *   초안의 「0.3초 자동 반영」은 폐기됐다. 값 변경은 더티가 되고, 이 바의 **「수정」을 눌러야만**
 *   서버로 나간다. 이 바가 사라지는 순간이 곧 「반영됐다」는 신호다.
 *   ★ 다만 **스위치는 그 규율 밖**이다(D-05) — 스위치를 켜면 그 시점의 더티 값까지 함께
 *     나간다. 그 사실을 `hint` 가 **상시 고지**한다. 스위치를 막지 않는 대신 숨기지 않는다.
 *
 * ③ ★ LOCKED 색 규칙 (UI-SPEC §토큰 충돌 경보 · S-6)
 *   이 저장소의 `--primary` 는 `--down`(매도 파랑)과 **값이 완전히 같다**. 그래서 채움 버튼의
 *   글자색에 `--primary-fg` 라는 이름을 쓰지 않고, 값이 완전히 동일한 `--destructive-fg`
 *   (light `#FFFFFF` / dark `oklch(0.10 0 0)`)로 대체한다 — `order-panel.tsx` ④ 와 같은 규율이다.
 *
 * ④ ★ 포커스를 빼앗지 않는다
 *   `role="status"` + `aria-live="polite"` 다. 값을 입력하는 도중에 바가 나타나므로 포커스를
 *   옮기면 그 순간 타이핑이 끊긴다. `alert`/`alertdialog` 가 아니고 자동 포커스도 없다.
 *   등장은 **fade 120ms** — slide-up 은 하단 입력 위로 미끄러져 들어오면서 탭 순서를 시각적으로
 *   흔든다(그리고 `prefers-reduced-motion` 에서 전환 자체가 꺼진다).
 *
 * ⑤ 토스트를 쓰지 않는다 (UI-SPEC D3)
 *   저장소에 토스트 라이브러리가 없고, 「미반영」은 사라지면 안 되는 상태다. 몇 초 뒤 스스로
 *   없어지는 알림에 담으면 사용자가 미반영 값을 그대로 두고 화면을 떠난다.
 *
 * ⑥ ★ 우측에 **AI 채팅 버튼 자리를 비워 둔다** (16-13 실측 결함)
 *   `app/layout.tsx` 의 `ChatFab` 은 `fixed right-6 bottom-6 z-40` 이라 이 바와 **정확히
 *   같은 z-축·같은 구석**을 쓴다. DOM 순서상 FAB 이 뒤라 겹치는 자리에서 포인터 이벤트를
 *   가로채고, 그 결과 **「수정」이 눌리지 않는다** — 이 화면의 1차 CTA 가 통째로 죽는다
 *   (E2E 케이스 4 가 실측으로 잡았다).
 *   z-index 를 올려 FAB 을 덮지 않는다. 덮으면 이번엔 채팅 진입점이 조용히 사라진다.
 *   대신 버튼 묶음이 FAB 영역 밖에 놓이도록 **오른쪽 여백을 비운다.** 두 컨트롤이 서로를
 *   가리지 않는 유일한 배치다.
 *   ⚠️ FAB 폭은 라벨 길이에 따라 변한다(실측 83px + 우측 24px). 고정 여백은 그 값을
 *      **가정**하는 것이므로, 가정이 깨지는 순간을 `trading-limit-chaser.spec.ts` 케이스 4 의
 *      **좌표 단언**이 잡는다 — 숫자만 남기면 라벨이 길어졌을 때 조용히 다시 겹친다.
 */

import { cn } from '@/lib/utils';

export interface DirtyActionBarProps {
  /** 미반영 필드 수. **0 이면 렌더하지 않는다.** */
  dirtyCount: number;
  /** 전송 중 — 버튼 비활성 + `반영 중…`. 응답(또는 타임아웃) 전까지 다시 열지 않는다. */
  submitting?: boolean;
  /** 「수정」 — 표시값 전체를 `crud "C"` 로 전송한다. */
  onSubmit: () => void;
  /** 「되돌리기」 — 폼을 서버값으로 되돌린다. **전송하지 않는다.** */
  onRevert: () => void;
  /**
   * 보조문. 표면마다 다르다 —
   *   상따: `「수정」을 눌러야 반영돼요 · 스위치를 켜면 변경한 값까지 함께 반영돼요`
   *   VI:   `「수정」을 눌러야 반영돼요 · 가동 상태(run)는 그대로 유지돼요`
   */
  hint: string;
  className?: string;
}

export function DirtyActionBar({
  dirtyCount,
  submitting = false,
  onSubmit,
  onRevert,
  hint,
  className,
}: DirtyActionBarProps) {
  // 더티 0 → **렌더 자체를 하지 않는다**(UI-SPEC A10 「빈」 열).
  if (dirtyCount <= 0) return null;

  return (
    <div
      data-slot="dirty-action-bar"
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-[var(--s-2)]',
        'border-t border-[var(--primary)] bg-[color-mix(in_oklch,var(--card)_96%,transparent)]',
        // 오른쪽 128px = FAB 영역(우측 24 + 실측 폭 83) + 여유 21. 파일 상단 ⑥.
        'py-[var(--s-2)] pl-[var(--s-4)] pr-[128px] backdrop-blur-[8px]',
        // 등장은 fade 120ms — slide-up 금지(파일 상단 ④). reduced-motion 에서는 전환 없음.
        'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-[120ms]',
        className,
      )}
    >
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <b className="block text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          변경한 값 {dirtyCount}개가 아직 서버에 반영되지 않았어요
        </b>
        <small className="block text-[11px] text-[var(--muted-fg)]">{hint}</small>
      </div>

      <button
        type="button"
        onClick={onRevert}
        disabled={submitting}
        className={cn(
          'h-10 flex-1 shrink-0 rounded-[var(--r-md)] border border-[var(--border)] px-[var(--s-4)] sm:flex-none',
          'bg-[var(--bg)] text-[length:var(--t-sm)] font-semibold text-[var(--fg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        되돌리기
      </button>

      {/*
        채움 버튼의 글자색은 `--destructive-fg` 다 — 파일 상단 ③. `--primary-fg` 는 값이
        같지만 이름이 accent 축에 있어, 그 이름이 이 파일에 등장하는 순간 매도 파랑과의
        충돌을 grep 으로 감시할 수 없게 된다.
      */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className={cn(
          'h-10 flex-1 shrink-0 rounded-[var(--r-md)] border border-[var(--primary)] px-[var(--s-4)] sm:flex-none',
          'bg-[var(--primary)] text-[length:var(--t-sm)] font-semibold text-[var(--destructive-fg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {submitting ? '반영 중…' : '수정'}
      </button>
    </div>
  );
}
