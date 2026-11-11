/**
 * Phase 41 — 종목 뉴스·공시 피드 조회 계약 + 합치기 규칙(규칙의 단일 정의 — server · home-sync 가 같이 쓴다).
 *
 * - D-04 · D-03: `GET /api/news/by-stock` 응답(`NewsByStockResponse`) — gh-trade 클라가 이 모양에 맞춰 배포된다(costly).
 *   시각은 전부 `+09:00` 오프셋 명시(`toKstOffsetIso`) · 글 없는 코드도 `items: []` · 수집 전이면 `collectedAt: null`.
 * - D-14: 거르기 · 합치기는 gh-radar 에서 한 번 — DB RPC `stock_feed_by_codes` 는 출처별 원 행(`StockFeedRpc*Row`)만 주고,
 *   한 줄로 만드는 규칙은 이 파일의 `mergeStockFeed` 하나뿐이다.
 * - D-20: 모든 줄에 `source` 가 비지 않는다 — 네이버 출처가 없으면 `NAVER_SOURCE_FALLBACK`.
 *
 * 현재 합치기 규칙: 한투 · 네이버 행을 각각 한 줄로 바꿔 publishedAt 내림차순(같으면 공시 먼저 · 그다음 id)으로 정렬한다.
 */

/** 줄 종류 — 공시(한투 제공업체 F · G) 또는 뉴스(한투 언론사 · 네이버). */
export type StockFeedKind = "news" | "disclosure";

/** 응답 한 줄 — 한투 · 네이버가 같은 기사면 합친 한 줄. */
export interface StockFeedItem {
  /** `kis:<일련번호>` 또는 `naver:<uuid>` — 합친 줄은 먼저 받은 쪽 id(나중에 링크가 붙어도 불변). */
  id: string;
  kind: StockFeedKind;
  /** 작성 시각 `YYYY-MM-DDTHH:MM:SS.sss+09:00`. */
  publishedAt: string;
  title: string;
  /** 자료원(「거래소 공시」 · 「코스닥 공시」 · 언론사명) — 비지 않는다(D-20). */
  source: string;
  /** 한투가 붙인 종목코드(숨김 연결 제외) — 네이버 단독 줄은 빈 배열. */
  stockCodes: string[];
  /** 원문 링크 — 공시 · 네이버에 아직 없는 한투 뉴스는 null(D-20 · 링크 아닌 글자로 표시). */
  url: string | null;
  /** 네이버 요약문 — 없으면 null. */
  description: string | null;
  /** gh-radar 가 받은 시각 `+09:00`. */
  receivedAt: string;
}

/** 종목 하나의 묶음. */
export interface StockFeedEntry {
  code: string;
  /** 종목별 조회 마지막 성공 `+09:00` — null = 아직 수집 전(D-06). 글 0건이어도 수집했으면 시각이 있다. */
  collectedAt: string | null;
  /** 기간 안 합친 뒤 줄 수(출처별 상한 `stockFeedPerSource(limit)` 안에서 센 값). */
  count: number;
  /** 출처별 상한에 닿아 더 오래된 글이 있을 수 있으면 true. */
  truncated: boolean;
  /** 최신순 최대 limit 줄. */
  items: StockFeedItem[];
}

/** `GET /api/news/by-stock` 응답. */
export interface NewsByStockResponse {
  /** 응답 만든 시각 `+09:00`. */
  asOf: string;
  /** 전체 흐름 마지막 성공 수집 `+09:00` — 수집기 생존 표시(없으면 null). */
  feedAt: string | null;
  /** 입력 코드 순서 · 글 없는 코드 포함. */
  stocks: StockFeedEntry[];
}

/** RPC `stock_feed_by_codes` 의 한투 원 행(pgTAP B8 키 집합과 같다). */
export interface StockFeedRpcKisRow {
  srno: string;
  kind: StockFeedKind;
  source: string;
  title: string;
  title_key: string;
  written_at: string;
  received_at: string;
  codes: string[];
}

/** RPC `stock_feed_by_codes` 의 네이버 원 행(pgTAP B9 키 집합과 같다). */
export interface StockFeedRpcNaverRow {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  url: string;
  published_at: string;
  created_at: string;
}

/** RPC 결과의 종목 하나. */
export interface StockFeedRpcStock {
  code: string;
  collected_at: string | null;
  kis: StockFeedRpcKisRow[];
  naver: StockFeedRpcNaverRow[];
}

