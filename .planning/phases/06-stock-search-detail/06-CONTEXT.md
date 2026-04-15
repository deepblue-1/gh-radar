# Phase 6: Stock Search & Detail — CONTEXT

## Context

Phase 5 스캐너 UI 완료 후, 트레이더가 스캐너 테이블에서 특정 종목을 클릭하거나 헤더에서 종목명/코드로 검색해 상세 정보를 확인하는 흐름을 완성한다. Phase 5 CONTEXT (D3)에서 `/stocks/[code]` 라우트가 이미 약속되어 있고, 백엔드(`/api/stocks/search`, `/api/stocks/:code`)는 Phase 2에서 이미 구현되어 있어 이번 phase 는 **프론트엔드만** 다룬다. Phase 7(뉴스), Phase 8(토론방)의 연결 지점(placeholder)도 미리 마련한다.

Requirements: SRCH-01, SRCH-02, SRCH-03.

## <decisions>

### D1. 검색 진입점 — AppHeader 전역 검색만
- 기존 `app-header.tsx` 의 '종목 검색' input 을 ⌘K/Ctrl+K 로 열리는 전역 모달로 활성화
- 별도 `/search` 페이지 **없음** — 선택 즉시 `/stocks/[code]`로 이동
- 모든 페이지에서 사용 가능한 단일 진입점

### D2. 자동완성 컴포넌트 — shadcn `Command` (cmdk) + ⌘K 단축키
- `npx shadcn@latest add command` 로 cmdk 의존성 추가
- ⌘K (Mac) / Ctrl+K (Windows/Linux) 전역 키보드 단축키로 모달 토글
- ↑↓ Enter ESC 키보드 네비게이션은 cmdk 기본 제공
- 입력 **debounce 300ms** 후 `GET /api/stocks/search?q=` 호출
- 모달 내 로딩/빈 결과/에러 상태 별도 처리

### D3. 자동완성 항목 표시
- 각 행: `종목명 · 종목코드 · 마켓 배지([KOSPI]/[KOSDAQ])`
- 가격·등락률은 **자동완성에 미노출** (상세 진입 후 확인 — 검색 UX 단순화)
- 서버 정렬/limit **수정 없음** — 현재 `name.ilike.%q%` OR `code.ilike.%q%`, name asc, limit 20 유지

### D4. 상세 페이지 레이아웃 — Hero + Stats grid + Phase 7/8 placeholder
- 라우트: `app/stocks/[code]/page.tsx` (Next.js dynamic route, App Router)
- **Hero 섹션**: 종목명 · 종목코드 · 마켓 배지 + 큰 현재가 + 등락액/등락률(Phase 3 `up/down/flat` 토큰 색상)
- **Stats grid** (Card 그리드, 2열/md: 3열): 시가 · 고가 · 저가 · 거래량 · 거래대금 · 시총 · 상한가 · 하한가
- **갱신 시각**: `HH:MM:SS KST` 절대시각 (Phase 5 `ko-KR` `Asia/Seoul` 포맷과 동일)
- **Phase 7 placeholder**: "관련 뉴스 — Phase 7 로드맵" 의도적 안내 Card
- **Phase 8 placeholder**: "종목토론방 — Phase 8 로드맵" 의도적 안내 Card
- 숫자 포맷은 기존 `components/ui/number.tsx` 재사용

### D5. 데이터 갱신 — 수동 refresh 버튼만
- 자동 폴링 **없음** (스캐너 1분 폴링과 의도적 분리 — API 부하 최소화)
- Refresh 버튼 내 subtle spinner (Phase 5 버튼 패턴 재사용)
- 장마감/주말 분기 UI 없음 — 갱신시각 표기로 사용자가 판단
- 초기 로드만 `skeleton.tsx` 노출, 재조회 시 기존 데이터 유지

### D6. 에러/빈 상태 — 스테이트별 전용 UI
- **404 StockNotFound** → `app/stocks/[code]/not-found.tsx`
  - 서버 `stocks` 테이블 미수집 종목 또는 잘못된 코드 안내
  - 대소문자·형식 힌트 + '스캐너로 돌아가기' 버튼 (`next/link` → `/scanner`)
- **API 에러(5xx/타임아웃)** → `app/stocks/[code]/error.tsx`
  - `ApiClientError.message` 그대로 노출 + 재시도 버튼
- **null 필드 값** (`price=null`, `market_cap=null` 등) → `—` (em-dash) 표기, `number.tsx` 의 nullish 처리 활용
- Fetch 흐름: 클라이언트 페이지(`'use client'`) — `apiFetch` 오류 envelope 사용

## <specifics>

- 라우트: `/stocks/[code]` — `code` 는 `^[A-Za-z0-9]{1,10}$` (서버 검증과 동일)
- 단축키: `mod+k` (cmdk 표준) — Mac ⌘K, Win/Linux Ctrl+K
- 자동완성 debounce: 300ms, AbortController로 이전 요청 취소
- 자동완성 min chars: **1자** (서버 쿼리 sanitize 후 비어있으면 호출 생략)
- 헤더 input: readonly 로 설정하고 click/focus 시 cmdk Dialog 토글 (이중 상태 회피)
- 등락률 색상: Phase 3 `Badge variant="up|down|flat"` 또는 동일 토큰 클래스 직접 사용
- 갱신시각: `Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })` + ` KST` suffix

## <reusable_assets>

