/**
 * Phase 41 — 뉴스·공시 줄 시각 표기(목업 `.fr .t`).
 *
 * - 같은 KST 날짜: 공시 `HH:MM:SS`(초 단위로 먼저 본 쪽이 의미 있다) · 뉴스 `HH:MM`
 * - 다른 날: `MM/DD`
 * - KST = +9h 뒤 `getUTC*` 로 읽는다 — 호스트 TZ 와 무관하다(`kstDateKey` 와 같은 방식).
 * - 읽을 수 없는 값 → 「—」.
 */
import type { StockFeedKind } from '@gh-radar/shared';

const KST_OFFSET_MS = 9 * 3600_000;
const PLACEHOLDER = '—';
const pad = (n: number) => String(n).padStart(2, '0');

export function formatFeedTime(publishedAt: string, kind: StockFeedKind, now: Date = new Date()): string {
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return PLACEHOLDER;
  const t = new Date(ms + KST_OFFSET_MS);
  const n = new Date(now.getTime() + KST_OFFSET_MS);
  const sameDay =
    t.getUTCFullYear() === n.getUTCFullYear() &&
    t.getUTCMonth() === n.getUTCMonth() &&
    t.getUTCDate() === n.getUTCDate();
  if (!sameDay) return `${pad(t.getUTCMonth() + 1)}/${pad(t.getUTCDate())}`;
  const hm = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  return kind === 'disclosure' ? `${hm}:${pad(t.getUTCSeconds())}` : hm;
}
