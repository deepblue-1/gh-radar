/**
 * ISIN → 종목명·단축코드 역매핑 (quick-260906 후속 — B2안).
 *
 * 게이트웨이는 잔고·미체결 와이어에 **종목명을 싣지 않는다**. `HoldingState` 는
 * `{isin, stock_qty, sellable_qty, avg_price}` 뿐이고 `UnfilledState` 도 이름이 없다.
 * WinForms 클라이언트도 사정은 같아서, 별도로 받은 종목마스터(`SymbolMasterResp(57)`)를
 * 로컬 맵에 두고 `StockDataManager.GetStockName(code)` 으로 푼다. 즉 **"와이어는 ISIN 만,
 * 이름은 소비자가 마스터로 푼다"** 가 이 게이트웨이의 규약이다.
 *
 * relay 의 **정본은 Supabase `stocks`** 다:
 *   - `stocks.isin` 은 D-28 이 정확히 이 목적으로 만든 컬럼이고 이미 채워져 있다.
 *   - relay 는 이미 서비스롤 Supabase 클라를 들고 있다(`store/supabase.ts`).
 *
 * 그러나 `stocks` 는 master-sync 가 KRX OpenAPI 로 채우고, KRX 는 전 영업일 데이터를 다음
 * 영업일 08:00 에 공개한다 — **상장 당일 종목은 `stocks` 에 없다**(2026-09-23 KR70010S0000).
 * 그 **미스만** 게이트웨이 종목마스터(27/57)가 보조 원천으로 채운다(quick-260923-cqj,
 * `store/gateway-symbols.ts`). 우선순위는 **행 단위**다 — `stocks` 에 ISIN 행이 있으면 그 행이
 * 통째로 이기고(market 이 null 이어도), 필드별 합성은 하지 않는다(D-01). `stocks` 에 code 로는
 * 있지만 `isin` 이 null 인 행(intraday-sync 부트스트랩 행)은 이 맵에 ISIN 으로 색인되지 않으므로
 * 그 ISIN 은 게이트웨이 원소가 푼다.
 *
 * 예전에 게이트웨이를 쓰지 않은 세 이유는 이렇게 풀었다:
 *   - 「누구의 세션에 편승할지」 → relay 전체 **단일 in-flight** 요청 1건, 사용자 수와 무관(D-02).
 *   - 「수 MB 분할 응답 조립」 → 약 10프레임(500종목/프레임)을 seq/total 검증 뒤 원자 교체(D-04).
 *   - 「수신 화이트리스트 확장」 → 57 에 hub 명시 case 를 같은 커밋에 두었다(D-07, PC-12).
 *
 * **하루 1회만 읽는다.** 원천(`stocks`)은 `master-sync` 가 평일 08:10 KST 에 한 번
 * 갱신하므로 그보다 자주 읽을 이유가 없다. 조회마다 DB 를 때리는 설계는 더더욱 안 된다 —
 * 모르는 ISIN 하나가 사용자 수에 비례한 쿼리 폭주로 이어진다. 미스는 그냥 미스로 두고
 * 호출부가 ISIN 을 그대로 보여준다.
 *
 * 하지 않는 것:
 *   - 실패해도 throw 하지 않는다. 이름은 **표시용**이라 relay 기동·주문 경로를 막을
 *     이유가 없다. 실패 시 옛 맵을 그대로 쓰고(첫 로드 실패면 빈 맵) 사유를 남긴다.
 *   - 개별 ISIN 을 지연 조회(lazy fetch)하지 않는다. 위의 폭주 이유와 같다.
 *   - 이름을 쓰지(write) 않는다. `stocks` 의 소유자는 `master-sync` 다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderMarket } from "@gh-radar/shared";

import { logger } from "../logger.js";
import { safePgError } from "./pg-error.js";

/**
 * PostgREST 페이지 크기.
 *
 * `.limit(10000)` 으로는 **1,000행만 온다** — 이 프로젝트의 `db-max-rows` 가 1,000 이라
 * 클라이언트 limit 을 서버가 덮어쓴다(master-sync delist-sweep 이 같은 함정에 3개월
 * 걸려 있었다). 전량을 보려면 `.range()` 페이징뿐이다.
 */
const PAGE_SIZE = 1000;

/** 일일 갱신 시각 (KST). `master-sync` 스케줄 08:10 + 20분 여유. */
const REFRESH_HOUR_KST = 8;
const REFRESH_MINUTE_KST = 30;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 역매핑 1건. 와이어에 실을 값이라 표시·주문 조립에 필요한 최소 필드만 담는다.
 *
 * Phase 16 D-02 로 `market` 이 추가됐다. 브라우저는 `order.new` 에 **ISIN 만** 싣고
 * 단축코드·시장 구분을 보내지 않으므로(D-28 산술 유도 금지), 그 둘을 relay 가 여기서 푼다.
 */
