import { Card } from '@/components/ui/card';

export interface ComingSoonCardProps {
  title: string;
  body: string;
}

/**
 * ComingSoonCard — Phase 7/8 placeholder (UI-SPEC Copywriting).
 * - 제목: Body 14 weight 600
 * - 본문: Body 14 regular muted
 *
 * 카피는 호출부(page.tsx)에서 주입한다 — 본 컴포넌트는 일반 presentational.
 */
export function ComingSoonCard({ title, body }: ComingSoonCardProps) {
  return (
    <Card className="p-4">
      <div className="space-y-2">
        <h3 className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          {title}
        </h3>
        <p className="text-[length:var(--t-sm)] text-[var(--muted-fg)]">
          {body}
        </p>
      </div>
    </Card>
  );
}
