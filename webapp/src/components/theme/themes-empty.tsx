import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * ThemesEmpty — UI-SPEC §S1 "내 테마 empty" + §Copywriting.
 *
 * 로그인 사용자가 아직 내 테마를 만들지 않았을 때 내 테마 섹션에 인라인으로 렌더.
 * 카피 계약: heading '아직 내 테마가 없어요', body '관심 있는 종목을 묶어 …',
 * 생성 CTA '＋ 테마 만들기', 시스템 복사 힌트.
 */
export interface ThemesEmptyProps {
  /** [＋ 테마 만들기] CTA — 생성 모달 오픈. */
  onCreate: () => void;
}

export function ThemesEmpty({ onCreate }: ThemesEmptyProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-start gap-3 rounded-[var(--r)] border border-dashed border-[color-mix(in_oklch,var(--primary)_30%,var(--border))] bg-[var(--card)] p-5"
    >
      <div className="flex items-center gap-2">
        <Sparkles
          aria-hidden="true"
          className="size-5 text-[var(--primary)]"
          strokeWidth={1.5}
        />
        <h3 className="text-[length:var(--t-h4)] font-bold text-[var(--fg)]">
          아직 내 테마가 없어요
        </h3>
      </div>
      <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        관심 있는 종목을 묶어 나만의 테마를 만들어 보세요.
      </p>
      <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
        아래 시스템 테마에서 복사(fork)해서 시작할 수도 있어요.
      </p>
      <Button type="button" onClick={onCreate}>
        ＋ 테마 만들기
      </Button>
    </div>
  );
}
