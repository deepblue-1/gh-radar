/**
 * Phase 41 — 한투 news-title 응답 행(`KisNewsTitleRow`) → `kis_news_ingest` 들여오기 행(`IngestRow`).
 *
 * 순수 함수만 둔다 — 시계 · 순서 · 호출은 루프(41-08)가 맡는다. 규칙은 2026-11-11 실측 표본
 * (`tests/fixtures/kis-news-title-sample.json`)으로 잠겨 있다.
 *
 * - D-07: 종목이 하나도 연결되지 않은 글은 행으로 만들지 않는다(`stats.unlinked`).
 * - D-11 · Pitfall 2: 종목별 조회로 받은 글은 조회한 종목에 **반드시** 연결하고, 한투가 붙인
 *   `iscd1..10` 도 함께 연결한다. 제목에 종목명이 있는지는 보지 않는다(기각안).
 * - D-09: 연결마다 숨김 사유 — ETP 종목이면 `etp`(shared `isEtpProduct` 단일 정의) · 공시(F/G)인데
 *   제목이 파생상품 안내면 `derivative_notice`. 둘 다 해당하면 종목 성질인 `etp` 를 먼저 쓴다.
 *   저장은 하되 조회에서 뺀다 — 규칙이 바뀌면 DB UPDATE 로 소급한다.
 * - 작성 시각은 `data_dt` + `data_tm`(KST)로 만든다. 일련번호 앞 14자리에서 뽑지 않는다
 *   (표본 350건 중 서울경제 3건 불일치 — 일련번호는 첫 작성, data_dt/tm 은 갱신 시각).
 * - 종목코드는 trim · 대문자 뒤 `SHORT_CODE_RE` 통과 + 종목 정보(meta)에 있는 것만 연결한다.
 *   이름 칸은 종목이 없어도 `" "` 로 오니 이름으로 연결 여부를 판단하지 않는다.
 */
import { SHORT_CODE_RE, isEtpProduct, newsTitleKey, type StockFeedKind } from "@gh-radar/shared";
import type { KisNewsTitleRow } from "../kis/types.js";

/** 공시 제공업체 코드 → 자료원 이름(D-20 — 자료원은 비지 않는다). 그 밖의 코드는 언론사 뉴스. */
export const DISCLOSURE_PROVIDERS: Readonly<Record<string, string>> = Object.freeze({
  F: "거래소 공시",
  G: "코스닥 공시",
});

/**
 * 파생상품 안내 공시 제목(D-09) — ELW · ETN · ETF · 주식선물 · 주식옵션의 상장 · 권리행사 · 폐지 안내.
 * `[ASSUMED]` 실제 파생 안내 제목 표본이 아직 없다 — D-10 사용자 확인에서 다듬는다(바뀌면 hidden_reason 소급 UPDATE).
 * 「파생상품」 은 넣지 않는다 — 회사의 「파생상품거래손실발생」 은 재료 공시다.
 * 공매도 과열종목 지정 같은 시장 조치도 숨기지 않는다. 뉴스(언론사) 제목에는 적용하지 않는다.
 */
export const DERIVATIVE_NOTICE_PATTERN = /ELW|주식워런트증권|ETN|상장지수증권|상장지수펀드|ETF|주식선물|주식옵션/;

/** 연결 숨김 사유 — DB `kis_news_stocks.hidden_reason`(NULL = 표시). */
export type HiddenReason = "etp" | "derivative_notice";

export interface IngestLink {
  code: string;
  hidden_reason: HiddenReason | null;
}

/** `kis_news_ingest(p_rows)` 한 행 — 키 이름은 41-01 pgTAP 이 잠근 계약 그대로. */
export interface IngestRow {
  srno: string;
  provider_code: string;
  source: string;
  kind: StockFeedKind;
  /** 한투 `news_lrdv_code`(비면 null) — 제공업체마다 체계가 달라 표시에 쓰지 않는다. */
  category: string | null;
  title: string;
  /** shared `newsTitleKey(title)` — DB 수정본 키와 웹 · 홈 합치기가 같은 정규화. */
  title_key: string;
  /** `YYYY-MM-DDTHH:MM:SS+09:00`. */
  written_at: string;
  links: IngestLink[];
}

/** 종목 정보(`kis_news_stock_meta` 결과) — ETP 판정에 쓴다. */
export interface StockMeta {
  name: string;
  group: string | null;
}

export interface ClassifyOptions {
  /** 종목별 조회면 그 코드 — 모든 행을 이 코드에 연결한다. 피드 조회면 없음. */
  queriedCode?: string;
  meta: ReadonlyMap<string, StockMeta>;
}

