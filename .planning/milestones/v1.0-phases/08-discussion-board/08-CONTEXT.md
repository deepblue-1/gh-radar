# Phase 8: Discussion Board — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

종목 상세 페이지의 "종목토론방" placeholder 자리에 네이버 종목토론방 최신 게시글을 **프록시 기반 스크래핑(1시간 배치 + on-demand)** 으로 수집·저장·표시한다. 배치는 scanner `top_movers` ∪ `watchlists` 합집합(~200종목) 대상, on-demand는 상세 페이지 진입/수동 새로고침 시점. Supabase `discussions.scraped_at` row-level 10분 TTL 캐싱, per-stock 30초 쿨다운. AI 요약·감성분석은 범위 밖(Phase 9 DISC-02), Phase 7(뉴스)는 별도.

Requirements: DISC-01.

## 이전 phase에서 이미 결정된 것 (carry forward)

- **DB 스키마**: `discussions` 테이블 완성 — `(stock_code, post_id)` UNIQUE, `idx_discussions_stock_posted`, FK re-point to `stocks` 마스터 완료(Phase 06.1). 추가 마이그레이션 불필요.
- **RLS**: `anon_read_discussions` (SELECT anon) 활성. 쓰기는 service role 전용.
- **UI placeholder**: 현재 [stock-detail-client.tsx:139-148](webapp/src/components/stock/stock-detail-client.tsx#L139-L148). Phase 7 execute 완료 후 `space-y-6` 컨테이너 내 2번째 섹션으로 이동 (R1).
- **섹션별 독립 새로고침 패턴**: Phase 7 `StockNewsSection` + `NewsRefreshButton` 구조를 그대로 복제. 자동 mount fetch + 수동 refresh + 30초 쿨다운 + `ApiClientError.details.retry_after_seconds`.
- **R5 back-nav 규칙**: `/stocks/[code]/discussions` 상단 타이틀 왼쪽 ← 인라인 링크 (03-UI-SPEC §4.4).
- **Worker 배포 패턴**: Phase 05.1/06.1/07 Cloud Run Job + Cloud Scheduler OAuth invoker + GCP Secret Manager + pnpm workspace worker.
- **Server route 패턴**: `server/src/routes/stocks.ts`의 Zod + Supabase + ApiClientError envelope + rate-limit 미들웨어.
- **Client fetch 패턴**: `webapp/src/lib/api.ts`의 `apiFetch` + `ApiClientError` + `X-Request-Id`.
- **법적/아키텍처 제약**: CLAUDE.md §"Naver 종목토론방" — bulk-polling 금지, on-demand + 제한된 배치 + 5~10분 캐싱, User-Agent 정상 설정, rate limit 존중, 2022 대법원 2021도1533 판결 유의.

</domain>

<decisions>
## Implementation Decisions

### D1. 아키텍처 — 프록시 기반 1h 배치 + on-demand 이중 경로
- **배치**: `workers/discussion-sync/` 신규 — Phase 7 news-sync 패턴 복제. Cloud Run Job + Cloud Scheduler `0 * * * *` (1시간 주기, KST, 전 시간대). Phase 05.1 Pitfall 2에 따라 **OAuth invoker** 사용 (OIDC 금지).
- **on-demand**: `server/src/routes/discussions.ts` 신규 — GET/POST. 상세 페이지 mount 자동 fetch + 수동 refresh 버튼.
- **프록시 기반 스크래핑**: Bright Data 급 외부 프록시 서비스 **초기부터 도입** — IP 차단 회피·안정성 우선. ⚠️ **"무료 API 우선" 원칙과 상충**하므로 명시적 비용 승인. 서비스 선정(Bright Data/ScraperAPI/기타)과 일일 예산 설정은 Plan 단계 POC 결과로 확정.
- 신규 의존성: `cheerio` (`pnpm -w add cheerio` — server/worker 둘 다 필요 여부는 planner 재량).

### D2. 배치 타겟 — scanner top_movers ∪ watchlists (약 200종목)
- `top_movers` 최신 `scan_id` 행 ∪ `watchlists.stock_code` distinct. Phase 7 뉴스와 동일 합집합.
- 1시간 × ~200종목 × 평균 1페이지 ≈ **4,800 scrapes/day**.
- 마스터 전체(~2,800종목) 배치 금지 — 법적 리스크 + 프록시 비용 폭증.

### D3. 수집 트리거 — 3경로
- **배치** (1h): 기본 커버리지 보장.
- **mount 자동 fetch**: 상세 페이지 진입 시 `fetchStockDiscussions(code, { hours: 24, limit: 5 })` — 캐시 hit 시 네이버 호출 없이 DB 반환.
- **수동 refresh**: 섹션 내 새로고침 버튼 → `POST /api/stocks/:code/discussions/refresh` — per-stock 30초 쿨다운.

### D4. 캐싱 — 10분 TTL, Supabase row-level
- **정책**: per-stock `MAX(discussions.scraped_at)` 기준.
  - `< 10분`: 스크래핑 skip, DB 바로 반환
  - `>= 10분` 또는 `NULL`: 프록시 스크래핑 → `discussions` upsert → 반환
- **저장소**: Supabase `discussions.scraped_at` 단일 진실 — Upstash Redis 미도입(MVP 단계).

### D5. UI — 상세 Card (`StockDiscussionSection`)
- **위치**: Phase 7 완료 후 `stock-detail-client.tsx` `space-y-6` 컨테이너 2번째 섹션 (뉴스 아래).
- **표시 개수**: 상위 **5개** (뉴스와 동일).
- **표시 필드**: 제목 + 절대시간(`MM/DD HH:mm` KST) + 작성자(네이버 닉네임) + **본문 2줄 미리보기**(`line-clamp-2`).
- **시간 범위**: 최근 **24시간** 이내 게시글만.
- **클릭 행동**: 새 탭으로 네이버 고유 URL (`target="_blank" rel="noopener noreferrer"`).
- **빈 상태**: "아직 토론 글이 없어요" + 수동 새로고침 유도.
- **로딩 상태**: Skeleton 5행(Phase 03 토큰 재사용).
- **에러 상태**: D7 참조.
- **컴포넌트 구성**: Phase 7 `StockNewsSection` + `NewsRefreshButton` 70~80% 복제. Header 아이콘은 `MessageSquare` (lucide).

### D6. UI — 전체 페이지 `/stocks/[code]/discussions`
- **신설 route**: `webapp/src/app/stocks/[code]/discussions/page.tsx` (Next 15 `use(params)` 패턴).
- **표시**: 최근 **7일** 이내, 서버 하드캡 **50건**(`LIMIT 50`). 50 초과 시 최신 50건만 반환, "N+" 뱃지/truncation 표시 없이 단순 절단 (Phase 7 R2와 동일 정책).
- **정렬**: 최신순 (`posted_at DESC`).
- **표시 필드**: 상세 Card와 동일 + 본문 미리보기 한도는 동일 2줄 유지(정보 밀도 일관).
- **back-nav**: R5 — 타이틀 h1 왼쪽 인라인 ← 링크 (`← 종목 상세로`).
- **페이지네이션/무한 스크롤**: v1 없음 (deferred).

### D7. 차단/실패 UX
- **Stale (캐시 있음 + 재시도 실패)**: 캐시 노출 + "X분 전 데이터" Badge + 재시도 버튼.
  - "X분"은 현재시각 - `MAX(scraped_at)` 계산, 60분 초과 시 "X시간 전".
- **Empty fail (캐시 없음 + 실패)**: "토론방을 불러올 수 없어요. 잠시 후 다시 시도해주세요." + 재시도 CTA. 차단 여부·프록시 에러 내부 사정은 사용자에게 비노출.
- **429 응답**: `details.retry_after_seconds` 우선, 없으면 30초. 버튼 disabled + 카운트다운.
- **프록시/네트워크 에러**: 일반화 메시지, Phase 7 `ApiClientError` 패턴 재사용.

### D8. Rate Limit & 쿨다운
- **per-stock 30초 쿨다운**: 서버 측 `discussions` 테이블 `MAX(scraped_at)` 기준 < 30초면 `429 Too Many Requests` + `details.retry_after_seconds`. Phase 7 뉴스와 동일 로직.
- **개인 IP rate limit**: `server/src/app.ts`의 기존 rate-limit 미들웨어 범위 흡수. 별도 추가 없음.
- **전역 프록시 예산**: Plan/POC에서 선정한 프록시 서비스의 일일 예산 한도 — worker 측 카운터(Supabase `api_usage` 테이블 확장 또는 별도 테이블, planner 재량) + 초과 시 abort.

### D9. API 계약
- **`GET /api/stocks/:code/discussions`** — 캐시 hit 시 DB 읽기, 미스 시 프록시 스크래핑 후 upsert → 결과 반환. 쿼리 `?hours=24&limit=5` (상세 Card 기본) 또는 `?days=7&limit=50` (전체 페이지). 서버 `limit` 하드캡 50, 클라이언트가 더 큰 값 요청 시 clamp.
- **`POST /api/stocks/:code/discussions/refresh`** — 수동 새로고침. 쿨다운 체크 → 프록시 스크래핑 → upsert → 갱신 목록 반환. 429 시 `details.retry_after_seconds` 포함.
- **응답 필드 (camelCase, packages/shared 타입)**: `stockCode`, `postId`, `title`, `body` (stripped plaintext), `author`, `postedAt`, `scrapedAt`, `url` (네이버 고유 URL).

### D10. 저장 정책 — discussions UPSERT
- **INSERT ... ON CONFLICT (stock_code, post_id) DO NOTHING** — 동일 post 재수집 skip, `scraped_at` 은 **UPDATE로 최신화**(캐시 TTL 계산용). 이는 `ON CONFLICT (stock_code, post_id) DO UPDATE SET scraped_at = EXCLUDED.scraped_at` 로 변경 필요(planner 재량 — 또는 별도 row 업데이트).
- **필드 매핑**:
  - `post_id` — 네이버 게시글 URL의 `nid=...` 쿼리 파라미터 추출
  - `title` — HTML strip + 엔티티 디코드
  - `body` — HTML strip, plaintext 저장 (line-clamp는 프론트 CSS)
  - `author` — 네이버 닉네임 그대로(마스킹 여부 planner 재량)
  - `posted_at` — RFC/네이버 포맷 → ISO timestamptz (KST)
  - `scraped_at` — `now()`
- **content_hash 컬럼 미도입** (현 스키마에 없음). Phase 9 AI 요약 캐시는 `post_id` 또는 `(stock_code, post_id)` 기준으로 충분.

### D11. 스팸/광고 휴리스틱 필터 (최소)
- **제외 조건** (AND 아닌 OR): 제목 길이 < 5자 **또는** 제목에 URL(`http://` / `https://`) 포함.
- **구현 위치**: server 쿼리 WHERE 절 또는 map 단계(planner 재량). 원본은 DB에 저장하되 UI 노출에서만 제외.

### D12. 순서 제약 — Phase 7 병렬 실행 조율
- Phase 7과 Phase 8은 서로 의존 없음. ROADMAP depends-on: Phase 2, Phase 6.
- **UI wave**(`stock-detail-client.tsx` 교체)는 **Phase 7 Wave 2(07-04) merge 이후** 시작 — `space-y-6` 컨테이너 구조 확정 후 2번째 섹션 추가만 하고 기존 구조 수정 금지.
- migration 불필요(스키마 완성), worker/server route/E2E wave는 Phase 7과 독립 진행 가능.

### Claude's Discretion
- 프록시 서비스 선정 (Bright Data / ScraperAPI / 자체 IP rotation) — POC 후 Plan 단계 결정
- cheerio selector 구체 (네이버 토론방 DOM 파싱)
- HTML strip 라이브러리 (`sanitize-html` vs 정규식 best-effort)
- 네이버 post URL의 `nid` 추출 로직
- `posted_at` 네이버 포맷 → ISO 변환 (date-fns 사용)
- body "2줄 미리보기" 처리 — 원문 plaintext + CSS `line-clamp-2` 채택 권장
- 작성자 닉네임 마스킹 여부 (익명 닉네임이라 그대로 권장)
- `discussions.scraped_at` UPSERT 동작 세부(DO NOTHING vs DO UPDATE SET scraped_at)
- Retention cleanup 실행 방식 (discussion-sync Job 훅 vs 독립 Scheduler)
- 프록시 예산 카운터 저장소 (Supabase `api_usage` 확장 vs 별도 테이블)
- 섹션 컴포넌트 공통 추상화 여부 (news/discussion `SectionCard` 공통 부모)
- Next.js server/client 경계 (`/discussions` 페이지 server-fetch 초기화 여부)
- 단위/통합 테스트 범위, Playwright E2E spec
- Dockerfile/scripts/deploy 세부 (news-sync 복제 기준)

### Folded Todos
(해당 없음 — 매칭 todo 0건)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 전체
- `.planning/PROJECT.md` — vision, News/Discussion Data Sources
- `.planning/REQUIREMENTS.md` — DISC-01 (Phase 8), DISC-02 (Phase 9 — 범위 밖)
- `.planning/ROADMAP.md` §"Phase 8: Discussion Board"
- `.planning/STATE.md` — 현 세션/진행도
- `CLAUDE.md` §"Naver 종목토론방" — URL 패턴, robots.txt 메모, 법적 판결(2021도1533), on-demand 아키텍처

### 선행 phase 아티팩트 (필수 참조)
- `.planning/phases/01-data-foundation/` — `discussions` 스키마 스켈레톤, Supabase service role 패턴
- `.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/` — Cloud Run Job + Scheduler + SA + Secret 배포 템플릿 + Pitfall 2 (OAuth invoker)
- `.planning/phases/06-stock-search-detail/06-CONTEXT.md` — `/stocks/[code]` 라우트 구조, placeholder 위치
- `.planning/phases/06.1-stock-master-universe/06.1-CONTEXT.md` — 3테이블 분리, FK re-point, master-sync 패턴
- `.planning/phases/06.2-auth-watchlist/06.2-CONTEXT.md` — `watchlists` 테이블 (배치 타겟 합집합 대상)
- `.planning/phases/07-news-ingestion/07-CONTEXT.md` — 섹션별 독립 새로고침 패턴(본 phase 재사용), `StockDetailClient` 세로 2단 적층 R1, R5 back-nav, `ApiClientError.details`, 30s 쿨다운, 법적 리스크 방어, 프록시/rate 설계 참고
- `.planning/phases/07-news-ingestion/07-01-PLAN.md` ~ `07-06-PLAN.md` — `StockNewsSection` / `NewsRefreshButton` / news-sync worker / IAM-deploy 구체 구현 (discussion 버전 복제 기준)
- `.planning/phases/03-design-system/03-UI-SPEC.md` §4.4 Page Back Nav — R5 back-nav 규칙

### 소스 코드
- `supabase/migrations/20260413120000_init_tables.sql:58-71` — `discussions` 스키마 + `idx_discussions_stock_posted`
- `supabase/migrations/20260413120100_rls_policies.sql:19-20` — `anon_read_discussions`
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql:141-145` — `discussions` FK re-point to master
- `webapp/src/components/stock/stock-detail-client.tsx:139-148` — 교체 대상 placeholder (Phase 7 execute 후 위치 재조정)
- `webapp/src/components/stock/coming-soon-card.tsx` — 참조용 (토론방 placeholder 교체 시 제거/대체)
- `webapp/src/components/stock/stock-news-section.tsx` (Phase 7 신설 예정) — 복제 기준
- `webapp/src/components/stock/news-refresh-button.tsx` (Phase 7 신설 예정) — 복제 기준
- `webapp/src/lib/api.ts` — `apiFetch`, `ApiClientError.details` (Phase 7 확장)
- `webapp/src/lib/stock-api.ts` — `fetchStockNews`/`refreshStockNews` (Phase 7) → `fetchStockDiscussions`/`refreshStockDiscussions` 추가 기준
- `webapp/src/app/stocks/[code]/news/page.tsx` (Phase 7 신설 예정) — `/discussions` 페이지 복제 기준
- `server/src/routes/stocks.ts` — Zod + Supabase + error envelope
- `server/src/routes/news.ts` (Phase 7 신설 예정) — `discussions.ts` 복제 기준
- `server/src/app.ts` — rate-limit/helmet/cors 미들웨어 스택
- `server/src/schemas/news.ts` · `server/src/mappers/news.ts` (Phase 7) — `discussions` 버전 기준
- `workers/master-sync/` 전체 — Dockerfile/scripts/tsconfig/entry 구조
- `workers/news-sync/` (Phase 7 신설 예정) — 더 직접적인 복제 기준
- `packages/shared/src/` — camelCase 타입 계약 위치

### 외부 스펙 (researcher 확인)
- 네이버 종목토론방 페이지: `https://finance.naver.com/item/board.naver?code={종목코드}` (리스트), 게시글 URL은 `nid` 쿼리 파라미터 포함
- Bright Data Web Scraping: https://brightdata.com/products/web-scraper
- ScraperAPI: https://www.scraperapi.com/
- cheerio 문서: https://cheerio.js.org/
- Cloud Run Jobs: https://cloud.google.com/run/docs/create-jobs
- 대법원 2022. 5. 12. 선고 2021도1533 판결 (크롤링 형사 책임) — CLAUDE.md 참조

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 7 `StockNewsSection`** → `StockDiscussionSection` 복제 기준. mount fetch + refresh 버튼 + 쿨다운 + 에러 state 오케스트레이션 구조 동일
- **Phase 7 `NewsRefreshButton`** → `DiscussionRefreshButton` 동일 인터페이스 (props: `stockCode`, `onRefresh`, `cooldownUntil`)
- **`webapp/src/lib/api.ts`** (`apiFetch`, `ApiClientError.details`) — Phase 7에서 `details` 확장됨, 그대로 사용
- **`webapp/src/lib/stock-api.ts`** — `fetchStockDetail`/`fetchStockNews` 옆에 `fetchStockDiscussions`, `refreshStockDiscussions` 추가
- **`webapp/src/components/ui/{card,button,skeleton,badge}`** — Phase 3 컴포넌트 재사용
- **`server/src/routes/stocks.ts`** — Zod 검증 + Supabase 조회 + ApiClientError envelope
- **`server/src/services/` · `server/src/kis/`** — service-role Supabase client 생성 패턴
- **`workers/news-sync/`** (Phase 7 신설) — `workers/discussion-sync/` 디렉터리에 복제 후 fetcher만 교체
- **Phase 05.1 배포 산출물** (`ops/`, `scripts/setup-*-iam.sh`, `scripts/deploy-*.sh`) — discussion-sync SA/Secret/Job/Scheduler 추가
- **Next 15 nested dynamic route** — `app/stocks/[code]/discussions/page.tsx` (news/page.tsx 복제)

### Established Patterns
- Supabase 마이그레이션 `YYYYMMDDHHMMSS_` prefix (본 phase는 마이그레이션 추가 **불필요** — 스키마 완성)
- service role 쓰기 + anon 읽기, RLS 기존 정책 승계
- Worker = `workers/<name>/` pnpm workspace + Dockerfile + `scripts/deploy-*.sh` + `DEPLOY.md`
- Cloud Run Job 이름: `gh-radar-<role>` → **`gh-radar-discussion-sync`**
- Cloud Scheduler **OAuth invoker** (Pitfall 2: OIDC 금지)
- GCP Secret Manager: `BRIGHT_DATA_TOKEN` 또는 선정된 프록시 서비스의 credential
- packages/shared 타입은 **camelCase** 계약 (Phase 7 수립)
- E2E Playwright fixture `webapp/e2e/fixtures/mock-api.ts` — `mockDiscussionsApi` 추가

### Integration Points
- `discussions.stock_code` FK → `stocks` 마스터. 존재 종목만 upsert (insert 실패는 per-stock skip)
- 상세 페이지 `stock-detail-client.tsx` 내부 UI 분해: 토론 섹션을 `stock-discussion-section.tsx` 별도 컴포넌트로 추출해 `/discussions` 페이지와 공용 (뉴스 패턴 동일)
- Express `server/src/app.ts` 라우트 등록 — 신규 `discussions` router 마운트 (기존 `stocks` router와 별도 또는 중첩)
- `auth` 미들웨어(Phase 06.2) — 상세/전체 페이지 모두 로그인 필수 대상 (miseenplace 확인)
- Supabase `discussions` 쓰기 주체: `discussion-sync` worker SA + Express service role
- Cloud Run `gh-radar-server` 와 분리된 Job 리소스

</code_context>

<specifics>
## Specific Ideas

- **"1시간 배치 + on-demand 이중 경로"** — 기본 커버리지와 사용자 주도 강제 새로고침 모두 만족. Phase 7 뉴스와 동일 철학.
- **프록시 기반 스크래핑 초기부터 도입** — 사용자 명시 결정. IP 차단 회피·운영 안정성 우선. "무료 API 우선" 원칙(CLAUDE.md §Constraints)과 상충하지만 discussion 수집의 특수성(Naver 그레이존·법적 판결) 때문에 예외 승인. 프록시 비용은 POC 결과로 추정 후 plan 단계 최종 확정.
- **POC 초점: 제품 품질 테스트** — 대표 3~5개 종목(예: 삼성전자/카카오/테슬라처럼 토론 활발한 종목) × 1~2주 스크래핑 → 실제 트레이더에게 유용한 정보가 나오는지 측정. 차단률·HTML 안정성도 부수적으로 관측하지만 결정 기준은 제품 가치.
- **본문 2줄 미리보기** — Phase 7 뉴스는 제목만, Phase 8은 본문 snippet 추가. 토론 글은 제목이 불명확한 경우가 많아 미리보기 가치 높음. 원문은 `discussions.body` 에 plaintext로 저장, UI는 CSS `line-clamp-2` 로 자르기.
- **상세 Card 24시간 vs 전체 페이지 7일** — 스코프 차별화. 상세는 "오늘 이 종목에 무슨 일이 있었나" 신호, 전체 페이지는 "주간 토론 흐름" 탐색.
- **스팸 필터 `제목 <5자 OR URL 포함`** — 과도한 필터보다 투명성 우선. 정작 의미 있는 짧은 글도 걸릴 수 있지만 신호/잡음 비율 감안 허용. Phase 9 AI가 나중에 정제.
- **Phase 7 ↔ Phase 8 UI 병렬 실행 제약** — `stock-detail-client.tsx`는 Phase 7 Wave 2(07-04) merge 후에만 Phase 8 UI wave 시작. 그 외 wave는 동시 진행 가능.

</specifics>

<deferred>
## Deferred Ideas

- **AI 토론방 요약 + 긍/부정/중립 센티먼트 (DISC-02)** — Phase 9. Phase 8 저장 단계는 요약 입력 데이터(title/body plaintext)를 정상 보존.
- **인기순/조회수 정렬 옵션** — 현재 스키마에 조회수·댓글수 컬럼 없음. 필요 시 마이그레이션 + UI 토글.
- **작성자 닉네임 기반 필터/팔로우** — personalization 확장.
- **댓글 스레드 표시** — 원문 이동으로 대체.
- **실시간 새 글 푸시** — v2 NOTF-*.
- **자유 키워드 검색** — 제품 사용 패턴과 거리.
- **이미지/첨부 썸네일** — 네이버 토론방 제한적, 스크래핑 복잡도↑.
- **`/discussions` 페이지 페이지네이션** — 50건 이상 보기.
- **배치 주기 가변** (장중 30분, 장외 2시간 등) — 초기 1h 단일 유지, 운영 중 조정.
- **스팸 필터 고도화** (도메인 블랙리스트, 키워드 모델) — 유지보수 부담. Phase 9 AI로 흡수 대안.
- **섹션 컴포넌트 공통 추상화** (news/discussion `SectionCard` 공통 부모) — Phase 8 완료 후 리팩터링 여지.
- **Redis 캐싱 도입** — Supabase row-level로 MVP 충분. 트래픽 증가 시 재검토.

### Reviewed Todos (not folded)
(해당 없음)

</deferred>

---

## Success Criteria Mapping

| Requirement | 결정 위치 |
|---|---|
| DISC-01 (1) 종목토론방 게시글 목록 표시 | D1, D5, D6 |
| DISC-01 (2) on-demand + 5~10분 캐싱 | D3, D4 (10분 채택), D8 |
| DISC-01 (3) discussions 테이블 저장 | D10 (UPSERT + 필드 매핑) |

## Verification Plan

1. `gh-radar-discussion-sync` Job 1회 실행 → `top_movers` 최신 scan_id ∪ `watchlists` 합집합 대상 ~200종목 스크래핑 → `discussions` UPSERT 행 증가 확인 + `(stock_code, post_id)` 중복 skip 확인
2. `/stocks/005930` 방문 → "종목토론방" 섹션 전체 폭, 최근 24시간 상위 5개 표시 (제목 + 시간 + 작성자 + 본문 2줄)
3. Phase 7 뉴스 섹션은 토론방 위, Phase 7 Wave 2 merge 후 `space-y-6` 레이아웃 확인
4. "더보기" 클릭 → `/stocks/005930/discussions` → 최근 7일 최대 50건, 최신순, R5 back-nav 링크
5. 게시글 클릭 → 새 탭으로 네이버 고유 URL (`nid` 포함)
6. "새로고침" 버튼 → `POST /api/stocks/:code/discussions/refresh` → 프록시 스크래핑 → upsert → UI 반영
7. 30초 이내 재시도 → 버튼 disabled + 카운트다운, 서버 429 + `details.retry_after_seconds`
8. 캐시 있음 + 프록시 실패 → "X분 전 데이터" Badge + 재시도 버튼 노출
9. 캐시 없음 + 실패 → "토론방을 불러올 수 없어요" + 재시도 CTA
10. 스팸 필터: 제목 `<5자` 또는 URL 포함 게시글 UI 미노출 (DB에는 저장)
11. 10분 이내 재호출 → 캐시 hit, 프록시 호출 없음 (로그 확인)
12. 90일 초과 retention cleanup → 해당 행 삭제 확인
13. E2E Playwright — `/stocks/[code]` 토론방 섹션 + `/discussions` 이동 + 새로고침 쿨다운
14. Axe 접근성 — 링크 name, 버튼 aria-label, 본문 `line-clamp-2` role, 빈 상태 role

## Open for Planner

1. **프록시 서비스 선정** — Bright Data / ScraperAPI / 자체 IP rotation 중 POC 비교. 비용·안정성·약관 검토. 일일 예산 설정.
2. **POC 설계** — 대표 3~5 종목(삼성전자/LG에너지솔루션/카카오/에코프로 등) × 1~2주 스크래핑. 측정: (a) 제품 유용성(내용 의미/신선도), (b) 차단률/HTTP 상태 분포, (c) 비용 실측.
3. **cheerio selector 구체** — 네이버 토론방 목록 페이지·게시글 페이지 DOM 구조 파싱. `nid` 추출.
4. **HTML strip 라이브러리** — `sanitize-html` vs 정규식. `packages/shared/src/discussion-sanitize.ts` (Phase 7 `news-sanitize.ts` 패턴).
5. **`discussions` UPSERT 전략** — `ON CONFLICT DO NOTHING` (scraped_at 보존) vs `DO UPDATE SET scraped_at = EXCLUDED.scraped_at` (TTL 계산 정확). 캐시 TTL 판정 정확도 차이 고려.
6. **Retention cleanup** — discussion-sync Job 훅 vs 독립 Cloud Scheduler cron.
7. **섹션 컴포넌트 분해** — `stock-discussion-section.tsx` 추출 범위(`/discussions` 페이지 공용 여부).
8. **Next.js server/client 경계** — `/discussions` 페이지 server-fetch 초기화 vs 전체 `'use client'`.
9. **테스트 범위** — unit (map/sanitize/filter), integration (프록시 mock + supabase upsert), E2E (browser).
10. **실패 분리** — per-stock try/catch, 전체 tick 실패 금지, metrics 기록.
11. **프록시 예산 카운터** — Supabase `api_usage` 확장 vs 별도 `discussion_usage` 테이블.
12. **Dockerfile/deploy 스크립트** — `workers/news-sync/` 템플릿 복제 + Secret 이름만 교체.
13. **Wave 순서 명시** — Phase 7 Wave 2(07-04) 의존. Phase 8 Wave 계획 시 blocking 주석.

## Parallel Execution Note

**Phase 7과 Phase 8은 병렬 실행 안전** — 의존성 없음(둘 다 Phase 2, 6만 의존).

**조율 포인트**:
- **독립 진행 가능**: migration 불필요(스키마 완성), `workers/discussion-sync/`, `server/src/routes/discussions.ts`, `/discussions` 페이지, E2E spec, IAM/deploy 스크립트
- **순서 제약**: `stock-detail-client.tsx` 교체 작업은 Phase 7 Wave 2(07-04) merge 이후. Phase 8 UI wave 시 `space-y-6` 컨테이너 내 **2번째 섹션 추가만** 하고 기존 구조 수정 금지
- **공유 자산**: `packages/shared` 타입은 파일 분리(news/discussion 각자), `ApiClientError.details`는 Phase 7에서 이미 확장됨

---

*Phase: 08-discussion-board*
*Context gathered: 2026-04-17*
