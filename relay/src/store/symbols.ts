/**
 * ISIN → 종목명·단축코드 역매핑 (quick-260906 후속 — B2안).
 *
 * 게이트웨이는 잔고·미체결 와이어에 **종목명을 싣지 않는다**. `HoldingState` 는
 * `{isin, stock_qty, sellable_qty, avg_price}` 뿐이고 `UnfilledState` 도 이름이 없다.
 * WinForms 클라이언트도 사정은 같아서, 별도로 받은 종목마스터(`SymbolMasterResp(57)`)를
 * 로컬 맵에 두고 `StockDataManager.GetStockName(code)` 으로 푼다. 즉 **"와이어는 ISIN 만,
 * 이름은 소비자가 마스터로 푼다"** 가 이 게이트웨이의 규약이다.
 *
 * relay 는 그 마스터를 게이트웨이(27/57)가 아니라 **Supabase `stocks` 에서** 얻는다:
 *   - `stocks.isin` 은 D-28 이 정확히 이 목적으로 만든 컬럼이고 이미 채워져 있다.
 *   - 게이트웨이 27/57 을 쓰려면 수신 화이트리스트를 넓히고 수 MB 분할 응답을 조립해야
 *     하는데, 그 프레임은 **사용자 세션에 실려 온다** — 누구의 세션에 편승할지부터
 *     문제가 된다. 이름 표시 하나에 세션 수명을 얽을 이유가 없다.
 *   - relay 는 이미 서비스롤 Supabase 클라를 들고 있다(`store/supabase.ts`).
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

import { logger } from "../logger.js";

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

/** 역매핑 1건. 와이어에 실을 값이라 표시에 필요한 최소 필드만 담는다. */
export type SymbolInfo = {
  /** 6자 단축코드. 주문·취소 요청 키다(`POST /api/orders` 는 ISIN 이 아니라 이 값을 받는다). */
  code: string;
  /** 종목명. */
  name: string;
};

/** Hub 가 요구하는 최소 표면. 테스트가 DB 없이 주입할 수 있게 좁게 잡는다. */
export interface SymbolLookup {
  lookup(isin: string): SymbolInfo | undefined;
}

type StockRow = {
  code: string;
  name: string;
  isin: string;
  is_delisted: boolean;
};

/**
 * 다음 갱신까지 남은 ms. `now` 는 테스트 주입용.
 *
 * KST 벽시계로 오늘 08:30 이 아직 안 지났으면 오늘, 지났으면 내일이다.
 * 요일을 가리지 않는 이유: `master-sync` 가 못 돈 날은 같은 데이터를 다시 읽을 뿐이고,
 * "주말엔 안 읽는다" 같은 조건을 넣으면 그 조건이 틀렸을 때 조용히 옛 이름을 계속 쓴다.
 */
export function msUntilNextRefresh(now: number = Date.now()): number {
  const kstNow = now + KST_OFFSET_MS;
  const dayStart = Math.floor(kstNow / DAY_MS) * DAY_MS;
  const todayTarget = dayStart + (REFRESH_HOUR_KST * 60 + REFRESH_MINUTE_KST) * 60 * 1000;
  const target = todayTarget > kstNow ? todayTarget : todayTarget + DAY_MS;
  return target - kstNow;
}

/**
 * ISIN → `{code, name}` 메모리 맵. 부팅 시 1회 + 매일 08:30 KST 재적재.
 *
 * 사용법: `const symbols = new SymbolMap(supabase); await symbols.start();`
 * → `symbols.lookup(isin)`. 종료 시 `symbols.close()` 로 타이머를 끈다.
 */
export class SymbolMap implements SymbolLookup {
  readonly #supabase: SupabaseClient;
  #byIsin = new Map<string, SymbolInfo>();
  #timer: NodeJS.Timeout | null = null;
  #loadedAt: Date | null = null;

  constructor(supabase: SupabaseClient) {
    this.#supabase = supabase;
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
          .select("code, name, isin, is_delisted")
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
          next.set(row.isin, { code: row.code, name: row.name });
        }
        if (page.length < PAGE_SIZE) break;
      }
    } catch (error) {
      // 이름은 표시용이다 — 실패로 relay 를 멈추지 않는다. 다만 조용히 넘기지도 않는다.
      logger.error(
        { error, cachedCount: this.#byIsin.size },
        "[SYM] 종목마스터 적재 실패 — 기존 맵 유지 (이름 없는 ISIN 은 원문 표시)",
      );
      return null;
    }

    this.#byIsin = next;
    this.#loadedAt = new Date();
    logger.info({ count: next.size }, "[SYM] 종목마스터 적재");
    return next.size;
  }

  /** 모르면 `undefined`. 호출부는 ISIN 원문으로 폴백한다. */
  lookup(isin: string): SymbolInfo | undefined {
    return this.#byIsin.get(isin);
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
