# Phase 7 — Deploy Log

- **배포 일시 (UTC):** 2026-04-17T10:27Z ~ 2026-04-17T10:33Z
- **GCP 프로젝트:** `gh-radar`
- **리전:** `asia-northeast3`
- **Job:** `gh-radar-news-sync`
- **최신 Job Image:** `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/news-sync:daf7a08`
- **Job SA:** `gh-radar-news-sync-sa@gh-radar.iam.gserviceaccount.com`
- **Scheduler 2개 (R6 분리 운영):**
  - `gh-radar-news-sync-intraday` — `*/15 9-15 * * 1-5` (장중 평일 KST 15분 주기)
  - `gh-radar-news-sync-offhours` — `0 */2 * * *` (장외 전시간 KST 2시간 주기)
- **Scheduler SA:** `gh-radar-scheduler-sa@gh-radar.iam.gserviceaccount.com` (OAuth invoker — OIDC 금지)
- **Server Revision:** `gh-radar-server-00009-ctt` (Naver env/secret mount 추가)
- **Server URL:** https://gh-radar-server-fnbhvevuva-du.a.run.app

## Cloud Run Job 구성

| 항목 | 값 |
|------|-----|
| CPU | 1 |
| Memory | 512Mi |
| Task Timeout | 600s |
| Max Retries | 1 |
| Parallelism | 1 |
| Tasks | 1 |
| Runtime | Node 22 LTS (alpine) |

## 환경변수 / Secrets

### news-sync Cloud Run Job

| Key | Source | Value |
|-----|--------|-------|
| `SUPABASE_URL` | inline | `https://ivdbzxgaapbmrxreyuht.supabase.co` |
| `NAVER_BASE_URL` | inline | `https://openapi.naver.com` |
| `NAVER_DAILY_BUDGET` | inline | `24500` |
| `NEWS_SYNC_DAILY_BUDGET` | inline | `24500` |
| `NEWS_SYNC_CONCURRENCY` | inline | `8` |
| `LOG_LEVEL` | inline | `info` |
| `APP_VERSION` | inline (GIT_SHA) | `daf7a08` |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret Manager | `gh-radar-supabase-service-role:latest` |
| `NAVER_CLIENT_ID` | Secret Manager | `NAVER_CLIENT_ID:latest` (D1) |
| `NAVER_CLIENT_SECRET` | Secret Manager | `NAVER_CLIENT_SECRET:latest` (D1) |

### server (gh-radar-server — revision 00009-ctt 추가)

신규 추가된 항목만:

| Key | Source |
|-----|--------|
| `NAVER_BASE_URL` | inline `https://openapi.naver.com` |
| `NAVER_DAILY_BUDGET` | inline `24500` |
| `NAVER_CLIENT_ID` | Secret Manager `NAVER_CLIENT_ID:latest` |
| `NAVER_CLIENT_SECRET` | Secret Manager `NAVER_CLIENT_SECRET:latest` |

## IAM — Accessor 바인딩 5건

| # | Secret | Member | Role |
|---|--------|--------|------|
| 1 | `gh-radar-supabase-service-role` | `gh-radar-news-sync-sa@...` | `secretmanager.secretAccessor` |
| 2 | `NAVER_CLIENT_ID` | `gh-radar-news-sync-sa@...` | `secretmanager.secretAccessor` |
| 3 | `NAVER_CLIENT_SECRET` | `gh-radar-news-sync-sa@...` | `secretmanager.secretAccessor` |
| 4 | `NAVER_CLIENT_ID` | `1023658565518-compute@developer.gserviceaccount.com` (server SA) | `secretmanager.secretAccessor` |
| 5 | `NAVER_CLIENT_SECRET` | `1023658565518-compute@developer.gserviceaccount.com` (server SA) | `secretmanager.secretAccessor` |

**추가**: Scheduler → Cloud Run Job `run.invoker` 바인딩 (리소스 단위, Job `gh-radar-news-sync`).

## Invariant 검증 결과 — smoke-news-sync.sh (INV-1 ~ INV-6)

| INV | 내용 | 결과 |
|-----|------|------|
| INV-1 | `gcloud run jobs execute --wait` exit 0 | ✅ PASS |
| INV-2 | `gcloud run jobs describe` exists | ✅ PASS |
| INV-3a | Scheduler intraday schedule == `*/15 9-15 * * 1-5` | ✅ PASS |
| INV-3b | Scheduler offhours schedule == `0 */2 * * *` | ✅ PASS |
| INV-3c | 두 Scheduler 모두 ENABLED | ✅ PASS |
| INV-4 | 최근 5분 로그에 `news-sync cycle complete` 1건 이상 | ✅ PASS |
| INV-5 | `news_articles` count header parse (CR 제거 후 숫자 추출) | ✅ PASS |
| INV-6 | `api_usage` count > 0 (service='naver_search_news', KST today) | ✅ PASS |

**결과: 8/8 PASS**

## E2E (Playwright news.spec.ts)

| Test | 시나리오 | 결과 |
|------|----------|------|
| V-17-a | 상세 목록 5 items + 전체 뉴스 보기 링크 | ✅ PASS |
| V-17-b | target=_blank + rel noopener noreferrer | ✅ PASS |
| V-18-a | /news 전체 페이지 50 items + ← back 이동 | ✅ PASS |
| V-18-b | limit 100 (서버 하드캡) 처리 | ✅ PASS |
| V-19 | refresh 429 → 버튼 disabled + data-remaining-seconds | ✅ PASS |
| V-20 | axe-core serious/critical 0 violation | ✅ PASS |

**결과: 6/6 PASS** + 기존 30 test 회귀 OK (총 36 passed).

