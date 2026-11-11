// RED 스텁 — GREEN 커밋에서 실제 분류로 바뀐다.
import type { StockFeedKind } from "@gh-radar/shared";
import type { KisNewsTitleRow } from "../kis/types.js";

export const DISCLOSURE_PROVIDERS: Readonly<Record<string, string>> = {};
export const DERIVATIVE_NOTICE_PATTERN = /$^/;

export type HiddenReason = "etp" | "derivative_notice";
export interface IngestLink {
  code: string;
  hidden_reason: HiddenReason | null;
}
export interface IngestRow {
  srno: string;
  provider_code: string;
  source: string;
  kind: StockFeedKind;
  category: string | null;
  title: string;
  title_key: string;
  written_at: string;
  links: IngestLink[];
}
export interface StockMeta {
  name: string;
  group: string | null;
}
export interface ClassifyOptions {
  queriedCode?: string;
  meta: ReadonlyMap<string, StockMeta>;
}
export interface ClassifyStats {
  total: number;
  unlinked: number;
  unknownCodes: number;
  invalid: number;
}

export function writtenAtOf(_dt: string, _tm: string): string | null {
  return null;
}

export function toIngestRows(
  raw: readonly KisNewsTitleRow[],
  _opts: ClassifyOptions,
): { rows: IngestRow[]; stats: ClassifyStats } {
  return { rows: [], stats: { total: raw.length, unlinked: 0, unknownCodes: 0, invalid: 0 } };
}
