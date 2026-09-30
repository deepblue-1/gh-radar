'use client';

/**
 * UnfilledProgress — 미체결 잔량진행률 **B안 한 줄** (Phase 25 · UI-SPEC ④ · 결정 7-A).
 *
 * 규율 (정본: 25-CONTEXT D-11~D-13 · 25-UI-SPEC ④ · R16 · R17):
 *   - **웹은 계산하지 않는다.** 값은 `progressView`(webapp/src/lib/queue-progress.ts)가 서버 값
 *     (`remaining_volume` · `progress_bp`)을 클램프한 보기 값 그대로다. 이 파일에 산술이 없는 것이
 *     그 계약의 증거다 — 남은 수량 · % · near · 값 텍스트를 여기서 다시 만들지 않는다.
 *   - D-11 항목이 없으면 이 컴포넌트를 **부르지 않는다**(호출부 `account-panel.tsx` 가 `null` 을 본다).
 *   - D-12 「· 0주」 · 100% 는 `view.full` — 채움 `--up`(「곧 내 차례」). 99.9% 를 100% 로 올리지
 *     않는 floor 규칙도 `progressView` 몫이다(R16).
 *   - D-13 오래된 값 표식이 없다 — 스토어가 마지막 값을 유지한다.
 *   - 문구는 WinForms 와 같은 말이다(quick-260930-fi4) — 대기 「{그룹} · {N}주 [막대] {P}%」 · 100%
 *     「{그룹} · 0주 [막대] 100%」 · first_filled 「{그룹} · 체결 시작 [막대] {P}%」. 두 모양이 같은 문구다(P-1).
 *   - 두 모양 — 차이는 **레이아웃뿐**이다:
 *       `row`     데스크톱 보조행(마이페이지 기본 표 · 공용 패널 임베드 · 카드 탭 임베드 — 세 표면 같은
 *                 문구 · R17), 한 줄 nowrap. 막대는 140px 이 기본이고 칸이 모자라면 **막대만** 40px 까지
 *                 줄어든다 — 보조행이 표 폭을 결정하지 않게 하는 짝(`UnfilledProgressRow` 의 `w-0 min-w-full`)
 *                 이다. 그래도 넘치면 표 가로 스크롤이 받는다(잘림 0).
 *       `compact` 모바일 카드 r3 — **막대가 유일한 신축 항목**(`flex-1 min-w-0`)이고 나머지는 `flex-none`
 *                 이다 — account-panel ⑧ 「신축 1개 + 나머지 flex-none」 규율의 r3 판(잘림 0).
 *   - 90% 이상 · full → 채움 `--up`(`data-near`) · 미만 `--primary`. 색만으로 말하지 않도록 숫자 % 가
 *     늘 함께 있고, 막대는 `role="progressbar"` + 값 속성 4종 + 이름 · 값 텍스트를 갖는다(WCAG 1.4.1).
 *   - `muted` = 취소 보관(`pendingCancelSent`) 행 — 숫자 `--muted-fg` · 채움 `--faint`(near 여도). 취소가
 *     이미 나간 주문을 「곧 내 차례」 빨강으로 부르지 않는다(R16). 종류명도 함께 죽인다 — 행 전체가
 *     회색인데 한 조각만 살아 있으면 살아 있는 주문으로 읽힌다(account-panel ⑨).
 *   - `selected` = 선택된 미체결 행(⑩) — 선택 배경(accent) 위라 `--fg` 조각을 `--accent-fg` 로 바꾼다
 *     (행의 다른 셀 · SideTag 와 같은 규칙).
 *   - first_filled(quick-260930-fi4 · `view.firstFilled`) — 두 모양 모두 「{그룹} · 체결 시작 [막대] {P}%」.
 *     막대는 서버가 첫 체결 순간 고정한 % 그대로이고 대기(near · 「곧 내 차례」)로 칠하지 않는다 — 채움
 *     `--primary`(muted 면 `--faint`), 루트 `data-first-filled`. 이 분기에도 산술이 없다.
 *   - 새 토큰 0 · 이 한 줄은 클릭 대상이 아니다(버튼 · 핸들러 없음).
 *
 * 문구 조각(수량 꼬리 「주」 · 막대 이름 · `PROGRESS_FIRST_FILLED_TEXT`)은 상수 한 곳에 둔다 — gh-trade 와
 * 합의된 공용 문구가 바뀌면 여기와 `progressView` 의 값 텍스트만 고친다.
 */

