# Phase 2: Backend API - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1이 Supabase `stocks` 테이블에 매 분 기록한 국내주식(코스피/코스닥) 시세 데이터를 소비해, Vercel 프론트엔드(Phase 4 이후)가 호출할 Express 기반 REST API 서버를 구축하고 **실제 Cloud Run(asia-northeast3)에 배포**해 공개 URL을 확보한다.

**포함:**
- `server/` 워크스페이스 완전 구현 (Express 5 + TypeScript + Supabase 클라이언트)
- 4개 엔드포인트: `/api/scanner`, `/api/stocks/:code`, `/api/stocks/search`, `/api/health`
- 보안 미들웨어 스택: helmet, CORS whitelist, per-IP rate limit, pino 구조화 로깅
- Dockerfile + 로컬 빌드 + Artifact Registry push + `gcloud run deploy` 스크립트
- Secret Manager 연동으로 `SUPABASE_SERVICE_ROLE_KEY` 주입
- vitest 유닛 + supertest 통합 + 배포 후 curl smoke 테스트

**제외:**
- 프론트엔드 (Phase 3, 4)
- Scanner UI 실제 필터/정렬 (Phase 5 클라이언트)
- News/Discussions/Summaries 엔드포인트 (Phase 7~9에서 추가)
- GitHub Actions 자동 배포 파이프라인 (v2)
- 사용자 인증/API key (v2, AUTH-01)

</domain>

<decisions>
## Implementation Decisions

### 워크스페이스 & 공용 코드
- **D-01:** `server/` 워크스페이스에 Express 앱 구축. Phase 1에서 이미 `package.json` 스텁만 존재하므로 본 페이즈에서 스캐폴드 완료.
- **D-02:** 언어/런타임 통일: **TypeScript strict + Node 22 LTS**. Phase 1의 `tsconfig.base.json` extends. ES2022 타겟(tsc 출력은 Node 22에서 그대로 동작). `.nvmrc=22`, Docker 베이스 이미지도 `node:22-alpine`으로 통일(2026-04-13 결정, STATE.md 참조).
- **D-03:** 프레임워크는 **Express 5.x** (CLAUDE.md 승계). Fastify/Hono 등 대안은 Phase 1에서 이미 결정됨.
- **D-04:** 도메인 타입은 **`@gh-radar/shared`에서 import**. `Stock`, `Market`, 신규 응답 envelope(`ApiError`, `ApiSuccess`) 모두 `packages/shared`에 정의해 프론트와 공유 가능하게 함.
- **D-05:** Supabase 클라이언트는 **`server/src/services/supabase.ts` 싱글턴** (Phase 1 `workers/ingestion/src/services/supabase.ts` 대칭 구조). service_role 키 사용, 환경변수 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

### API 엔드포인트 계약
- **D-06:** 필수 4개 엔드포인트 전부 **Phase 2에서 구현**: `/api/scanner`, `/api/stocks/:code`, `/api/stocks/search?q=`, `/api/health`. Phase 6 SRCH-01/02가 `/api/stocks/search`를 소비하므로 API만 먼저 열어둠.
- **D-07:** `/api/scanner` 쿼리 파라미터는 **전부 서버에서 필터/정렬** 지원:
  - `market` (`KOSPI|KOSDAQ|ALL`, 기본 `ALL`)
  - `minRate` (등락률 최소값, 숫자)
  - `sort` (기본 `rate_desc`, 가능값 `rate_desc|rate_asc|volume_desc`)
  - `limit` (기본 없음 = 전체 반환, 상한 10000)
  - 파라미터 없으면 **전 종목 반환** (~3000개, gzip 후 ~60KB).
- **D-08:** **페이지네이션 없음**. 1분 폴링 기반이라 전체 반환이 더 단순하며, SCAN-01 "전 종목 표시" 요구를 직접 충족.
- **D-09:** `/api/scanner` 응답은 **상한가 근접률(`upperLimitProximity = close / upper_limit`)을 서버가 계산**해 필드로 포함. 프론트에서 매번 계산할 필요 제거.
- **D-10:** `/api/stocks/:code` — 없는 코드는 **HTTP 404** + `{error:{code:'STOCK_NOT_FOUND', message:...}}`. 200+null 아님.
- **D-11:** `/api/stocks/search?q=` — **Supabase ILIKE 부분일치** (`name ILIKE '%q%' OR code ILIKE '%q%'`). 대소문자 무시. 결과는 `name` 정렬, 상한 20개. Postgres FTS/형태소 분석기는 오버킬.
- **D-12:** `/api/health` — 단순 `{status:'ok', timestamp, version}`. Supabase 핑 하지 않음(liveness만 필요, readiness는 본 페이즈 범위 외).

