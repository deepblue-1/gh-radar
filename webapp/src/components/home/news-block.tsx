import type { HomeNewsRef } from '@gh-radar/shared';

/**
 * NewsBlock — 근거 뉴스 블록 (13-UI-SPEC §Component Inventory · news).
 *
 * 상단 `--border-subtle` 구분선 + (테마 카드만) "근거 뉴스" label(caption 800) +
 * 뉴스 아이템 1~2건. 각 아이템 = 외부 anchor:
 *   `--flat` dot + [제목 14/400 / 출처 12 muted + ↗].
 * hover → 제목 `--primary`.
 *
 * 5원칙 #5 (출처 표기) + Claude 환각 방지: title/url/source 를 **verbatim** 표시(변형 없음).
 * T-13-11 (reverse tabnabbing): 모든 anchor 에 target="_blank" rel="noopener noreferrer".
 */
export interface NewsBlockProps {
  /** 대표 뉴스 (verbatim). 최대 2건 표시. */
  news: HomeNewsRef[];
  /** "근거 뉴스" label 표시 여부 (테마 카드=true, 개별 급등=false). */
  showLabel: boolean;
}

const MAX_NEWS = 2;

export function NewsBlock({ news, showLabel }: NewsBlockProps) {
  if (!news || news.length === 0) return null;

  const items = news.slice(0, MAX_NEWS);

  return (
    <div className="flex flex-col gap-[6px] border-t border-[var(--border-subtle)] pt-[var(--s-3)]">
      {showLabel && (
        <span className="text-[length:var(--t-caption)] font-extrabold tracking-[0.02em] text-[var(--muted-fg)]">
          근거 뉴스
        </span>
      )}
      {items.map((item, i) => (
        <a
          key={`${item.url}-${i}`}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2 text-[var(--fg)] no-underline"
        >
          <span
            aria-hidden="true"
            className="mt-[8px] size-[5px] shrink-0 rounded-full bg-[var(--muted-fg)]"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-[length:var(--t-sm)] font-normal group-hover:text-[var(--primary)]">
              {item.title}
            </span>
            <span className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
              {item.source} <span className="opacity-60">↗</span>
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
