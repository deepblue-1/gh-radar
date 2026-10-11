# Phase 1: Data Foundation - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

KIS OpenAPI에서 국내주식(코스피/코스닥) 실시간 시세 데이터를 수집하여 Supabase `stocks` 테이블에 저장하는 기반 레이어를 구축한다.

**포함:**
- pnpm workspaces 기반 모노레포 초기화 (webapp/server/workers/ingestion/packages/shared)
- Supabase 프로젝트 생성, 4개 테이블(`stocks`, `news_articles`, `discussions`, `summaries`) 마이그레이션, RLS 정책
- workers/ingestion: KIS 등락률 순위 REST 폴링 → stocks upsert 로직, 휴장일 감지, 에러 처리
- Cloud Run Job 배포 준비(Dockerfile, 설정). 실제 Cloud Scheduler 등록은 Phase 2와 병행 가능

**제외:**
- Express API 서버 구현 (Phase 2)
- 프론트엔드 (Phase 3, 4)
- news_articles/discussions/summaries 테이블 데이터 수집 (Phase 7~9)
- 사용자 인증/로그인 (v2)

</domain>

<decisions>
## Implementation Decisions

### 프로젝트 구조
- **D-01:** 모노레포 패키지 매니저는 **pnpm workspaces** 사용. 디스크 효율과 Cloud Run 빌드 시 의존성 결합 용이성.
- **D-02:** 디렉토리 레이아웃은 루트에 `webapp/`, `server/`, `workers/`, `packages/` 배치. `apps/` 래퍼 없음 — 패키지 수가 적어 불필요한 깊이를 피함.
- **D-03:** `workers/` 는 **복수형**으로 시작하고 하위에 `ingestion/` 서브디렉토리를 둔다. 미래에 news-fetcher, summarizer 등 추가될 수 있으므로 확장 공간 확보.
- **D-04:** 전역 언어는 **TypeScript**(Node.js 22 LTS). frontend/backend/worker 모두 TS로 통일하여 `packages/shared`에서 타입 재사용 가능. Python 도입은 당장 불필요. *(2026-04-13 업데이트: 원안은 Node 20+였으나 로컬/Docker 환경 모두 Node 22로 통일, STATE.md 참조.)*
- **D-05:** `packages/shared`에 도메인 타입(`Stock`, `ScannerResponse` 등)을 정의해 server와 workers/ingestion이 동일 인터페이스를 공유한다.

### 종목 데이터 범위 (stocks 테이블)
- **D-06:** stocks 테이블 필드 범위는 **중간 세트**: `종목코드(PK), 종목명, 마켓(코스피/코스닥), 현재가, 전일대비, 등락률, 거래량, 시가, 고가, 저가, 시가총액, 상한가, 하한가, 갱신시각`.
- **D-07:** **상한가/하한가를 저장**한다. Phase 5 Scanner가 "상한가 근접" 필터링을 할 때 `현재가 / 상한가 × 100` 계산에 필요하며, DB에 저장해두면 backend가 매 요청마다 재계산할 필요 없음.
- **D-08:** **최신 스냅샷만 유지**한다 (upsert 방식). 시계열 보존(`stock_snapshots` 같은 별도 테이블)은 v2 이후로 연기 — Supabase 무료 tier 용량 보호, Scanner는 현재 상태만 필요.