### 응답 규격 & 에러 처리
- **D-13:** 성공 응답 envelope: **배열/단일 객체를 루트에 그대로 반환** (과포장 지양). 예: `/api/scanner` → `Stock[]`, `/api/stocks/:code` → `Stock`. 메타데이터 필요 시 헤더 사용.
- **D-14:** 에러 응답 포맷: **`{error:{code, message}}`** + 적절한 HTTP status. `code`는 대문자 스네이크(`STOCK_NOT_FOUND`, `INVALID_QUERY_PARAM`, `INTERNAL_ERROR`). 프론트 i18n/분기에 사용.
- **D-15:** **단일 Express 에러 미들웨어**가 `ApiError` 하위 클래스들을 `{error:{code,message}}`로 변환. 미처리 예외는 500 `INTERNAL_ERROR`로 매핑하며 프로덕션에서는 스택트레이스 미노출, 로그에만 기록.
- **D-16:** 404 fallback 미들웨어: 매칭 안 된 라우트는 `{error:{code:'NOT_FOUND', message:'Route not found'}}` 반환.

### 보안 & CORS
- **D-17:** 인증 **없음** (공개 API). v1은 로그인 없고 시세 데이터는 공개 정보. AUTH-01은 v2.
- **D-18:** CORS: 환경변수 `CORS_ALLOWED_ORIGINS`로 관리. 값 형식은 쉼표 구분 + 정규식 허용 패턴:
  - 프로덕션 고정 도메인 (`https://gh-radar.vercel.app` 등)
  - Vercel preview 와일드카드 (`/^https:\/\/gh-radar-.*\.vercel\.app$/`)
  - 로컬 개발 (`http://localhost:3000`, `http://127.0.0.1:3000`)
- **D-19:** `helmet()` 기본 설정 적용. JSON API라 CSP는 기본값 유지.
- **D-20:** **per-IP rate limit 200 req/min** (`express-rate-limit` 메모리 저장소). 1분 폴링 + 검색/상세 클릭 여유 충분. Cloud Run min=1이라 단일 인스턴스가 대부분 처리, 메모리 저장소로 충분. 429 응답은 `{error:{code:'RATE_LIMITED', message}}`.
- **D-21:** `express.json({limit:'16kb'})`. v1 API는 GET 위주라 큰 바디 불필요.
- **D-22:** **request-id 미들웨어**로 `X-Request-Id` 발급(없으면 생성) → pino child logger에 바인딩 → 응답 헤더로도 반환. Phase 1 `job_run_id` 패턴 승계.
- **D-23:** Supabase `service_role` 키는 **server 프로세스에서만 사용**, 응답/로그에 절대 노출 금지. pino redact 경로: `req.headers.authorization`, `*.service_role_key`, `*.access_token`.

### 로깅
- **D-24:** **pino JSON 로거** Phase 1 패턴 승계. 모든 로그는 stdout → Cloud Logging이 severity 자동 파싱.
- **D-25:** 필수 필드: `request_id`, `route`, `method`, `status`, `latency_ms`, `user_agent`, `referer`. pino-http 미들웨어로 자동 바인딩.
- **D-26:** redact: `req.headers.authorization`, `req.headers.cookie`, `*.supabase_service_role_key`, `*.access_token`, `*.refresh_token`.

### Cloud Run 배포
- **D-27:** **리전 asia-northeast3 (서울)**. 국내 사용자 지연 최소화. Phase 1 Supabase 리전과 매칭(프로젝트 생성 시 Seoul 선택 권장, `.planning/phases/01-data-foundation/01-PLAN.md` 확인).
- **D-28:** 인스턴스 프로파일: **CPU=1, Memory=512Mi, Concurrency=80, min-instances=1, max-instances=3**. `min=1`은 CLAUDE.md/ROADMAP Success Criteria #2의 **비가역 결정** (cold start 없는 응답).
- **D-29:** 포트는 **8080** (Cloud Run 기본). 컨테이너는 `PORT` 환경변수를 존중.
- **D-30:** 요청 타임아웃 기본값(Cloud Run 300s) 유지. API는 빠른 쿼리만 하므로 따로 설정 불필요.