export type SymbolInfo = {
  /** 6자 단축코드. `dma_orders.stock_code` 에 들어갈 값이다. */
  code: string;
  /** 종목명. */
  name: string;
  /**
   * 게이트웨이 시장 구분. **모르면 `null` 이고 기본값으로 메우지 않는다** (T-16-05).
   *
   * 주문 조립 단계가 `null` 을 명시 거부한다 — `"K"` 로 메우면 코스닥 주문이 코스피로 나간다.
   */
  market: OrderMarket | null;
  /**
   * 원천 표식. **없으면 Supabase `stocks` 정본**이고, `"gateway"` 면 게이트웨이 종목마스터(57)
   * 보조 원천이다(quick-260923-cqj). `dma_orders.stock_code` 가 FK → `stocks(code)` 라서 이
   * 구분이 필요하다 — 게이트웨이 코드는 `stocks` 에 없을 수 있다(`stocksCodeOf`).
   */
  source?: "gateway";
};

/**
 * `dma_orders.stock_code` 에 쓸 코드 (D-06). FK → `stocks(code)`
 * (`supabase/migrations/20260905120200_dma_orders.sql:53`) 라서 **Supabase 원천일 때만** 코드를
 * 돌려준다. 게이트웨이 원천이면 `null` 이다 — 그 코드를 그대로 쓰면 insert 가 FK 위반으로
 * 실패해 수동 주문은 거부되고 자동주문 감사 행은 사라진다. 표시용 보강에는 이 함수를 쓰지 않는다.
 */
export function stocksCodeOf(info: SymbolInfo | undefined): string | null {
  if (info === undefined || info.source === "gateway") return null;
  return info.code;
}

/** Hub 가 요구하는 최소 표면. 테스트가 DB 없이 주입할 수 있게 좁게 잡는다. */
export interface SymbolLookup {
  lookup(isin: string): SymbolInfo | undefined;
}

type StockRow = {
  code: string;
  name: string;
  isin: string;
  /** `"KOSPI"` / `"KOSDAQ"` 원문. 게이트웨이 1자 코드로는 `toOrderMarket` 이 좁힌다. */
  market: string | null;
  is_delisted: boolean;
};

/**
 * 시장 구분 변환의 **유일한 지점** (D-21). `server/src/services/dma-orders.ts` 에서 이식했다 —
 * 주문 경로가 REST 에서 wss 로 넘어오면서(D-02) 변환이 필요한 곳도 relay 로 따라왔다.
 *
 * 게이트웨이는 이 필드의 **첫 글자만** 읽는다. 그래서 호출부마다 문자열을 지어내면
 * `"KOSDAQ"` 이 어느 날 `K` 로 읽혀 **엉뚱한 시장으로 주문이 나간다**.
 *
 * **모르는 값은 지어내지 않고 `null` 이다.** 기본값 `"K"` 로 메우면 코스닥 주문이
 * 코스피로 나가고, 그것은 조용히 성공한 것처럼 보이는 오주문이다 (T-16-05).
 */
export function toOrderMarket(market: string | null): OrderMarket | null {
  if (market === "KOSPI") return "K";
  if (market === "KOSDAQ") return "Q";
  return null;
}

/**
 * 다음 갱신까지 남은 ms. `now` 는 테스트 주입용.
 *
 * KST 벽시계로 오늘 08:30 이 아직 안 지났으면 오늘, 지났으면 내일이다.
 * 요일을 가리지 않는 이유: `master-sync` 가 못 돈 날은 같은 데이터를 다시 읽을 뿐이고,
 * "주말엔 안 읽는다" 같은 조건을 넣으면 그 조건이 틀렸을 때 조용히 옛 이름을 계속 쓴다.
 */
export function msUntilNextRefresh(now: number = Date.now()): number {
  return msUntilKst(REFRESH_HOUR_KST, REFRESH_MINUTE_KST, now);
}

/**
 * 다음 KST `hour:minute` 까지 남은 ms. 오늘 그 시각이 아직 안 지났으면 오늘, 지났으면(같으면) 내일.
 * `msUntilNextRefresh`(08:30)와 게이트웨이 종목마스터 경계(07:30, `gateway-symbols.ts`)가 같이 쓴다.
 */
export function msUntilKst(hour: number, minute: number, now: number = Date.now()): number {
  const kstNow = now + KST_OFFSET_MS;
  const dayStart = Math.floor(kstNow / DAY_MS) * DAY_MS;
  const todayTarget = dayStart + (hour * 60 + minute) * 60 * 1000;
  const target = todayTarget > kstNow ? todayTarget : todayTarget + DAY_MS;
  return target - kstNow;
}

/**
 * ISIN → `{code, name, market}` 메모리 맵. 부팅 시 1회 + 매일 08:30 KST 재적재.
 *
 * 사용법: `const symbols = new SymbolMap(supabase); await symbols.start();`
 * → `symbols.lookup(isin)`. 종료 시 `symbols.close()` 로 타이머를 끈다.
 */
