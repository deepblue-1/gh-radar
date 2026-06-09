import { describe, expect, it, expectTypeOf } from "vitest";
import {
  THEME_STOCK_SOURCES,
  type Theme,
  type ThemeStock,
  type ThemeStockMember,
  type ThemeStockSource,
  type ThemeWithStats,
} from "../theme.js";

/**
 * Phase 10 — Plan 02 (Wave 1).
 *
 * 테마 도메인 5 타입 + ThemeStockSource union 의 컴파일 + 런타임 sentinel 검증.
 * Wave 2 스크랩 upsert / Wave 3 server 라우트 / Wave 4 유저 CRUD 가
 * `@gh-radar/shared` 에서 동일 타입을 import 하므로 본 test 가 type contract 의
 * single-source-of-truth.
 *
 * 런타임 sentinel(THEME_STOCK_SOURCES)은 DB `theme_stocks.source` 컬럼의
 * 허용 값과 1:1 대응 — 마이그레이션(Task 2)·워커 upsert·UI 뱃지가 모두 참조.
 */

describe("ThemeStockSource", () => {
  it("naver/alphasquare/ai/user 4 멤버를 런타임 tuple 로 노출", () => {
    expect(THEME_STOCK_SOURCES).toEqual(["naver", "alphasquare", "ai", "user"]);
    expect(THEME_STOCK_SOURCES).toHaveLength(4);
  });

  it("tuple 멤버는 ThemeStockSource union 에 할당 가능", () => {
    for (const source of THEME_STOCK_SOURCES) {
      const s: ThemeStockSource = source;
      expect(typeof s).toBe("string");
    }
  });

  it("도메인 외 source 는 타입 레벨에서 거부", () => {
    // @ts-expect-error 'twitter' 는 허용 source 가 아님
    const _bad: ThemeStockSource = "twitter";
    expect(true).toBe(true);
  });
});

describe("Theme", () => {
  it("시스템 테마(ownerId NULL) 를 컴파일", () => {
    const systemTheme: Theme = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "HBM",
      description: "고대역폭 메모리",
      isSystem: true,
      ownerId: null,
      sources: ["naver", "alphasquare"],
      top3AvgChangeRate: 12.34,
      statsUpdatedAt: "2026-06-09T07:00:00Z",
      createdAt: "2026-06-09T07:00:00Z",
      updatedAt: "2026-06-09T07:00:00Z",
    };
    expectTypeOf(systemTheme).toEqualTypeOf<Theme>();
    expect(systemTheme.ownerId).toBeNull();
  });

  it("유저 테마(ownerId 채움, description/stats NULL) 를 컴파일", () => {
    const userTheme: Theme = {
      id: "22222222-2222-2222-2222-222222222222",
      name: "내 관심 테마",
      description: null,
      isSystem: false,
      ownerId: "33333333-3333-3333-3333-333333333333",
      sources: ["user"],
      top3AvgChangeRate: null,
      statsUpdatedAt: null,
      createdAt: "2026-06-09T07:00:00Z",
      updatedAt: "2026-06-09T07:00:00Z",
    };
    expectTypeOf(userTheme.ownerId).toEqualTypeOf<string | null>();
    expectTypeOf(userTheme.description).toEqualTypeOf<string | null>();
    expectTypeOf(userTheme.top3AvgChangeRate).toEqualTypeOf<number | null>();
  });
});

describe("ThemeStock", () => {
  it("provenance 컬럼(source/confidence/reason/effective) 을 컴파일", () => {
    const member: ThemeStock = {
      themeId: "11111111-1111-1111-1111-111111111111",
      stockCode: "005930",
      source: "naver",
      confidence: 0.92,
      reason: "HBM 관련 메모리 대장주",
      effectiveFrom: "2026-06-09T07:00:00Z",
      effectiveTo: null,
    };
    expectTypeOf(member.confidence).toEqualTypeOf<number | null>();
    expectTypeOf(member.reason).toEqualTypeOf<string | null>();
    expectTypeOf(member.effectiveTo).toEqualTypeOf<string | null>();
    expect(member.stockCode).toBe("005930");
  });
});

describe("ThemeWithStats", () => {
  it("Theme + stockCount + optional stocks 정렬 응답 형태", () => {
    const memberRow: ThemeStockMember = {
      code: "005930",
      name: "삼성전자",
      market: "KOSPI",
      price: 70500,
      changeRate: 1.5,
      tradeAmount: 1_234_567_000,
      source: "naver",
    };
    const withStats: ThemeWithStats = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "HBM",
      description: "고대역폭 메모리",
      isSystem: true,
      ownerId: null,
      sources: ["naver"],
      top3AvgChangeRate: 12.34,
      statsUpdatedAt: "2026-06-09T07:00:00Z",
      createdAt: "2026-06-09T07:00:00Z",
      updatedAt: "2026-06-09T07:00:00Z",
      stockCount: 33,
      stocks: [memberRow],
    };
    expectTypeOf(withStats).toMatchTypeOf<Theme>();
    expectTypeOf(withStats.stockCount).toEqualTypeOf<number>();
    expect(withStats.stocks?.[0]?.market).toBe("KOSPI");
  });

  it("stocks 는 optional — 목록 응답에서 생략 가능", () => {
    const listItem: ThemeWithStats = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "HBM",
      description: null,
      isSystem: true,
      ownerId: null,
      sources: ["naver"],
      top3AvgChangeRate: null,
      statsUpdatedAt: null,
      createdAt: "2026-06-09T07:00:00Z",
      updatedAt: "2026-06-09T07:00:00Z",
      stockCount: 0,
    };
    expect(listItem.stocks).toBeUndefined();
  });
});
