import { SearchX } from 'lucide-react';

/**
 * Scanner 빈 결과 블록 (UI-SPEC §Wireframes §3).
 * 조건에 맞는 종목이 없을 때 사용자에게 필터 완화를 안내한다.
 */
export function ScannerEmpty() {
  return (
    <div
      role="status"
      className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-6 text-center"
    >
      <SearchX
        aria-hidden="true"
        className="size-10 text-[var(--muted-fg)]"
      />
      <p className="text-[length:var(--t-base)] font-semibold text-[var(--fg)]">
        조건에 맞는 종목이 없습니다
      </p>
      <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
        임계값을 낮추거나 마켓 필터를 넓혀보세요.
      </p>
    </div>
  );
}