### Worker 실행 전략
- **D-09:** Worker는 **Cloud Run Job**으로 배포하고 **Cloud Scheduler**가 cron 트리거한다. 기존 Express API(Cloud Run Service)와 완전히 분리 — KIS 토큰 일일 발급 제한 관리와 배포 단위 독립성 확보.
- **D-10:** 폴링 주기는 **1분 간격**. Cloud Scheduler cron = `* 9-15 * * 1-5` (평일 09:00~15:59 매 분) + `35 15 * * 1-5` (15:35 종가 스냅샷 1회).
- **D-11:** **BullMQ/Redis는 도입하지 않는다**. Cloud Run Job이 1회 실행 → 종료 모델이므로 큐가 불필요. 큐는 Phase 9(AI 요약 배치)에서 실제 필요해지면 server 내부에 도입.
- **D-12:** 휴장일 감지는 **KIS API 응답의 영업일 필드(bsop_date 또는 동등 필드) 검사** 방식. 응답의 영업일이 오늘과 다르면 upsert 생략 후 exit. 별도 공휴일 API나 하드코딩 캘린더 사용하지 않음.
- **D-13:** **Phase 1 실증 작업 필수**: 실제 휴장일(토/일 또는 다음 공휴일)에 KIS 등락률 순위 API를 호출해 응답 필드가 어떻게 동작하는지(전 영업일 freeze, 에러, 빈 데이터 중 어느 것) 확인하고 로직을 확정한다.
- **D-14:** 에러 시 **지수 백오프 재시도**: 1초 → 2초 → 4초 베이스, 최대 3회. 그 후에도 실패하면 구조화된 로그 남기고 exit — 다음 cron 사이클이 자연스럽게 재시도.
- **D-15:** 부분 실패는 **멱등 upsert**로 처리. Supabase batch upsert를 트랜잭션 없이 전송. 네트워크 단절 등으로 일부만 반영되어도 다음 사이클에서 오버라이트되므로 데이터 일관성 유지.

### Supabase 스키마
- **D-16:** Phase 1에서 **4개 테이블 전부 생성**: `stocks`, `news_articles`, `discussions`, `summaries`. stocks는 풀 스키마와 upsert 로직까지 구현, 나머지 3개는 스키마만 정의(스켈레톤). 후속 Phase(7/8/9)에서 마이그레이션 충돌 없이 데이터 수집 로직만 추가.
- **D-17:** **RLS 활성화**하되 **사용자 로그인은 없음**. 정책: `public`(anon)이 SELECT 가능, 쓰기는 `service_role`만 가능. weekly-wine-bot처럼 authenticated 요구하는 패턴이 아닌, 공개 앱에 맞게 anon SELECT 허용.
- **D-18:** 마이그레이션 도구는 **Supabase CLI** (`supabase db push`). 파일 형식은 `supabase/migrations/YYYYMMDDhhmmss_slug.sql` (weekly-wine-bot 패턴 따름). Supabase MCP는 인터랙티브 탐색용으로 병행 사용.
- **D-19:** 디렉토리 레이아웃: **루트에 `supabase/` 폴더** 배치 (webapp/server/workers와 동일 레벨). `config.toml`, `migrations/`, `SCHEMA.md` 포함. weekly-wine-bot 구조 참조.
- **D-20:** **클라이언트 모듈 패턴**: `server/src/services/supabase.ts`와 `workers/ingestion/src/services/supabase.ts`에 각각 service_role 키로 초기화한 싱글턴 클라이언트를 노출. 환경 변수는 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### Claude's Discretion
- Supabase 테이블 컬럼의 정확한 타입(numeric(20,2) vs bigint 등)은 KIS API 응답 실증 후 planner가 결정
- stocks 테이블의 인덱스 전략(등락률 정렬용 등)은 Scanner 쿼리 패턴을 보며 planner가 결정
- Dockerfile의 구체 베이스 이미지(node:20-alpine vs distroless 등)는 planner가 결정
- 로깅 포맷(JSON vs plaintext)은 planner가 Cloud Run 운영 편의를 기준으로 결정
- 환경 변수 관리 방식(.env 파일, Cloud Run secrets, Secret Manager 등)은 planner가 결정
- KIS OAuth2 토큰 발급 후 재사용 캐싱 전략 세부(Supabase에 저장 vs 메모리 캐시)는 planner가 Cloud Run Job의 stateless 특성을 고려해 결정

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 기반
- `.planning/PROJECT.md` — 프로젝트 전반, v1 범위, 제약 조건
- `.planning/REQUIREMENTS.md` — v1/v2 requirements, 특히 INFR-01, INFR-02
- `.planning/ROADMAP.md` §"Phase 1: Data Foundation" — 페이즈 목표, Success Criteria
- `CLAUDE.md` §"Technology Stack" — KIS OpenAPI, Supabase, Node/Express, Cloud Run 제약 사항 요약