Stock-detail.spec.ts 기존 Phase 7 placeholder assertion 은 Plan 07-04 가 교체한 실 StockNewsSection 에 맞춰 갱신.

## Production smoke

- `curl https://gh-radar-server-fnbhvevuva-du.a.run.app/api/stocks/005930/news?limit=3&days=7` → **200**, 3+ 삼성전자 뉴스 item (실제 Naver 응답)
- `curl -X POST .../api/stocks/005930/news/refresh` → **200** (NOT 503 NAVER_UNAVAILABLE)
- `news_articles` row count: **1103** (배포 시점)
- `api_usage` count (naver_search_news, 2026-04-17 KST): **39**
- `https://gh-radar-webapp.vercel.app/stocks/005930` → 307 to /login (auth 필수, UX 정상)

## 배포 중 조우한 이슈와 해결

### 1. top_movers 컬럼명 불일치 (Rule 1 Bug Fix)

- **발견**: Cloud Run Job 첫 실행 로그 — `column top_movers.stock_code does not exist` (PG 42703) → exit(1)
- **원인**: Phase 06.1 이 stocks 를 split 하며 `top_movers.code` 로 유지했으나 news-sync worker (`workers/news-sync/src/pipeline/targets.ts`) 는 `stock_code` 로 조회
- **해결**: `.select("code")` + 맵 타입 `Array<{ code: string }>` 으로 수정 → `fix(07-06): top_movers 컬럼명 stock_code → code` 커밋
- **재배포**: SHA `daf7a08` 이미지로 재빌드 → 재실행 성공

### 2. smoke INV-5 헤더 파싱 CR 제거 누락 (Rule 1 Bug Fix)

- **발견**: INV-5 가 news_articles 행이 존재함에도 FAIL
- **원인**: `content-range: 0-868/869\r` 의 trailing CR 이 `grep -oE '[0-9]+$'` 와 충돌 → `$` 앵커 매칭 실패
- **해결**: `| tr -d '\r'` 파이프 추가 → 정상 파싱
- **DI-02**: master-sync smoke 에도 동일 패턴이 있으나 scope out (deferred-items.md 기록)

## Deviations from Plan

### D1: Naver Secret 이름 (short form 재사용)

- **Plan 원본**: `gh-radar-naver-client-id` + `gh-radar-naver-client-secret`
- **실제 사용**: `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` (프로젝트 `gh-radar` 에 이미 등록됨, 값 포함)
- **이유**: 중복 Secret 리소스 생성 회피. setup/deploy 스크립트에 `NAVER_ID_SECRET`/`NAVER_SECRET_SECRET` 변수로 캡슐화 + plan-spec 명을 주석으로 문서화
- **영향**: 기능 동일, acceptance grep 기준 충족

### D2: SERVER_SA 기본값

- **Plan 원본**: `gh-radar-server-sa@gh-radar.iam.gserviceaccount.com`
- **실제**: `1023658565518-compute@developer.gserviceaccount.com` (default compute SA — Phase 02 배포가 이 SA 를 채택했고 gh-radar-server Cloud Run revision 이 해당 SA 사용 중)
- **이유**: 실제 Cloud Run revision 의 `serviceAccountName` 을 따름. `gh-radar-server-sa` 는 이 프로젝트에 존재하지 않음
- **구현**: `setup-news-sync-iam.sh` 가 `detect_server_sa()` 로 자동 감지, `SERVER_SA=<email>` env override 허용

## Known issues / next

- **DI-01 (Plan 07-01 이월)**: Supabase 자동 GRANT 가 `incr_api_usage` RPC 에 anon/authenticated 실행권한 부여. 현재 실 피해 없음 (api_usage 테이블은 RLS 로 deny, worker 만 service_role 로 호출). 향후 마이그레이션 한 줄 추가 필요 (`REVOKE ALL ON FUNCTION incr_api_usage(text, date, int) FROM anon, authenticated;`).
- **DI-02 (본 Plan 발견)**: master-sync smoke INV-4 가 동일 CR 파싱 이슈로 silent FAIL. 데이터 무결성 영향 없음.
- **Naver scheduler 주기 실측**: 15분 주기 × 8h × 5d 평일 = 160 invocations/주 + 2h 주기 = ~84 invocations/주. page 별 호출 ×, target×pages 동적. 현재 api_usage=39/day 시작, 25,000 한도 대비 안전 마진 충분.

## 운영 참고

- **로그**: https://console.cloud.google.com/logs/viewer?project=gh-radar
- **Job 콘솔**: https://console.cloud.google.com/run/jobs/details/asia-northeast3/gh-radar-news-sync?project=gh-radar
- **Scheduler 콘솔**: https://console.cloud.google.com/cloudscheduler?project=gh-radar
- **재배포** (news-sync Job):
  ```bash
  export GCP_PROJECT_ID=gh-radar
  set -a && source workers/master-sync/.env && set +a
  bash scripts/deploy-news-sync.sh
  ```
- **서버 재배포** (Naver env 변경 시):
  ```bash
  export GCP_PROJECT_ID=gh-radar
  set -a && source workers/master-sync/.env && set +a
  export CORS_ALLOWED_ORIGINS="https://gh-radar-webapp.vercel.app"
  bash scripts/deploy-server.sh
  ```
- **Secret 갱신** (Naver credential rotation):
  ```bash
  printf '%s' "<new-client-id>" | gcloud secrets versions add NAVER_CLIENT_ID --data-file=- --project=gh-radar
  printf '%s' "<new-client-secret>" | gcloud secrets versions add NAVER_CLIENT_SECRET --data-file=- --project=gh-radar
  # Cloud Run revision 은 다음 배포 시 latest 를 자동으로 참조
  ```