### 이미지 빌드 & Secret
- **D-31:** **Dockerfile 멀티스테이지** Phase 1 패턴 승계: **node:22-alpine** base(2026-04-13 Node 22 통일 결정으로 Phase 1 Dockerfile도 동일 승급), `pnpm deploy --filter @gh-radar/server` 로 의존성 트리밍, 최종 이미지에는 `dist/` + `node_modules` + 런타임만 포함. non-root user로 실행.
- **D-32:** **로컬 docker build + Artifact Registry push**. `--platform=linux/amd64` 강제 (macOS arm64 개발 머신에서도 x86 이미지 빌드). Cloud Build 사용 안 함 — 로컬 제어 선호.
- **D-33:** Artifact Registry: asia-northeast3에 저장소 `gh-radar` 생성. 이미지 태그는 `git rev-parse --short HEAD`(예: `d31c807`) + 추가 `:latest`. 태그만 참조로 revision 고정 가능.
- **D-34:** Secret 주입은 **Google Secret Manager + `gcloud run deploy --update-secrets`**. `SUPABASE_SERVICE_ROLE_KEY`만 Secret Manager 관리 (접근 IAM: Cloud Run 서비스 계정). 나머지 env vars는 `--set-env-vars` 평문.
- **D-35:** 환경변수 계약 (container 내부):
  - `SUPABASE_URL` — Supabase 프로젝트 URL (평문 env)
  - `SUPABASE_SERVICE_ROLE_KEY` — Secret Manager 주입
  - `CORS_ALLOWED_ORIGINS` — 쉼표 구분 + 정규식 리터럴 (평문 env)
  - `PORT` — 8080 (Cloud Run 자동 주입)
  - `NODE_ENV` — `production` (스크립트가 주입)
  - `LOG_LEVEL` — 기본 `info`

### 배포 자동화 & 테스트
- **D-36:** 배포 자동화는 **`scripts/deploy-server.sh` 수동 스크립트**. GitHub Actions/WIF는 v2. 스크립트 내용:
  1. **gcloud 가드 체크** — `gcloud config get-value project`와 기대 프로젝트 ID(환경변수 `GCP_PROJECT_ID` 또는 스크립트 상수) 불일치 시 안내 메시지 출력 후 `exit 1`. 계정 오인으로 weekly-wine-bot 프로젝트에 배포되는 사고 방지.
  2. `docker build --platform=linux/amd64 -t <registry>/server:<sha>`
  3. `docker push`
  4. `gcloud run deploy gh-radar-server --image=<registry>/server:<sha> --region=asia-northeast3 --min-instances=1 --max-instances=3 --cpu=1 --memory=512Mi --concurrency=80 --set-env-vars=... --update-secrets=SUPABASE_SERVICE_ROLE_KEY=...`
  5. 배포 성공 시 URL 출력 + `curl $URL/api/health` smoke.
- **D-37:** **테스트 계층**:
  - **vitest 유닛**: 필터/정렬 로직, 응답 변환(`upperLimitProximity` 계산 등), CORS origin 매처. Phase 1 테스트 패턴 승계.
  - **supertest 통합**: Express app 인스턴스에 HTTP 요청으로 라우트/미들웨어/에러 포맷 검증. Supabase는 mock 또는 local Supabase 인스턴스.
  - **배포 후 curl smoke**: 배포 스크립트 말미에 `/api/health`, `/api/scanner`, `/api/stocks/005930` (삼성전자) 호출해 HTTP 200 + JSON shape 확인.
- **D-38:** E2E/CI는 v2. Phase 2에서는 로컬/수동 실행만.

### 선행 조건 (사용자 준비)
- **D-39:** **gh-radar 전용 gcloud configuration** 사용. weekly-wine-bot과 완전히 분리된 GCP 프로젝트·계정을 사용하므로, 배포 전에 다음을 완료:
  - `gcloud config configurations create gh-radar` → `gcloud auth login`(gh-radar 계정) → `gcloud config set account <email>` → `gcloud config set project <GCP 프로젝트 ID>` → `gcloud config set run/region asia-northeast3` → `gcloud config set artifacts/location asia-northeast3`.
  - `gcloud auth configure-docker asia-northeast3-docker.pkg.dev` (로컬 docker push용 credHelper 등록).
  - 필요 시 `gcloud auth application-default login`으로 로컬 ADC 별도 설정 (weekly-wine-bot ADC를 덮어쓴다는 점 주의).
  - 일상 전환: `gcloud config configurations activate gh-radar` ↔ `activate default`.
  - 배포 전 `gcloud config list`로 active configuration 재확인 습관화. D-36의 가드 체크가 2차 방어선.