/** RPC `stock_feed_by_codes` 결과(jsonb 단일 값). */
export interface StockFeedRpcResult {
  feed_at: string | null;
  stocks: StockFeedRpcStock[];
}

/** 기본 기간(일) — D-08. */
export const STOCK_FEED_DEFAULT_DAYS = 3;
/** 기간 상한(일). */
export const STOCK_FEED_MAX_DAYS = 7;
/** 종목당 기본 줄 수. */
export const STOCK_FEED_DEFAULT_LIMIT = 20;
/** 종목당 줄 수 상한. */
export const STOCK_FEED_MAX_LIMIT = 100;
/** 묶음 조회 코드 수 상한. */
export const NEWS_BY_STOCK_MAX_CODES = 100;
/** 앞부분 일치로 같은 기사라 보려면 짧은 쪽 키가 이 글자 수 이상이어야 한다(리서치 뒤 확정). */
export const TITLE_PREFIX_MIN_CHARS = 15;
/** 앞부분 일치로 같은 기사라 보는 작성 시각 차 상한 — 매일 같은 제목(「[표] 외국인 순매수 상위」) 오병합 방지. */
export const SAME_ARTICLE_WINDOW_MS = 12 * 3600_000;
/** 네이버 기사에 출처가 없을 때 표기(D-20). */
export const NAVER_SOURCE_FALLBACK = "네이버 뉴스";

const KST_OFFSET_MS = 9 * 3600_000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/**
 * 시각 → `YYYY-MM-DDTHH:MM:SS.sss+09:00`. +9h 뒤 `getUTC*` 로 읽어 호스트 TZ 와 무관하다.
 * 파싱할 수 없는 값이면 throw(조용히 Invalid Date 문자열을 내보내지 않는다).
 */
export function toKstOffsetIso(input: string | Date): string {
  const ms = input instanceof Date ? input.getTime() : Date.parse(input);
  if (!Number.isFinite(ms)) throw new Error(`toKstOffsetIso: 시각을 읽을 수 없다 (${String(input)})`);
  const d = new Date(ms + KST_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}+09:00`
  );
}

/** 종목당 limit 줄을 만들려고 출처별로 DB 에서 가져올 행 수 — 합치면 줄이 줄어드니 여유 10. */
export function stockFeedPerSource(limit: number): number {
  return Math.min(limit + 10, STOCK_FEED_MAX_LIMIT + 10);
}

/** 제목 정규화 키 — 글자(한글 · 영문 · 한자) · 숫자만 남기고 소문자. 따옴표 · 말줄임 · 괄호 · 공백은 빠진다. */
export function newsTitleKey(title: string): string {
  return title.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function kisItem(r: StockFeedRpcKisRow): StockFeedItem {
  return {
    id: `kis:${r.srno}`,
    kind: r.kind,
    publishedAt: toKstOffsetIso(r.written_at),
    title: r.title,
    source: r.source,
    stockCodes: r.codes,
    url: null,
    description: null,
    receivedAt: toKstOffsetIso(r.received_at),
  };
}

function naverItem(r: StockFeedRpcNaverRow): StockFeedItem {
  return {
    id: `naver:${r.id}`,
    kind: "news",
    publishedAt: toKstOffsetIso(r.published_at),
    title: r.title,
    source: r.source != null && r.source.trim() !== "" ? r.source : NAVER_SOURCE_FALLBACK,
    stockCodes: [],
    url: r.url,
    description: r.description,
    receivedAt: toKstOffsetIso(r.created_at),
  };
}

/** publishedAt 내림차순 · 같은 시각이면 공시 먼저 · 그다음 id 오름차순(결정적). publishedAt 은 모두 +09:00 고정 폭이라 문자열 비교. */
function compareFeedItems(a: StockFeedItem, b: StockFeedItem): number {
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
  if (a.kind !== b.kind) return a.kind === "disclosure" ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 한 종목의 한투 · 네이버 원 행 → 응답 줄(최신순). */
export function mergeStockFeed(kis: StockFeedRpcKisRow[], naver: StockFeedRpcNaverRow[]): StockFeedItem[] {
  const out: StockFeedItem[] = [...kis.map(kisItem), ...naver.map(naverItem)];
  return out.sort(compareFeedItems);
}
