'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * CopyTextButton — 일반 텍스트 클립보드 복사 버튼 (quick-260914-jtj, D-03·D-04).
 *
 * - getText 는 클릭 시점에 호출(lazy) → 지금 화면에 보이는 스냅샷과 항상 일치.
 * - navigator.clipboard.writeText 로 일반 텍스트만 쓴다(HTML ClipboardItem 미사용, T-jtj-01).
 * - 상태: idle → copied('복사됨' + 체크) / failed('복사 실패' + X) → RESET_MS 후 idle.
 *   실패는 console.error 로 에러만 남긴다(복사 텍스트는 로그 금지, T-jtj-03). 토스트 라이브러리 없음.
 * - 상태 변화는 sr-only role=status(aria-live=polite)로 안내. 문구를 시각 라벨과 다르게 둬
 *   getByText('복사됨') 같은 정확 조회가 한 요소만 잡는다.
 *
 * 변형:
 *   label 있음 → 캡션 텍스트 버튼(아이콘 + 라벨). ariaLabel 은 반드시 보이는 label 을 포함해야
 *                한다(WCAG 2.5.3 label-in-name).
 *   label 없음 → 32px 아이콘 버튼. 피드백은 absolute 말풍선이라 레이아웃을 밀지 않는다.
 *                말풍선은 아이콘 **위**(bottom-full)에 뜬다 — 아래로 두면 ThemeCard 헤더의
 *                "평균 등락" 캡션 끝을 가린다(390px 실측). 위쪽은 카드 상단 패딩·카드 간 여백뿐.
 *                말풍선에 z-index 를 주지 않는다 — ThemeCard article 은 isolate 가 아니라
 *                z-index 가 sticky 탑바 위로 샐 수 있다(SoloCard isolate 주석과 같은 문제).
 */
export interface CopyTextButtonProps {
  /** 클릭 시점에 호출되어 복사할 텍스트를 반환. */
  getText: () => string;
  /** 고정 접근성 이름. */
  ariaLabel: string;
  /** 보이는 idle 라벨. 생략 시 아이콘 전용 버튼. */
  label?: string;
  /** wrapper span 에 병합. */
  className?: string;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

const RESET_MS = 1800;

const STATUS_ANNOUNCE: Record<CopyStatus, string> = {
  idle: '',
  copied: '클립보드에 복사했습니다',
  failed: '클립보드 복사에 실패했습니다',
};

export function CopyTextButton({
  getText,
  ariaLabel,
  label,
  className,
}: CopyTextButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleClick = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      const clipboard =
        typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        throw new Error('clipboard API unavailable');
      }
      await clipboard.writeText(getText());
      setStatus('copied');
    } catch (err) {
      console.error('[CopyTextButton] clipboard write failed', err);
      setStatus('failed');
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setStatus('idle');
    }, RESET_MS);
  };

  const Icon = status === 'copied' ? Check : status === 'failed' ? X : Copy;
  const iconTone =
    status === 'copied'
      ? 'text-[var(--primary)]'
      : status === 'failed'
        ? 'text-[var(--destructive)]'
        : undefined;
  const feedbackTone =
    status === 'failed' ? 'text-[var(--destructive)]' : 'text-[var(--primary)]';
  const feedbackText = status === 'failed' ? '복사 실패' : '복사됨';

  return (
    <span className={cn('relative inline-flex', className)}>
      {label !== undefined ? (
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={handleClick}
          className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-[6px] py-[2px] text-[length:var(--t-caption)] text-[var(--muted-fg)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Icon aria-hidden="true" className={cn('size-4', iconTone)} />
          <span className={status === 'idle' ? undefined : feedbackTone}>
            {status === 'idle' ? label : feedbackText}
          </span>
        </button>
      ) : (
        <>
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={handleClick}
            className="inline-flex size-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--muted-fg)] transition-colors hover:text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Icon aria-hidden="true" className={cn('size-4', iconTone)} />
          </button>
          {status !== 'idle' && (
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute right-0 bottom-full mb-1 whitespace-nowrap rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--card)] px-[6px] py-[2px] text-[length:var(--t-caption)] font-extrabold',
                feedbackTone,
              )}
            >
              {feedbackText}
            </span>
          )}
        </>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {STATUS_ANNOUNCE[status]}
      </span>
    </span>
  );
}
