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
 * ⑥ 우측 여백은 **없다** — 있었고, 왜 있었고, 왜 없어졌는지 (16-13 → 260912-mvo Q-01 → 260912-ok2 ③)
 *   ⓐ 왜 있었나: AI FAB 이 **전역**이던 시절, 이 바의 오른쪽 끝에 FAB 이 겹쳐 앉아
 *      포인터 이벤트를 가로챘다. 화면 하단의 1차 CTA(「수정」)가 눌리지 않던 실측 결함이고,
 *      그 회피로 `pr-[128px]`(우측 24 + FAB 실측 폭 83 + 여유 21)를 예약했다.
 *   ⓑ 왜 없어졌나: FAB 이 전역이 아니게 됐다. `chat-fab.tsx` 가 `usePathname()` 으로
 *      종목상세 본문(`/stocks/{code}`)만 통과시킨다. 이 바의 소비처는
 *      `limit-chaser-form.tsx` · `vi-settings-card.tsx` **둘뿐**이고 둘 다 `/trading/*` 이라
 *      **같은 화면에 공존할 수 없다.** 겹치지 않는 것을 위해 비워 둔 128px 은 그냥
 *      「아무것도 없는 오른쪽 128px」이고, 좁은 화면에서는 그만큼 버튼 두 개를 왼쪽으로
 *      밀어 붙여 문구를 두 줄로 접었다. 없는 충돌을 피하느라 있는 배치를 망가뜨린 셈이다.
 *   ⓒ ★ **되돌리지 마라 — 다시 판단해야 하는 조건은 이것뿐이다.** 이 바는 공용 컴포넌트다.
 *      「FAB 이 뜨는 표면」(오늘 기준 `/stocks/{code}` 계열)에 이 바를 쓰는 소비처가 새로
 *      붙는 순간, 그리고 **그때만** 겹침이 되살아난다. 그 경우에도 여백 부활은 마지막
 *      수단이다 — 먼저 ⓘ 그 표면에서 FAB 을 숨길 수 있는지, ⓙ 바를 그 표면에서만
 *      `pr` 로 감쌀 수 있는지(`className` prop 이 이미 열려 있다)를 보라. 여기 전역으로
 *      다시 박으면 겹치지 않는 나머지 소비처 전부가 다시 대가를 치른다.
 *      z-index 로 FAB 을 덮는 것은 해법이 아니다 — 덮으면 채팅 진입점이 조용히 사라진다.
 *   ⓓ 회귀 잠금: `limit-chaser-form.test.tsx` 의
 *      「③ 액션 바에 FAB 회피용 오른쪽 여백 예약이 없다」가 **렌더된 className** 에
 *      임의의 `pr-*` 이 하나도 없음을 단언한다. 소스 grep 이 아니다 — 이 주석이 옛 값을
 *      언급하는 순간 grep 게이트는 스스로 무효가 되기 때문이다.
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
        /*
          좌우가 **한 유틸리티**(`px-`)다 — 근거와 「되돌리기 전에 볼 것」은 파일 상단 ⑥.
          `pl-` + `pr-` 두 갈래로 두면 「오른쪽만 조금 더」가 다시 들어올 자리가 생기고,
          회귀 단언도 그 자리를 정확히 가리키지 못한다. 좌우 대칭이 곧 계약이다.
        */
        'py-[var(--s-2)] px-[var(--s-4)] backdrop-blur-[8px]',
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
