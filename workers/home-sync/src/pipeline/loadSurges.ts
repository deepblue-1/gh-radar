import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isEtpProduct,
  kstDateIso,
  mergeStockFeed,
  takeFeedWithDisclosures,
  type StockFeedKind,
  type StockFeedRpcResult,
} from "@gh-radar/shared";
import type { HomeSyncConfig } from "../config";
import { previousTradingDate } from "./tradingDay";

/**
 * Phase 13 Plan 02 Task 1 — 오늘의 급등 종목 + 종목명 + 종목별 top-K 뉴스 로드.
 *
 * 흐름 (server/src/lib/quoteJoin.ts 청크 패턴 계승):
 *   1. stock_quotes.change_rate >= surgeThreshold AND rate_updated_at >= 오늘 KST 자정 통과분
 *      **전체** 로드 (정렬/cap 은 아직 안 함). 신선도는 등락률 기준 시각 rate_updated_at 으로 판정한다
 *      — updated_at 은 행 쓰기 시각이라 server 상세 on-demand(00:28 KST 전일 스냅샷)·STEP2 hot set
 *      UPDATE 가 어제 change_rate 에 오늘 시각을 붙였다(261001 동일스틸럭스 023790 +29.99%).
 *   2. stocks 마스터에서 code→name/market/security_group 해석 (청크 IN, QUOTE_CHUNK) 후
 *      ETN/ETF/레버리지·인버스 제외(isExcludedProduct) → change_rate desc → surgeMax cap.
 *      **필터가 slice 보다 먼저여야** 제외된 자리를 후순위 일반 종목이 채운다 (slice 를 먼저 하면
 *      제외분만큼 급등 슬롯이 빈 채로 남는다 — quick 260803-it6).
 *   3. (Phase 41 D-19) 급등 종목의 재료 = 합친 피드(공시 · 한투 뉴스 · 네이버 뉴스). code 청크마다
 *      RPC `stock_feed_by_codes`(등록 안 함 · 출처별 종목당 최신 NEWS_CANDIDATES_PER_STOCK 건)를 1회 부르고,
 *      종목마다 shared `mergeStockFeed` 로 한 줄씩 합친다 — **합치기는 server 와 같은 shared 함수**(D-14 한 번만).
 *      그래서 server 응답과 같은 거르기가 홈 AI 입력에도 그대로 적용된다: 한투 auto_market · ETP 연결 숨김(RPC),
 *      네이버는 제목에 종목명이 있는 기사만(RPC · 20261112320000), 시황 제목 제외(mergeStockFeed). 여기서 다시 거르지 않는다.
 *      뉴스 창은 최근 48h, 단 직전 거래일 15:30 KST 가 더 이르면 그 시각부터(월요일·연휴 다음날 전 거래일 저녁 기사 보장,
 *      quick-260915-boq). 청크로 나누는 이유는 한 번에 너무 많은 종목 · 줄을 받지 않으려는 것(D-07 / Pitfall 1 계승).
 *   3b. 종목별 top-K(newsPerStock): 최근 공시 최대 DISCLOSURE_TOP_MAX(2)건 먼저 → 나머지에서 종목명이
 *      title 또는 description 에 든 기사 → 최신순. 종목명 우선(광진실업 케이스 fix)은 시황 라운드업 · 테마 기사가
 *      최신이라는 이유로 종목 특정 재료를 top-K 밖으로 밀어내지 않게 한다. 공시가 0건이면 이전 규칙 그대로다.
 *
 * Claude 입력은 이 Surge[] 로부터 clusterSurges 가 구성한다 (번호 매긴 뉴스 인덱스).
 */

/** 합친 피드 한 줄 (Claude 뉴스 인덱스 해석의 원문 소스 · Phase 41 D-19). */
export interface NewsRow {
  /** 피드 줄 id — `kis:<일련번호>` 또는 `naver:<uuid>` (content_hash 입력). */
  id: string;
  stock_code: string;
  title: string;
  /** 원문 링크 — 공시 · 네이버에 아직 없는 한투 뉴스는 null (D-20). */
  url: string | null;
  /** 자료원(언론사명 · 「거래소 공시」 · 「코스닥 공시」) — 비지 않는다 (D-20). */
  source: string;
  /** 작성 시각 `YYYY-MM-DDTHH:MM:SS.sss+09:00` (고정 폭 — 문자열 비교로 정렬 가능). */
  published_at: string;
  /** Naver Search API 스니펫 (HTML 태그 포함 가능, nullable). 프롬프트 컨텍스트용. */
  description: string | null;
  /** 공시 · 뉴스. */
  kind: StockFeedKind;
}