import { PROGRESS_FIRST_FILLED_TEXT, type ProgressView } from '@/lib/queue-progress';
import { cn } from '@/lib/utils';

/** 막대 접근성 이름(UI-SPEC 접근성 계약). */
export const UNFILLED_PROGRESS_BAR_LABEL = '체결예상까지 진행률';
/** 수량 꼬리 — WinForms 와 같은 「N주」. */
const QTY_TAIL = '주';

const NUMBER_FORMAT = new Intl.NumberFormat('ko-KR');

export interface UnfilledProgressProps {
  /** `progressView(item)` 결과 — 이 컴포넌트는 그대로 그린다. */
  view: ProgressView;
  /** `row` = 데스크톱 보조행 한 줄 · `compact` = 모바일 카드 r3. */
  variant: 'row' | 'compact';
  /** 취소 보관 행 — 숫자 `--muted-fg` · 채움 `--faint`. */
  muted?: boolean;
  /** 선택된 미체결 행 — `--fg` 조각을 `--accent-fg` 로. `muted` 가 우선한다. */
  selected?: boolean;
  className?: string;
}

export function UnfilledProgress({
  view,
  variant,
  muted = false,
  selected = false,
  className,
}: UnfilledProgressProps) {
  const compact = variant === 'compact';
  const strong = muted
    ? 'text-[var(--muted-fg)]'
    : selected
      ? 'text-[var(--accent-fg)]'
      : 'text-[var(--fg)]';
  const fill = muted
    ? 'bg-[var(--faint)]'
    : view.near && !view.firstFilled
      ? 'bg-[var(--up)]'
      : 'bg-[var(--primary)]';
  const remaining = NUMBER_FORMAT.format(view.remaining);

  const bar = (
    <div
      role="progressbar"
      aria-label={UNFILLED_PROGRESS_BAR_LABEL}
      aria-valuenow={view.pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={view.valueText}
      data-slot="unfilled-progress-bar"
      className={cn(
        'relative h-1.5 overflow-hidden rounded-full bg-[var(--muted)]',
        // row — 기본 140px, 칸이 모자라면(카드 탭 폰 폭) 막대만 40px 까지 줄어든다(문장 · % 는 flex-none).
        compact ? 'min-w-0 flex-1' : 'w-[140px] min-w-10 shrink',
      )}
    >
      <div
        data-slot="unfilled-progress-fill"
        style={{ width: `${view.pct}%` }}
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none',
          fill,
        )}
      />
    </div>
  );

  return (
    <div
      data-slot="unfilled-progress"
      data-variant={variant}
      data-near={view.near && !view.firstFilled ? 'true' : undefined}
      data-first-filled={view.firstFilled ? 'true' : undefined}
      data-muted={muted ? 'true' : undefined}
      className={cn(
        'flex min-w-0 items-center gap-2 text-[11px] leading-[1.5] whitespace-nowrap text-[var(--muted-fg)]',
        compact ? 'mt-1.5' : 'pl-0.5',
        className,
      )}
    >
      <span data-slot="unfilled-progress-kind" className={cn('flex-none font-semibold', strong)}>
        {view.groupLabel}
      </span>
      <span className="flex-none">·</span>
      <span data-slot="unfilled-progress-amount" className="flex-none">
        {view.firstFilled ? (
          <b className={cn('font-semibold', strong)}>{PROGRESS_FIRST_FILLED_TEXT}</b>
        ) : (
          <>
            <b className={cn('mono font-semibold', strong)}>{remaining}</b>
            {QTY_TAIL}
          </>
        )}
      </span>
      {bar}
      <b className={cn('mono flex-none font-semibold', strong)}>{view.pct}%</b>
    </div>
  );
}
