/**
 * Phase 08 — KST 기반 토론방 날짜 포맷.
 *
 * - 상세 Card: `MM/DD HH:mm` (formatDiscussionCardDate)
 * - `/stocks/[code]/discussions` 페이지: `YYYY-MM-DD HH:mm` (formatDiscussionFullDate)
 * - Timezone: `Asia/Seoul` 고정 — 서버는 ISO-8601 (`Z` 또는 `+09:00`) 을 내려줌.
 * - 외부 날짜 라이브러리 도입 금지 (UI-SPEC Deviation Guardrail §2) — `Intl.DateTimeFormat` 만 사용.
 * - 잘못된 ISO / null / undefined / empty → em-dash (`—`) 반환.
 *
 * Phase 7 `format-news-date.ts` 와 의도적으로 분리되어 있다 (UI-SPEC §20 — 공통 추상화 Deferred).
 */

const PLACEHOLDER = '—';

const CARD_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const FULL_DATE_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function parseSafe(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function partsOf(fmt: Intl.DateTimeFormat, d: Date): Record<string, string> {
  return fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
}

/** 상세 Card 용 — 'MM/DD HH:mm' (KST). */
export function formatDiscussionCardDate(iso: string | null | undefined): string {
  const d = parseSafe(iso);
  if (!d) return PLACEHOLDER;
  const parts = partsOf(CARD_FMT, d);
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

/** /stocks/[code]/discussions 페이지 용 — 'YYYY-MM-DD HH:mm' (KST). */
export function formatDiscussionFullDate(iso: string | null | undefined): string {
  const d = parseSafe(iso);
  if (!d) return PLACEHOLDER;
  const parts = partsOf(FULL_DATE_FMT, d);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