/** 급등 종목 1건 — 코드/이름/등락률 + 종목별 top-K 뉴스. */
export interface Surge {
  code: string;
  name: string;
  changeRate: number;
  news: NewsRow[];
}

/** stock_quotes / stocks 청크 IN 크기 (PostgREST URL 414 방지) · 피드 RPC 한 번에 넘기는 코드 수. */
const QUOTE_CHUNK = 200;

/** KST(UTC+9) 오프셋 (index.ts computeSlot 와 동일값). */
const KST_OFFSET_MS = 9 * 3600_000;

/**
 * now 기준 오늘 KST 자정(00:00 KST)을 UTC ISO 로 변환.
 * 예: 2026-07-07T08:26:00+09:00 → "2026-07-06T15:00:00.000Z" (오늘 KST 자정 = UTC 전일 15:00).
 * index.ts computeSlot 의 KST→UTC 변환 패턴과 동일 구조 (검증된 방식 재사용).
 */
export function kstMidnightIso(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const midnightKstMs = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    0,
    0,
    0,
  );
  return new Date(midnightKstMs - KST_OFFSET_MS).toISOString();
}

/**
 * 뉴스 후보 창 — 최근 48h, 단 직전 거래일 15:30 KST 가 더 이르면 그 시각부터
 * (월요일·연휴 다음날 전 거래일 저녁 기사 보장, quick-260915-boq).
 * 전일 저녁 공시가 당일 재료이므로 "당일만"은 금물.
 */
const NEWS_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * 뉴스 창 컷오프 = min(now − 48h, 직전 거래일 15:30 KST) 을 UTC ISO 로.
 * 두 시각 중 이른 쪽이라 화~금 커버리지(48h)는 절대 좁아지지 않는다.
 * 예: 2026-09-14(월) 09:05 KST → "2026-09-11T06:30:00.000Z" (금 15:30 KST).
 */
export function newsWindowCutoffIso(now: Date): string {
  const prevTradingDay = previousTradingDate(kstDateIso(now));
  const prevCloseMs = Date.parse(`${prevTradingDay}T15:30:00+09:00`);
  const rollingMs = now.getTime() - NEWS_WINDOW_MS;
  return new Date(Math.min(prevCloseMs, rollingMs)).toISOString();
}

/**
 * 종목당 뉴스 후보 상한 — RPC 출처별 상한(p_per_source)이자 합친 뒤 보관하는 줄 수.
 * newsPerStock(기본 5) 보다 넉넉히 잡아 공시 · 종목명 우선 정렬이 재료 기사를 top-K 안으로
 * 끌어올릴 여지를 확보한다.
 */
const NEWS_CANDIDATES_PER_STOCK = 50;

/** top-K 앞자리에 먼저 두는 최근 공시 수 (Phase 41 D-19) — 공시가 많아도 뉴스 자리를 다 먹지 않게. */
export const DISCLOSURE_TOP_MAX = 2;

/**
 * 홈 급등 집합에서 제외할 파생·지수연동 상품인가 (ETN/ETF/ELW/레버리지·인버스).
 * 지수 하락에 연동된 상품이 "오늘의 급등 테마"로 잡히면 트레이더에게 의미가 없다.
 * 규칙은 shared `isEtpProduct` 하나(Phase 41 D-09 단일 정의) — 그룹(ETF · ETN · ELW) 또는 이름 패턴.
 * 이름 패턴은 security_group 오분류 대비(570127 "한투 인버스2X코스피200선물 ETN" 이 '주권' 으로 적재된 실사례).
 * '스팩' 은 넣지 않는다(ETP 가 아니다). 이름·그룹 둘 다 없으면 false — 마스터 미해석 코드는 통과시킨다.
 */
