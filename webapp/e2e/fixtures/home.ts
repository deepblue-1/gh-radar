import type { Page, Route } from '@playwright/test';
import type {
  HomeSnapshotResponse,
  HomeThemeSnapshot,
  HomeSnapshotIndexEntry,
} from '@gh-radar/shared';

/**
 * Phase 13 Plan 05 — 홈 E2E fixture.
 *
 * server `GET /api/home`(Plan 03, 객체 계약 `{ snapshot, index }`)를 결정론적으로
 * 모킹한다. 실서버/워커 적재 여부(급등은 날마다 변동)와 무관하게 흐름·카피 계약을
 * 검증하기 위한 mock (themes.spec 의 mockThemesApi 패턴 동형).
 *
 * 두 모드:
 *  - populated: 주도 테마 1(6종목·근거뉴스 4건[중복 URL 1 → dedup 후 3]) + 개별 급등 1
 *    + 슬롯 2개(:30 시점) 인덱스. 6종목 → top4 + "+2개 종목 더" 인라인 토글(A) 노출.
 *  - empty: snapshot=null + index=[] → HomeEmpty("오늘은 +20% 급등 종목이 없습니다").
 *
 * 라우트는 `**` host-agnostic 매칭(NEXT_PUBLIC_API_BASE_URL 무관).
 */

const TRADE_DATE = '2026-07-02';
const SLOT_1430 = '2026-07-02T05:30:00.000Z'; // KST 14:30
const SLOT_1530 = '2026-07-02T06:30:00.000Z'; // KST 15:30 (마감)

const POPULATED_SNAPSHOT: HomeThemeSnapshot = {
  tradeDate: TRADE_DATE,
  capturedAt: SLOT_1530,
  themeCount: 1,
  stockCount: 7,
  isCarried: false,
  payload: {
    threshold: 20,
    marketStatus: 'closed',
    themes: [
      {
        name: 'AI 반도체',
        reason: 'HBM 수요 급증 기대감으로 관련주 동반 급등',
        // 6종목 → top4(SK하이닉스·삼성전자·한미반도체·이오테크닉스) + overflow 2(오픈엣지·가온칩스)
        // → 카드에 "+2개 종목 더" 인라인 토글(A) 노출.
        stocks: [
          { code: '000660', name: 'SK하이닉스', changeRate: 24.1 },
          { code: '005930', name: '삼성전자', changeRate: 21.5 },
          { code: '042700', name: '한미반도체', changeRate: 28.4 },
          { code: '039030', name: '이오테크닉스', changeRate: 23.2 },
          { code: '394280', name: '오픈엣지테크놀로지', changeRate: 20.7 },
          { code: '399720', name: '가온칩스', changeRate: 26.9 },
        ],
        // 근거 뉴스 4건 — 중 1건은 중복 URL(1번과 동일) → dedup 후 unique 3건.
        news: [
          {
            title: 'HBM 공급 부족 심화… 관련주 강세',
            url: 'https://n.news.naver.com/mnews/article/001/0000000001',
            source: '연합뉴스',
          },
          {
            title: 'SK하이닉스, HBM4 양산 계획 앞당겨',
            url: 'https://n.news.naver.com/mnews/article/015/0000000010',
            source: '한국경제',
          },
          {
            title: '반도체 장비주 일제히 급등… 수주 기대감',
            url: 'https://n.news.naver.com/mnews/article/009/0000000020',
            source: '매일경제',
          },
          {
            // 중복 URL(1번 기사와 동일) — dedup 검증용. 표시되면 안 됨.
            title: 'HBM 공급 부족 심화… 관련주 강세 (중복)',
            url: 'https://n.news.naver.com/mnews/article/001/0000000001',
            source: '연합뉴스',
          },
        ],
      },
    ],
    singles: [
      {
        code: '035720',
        name: '카카오',
        changeRate: 22.8,
        reason: '신규 AI 서비스 출시 소식',
        news: [
          {
            title: '카카오, 신규 AI 서비스 공개',
            url: 'https://n.news.naver.com/mnews/article/001/0000000002',
            source: '한국경제',
          },
        ],
      },
    ],
  },
};

const POPULATED_INDEX: HomeSnapshotIndexEntry[] = [
  {
    tradeDate: TRADE_DATE,
    capturedAt: SLOT_1530,
    themeCount: 1,
    stockCount: 7,
    isCarried: false,
  },
  {
    tradeDate: TRADE_DATE,
    capturedAt: SLOT_1430,
    themeCount: 1,
    stockCount: 7,
    isCarried: false,
  },
];

export const HOME_POPULATED: HomeSnapshotResponse = {
  snapshot: POPULATED_SNAPSHOT,
  index: POPULATED_INDEX,
};

export const HOME_EMPTY: HomeSnapshotResponse = {
  snapshot: null,
  index: [],
};

export interface MockHomeApiOptions {
  /** 응답 body. 미지정 시 populated. */
  response?: HomeSnapshotResponse;
}

/**
 * `/api/home`(+ 쿼리) 모킹 — snapshot + 네비 인덱스 반환.
 * 날짜/시점 파라미터가 붙어도 동일 응답(흐름 검증용, verbatim payload).
 */
export async function mockHomeApi(
  page: Page,
  opts: MockHomeApiOptions = {},
): Promise<void> {
  const response = opts.response ?? HOME_POPULATED;
  await page.route(/\/api\/home(?:\?[^/]*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store', 'x-request-id': 'test-req-id' },
      body: JSON.stringify(response),
    });
  });
}