export interface ClassifyStats {
  /** 받은 행 수. */
  total: number;
  /** 연결할 종목이 없어 뺀 글(D-07). */
  unlinked: number;
  /** 모양이 틀리거나 종목 정보에 없어 연결하지 않은 코드 수(연결 칸 단위). */
  unknownCodes: number;
  /** 작성 시각 · 일련번호 · 제목이 잘못돼 뺀 글. */
  invalid: number;
}

const CODE_SLOTS = ["iscd1", "iscd2", "iscd3", "iscd4", "iscd5", "iscd6", "iscd7", "iscd8", "iscd9", "iscd10"] as const;

/**
 * 한투 `data_dt`(YYYYMMDD) + `data_tm`(HHMMSS) KST → `YYYY-MM-DDTHH:MM:SS+09:00`.
 * 형식이 틀리거나 없는 날짜(2월 30일 · 13월) · 시각(25시 · 60분)이면 null.
 */
export function writtenAtOf(dt: string, tm: string): string | null {
  const d = (dt ?? "").trim();
  const t = (tm ?? "").trim();
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) return null;
  const y = Number(d.slice(0, 4));
  const mo = Number(d.slice(4, 6));
  const da = Number(d.slice(6, 8));
  const h = Number(t.slice(0, 2));
  const mi = Number(t.slice(2, 4));
  const s = Number(t.slice(4, 6));
  if (h > 23 || mi > 59 || s > 59) return null;
  const cal = new Date(Date.UTC(y, mo - 1, da));
  if (cal.getUTCFullYear() !== y || cal.getUTCMonth() !== mo - 1 || cal.getUTCDate() !== da) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}+09:00`;
}

function normalizeCode(raw: string | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

/**
 * 한투 응답 행들 → 들여오기 행 + 통계. 입력 순서를 지킨다.
 * `queriedCode` 가 `SHORT_CODE_RE` 를 통과하지 못하면 호출부 버그라 throw 한다.
 */
export function toIngestRows(
  raw: readonly KisNewsTitleRow[],
  opts: ClassifyOptions,
): { rows: IngestRow[]; stats: ClassifyStats } {
  const queried = opts.queriedCode === undefined ? undefined : normalizeCode(opts.queriedCode);
  if (queried !== undefined && !SHORT_CODE_RE.test(queried)) {
    throw new Error(`toIngestRows: 조회 코드 모양이 틀렸다 (${opts.queriedCode})`);
  }

  const stats: ClassifyStats = { total: raw.length, unlinked: 0, unknownCodes: 0, invalid: 0 };
  const rows: IngestRow[] = [];

  for (const r of raw) {
    const srno = (r.cntt_usiq_srno ?? "").trim();
    const provider = (r.news_ofer_entp_code ?? "").trim();
    const title = (r.hts_pbnt_titl_cntt ?? "").trim();
    const titleKey = newsTitleKey(title);
    const writtenAt = writtenAtOf(r.data_dt, r.data_tm);
    if (!srno || !provider || !title || !titleKey || writtenAt === null) {
      stats.invalid += 1;
      continue;
    }

    const disclosureSource = DISCLOSURE_PROVIDERS[provider];
    const kind: StockFeedKind = disclosureSource !== undefined ? "disclosure" : "news";
    const derivative = kind === "disclosure" && DERIVATIVE_NOTICE_PATTERN.test(title);

    const codes: string[] = queried !== undefined ? [queried] : [];
    for (const slot of CODE_SLOTS) {
      const code = normalizeCode(r[slot]);
      if (!code) continue;
      if (!SHORT_CODE_RE.test(code) || !opts.meta.has(code)) {
        stats.unknownCodes += 1;
        continue;
      }
      if (!codes.includes(code)) codes.push(code);
    }
    if (codes.length === 0) {
      stats.unlinked += 1;
      continue;
    }

    const links: IngestLink[] = codes.map((code) => {
      const m = opts.meta.get(code);
      const hidden: HiddenReason | null = m && isEtpProduct(m.name, m.group) ? "etp" : derivative ? "derivative_notice" : null;
      return { code, hidden_reason: hidden };
    });

    const category = (r.news_lrdv_code ?? "").trim();
    rows.push({
      srno,
      provider_code: provider,
      source: (r.dorg ?? "").trim() || disclosureSource || provider,
      kind,
      category: category || null,
      title,
      title_key: titleKey,
      written_at: writtenAt,
      links,
    });
  }

  return { rows, stats };
}