### Claude's Discretion (planner가 재량으로 결정)
- Supabase 클라이언트 재사용 패턴(app.locals vs import) 선택
- `ApiError` 클래스 계층 설계(단일 vs 세분화)
- Supabase `.select('*')` vs 명시적 컬럼 목록 (인덱스 감안)
- Zod 등 런타임 검증 라이브러리 도입 여부 및 범위
- pino-http 설정 세부값 (로그 레벨, 성공/실패 커스터마이즈)
- Dockerfile 베이스 이미지 정확 버전, 보안 업데이트 전략
- rate-limit 키 생성 전략 (`X-Forwarded-For` 신뢰 범위)
- `/api/scanner` 응답 캐시 헤더(`Cache-Control`) 전략

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 프로젝트 루트
- `CLAUDE.md` — Cloud Run min-instances=1, KIS API 제약, Supabase/Express/Cloud Run 스택 결정
- `.planning/ROADMAP.md` — Phase 2 Goal 및 Success Criteria 원문 (특히 #2 min-instances=1)
- `.planning/REQUIREMENTS.md` — INFR-03 (Express API + Cloud Run 배포)
- `.planning/STATE.md` — 프로젝트 현재 상태

### Phase 1 산출물 (승계 대상)
- `.planning/phases/01-data-foundation/01-CONTEXT.md` — D-01~D-20 (모노레포, pnpm, Supabase 스키마, service_role, RLS anon SELECT)
- `.planning/phases/01-data-foundation/01-PLAN.md` — pino 패턴, Dockerfile 멀티스테이지, Supabase 클라이언트 싱글턴 참조
- `packages/shared/src/stock.ts` — `Stock`, `Market` 타입 재사용
- `workers/ingestion/src/services/supabase.ts` — Supabase 싱글턴 패턴 대칭 구현
- `supabase/migrations/` — stocks 테이블 스키마 (컬럼명/타입 확인)

### 외부 문서
- Cloud Run deploy: `https://cloud.google.com/run/docs/deploying`
- Secret Manager + Cloud Run: `https://cloud.google.com/run/docs/configuring/secrets`
- Supabase JS SDK v2: `https://supabase.com/docs/reference/javascript`
- Express 5 마이그레이션: `https://expressjs.com/en/guide/migrating-5.html`

</canonical_refs>

<specifics>
## Specific Ideas

- `/api/scanner` 응답에 각 종목당 계산된 `upperLimitProximity` 필드 포함 (Phase 5 슬라이더가 이 값으로 필터)
- request-id 헤더명: `X-Request-Id` (Cloud Run 표준), `X-Trace-Id` 동시 바인딩 고려 시 planner 재량
- 에러 코드 명명 예시: `STOCK_NOT_FOUND`, `INVALID_QUERY_PARAM`, `RATE_LIMITED`, `INTERNAL_ERROR`, `NOT_FOUND`, `VALIDATION_FAILED`
- 배포 스크립트는 `scripts/deploy-server.sh` (`server/scripts/` 아님 — 루트 scripts가 Phase 전체 공용)
- Artifact Registry 저장소 이름: `gh-radar`
- Cloud Run 서비스 이름: `gh-radar-server`
- 로컬 개발 실행 포트: 8080 (배포 환경과 동일하게 유지해 혼선 최소화)

</specifics>

<deferred>
## Deferred Ideas

- **GitHub Actions 자동 배포** (WIF 인증 + master push 트리거) — v2 배포 성숙도 단계
- **Cloud Run 장 시간대만 min=1 스케줄링** — 비용 최적화 실험, 추후 비용 관찰 후 검토
- **Postgres full-text search / 형태소 분석기** — 종목 검색 품질 개선 필요 시점에 도입
- **`/api/scanner` 응답 캐시(Cloud CDN/Memorystore)** — 트래픽 증가 시 검토
- **API key / 사용자 인증** — AUTH-01 v2
- **RFC 9457 Problem Details 포맷** — 외부 파트너 API 오픈 시 고려
- **Readiness probe (Supabase 핑)** — 장애 감지 세분화 필요 시 추가
- **E2E 테스트(실 Supabase + 실 Cloud Run)** — CI 확장 단계

</deferred>

---

*Phase: 02-backend-api*
*Context gathered: 2026-04-13 via /gsd-discuss-phase*