export class SymbolMap implements SymbolLookup {
  readonly #supabase: SupabaseClient;
  #byIsin = new Map<string, SymbolInfo>();
  #timer: NodeJS.Timeout | null = null;
  #loadedAt: Date | null = null;
  /** `stocks` 미스일 때만 보는 보조 원천(게이트웨이 종목마스터). 없으면 미스는 미스다. */
  readonly #fallback: SymbolLookup | undefined;

  constructor(supabase: SupabaseClient, opts?: { fallback?: SymbolLookup }) {
    this.#supabase = supabase;
    this.#fallback = opts?.fallback;
  }

  /** 즉시 1회 적재하고 다음 08:30 KST 갱신을 예약한다. 적재 실패해도 예약은 건다. */
  async start(): Promise<void> {
    await this.refresh();
    this.#schedule();
  }

  /**
   * `stocks` 전량을 다시 읽어 맵을 **통째로 교체**한다.
   *
   * 부분 갱신(누적 merge)을 하지 않는 이유: 상장폐지·종목명 변경이 반영되지 않고
   * 옛 이름이 영원히 남는다. 교체는 새 맵을 다 만든 뒤 마지막에 한 번 바꾸므로,
   * 도중에 조회가 들어와도 반쪽 맵을 보지 않는다.
   *
   * @returns 적재 성공 시 건수, 실패 시 `null`(옛 맵 유지)
   */
  async refresh(): Promise<number | null> {
    const next = new Map<string, SymbolInfo>();
    try {
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await this.#supabase
          .from("stocks")
          .select("code, name, isin, market, is_delisted")
          .not("isin", "is", null)
          // 페이지 사이에 순서가 흔들리면 어떤 행은 두 번 오고 어떤 행은 영영 안 온다.
          .order("code", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error !== null) throw error;

        const page = (data ?? []) as StockRow[];
        for (const row of page) {
          if (!row.isin || !row.code || !row.name) continue;
          // 상장폐지 행도 담는다 — 당일 폐지된 종목을 아직 들고 있을 수 있고,
          // 그때 ISIN 원문보다 옛 이름이라도 보이는 편이 낫다. 단 같은 ISIN 이
          // 활성·폐지로 겹치면 **활성이 이긴다**.
          const prev = next.get(row.isin);
          if (prev !== undefined && row.is_delisted) continue;
          next.set(row.isin, {
            code: row.code,
            name: row.name,
            // 모르는 시장은 `null` 로 남긴다 — 이름 표시는 되고 주문만 막힌다.
            market: toOrderMarket(row.market ?? null),
          });
        }
        if (page.length < PAGE_SIZE) break;
      }
    } catch (error) {
      // 이름은 표시용이다 — 실패로 relay 를 멈추지 않는다. 다만 조용히 넘기지도 않는다.
      // `stocks` 조회 오류도 같은 규율을 지난다 (16-38 / R2-CR-03) — 이 표면 자체는
      // 공개 마스터라 값이 민감하지 않지만, 「PostgREST 오류를 통째로 싣는 로그」를 한 줄이라도
      // 남겨 두면 그것이 다음 복사의 원본이 된다. → `store/pg-error.ts`
      logger.error(
        { pgError: safePgError(error), cachedCount: this.#byIsin.size },
        "[SYM] 종목마스터 적재 실패 — 기존 맵 유지 (이름 없는 ISIN 은 원문 표시)",
      );
      return null;
    }

    this.#byIsin = next;
    this.#loadedAt = new Date();
    logger.info({ count: next.size }, "[SYM] 종목마스터 적재");
    return next.size;
  }

  /**
   * `stocks` 맵이 먼저이고, **미스일 때만** 보조 원천을 본다 (D-01 — 행 단위 우선순위).
   * 둘 다 모르면 `undefined`. 호출부는 ISIN 원문으로 폴백한다.
   */
  lookup(isin: string): SymbolInfo | undefined {
    return this.#byIsin.get(isin) ?? this.#fallback?.lookup(isin);
  }

  /** `/healthz` 요약. 식별자를 담지 않는다. */
  stats(): { symbolCount: number; loadedAt: string | null } {
    return {
      symbolCount: this.#byIsin.size,
      loadedAt: this.#loadedAt === null ? null : this.#loadedAt.toISOString(),
    };
  }

  /** 예약 타이머를 끈다. 남기면 프로세스가 안 내려간다. */
  close(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #schedule(): void {
    this.close();
    const delay = msUntilNextRefresh();
    this.#timer = setTimeout(() => {
      void this.refresh().finally(() => this.#schedule());
    }, delay);
    // 이벤트 루프를 붙들지 않는다 — 이 타이머 하나 때문에 종료가 지연되면 안 된다.
    this.#timer.unref?.();
    logger.info({ nextRefreshInMs: delay }, "[SYM] 다음 종목마스터 갱신 예약");
  }
}
