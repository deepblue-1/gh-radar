'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ScannerErrorProps {
  error: Error;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Scanner 에러 카드 — stale-but-visible (UI-SPEC §Wireframes §4).
 * 리스트는 유지한 채 필터 아래에 병기되거나, 초기 로딩 실패 시 단독 렌더된다.
 */
export function ScannerError({ error, onRetry, retrying }: ScannerErrorProps) {
  const code = error instanceof ApiClientError ? error.code : undefined;
  const prefix = code ? `[${code}] ` : '';
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-[var(--r)] bg-[var(--card)] p-6"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor:
          'color-mix(in oklch, var(--destructive) 40%, var(--border))',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="size-5 shrink-0 text-[var(--destructive)]"
        />
        <div className="flex flex-col gap-1 text-[length:var(--t-sm)]">
          <p className="font-semibold text-[var(--fg)]">
            데이터를 불러오는 중 문제가 발생했습니다
          </p>
          <p className="text-[var(--muted-fg)]">
            {prefix}
            {error.message} 잠시 후 다시 시도해주세요.
          </p>
        </div>
      </div>
      <div>
        <Button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-label="스캐너 데이터 다시 시도"
        >
          <RefreshCw
            aria-hidden="true"
            className={cn('size-4', retrying && 'animate-spin')}
          />
          {retrying ? '다시 시도 중...' : '다시 시도'}
        </Button>
      </div>
    </div>
  );
}
