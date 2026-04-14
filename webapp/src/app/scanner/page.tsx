import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError, apiFetch } from '@/lib/api';

/**
 * `/scanner` Phase 4 placeholder.
 * - 서버 컴포넌트에서 `apiFetch('/api/health')` 호출 → 배지로 API 연결 상태 표시
 * - `revalidate = 30` 으로 30초 ISR (Phase 4 D-12, 과도 호출 방지)
 * - Phase 5 에서 실 Scanner UI 로 교체 (URL 유지)
 */
export const revalidate = 30;

interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

type HealthBadgeState =
  | { kind: 'ok'; version: string }
  | { kind: 'fail'; code: string; message: string };

async function fetchHealth(): Promise<HealthBadgeState> {
  try {
    // `revalidate: 30` + `force-cache` 로 30초 ISR 동안 서버측 fetch 캐시 재사용.
    const body = await apiFetch<HealthResponse>('/api/health', {
      cache: 'force-cache',
      next: { revalidate: 30 },
    });
    return { kind: 'ok', version: body.version };
  } catch (err) {
    if (err instanceof ApiClientError) {
      return { kind: 'fail', code: err.code, message: err.message };
    }
    return {
      kind: 'fail',
      code: 'UNKNOWN',
      message: err instanceof Error ? err.message : '알 수 없는 오류',
    };
  }
}

export default async function ScannerPage() {
  const health = await fetchHealth();

  return (
    <AppShell hideSidebar>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[length:var(--t-2xl)] font-bold tracking-[-0.01em] text-[var(--fg)]">
              Scanner
            </h1>
            <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
              실시간 스캐너는 Phase 5 에서 활성화됩니다. 지금은 배포/연결 상태만 확인합니다.
            </p>
          </div>

          {health.kind === 'ok' ? (
            <Badge variant="up" aria-live="polite">
              API 연결: OK · v{health.version}
            </Badge>
          ) : (
            <Badge variant="down" aria-live="polite">
              API 연결: FAIL ({health.code})
            </Badge>
          )}
        </header>

        <section
          aria-label="금융 컬러 배지 데모"
          className="flex flex-wrap items-center gap-2"
        >
          <Badge variant="up">상승 +3.21%</Badge>
          <Badge variant="down">하락 −1.84%</Badge>
          <Badge variant="flat">보합 0.00%</Badge>
        </section>

        <section
          aria-label="스캐너 로딩 미리보기"
          className="flex flex-col gap-2 rounded-[var(--r)] border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
              상한가 근접 종목
            </h2>
            <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              Phase 5 준비 중
            </span>
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </section>

        {health.kind === 'fail' && (
          <p className="text-[length:var(--t-caption)] text-[var(--down)]">
            {health.message}
          </p>
        )}
      </div>
    </AppShell>
  );
}
