/**
 * Phase 13 — 홈 화면 "오늘의 급등 테마" 공유 타입 계약 (HOME-01).
 *
 * webapp · server 가 공유하는 홈 급등 테마 도메인 타입 (apiFetch<HomeSnapshotResponse> 계약).
 * 오늘 +20% 급등 종목을 bottom-up AI(Claude Haiku) 클러스터링한 "오늘의 주도 테마 ·
 * 상승 이유 · 소속 종목 · 대표 뉴스" 를 시점별(:30) 스냅샷으로 표시한다.
 *
 * DB 는 snake_case (supabase/migrations/{ts}_home_theme_snapshots.sql) —
 * server 의 순수함수가 row → 아래 camelCase 타입으로 변환한다.
 * payload 는 Claude 출력 1:1 blob (RESEARCH §Pattern 1, D-06).
 *
 * 결정 근거:
 *   D-01: 시점별(:30) 스냅샷 — capturedAt 이 장중 매시 :30 시점.
 *   D-04: content_hash — 급등집합+뉴스 해시 동일 시 Claude 호출 skip.
 *   D-05: isCarried — hash-skip 으로 직전 스냅샷 복제 append 한 row 표시.
 *   D-06: payload 는 Claude 출력 verbatim blob (themes/singles/threshold/marketStatus).
 */

/** 대표 뉴스 참조 (Claude 가 verbatim 인용, 1~2건). */
export interface HomeNewsRef {
  /** 뉴스 제목 (news_articles.title verbatim) */
  title: string;
  /** 원문 URL (출처 표기 — 5원칙 #5) */
  url: string;
  /** 출처명 (news_articles.source) */
  source: string;
}

/** 테마/개별 급등 소속 종목 1건. */
export interface HomeSurgeStock {
  /** 종목코드 (6자리) */
  code: string;
  /** 종목명 */
  name: string;
  /** 당일 등락률 % (≥ threshold) */
  changeRate: number;
}

/** 오늘의 주도 테마 (2종목 이상 클러스터 — bottom-up AI 발견, 기존 큐레이션 미참조). */
export interface HomeSurgeTheme {
  /** 테마명 (Claude 명명) */
  name: string;
  /** 상승 이유 (Claude 근거 설명, 뉴스 기반). 근거 부족 시 null */
  reason: string | null;
  /** 소속 급등 종목 (2건 이상) */
  stocks: HomeSurgeStock[];
  /** 대표 뉴스 (1~2건, verbatim) */
  news: HomeNewsRef[];
}

/** 개별 급등 종목 (테마 클러스터에 속하지 않는 단독 급등, 별도 섹션). */
export interface HomeSurgeSingle {
  /** 종목코드 (6자리) */
  code: string;
  /** 종목명 */
  name: string;
  /** 당일 등락률 % (≥ threshold) */
  changeRate: number;
  /** 상승 이유 (Claude 근거 설명). 근거 부족 시 null */
  reason: string | null;
  /** 대표 뉴스 (1~2건, verbatim) */
  news: HomeNewsRef[];
}

/** 스냅샷 payload — Claude 출력 1:1 blob (DB jsonb 컬럼과 동형, D-06). */
export interface HomeSnapshotPayload {
  /** 급등 임계값 % (기본 20 고정) */
  threshold: number;
  /** 시점 시장 상태 (장전 프리마켓(NXT, 08시대) premarket / 장중 open / 마감직후 closed) */
  marketStatus: "premarket" | "open" | "closed";
  /** 오늘의 주도 테마 (2종목 이상 클러스터) */
  themes: HomeSurgeTheme[];
  /** 개별 급등 종목 (단독 급등, 테마 미소속) */
  singles: HomeSurgeSingle[];
}

/** 홈 스냅샷 1건 — 시점별(:30) 스냅샷 + payload (D-01). */
export interface HomeThemeSnapshot {
  /** KST 거래일 (YYYY-MM-DD) */
  tradeDate: string;
  /** 스냅샷 시점 (ISO timestamptz, 장중 매시 :30) */
  capturedAt: string;
  /** payload.themes 개수 (목록 표시용) */
  themeCount: number;
  /** 급등 종목 총수 (테마 소속 + 개별 급등) */
  stockCount: number;
  /** 직전 스냅샷 복제 append 여부 (D-05, hash 동일 skip) */
  isCarried: boolean;
  /** Claude 출력 blob (D-06) */
  payload: HomeSnapshotPayload;
}

/** 스냅샷 인덱스 엔트리 — 날짜/시점 네비게이션용 (payload 제외 경량). */
export interface HomeSnapshotIndexEntry {
  /** KST 거래일 (YYYY-MM-DD) */
  tradeDate: string;
  /** 스냅샷 시점 (ISO timestamptz) */
  capturedAt: string;
  /** payload.themes 개수 */
  themeCount: number;
  /** 급등 종목 총수 */
  stockCount: number;
  /** 복제 append 여부 (D-05) */
  isCarried: boolean;
}

/** GET 홈 스냅샷 응답 — 현재 스냅샷 + 네비게이션 인덱스. */
export interface HomeSnapshotResponse {
  /** 요청 시점의 스냅샷 (급등 없는 날/미생성 시 null → 빈 상태 표시) */
  snapshot: HomeThemeSnapshot | null;
  /** 날짜/시점 네비게이션용 인덱스 (최신순) */
  index: HomeSnapshotIndexEntry[];
}