**재사용 (읽고 그대로 사용)**:
- `webapp/src/components/layout/app-header.tsx` — 기존 '종목 검색' input 자리에 전역 검색 트리거 마운트
- `webapp/src/components/layout/app-shell.tsx`, `center-shell.tsx`
- `webapp/src/components/ui/{card,badge,skeleton,button,number,popover,input}.tsx`
- `webapp/src/lib/api.ts` — `apiFetch`, `ApiClientError`, `X-Request-Id` 전파
- `packages/shared/src/marketHours.ts` — `isKoreanMarketOpen()` (향후 장마감 배지 활용 여지, 이번 phase에는 미사용)

**백엔드 (그대로 사용, 수정 없음)**:
- `server/src/routes/stocks.ts` — `/api/stocks/search?q=`, `/api/stocks/:code`
- `server/src/mappers/stock.ts` — Stock 타입
- `server/src/schemas/stocks.ts`

**참고 (API 계약 확인용)**:
- `supabase/migrations/20260413120000_init_tables.sql` — stocks 스키마 컬럼

**신규 추가**:
- `webapp/src/components/ui/command.tsx` (shadcn add)
- `webapp/src/components/search/global-search.tsx` — ⌘K Dialog, debounce, cmdk 통합
- `webapp/src/lib/stock-api.ts` — `searchStocks(q, signal)`, `fetchStockDetail(code, signal)`
- `webapp/src/app/stocks/[code]/page.tsx`
- `webapp/src/app/stocks/[code]/not-found.tsx`
- `webapp/src/app/stocks/[code]/error.tsx`
- `webapp/src/components/stock/stock-hero.tsx`
- `webapp/src/components/stock/stock-stats-grid.tsx`
- `webapp/src/components/stock/coming-soon-card.tsx` (Phase 7/8 placeholder 공용)

## <canonical_refs>

- `.planning/ROADMAP.md` — Phase 6 절
- `.planning/REQUIREMENTS.md` — SRCH-01, SRCH-02, SRCH-03
- `.planning/phases/02-backend-api/` 산출물 — `/api/stocks/*` 계약
- `.planning/phases/03-design-system/` 산출물 — `up/down/flat` 토큰, Card/Badge/Skeleton 규약
- `.planning/phases/04-frontend-scaffold/` 산출물 — `apiFetch`, AppShell, AppHeader
- `.planning/phases/05-scanner-ui/05-CONTEXT.md` — `/stocks/[code]` 라우트 약속(D3), 절대시각 포맷(D5), 수동 refresh 버튼 패턴
- `server/src/routes/stocks.ts` — search/detail 실제 구현
- `server/src/mappers/stock.ts` — Stock 타입
- `supabase/migrations/20260413120000_init_tables.sql` — DB 컬럼 원본
- `packages/shared/src/marketHours.ts` — 장마감 로직
- `CLAUDE.md` — Tech stack, shadcn/ui 규약

## <deferred>

- 최근 검색어 / 인기 종목 추천 (로컬스토리지 또는 별도 API)
- 서버 search 랭킹 개선 (prefix match 우선, 거래대금 가중)
- 차트·기간별 시세·일봉 (KIS historical API 필요, 별도 phase)
- Phase 7/8 placeholder 실제 데이터 연결 (각 phase에서 구현)
- 실시간 SSE/WebSocket 시세 스트림
- 즐겨찾기 / 관심종목 (v2 PERS-01)
- 장마감 배지 / stale 경고
- 상세 페이지 자동 폴링 (지금은 수동만)
- `/search` 전용 페이지 (로딩/랜딩 화면)

## <open_for_planner>

1. **⌘K Dialog 구현 형태**: shadcn `CommandDialog` (cmdk + Dialog 결합) vs `Popover` 앵커형 — researcher가 헤더 input 앵커 위치·모바일 UX 비교
2. **Hero 반응형**: 모바일(`<768px`) 에서 현재가 폰트 축소 전략 (Tailwind breakpoint vs clamp)
3. **Stats grid 열 수**: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4` 후보 — 필드 8개 기준 최적 비율
4. **page.tsx 서버/클라이언트 경계**: 서버 컴포넌트에서 초기 fetch 후 클라이언트 refresh 훅 vs 전체 `'use client'` (스캐너와 일관성 검토)
5. **cmdk 버전·의존성 크기**: shadcn 기본 가이드 대비 번들 영향

## <folded_todos>

(해당 없음)

## Success Criteria Mapping

| Requirement | 결정 위치 |
|---|---|
| SRCH-01 종목명 또는 종목코드로 검색 | D1, D2 (서버 search endpoint `name OR code ilike`) |
| SRCH-02 검색 자동완성 드롭다운 | D2, D3 |
| SRCH-03 종목 상세 페이지 (현재가·등락률·거래량 등) | D4, D5, D6 |

## Verification Plan

1. `/scanner` 행 클릭 → `/stocks/005930` 이동 → Hero + Stats grid + 두 placeholder 렌더링
2. ⌘K → 모달 오픈 → "삼성" 입력(300ms) → 자동완성 노출 → 선택 → `/stocks/005930`
3. ⌘K → "005930" 입력 → 코드 매칭 결과 노출
4. `/stocks/INVALID` → `not-found.tsx` 노출
5. 백엔드 off → refresh 버튼 → `error.tsx` 노출, 재시도 복구
6. 모바일 뷰포트(`<768px`) — Hero 가독성, Stats grid 2열, 검색 모달 풀스크린
7. Lighthouse/axe 기본 접근성 (Dialog focus trap, Badge contrast)

## Next Step

`/gsd-plan-phase 6` 실행.
