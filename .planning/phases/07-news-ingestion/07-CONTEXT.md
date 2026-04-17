# Phase 7: News Ingestion — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

종목 상세 페이지의 "관련 뉴스" placeholder 자리에, Naver Search API로 수집한 해당 종목의 뉴스를 수집·저장·표시한다. 수집은 (1) scanner top_movers + watchlist 합집합을 대상으로 한 주기적 배치와 (2) 상세 페이지의 뉴스 전용 수동 새로고침 두 경로로 이뤄진다. AI 요약·감성분석은 범위 밖(Phase 9), 토론방은 별도(Phase 8).

Requirements: NEWS-01.

## 이전 phase에서 이미 결정된 것 (carry forward)

- **DB 스키마**: `news_articles` 테이블 Phase 1에서 스켈레톤 생성, Phase 06.1에서 FK를 `stocks` 마스터로 re-point 완료. 추가 컬럼/인덱스 필요 시 마이그레이션 추가만.
- **RLS**: `anon_read_news` (SELECT anon) 이미 활성. 쓰기는 service role 전용.
- **UI placeholder 자리**: [stock-detail-client.tsx:139-148](webapp/src/components/stock/stock-detail-client.tsx#L139-L148) 의 `ComingSoonCard("관련 뉴스", "Phase 7 로드맵에서 제공됩니다.")`.
- **Worker 배포 패턴**: Phase 05.1 ingestion + Phase 06.1 master-sync 가 확립한 Cloud Run Job + Cloud Scheduler + GCP Secret Manager + pnpm workspace worker 구조.
- **Server route 패턴**: `server/src/routes/stocks.ts` 의 Zod 스키마 + Supabase 쿼리 + ApiClientError envelope + rate-limiter 미들웨어.
- **Client fetch 패턴**: `webapp/src/lib/api.ts` 의 `apiFetch` / `ApiClientError` / `X-Request-Id` 전파.
</domain>

<decisions>
## Implementation Decisions

### D1. 수집 트리거 — 배치 + 사용자 수동 새로고침
- **배치**: Cloud Run Job + Cloud Scheduler 로 주기적 수집 (D2 참조)
- **수동**: 상세 페이지 "관련 뉴스" Card 내부에 **뉴스 전용 새로고침 버튼** — 종목 시세의 기존 새로고침 버튼과 분리 (Phase 8 토론방 완성 시 해당 Card 도 동일 패턴으로 토론방 전용 새로고침 추가 예정)
- on-demand 전용·배치 전용 설계는 배제. 배치로 일상 커버리지 보장, 사용자가 필요 시 강제 refresh.

### D2. 배치 수집 — 15분 주기 · 24시간 운영
- **주기**: Cloud Scheduler `*/15 * * * *` (KST), 24시간 가동. 장외에도 공시·실적·외신 발표로 뉴스 발생
- **대상 종목**: `top_movers` 최신 scan_id 행 ∪ `watchlists.stock_code` 전체 (중복 제거). 마스터 전체 ~2,800 종목 배치 금지
- **예상 API 호출량**: 96 tick/day × 평균 200 종목 ≈ 19,200 calls/day → Naver 25,000/day 한도의 77% 내
- **Worker 위치**: `workers/news-sync/` 신규 — master-sync 패턴 그대로 복제
- **배포**: Cloud Run Job (`gh-radar-news-sync`) + Cloud Scheduler OIDC invoker, 기존 SA/Secret 정책 재사용

### D3. Naver Search API 호출 설계
- **엔드포인트**: `GET https://openapi.naver.com/v1/search/news.json`
- **헤더**: `X-Naver-Client-Id` + `X-Naver-Client-Secret` — GCP Secret Manager 에 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 신규 생성 (KIS Secret 관리 절차 재사용)
- **쿼리 파라미터**: `query={종목명}` (종목명만), `display=20`, `sort=date`, `start=1`
- **종목명 단독 쿼리** 선택 사유: 네이버 금융 사용자 검색 패턴과 일치, 대부분 종목명이 고유. 동명 노이즈는 v1 허용 범위 (Phase 9 AI 요약이 일부 완화)
- **응답 필드 매핑**:
  - `title` (HTML 태그 `<b>` 등 포함 — server 단에서 strip)
  - `originallink` / `link` → `url` (originallink 우선, 없으면 link)
  - `pubDate` (RFC 822) → `published_at` (ISO timestamptz)
  - `description` → `content_hash` 계산 입력 (DB에는 저장하지 않음)
  - `source` → Naver API 미제공 → URL host 파싱 또는 NULL (server 에서 best-effort)

### D4. 저장 정책 — news_articles UPSERT
- **INSERT + ON CONFLICT DO NOTHING**: UNIQUE(stock_code, url) 제약 활용 — 동일 뉴스 재수집 시 skip (`created_at`은 최초 수집 시각 보존)
- **필드**: `stock_code`, `title` (strip 후), `source` (host 또는 NULL), `url`, `published_at`, `content_hash`
- **content_hash 계산**: `sha256(title_stripped + '\n' + description_stripped)` — Phase 9 AI 요약 재사용 준비
- **쓰기 주체**: news-sync worker + Express route (수동 새로고침) 양쪽 모두 Supabase service role 사용
- **Retention**: 90일 초과 행 nightly cleanup job 으로 삭제 (`DELETE FROM news_articles WHERE created_at < now() - interval '90 days'`). 별도 Cloud Scheduler cron (예: `0 3 * * *`) 또는 news-sync Job에 훅으로 추가 — 방식은 planner 재량

### D5. Rate Limit & 쿨다운
- **Naver 25K/day 방어**: worker 내 호출 카운터 + 25,000 접근 시 즉시 abort. 카운터 저장소는 Upstash Redis 또는 Supabase `api_usage` 테이블 — planner 재량
- **수동 새로고침 per-stock 30초 쿨다운**:
  - 서버: Express route `/api/stocks/:code/news/refresh` — `news_articles` 에서 해당 stock_code 의 `MAX(created_at)` 기준 < 30초면 `429 Too Many Requests` + `retry_after_seconds` 반환
  - 클라이언트: 응답/요청 기반으로 버튼 `disabled` + 남은 쿨다운 초 카운트다운 표시
- **IP 기반 전역 rate-limit**: `server/src/app.ts` 에 이미 설정된 미들웨어 범위로 흡수. 별도 추가 없음

### D6. UI — 상세 페이지 레이아웃
- **섹션 배치**: 기존 `grid md:grid-cols-2` 2열(뉴스 + 토론방 placeholder) → **세로 2단 적층**으로 전환. 각 섹션이 **전체 폭** 사용
  - 위: "관련 뉴스" Card (Phase 7 실제 데이터)
  - 아래: "종목토론방" ComingSoonCard (Phase 8 까지 placeholder 유지)
- **모바일**: `<md` 도 동일 세로 스택 (자연스러운 연속)
- **뉴스 항목 레이아웃**:
  - 제목 (click → 원문, `target="_blank" rel="noopener noreferrer"`)
  - 절대시간 `MM/DD HH:mm` (KST) — 상대시간 미사용
  - 출처(source) 미표시 (v1 단순화, 재고 여지 있음)
- **표시 개수**: 상위 **5개**만 상세 페이지에 노출
- **"더보기" 링크**: 5개 하단 텍스트 링크 → `/stocks/[code]/news` 신규 route 로 이동 (전체 20개)
- **빈 상태**: "아직 수집된 뉴스가 없어요" 류 안내 + 수동 새로고침 액션 유도 카피
- **로딩 상태**: `Skeleton` 5행 (Phase 03 skeleton 토큰 재사용)
- **에러 상태**: `ApiClientError.message` 노출 + 재시도 버튼

### D7. 신규 Route — `/stocks/[code]/news`
- **경로**: `webapp/src/app/stocks/[code]/news/page.tsx` (Next.js nested dynamic route)
- **표시**: `news_articles` 최근 7일 이내 최신 20개 — 절대시간 `YYYY-MM-DD HH:mm` + 제목 + 출처(host) + 원문 링크
- **돌아가기**: 상단 breadcrumb 또는 `← 종목 상세로` 링크
- **페이지네이션/추가 로드**: v1 없음 (20개 이상은 deferred)

### D8. API 계약
- **`GET /api/stocks/:code/news`** — 상세 페이지 및 `/news` 페이지 공용. Supabase 읽기만. 기본 7일/상위 20개. query `?limit=5&days=7` 지원
- **`POST /api/stocks/:code/news/refresh`** — 수동 새로고침. 쿨다운 체크 → Naver API 호출 → upsert → 갱신된 목록 반환. `429` 응답 시 `retry_after_seconds` 포함

### D9. 시간 범위 필터
- UI: **최근 7일** 이내 뉴스만 렌더링 (쿼리에서 `published_at >= now() - interval '7 days'`)
- DB: 90일 저장 (D4 Retention)
- 7일 초과 뉴스는 수집·저장되어도 UI 미노출 — retention 이전에 자연 소멸

### Claude's Discretion
- 출처(source) 파싱 로직 상세 (host 추출 vs 전용 매핑 테이블)
- `title` HTML 태그 strip 구현 (Naver `<b>`, `&quot;` 등)
- `pubDate` RFC 822 → ISO 변환 (date-fns-tz 후보, 이미 webapp 에서 사용)
- Retention cleanup 실행 방식 (news-sync Job 훅 vs 독립 Scheduler)
- API 호출 카운터 저장소 (Upstash vs Supabase vs in-memory)
- `/news` 페이지 정렬/필터 (기본 최신순 외 옵션 추가 여부)
- 에러/빈 상태 UX 카피 문구
- news-sync Job 내부 동시성 (종목 병렬 fetch 수 — Naver API 대기시간 고려)
- Dockerfile / deploy 스크립트 세부 (05.1/06.1 템플릿 복제)
- 단위/통합 테스트 커버리지 (Zod 스키마, map 함수, cleanup 로직)

### Folded Todos
(해당 없음 — todo match 0건)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 전체
- `.planning/PROJECT.md` — vision, News Data Sources (Naver API 25K/day)
- `.planning/REQUIREMENTS.md` — NEWS-01 (Phase 7), NEWS-02 (Phase 9, 범위 밖)
- `.planning/ROADMAP.md` §"Phase 7: News Ingestion"
- `.planning/STATE.md` — 현 세션/진행도
- `CLAUDE.md` §"News Data Sources" — Naver Search API 운영 제약·법적 가이드

### 선행 phase 아티팩트
- `.planning/phases/01-data-foundation/` — `news_articles` 스키마 스켈레톤, Supabase service role 패턴
- `.planning/phases/05.1-ingestion-cloud-run-job-cloud-scheduler-kis/` — Cloud Run Job + Scheduler + SA + Secret 배포 템플릿 (news-sync 참조 모델)
- `.planning/phases/06-stock-search-detail/06-CONTEXT.md` — `/stocks/[code]` 라우트 구조, D4 (placeholder 자리), D5 (수동 refresh 패턴)
- `.planning/phases/06.1-stock-master-universe/06.1-CONTEXT.md` — 3테이블 분리, FK re-point, master-sync worker 패턴
- `.planning/phases/06.2-auth-watchlist/06.2-CONTEXT.md` — watchlists 스키마, PERS-01, RLS authenticated 확장

### 소스 코드
- `supabase/migrations/20260413120000_init_tables.sql:42-56` — `news_articles` 스키마 + `idx_news_stock_published`
- `supabase/migrations/20260413120100_rls_policies.sql:16-17` — `anon_read_news` 정책
- `supabase/migrations/20260415120000_split_stocks_master_quotes_movers.sql:131-140` — news_articles FK re-point to master
- `webapp/src/components/stock/stock-detail-client.tsx:139-148` — 교체 대상 placeholder 영역
- `webapp/src/components/stock/coming-soon-card.tsx` — 토론방은 유지, 뉴스는 신규 컴포넌트로 교체
- `webapp/src/app/stocks/[code]/page.tsx` — nested route 패턴 참조 (`news/page.tsx` 추가 기준)
- `webapp/src/lib/api.ts` — `apiFetch`, `ApiClientError`
- `webapp/src/lib/stock-api.ts` — `fetchStockDetail` 패턴 (추가할 `fetchStockNews`, `refreshStockNews` 기준)
- `server/src/routes/stocks.ts` — Zod + Supabase 조회 + error envelope 패턴
- `server/src/app.ts` — rate-limit / helmet / cors 미들웨어 스택
- `server/src/schemas/stocks.ts` · `server/src/mappers/stock.ts` — 응답 계약 변환 패턴
- `workers/master-sync/` (전체) — news-sync worker 의 Dockerfile/scripts/tsconfig/entry 구조 복제 기준
- `workers/ingestion/Dockerfile` · `scripts/` · `DEPLOY.md` — Cloud Run Job 배포 가이드
- `ops/` (존재 시) — IAM/Secret 생성 스크립트

### 외부 스펙 (researcher 확인)
- Naver Search API 가이드: https://developers.naver.com/docs/serviceapi/search/news/news.md
- Naver OpenAPI 뉴스 스펙 (query/display/start/sort)
- Cloud Run Jobs 문서: https://cloud.google.com/run/docs/create-jobs
- GCP Secret Manager access 패턴 (기존 `workers/master-sync/` 참조)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`workers/master-sync/`**: Dockerfile / pnpm workspace 설정 / tsconfig / scripts / DEPLOY.md — `workers/news-sync/` 디렉터리에 그대로 복제 후 fetcher만 교체
- **Phase 05.1 배포 산출물** (`ops/`, `scripts/setup-ingestion-iam.sh`, `scripts/deploy-ingestion.sh`): news-sync SA/Secret/Job/Scheduler 추가
- **`server/src/routes/stocks.ts`**: Zod 검증 + Supabase 조회 + ApiClientError envelope — `server/src/routes/news.ts` (또는 `stocks.ts` 확장) 에 동일 패턴 적용
- **`server/src/services/` · `server/src/kis/`**: service-role Supabase client 생성 패턴 재사용
- **`webapp/src/components/stock/stock-detail-client.tsx`**: mount/refresh 오케스트레이션, AbortController, 에러 state — 뉴스 새로고침 버튼도 동일 훅/핸들러 구조
- **`webapp/src/components/ui/{card,button,skeleton,badge}.tsx`**: Phase 3 컴포넌트 재사용
- **`webapp/src/lib/api.ts` (`apiFetch`, `ApiClientError`, `X-Request-Id`)**: 뉴스 fetch/refresh 에 그대로 사용
- **`webapp/src/lib/stock-api.ts`**: `fetchStockDetail` 옆에 `fetchStockNews`, `refreshStockNews` 추가 기준
- **Next 15 nested dynamic route**: `app/stocks/[code]/news/page.tsx` — `page.tsx`, `not-found.tsx`, `error.tsx` 기존 패턴 차용
- **date-fns-tz** (webapp 기존 의존성 확인 필요): RFC 822 → ISO 변환, KST 포맷팅

### Established Patterns
- Supabase 마이그레이션은 `YYYYMMDDHHMMSS_` prefix 파일로 추가 (기존 5개 컨벤션)
- service role 쓰기 + anon 읽기, RLS는 기존 정책 승계
- Worker 는 `workers/<name>/` pnpm workspace 디렉터리 + Dockerfile + `scripts/deploy-*.sh` + `DEPLOY.md`
- Cloud Run Job 이름: `gh-radar-<role>` (예: `gh-radar-ingestion`, `gh-radar-master-sync`) → `gh-radar-news-sync`
- Cloud Scheduler OAuth invoker, 15분 단위 `*/15 * * * *` 또는 1분 단위 `* * * * *`
- GCP Secret Manager: 프로젝트당 Secret 생성, Worker SA 에 `roles/secretmanager.secretAccessor` 부여
- E2E (playwright) fixture 는 `webapp/e2e/fixtures/mock-api.ts` 에 mock 추가

### Integration Points
- `news_articles.stock_code` FK → `stocks` 마스터 (06.1 이후). **존재하지 않는 종목코드 뉴스는 insert 실패** — worker 는 upsert 전 종목 존재 검증 또는 ON CONFLICT 예외 처리
- 상세 페이지 `stock-detail-client.tsx` 내부 UI 분해: 뉴스 섹션을 별도 컴포넌트 (`stock-news-section.tsx`) 로 추출해 `/news` 페이지와 공용 고려
- Express `server/src/app.ts` 라우트 등록 — 신규 `news` router 마운트
- Supabase `news_articles` 쓰기 주체: news-sync worker SA + Express service role
- Cloud Run 기존 `gh-radar-server` 와 분리된 Job 리소스 (05.1/06.1 패턴 유지)

</code_context>

<specifics>
## Specific Ideas

- 사용자는 "뉴스와 종목토론방을 한번에 새로고침"이 아닌 **섹션별 독립 새로고침**을 명시. Phase 8 토론방 Card 도 자체 새로고침 버튼을 가지는 패턴으로 확장 예정 (Phase 7 에서 디자인만 수립)
- 25K/day 한도 대비 **약 77% 사용** 예상 — 1~2개 사용자가 수동 새로고침 연타해도 쿨다운 30초로 대부분 흡수. 만일 운영 중 초과 조짐이 보이면 주기 20분으로 완화 가능 (planner 는 이를 config 로 빼두길 고려)
- 뉴스 전체 페이지(`/news`) 는 "더보기" 의 자연스러운 확장 — 20개 이상 pagination 은 deferred
- `source` 표시는 v1 에 상세 Card 에서는 숨김, `/news` 페이지에선 노출 (정보 밀도 차이)
- "출처 미표시" 결정은 임시 — 사용자 피드백이 나오면 재고
</specifics>

<deferred>
## Deferred Ideas

- **AI 뉴스 요약 (NEWS-02)** — Phase 9
- **토론방 수집 (DISC-01)** — Phase 8. 단, "섹션별 독립 새로고침" 패턴은 본 phase 에서 먼저 수립해 Phase 8 이 재사용
- **뉴스 전체 페이지 페이지네이션** — 20개 이상 보기
- **출처별/날짜별 필터링** — `/news` 페이지 내 필터
- **뉴스 이미지 썸네일** — Naver API 미제공, 추가 스크래핑 필요
- **공유 / 북마크** — 추후 personalization
- **실시간 새 뉴스 푸시** — v2 NOTF-*
- **동명 회사 노이즈 완화** — 종목 섹터/업종 기반 쿼리 확장 (마스터에 sector 있음)
- **출처 표시 상세 Card 재도입** — 사용자 피드백 이후
- **뉴스 검색(자유 키워드)** — 본 제품 사용 패턴과 거리

### Reviewed Todos (not folded)
(해당 없음)

</deferred>

---

## Success Criteria Mapping

| Requirement | 결정 위치 |
|---|---|
| NEWS-01 (1) 종목별 관련 뉴스 목록 표시 | D1, D6, D7 |
| NEWS-01 (2) 제목/출처/날짜 + 원문 링크 | D3 매핑, D6 (상세 카드: 제목+날짜+링크), D7 (전체 페이지: +출처) |
| NEWS-01 (3) Naver API 25,000/day 한도 내 | D2 (15분×200종목≈19,200), D5 (쿨다운 + 카운터) |

## Verification Plan

1. news-sync Job 1회 실행 → scanner top_movers + watchlists 합집합 대상 종목의 `news_articles` UPSERT — 행 증가 확인 + UNIQUE 중복 skip 확인
2. `/stocks/005930` 방문 → "관련 뉴스" 섹션 전체 폭, 최근 7일 상위 5개 표시, 토론방 placeholder 하단 유지
3. "더보기" 클릭 → `/stocks/005930/news` — 최대 20개 전체 목록, 출처/날짜/제목/링크
4. 뉴스 Card "새로고침" 버튼 → `POST /api/stocks/:code/news/refresh` → Naver API 호출 → `news_articles` 갱신 → UI 반영
5. 30초 이내 재시도 → 버튼 disabled, 카운트다운/토스트 확인, 서버 `429` + `retry_after_seconds` 검증
6. 빈 종목(뉴스 없음) → 빈 상태 안내 메시지 + 수동 새로고침 유도
7. 모바일 뷰포트(`<md`) → 1열 스택, 터치 타겟 충분
8. 90일 초과 행 cleanup job 실행 → 해당 행 삭제 확인
9. Naver API 호출 카운터 25,000 접근 시 abort → worker 로그 경고, 이후 tick 에선 cleanup/skip
10. E2E (playwright) — `/stocks/[code]` 뉴스 섹션 렌더 + `/news` 페이지 이동 + 새로고침 쿨다운
11. Axe 접근성 — 링크 name, 버튼 aria-label, 빈 상태 role

## Open for Planner

1. news-sync worker 내 종목 병렬 호출 수 — Naver 응답 ~500ms 가정 시 5~10 동시성 적정, rate spike 주의
2. API 호출 카운터 저장소 (Upstash vs Supabase `api_usage` vs in-memory)
3. Retention cleanup — news-sync Job 훅 vs 독립 Cloud Scheduler
4. 뉴스 섹션 컴포넌트 분해 (`stock-news-section.tsx` 추출 여부, `/news` 페이지와 shared)
5. `title` HTML 태그 strip 라이브러리 (sanitize-html vs 정규식 best-effort)
6. Naver API 응답 `source`/`originallink` 파싱 전략 — host 추출, `kr.newsroom.com` 등 도메인 매핑
7. Next.js server/client 경계 — `/news` 페이지 server-fetch 초기화 vs 전체 `'use client'`
8. 테스트 범위 — unit (map/sanitize/sha256) + integration (worker fetch mock) + E2E (browser)
9. 실패 분리 — 특정 종목 Naver 호출 실패 시 전체 tick 실패 금지, per-stock try/catch + metrics

---

*Phase: 07-news-ingestion*
*Context gathered: 2026-04-17*