### 외부 참조 (리서처/플래너가 추가 조사 시 활용)
- KIS 공식 레포: https://github.com/koreainvestment/open-trading-api — 등락률 순위 REST 샘플, rate limit, 인증 흐름
- KIS 개발자 포털: https://apiportal.koreainvestment.com/apiservice — tr_id, 요청/응답 명세
- Supabase CLI 마이그레이션 문서: https://supabase.com/docs/guides/cli/local-development#database-migrations
- Supabase RLS 문서: https://supabase.com/docs/guides/database/postgres/row-level-security
- Google Cloud Run Jobs: https://cloud.google.com/run/docs/create-jobs
- Google Cloud Scheduler → Run Jobs 트리거: https://cloud.google.com/scheduler/docs/schedule-run-cloud-run-jobs

### 참조 프로젝트 패턴
- `/Users/alex/repos/weekly-wine-bot/supabase/` — Supabase 마이그레이션 파일명 규칙, config.toml, SCHEMA.md 구조
- `/Users/alex/repos/weekly-wine-bot/supabase/migrations/20260313073807_crm_tables_rls_policies.sql` — RLS 정책 배치 작성 예시
- `/Users/alex/repos/weekly-wine-bot/server/src/services/supabase.ts` — 백엔드 service_role 클라이언트 모듈 패턴

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **없음** — gh-radar는 그린필드 프로젝트. 리포지토리 루트에 `CLAUDE.md` 하나만 존재하고 코드가 없다.

### Established Patterns
- **weekly-wine-bot의 Supabase 사용 패턴**(외부 프로젝트지만 같은 저자의 참조 구현):
  - `supabase/migrations/YYYYMMDDhhmmss_slug.sql` 타임스탬프 파일명
  - RLS 모든 테이블 활성화, `authenticated USING (true)` + service_role 쓰기
  - `supabase/SCHEMA.md`에 스키마 문서 별도 관리
  - 백엔드는 service_role 싱글턴, 프론트는 `@supabase/ssr` browser/server 클라이언트

### Integration Points
- Phase 2 (Backend API): `packages/shared` 타입 import, Supabase 클라이언트 모듈 재사용
- Phase 5 (Scanner UI): stocks 테이블의 `상한가`, `등락률` 필드를 직접 쿼리
- Phase 7~9: 이미 생성된 news_articles/discussions/summaries 테이블에 데이터만 추가

</code_context>

<specifics>
## Specific Ideas

- **webapp/server/workers 네이밍**: 사용자가 기능을 명확히 드러내는 이름으로 지정. `frontend`/`backend` 같은 추상적 이름 대신 `webapp`(브라우저 앱), `server`(HTTP 서버), `workers`(백그라운드 잡들) 사용.
- **Cloud Scheduler + Cloud Run Job 조합**은 사용자가 기존 프로젝트에서 Google Scheduler를 써본 경험이 있어 친숙한 패턴.
- **BullMQ 배제**: CLAUDE.md 기술 스택 추천에 BullMQ가 있지만, Phase 1 범위에서는 불필요. Cloud Run Job 자체가 "1회 실행 후 종료" 모델이므로 큐가 역할을 갖지 못함. Phase 9에서 AI 요약 배치가 실제로 필요해지면 도입 검토.
- **weekly-wine-bot 참조**: 동일 저자 프로젝트라 Supabase 패턴을 재사용하되, 한 가지 차이점 — weekly-wine-bot은 admin 앱이라 authenticated 기반 RLS를 쓰지만 gh-radar는 공개 앱이므로 anon SELECT 허용 정책으로 조정.

</specifics>

<deferred>
## Deferred Ideas

- **사용자 로그인 (AUTH-01, AUTH-02)**: 논의 중 "v1에도 인증을 넣고 싶다"는 발화가 있었으나, 실제 의도는 "RLS 활성화"였음이 확인됨. 사용자 인증은 v2 이후로 유지.
- **시계열 스냅샷 테이블 (`stock_snapshots`)**: 과거 등락률 차트나 분석 기능은 v2 이후. 현재는 upsert로 최신 상태만 유지.
- **Python 워커 도입**: 네이버 종목토론방 스크래핑(Phase 8)에서 Python이 유리할 수 있으나, cheerio+axios TypeScript 스택으로 대응 예정. 정말 필요해지면 `workers/scraper-py/` 형태로 추가.
- **BullMQ + Upstash Redis**: Phase 9 AI 요약 배치에서 도입 검토. Phase 1에서는 필요 없음.
- **재무지표 필드 (PER/PBR/EPS)**: stocks 테이블에 포함하지 않음. v2 이후 screener 기능 도입 시 추가 고려.

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-04-10*
