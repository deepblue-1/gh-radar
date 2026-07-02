"use client";

/**
 * Phase 14 Plan 09 — 인라인 미니 종목카드 (C6, CHAT-01, D-07).
 *
 * 답변 본문 내 종목 언급을 `/stocks/{code}` 로 가는 인라인 카드로 렌더. `--card`+border,
 * 종목명 + `.mono` 코드/가격 + 등락 배지. hover `--muted`.
 *
 * ## 국내 색상 관례 필수 (D-07 / Pitfall 5 / T-14-05c mitigate)
 * 상승(changeRate>0) = 빨강(`--up`/`--up-bg`), 하락(changeRate<0) = 파랑(`--down`/`--down-bg`).
 * 미국식(상승 초록)과 반대 — 한국 트레이더 관례에 맞춘다.
 */

export interface MiniStockCardProps {
  code: string;
  name: string;
  price: number;
  changeRate: number;
}

const PRICE_FMT = new Intl.NumberFormat("ko-KR");

function formatChangeRate(rate: number): string {
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
}

export function MiniStockCard({
  code,
  name,
  price,
  changeRate,
}: MiniStockCardProps) {
  // 국내색상: 상승 --up(빨강) / 하락 --down(파랑) / 보합은 muted.
  const badgeClass =
    changeRate > 0
      ? "bg-[var(--up-bg)] text-[var(--up)]"
      : changeRate < 0
        ? "bg-[var(--down-bg)] text-[var(--down)]"
        : "bg-[var(--muted)] text-[var(--muted-fg)]";

  return (
    <a
      href={`/stocks/${code}`}
      className="my-[var(--s-1)] inline-flex w-fit items-center gap-[var(--s-2)] rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--card)] px-[var(--s-3)] py-[var(--s-2)] text-[var(--fg)] no-underline transition-colors hover:bg-[var(--muted)]"
    >
      <span className="flex items-baseline gap-[var(--s-1)]">
        <span className="text-[length:var(--t-sm)] font-semibold">{name}</span>
        <span className="mono text-[length:11px] text-[var(--muted-fg)]">
          {code}
        </span>
      </span>
      <span className="mono text-[length:var(--t-sm)] font-semibold">
        {PRICE_FMT.format(price)}
      </span>
      <span
        className={`inline-flex h-5 items-center rounded-full px-2 text-[length:11px] font-semibold ${badgeClass}`}
      >
        {formatChangeRate(changeRate)}
      </span>
    </a>
  );
}