export function isExcludedProduct(
  name: string | null | undefined,
  securityGroup: string | null | undefined,
): boolean {
  return isEtpProduct(name, securityGroup);
}

/** loadSurges 재시도 옵션 (기본: 빈 결과 시 2회 재시도, 1.5s 간격). 테스트가 delay 0 주입. */
export interface LoadSurgesOptions {
  emptyRetries?: number;
  retryDelayMs?: number;
  /** 신선도·뉴스 창 컷오프 기준 시각 (테스트 주입용). 미지정 시 new Date(). */
  now?: Date;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 종목명이 뉴스 title 또는 description 에 verbatim 부분문자열로 등장하는가 (2단 정렬 우선순위 신호). */
function nameMatches(n: NewsRow, name: string): boolean {
  if (!name) return false;
  if (n.title.includes(name)) return true;
  return n.description ? n.description.includes(name) : false;
}

export async function loadSurges(
  supabase: SupabaseClient,
  cfg: HomeSyncConfig,
  opts: LoadSurgesOptions = {},
): Promise<Surge[]> {
  const emptyRetries = opts.emptyRetries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  // 사이클 기준 시각 1회 고정 — 신선도 컷오프와 뉴스 창 컷오프가 같은 now 를 쓴다(벽시계 직접 읽기 금지).
  const now = opts.now ?? new Date();
  // stale cleanup 없는 stock_quotes(D-21)에서 어제 급등/거래정지 잔존 행 제외 — 등락률 기준 시각
  // (rate_updated_at)이 오늘 KST 자정 이후인 행만. updated_at 필터는 쓰지 않는다: updated_at 은 행 쓰기
  // 시각이라 server 상세 on-demand(00:28 KST 전일 스냅샷)·STEP2 hot set UPDATE 가 어제 change_rate 에
  // 오늘 시각을 붙였다(261001 동일스틸럭스 023790 +29.99%). rate_updated_at 이 NULL 인 행은 제외(fail-safe).
  // 사이클 내 고정값이므로 retry 루프 밖에서 1회 계산.
  const freshnessCutoff = kstMidnightIso(now);

  // 1) 급등 종목 (change_rate >= threshold, rate_updated_at >= 오늘 KST 자정) — 통과분 전체.
  //    정렬/cap 은 2b(제외 필터 뒤)에서 한다.
  //    빈 결과(0행)는 상류 stock_quotes 갱신 갭 / 일시 read blip 일 수 있으므로 (에러 아닌
  //    빈 성공 응답일 때만) 짧게 재시도한다. 진짜 급등 없는 날은 재시도해도 0 → 빠르게 [] 반환.
  let quoteRows: Array<{ code: string; change_rate: number }> = [];
  for (let attempt = 0; attempt <= emptyRetries; attempt++) {
    const { data, error: qErr } = await supabase
      .from("stock_quotes")
      .select("code,change_rate")
      .gte("change_rate", cfg.surgeThreshold)
      .gte("rate_updated_at", freshnessCutoff);
    if (qErr) throw qErr;
    quoteRows = (data ?? []) as Array<{ code: string; change_rate: number }>;
    if (quoteRows.length > 0 || attempt === emptyRetries) break;
    await sleep(retryDelayMs);
  }

  // threshold 통과분 전체 — 정렬/slice 는 제외 필터 이후로 미룬다.
  const passing = quoteRows.map((r) => ({
    code: r.code,
    changeRate: Number(r.change_rate),
  }));

  if (passing.length === 0) return [];

  // 2) 종목명 + 증권그룹 해석 (stocks 마스터, code 청크 IN).
  //    threshold 통과분만 조회하므로 청크 IN 비용은 미미하다.
  const nameByCode = new Map<string, string>();
  const groupByCode = new Map<string, string | null>();
  const passingCodes = passing.map((s) => s.code);
  for (let i = 0; i < passingCodes.length; i += QUOTE_CHUNK) {
    const chunk = passingCodes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase
      .from("stocks")
      .select("code,name,market,security_group")
      .in("code", chunk);
    if (error) throw error;
    for (const m of (data ?? []) as Array<{
      code: string;
      name: string;
      security_group?: string | null;
    }>) {
      nameByCode.set(m.code, m.name);
      groupByCode.set(m.code, m.security_group ?? null);
    }
  }

  // 2b) ETN/ETF/레버리지·인버스 제외 → 등락률 desc → surgeMax cap.
  //     필터가 slice 보다 먼저라 제외된 자리를 후순위 일반 종목이 채운다.
  const surges = passing
    .filter(
      (s) =>
        !isExcludedProduct(nameByCode.get(s.code), groupByCode.get(s.code)),
    )
    .sort((a, b) => b.changeRate - a.changeRate)
    .slice(0, cfg.surgeMax);

  if (surges.length === 0) return [];

  const codes = surges.map((s) => s.code);

  // 3) 종목별 재료 후보 = 합친 피드 (Phase 41 D-19) — code 청크마다 RPC 1회(등록 안 함) → 종목마다 mergeStockFeed.
  //    뉴스 창: min(now−48h, 직전 거래일 15:30 KST) 이후.
  const cutoffIso = newsWindowCutoffIso(now);
  const candidatesByCode = new Map<string, NewsRow[]>();
  for (let i = 0; i < codes.length; i += QUOTE_CHUNK) {
    const chunk = codes.slice(i, i + QUOTE_CHUNK);
    const { data, error } = await supabase.rpc("stock_feed_by_codes", {
      p_codes: chunk,
      p_since: cutoffIso,
      p_per_source: NEWS_CANDIDATES_PER_STOCK,
      p_register: false,
      // 공시가 뉴스 50건에 밀려 빠지지 않게 기간 안 최신 공시를 따로 받는다(by-stock 과 같은 규칙).
      p_min_disclosures: DISCLOSURE_TOP_MAX,
    });
    if (error) throw error;
    const chunkSet = new Set(chunk);
    for (const st of (data as StockFeedRpcResult | null)?.stocks ?? []) {
      // 청크 밖 종목은 무시 (mock/응답이 전체를 줄 수 있으므로 방어).
      if (!chunkSet.has(st.code)) continue;
      const rows: NewsRow[] = takeFeedWithDisclosures(
        mergeStockFeed(st.kis ?? [], st.naver ?? []),
        NEWS_CANDIDATES_PER_STOCK,
        DISCLOSURE_TOP_MAX,
      ).map((it) => ({
          id: it.id,
          stock_code: st.code,
          title: it.title,
          url: it.url,
          source: it.source,
          published_at: it.publishedAt,
          description: it.description,
          kind: it.kind,
        }));
      if (rows.length > 0) candidatesByCode.set(st.code, rows);
    }
  }

  // 3b) 종목별 top-K — 최근 공시 최대 DISCLOSURE_TOP_MAX 건 → (나머지) 종목명 든 기사 → 최신순.
  //     published_at 은 모두 +09:00 고정 폭이라 문자열 비교가 시각 비교다.
  const newsByCode = new Map<string, NewsRow[]>();
  for (const [code, cands] of candidatesByCode) {
    const name = nameByCode.get(code) ?? "";
    const newestFirst = (a: NewsRow, b: NewsRow) => b.published_at.localeCompare(a.published_at);
    const topDisclosures = cands
      .filter((n) => n.kind === "disclosure")
      .sort(newestFirst)
      .slice(0, DISCLOSURE_TOP_MAX);
    const taken = new Set(topDisclosures);
    const rest = cands
      .filter((n) => !taken.has(n))
      .sort((a, b) => {
        const am = nameMatches(a, name) ? 0 : 1;
        const bm = nameMatches(b, name) ? 0 : 1;
        if (am !== bm) return am - bm; // 종목명 든 기사 우선.
        return newestFirst(a, b); // 그룹 내 최신순.
      });
    newsByCode.set(code, [...topDisclosures, ...rest].slice(0, cfg.newsPerStock));
  }

  return surges.map((s) => ({
    code: s.code,
    name: nameByCode.get(s.code) ?? s.code,
    changeRate: s.changeRate,
    news: newsByCode.get(s.code) ?? [],
  }));
}
