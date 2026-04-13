---
phase: 2
slug: backend-api
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source invariants: `02-RESEARCH.md` §10 (Validation Architecture, INV-1 ~ INV-11).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + supertest 7.x |
| **Config file** | `server/vitest.config.ts` (Wave 1 02-01-01 산출물 — mirrors Phase 1 `workers/ingestion/vitest.config.ts`) |
| **Quick run command** | `pnpm -F @gh-radar/server test --run` |
| **Full suite command** | `pnpm -F @gh-radar/server test --run && pnpm -F @gh-radar/server build && bash scripts/smoke-server.sh "$URL"` |
| **Estimated runtime** | ~5s (unit) · ~30s (full w/ deploy smoke) |

---

## Sampling Rate

- **After every task commit:** `pnpm -F @gh-radar/server test --run` (vitest unit + supertest)
- **After every plan wave:** Quick run + `pnpm -F @gh-radar/server build` + docker dry-build
- **Before `/gsd-verify-work`:** Full suite (unit + build + Cloud Run deploy + INV-1~INV-11) must be green
- **Max feedback latency:** ~5 seconds for unit layer

---

## Per-Task Verification Map

*5개 PLAN(02-01~02-05)의 모든 task를 INFR-03 요구사항에 매핑. threat 참조가 없는 task는 보안 영향 없는 구조 작업(Wave 0 setup 또는 순수 엔트리 wiring).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | INFR-03 | — | N/A (workspace/TS/vitest setup) | unit (typecheck) | `pnpm install --frozen-lockfile=false && pnpm -F @gh-radar/server typecheck` | ❌ Wave 0 | ⬜ pending |
| 02-01-02 | 02-01 | 1 | INFR-03 | T-02-01 | pino redact paths로 service_role/auth/cookie 로그 차단 | unit (typecheck + build) | `pnpm -F @gh-radar/server typecheck && pnpm -F @gh-radar/shared build` | ❌ Wave 0 | ⬜ pending |
| 02-01-03 | 02-01 | 1 | INFR-03 | T-02-04, T-02-08 | 매퍼 숫자 캐스팅 + upper_limit=0 division-by-zero 회피 · 테스트 env는 fake key | unit (vitest) | `pnpm -F @gh-radar/server test --run` | ❌ Wave 0 | ⬜ pending |
| 02-02-01 | 02-02 | 2 | INFR-03 | T-02-03, T-02-10 | trust proxy=1 + ipKeyGenerator(IPv6 /64) · X-Request-Id 정규식 검증 후 UUID fallback | unit (vitest) | `pnpm test --run tests/middleware/request-id.test.ts tests/middleware/rate-limit.test.ts` | ❌ Wave 0 | ⬜ pending |
| 02-02-02 | 02-02 | 2 | INFR-03 | T-02-06 | production에서 stack trace/err.message 은닉 → Internal server error 고정 | unit (vitest) | `pnpm test --run tests/middleware/error-handler.test.ts` | ❌ Wave 0 | ⬜ pending |
| 02-02-03 | 02-02 | 2 | INFR-03 | T-02-02, T-02-09 | CORS 화이트리스트 + 비허용 origin ACAO 부재 · express.json limit 16kb | integration (supertest) | `pnpm test --run tests/middleware/cors-integration.test.ts && pnpm typecheck` | ❌ Wave 0 | ⬜ pending |
| 02-03-01 | 02-03 | 3 | INFR-03 | T-02-04, T-02-13 | zod enum/min/max로 PostgREST 주입/DoS 차단 · mock 누적 filter로 복수 필터 AND 보장 | integration (supertest) | `pnpm test --run tests/routes/health.test.ts tests/routes/scanner.test.ts` | ❌ Wave 0 | ⬜ pending |
| 02-03-02 | 02-03 | 3 | INFR-03 | T-02-04b, T-02-11, T-02-12 | `sanitizeSearchTerm`이 `,()%` 제거 · `/search`를 `/:code`보다 먼저 등록 · 종목코드 정규식 검증 | integration (supertest) | `pnpm test --run tests/routes/stock-detail.test.ts tests/routes/search.test.ts` | ❌ Wave 0 | ⬜ pending |
| 02-03-03 | 02-03 | 3 | INFR-03 | — | N/A (production entry wiring) | unit (build + 전체 vitest 집계) | `pnpm build && test -f dist/server.js && pnpm test --run` | ❌ Wave 0 | ⬜ pending |
| 02-03-04 | 02-03 | 3 | INFR-03 | — | 체크포인트 — 실 Supabase 연결로 end-to-end 확인 | manual (checkpoint:human-verify) | `manual` — 사용자가 curl 5종 결과 확인 후 approved | ✅ | ⬜ pending |
| 02-04-01 | 02-04 | 4 | INFR-03 | T-02-14, T-02-16 | non-root `USER app` 실행 · `.dockerignore`로 `.env`/tests/node_modules 제외 | unit (docker build + run smoke) | `docker build --platform=linux/amd64 -f server/Dockerfile ... && docker run ... APP_VERSION==local-test` | ❌ Wave 0 | ⬜ pending |
| 02-04-02 | 02-04 | 4 | INFR-03 | T-02-05, T-02-15 | gcloud config/project 가드 → 불일치 시 exit 1 · `--set-env-vars="^@^..."` delimiter로 CORS 콤마 보호 | unit (bash 문법 + guard dry-run) | `test -x scripts/deploy-server.sh && bash -n scripts/deploy-server.sh && (unset GCP_PROJECT_ID; bash scripts/deploy-server.sh 2>&1 \| grep -q 'GCP_PROJECT_ID env var is required')` | ❌ Wave 0 | ⬜ pending |
| 02-04-03 | 02-04 | 4 | INFR-03 | T-02-17 | smoke 로그는 curl stderr만(수용) · INV-1~INV-9 curl+jq 검증 스크립트 | unit (bash 문법 + usage 체크) | `test -x scripts/smoke-server.sh && bash -n scripts/smoke-server.sh && bash scripts/smoke-server.sh 2>&1 \| grep -q 'Usage: smoke-server.sh'` | ❌ Wave 0 | ⬜ pending |
| 02-05-01 | 02-05 | 5 | INFR-03 | T-02-18 | secretAccessor를 리소스 단위 `gh-radar-supabase-service-role`에만 바인딩 | manual (checkpoint:human-action) | `manual` — 사용자가 gcloud 7단계 실행 후 검증 4종 통과 | ✅ | ⬜ pending |
| 02-05-02 | 02-05 | 5 | INFR-03 | T-02-01, T-02-05, T-02-19 | 배포 로그 + Cloud Logging에 service_role 키 0건 · minScale=1 고정 · gcloud 가드 작동 | smoke (실 Cloud Run) | `URL=$(gcloud run services describe ... --format='value(status.url)') && bash scripts/smoke-server.sh "$URL"` | ✅ | ⬜ pending |
| 02-05-03 | 02-05 | 5 | INFR-03 | — | 체크포인트 — 실 URL 브라우저 확인 + 비용 확인 | manual (checkpoint:human-verify) | `manual` — 사용자가 브라우저로 3 URL + Billing 확인 후 approved | ✅ | ⬜ pending |
| 02-05-04 | 02-05 | 5 | INFR-03 | T-02-20 | Cloud Logging retention 기본값 PII 누출은 pino redact로 방어(수용) · DEPLOY-LOG 영구 보관 | unit (file + PASS 11건 grep) | `test -f .../02-DEPLOY-LOG.md && grep -c 'PASS' ... \| awk '{ exit ($1 < 11) }'` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*File Exists 컬럼: `❌ Wave 0` = 해당 task가 최초로 생성하는 파일 / `✅` = 선행 Wave 산출물 또는 실행 아티팩트 참조.*

---

## Smoke-Test Invariants (from RESEARCH §10.3)

| # | Invariant | Verify Command | Success Criterion |
|---|-----------|----------------|-------------------|
| INV-1  | `GET /api/health` → 200 + `{status:'ok', timestamp, version}` | `curl -fsS $URL/api/health \| jq -e '.status=="ok"'` | SC#1 공개 URL |
| INV-2  | `GET /api/scanner` → 200 + array, each with `upperLimitProximity:number` | `curl -fsS $URL/api/scanner \| jq -e 'type=="array" and (.[0].upperLimitProximity\|type=="number")'` | SC#3 |
| INV-3  | `GET /api/stocks/005930` → 200 + `code=="005930"` | `curl -fsS $URL/api/stocks/005930 \| jq -e '.code=="005930"'` | SC#4 |
| INV-4  | `GET /api/stocks/000000` → 404 + `error.code=="STOCK_NOT_FOUND"` | see RESEARCH §10.3 | SC#4 |
| INV-5  | `GET /api/stocks/search?q=삼성` → ≤20 results | see RESEARCH §10.3 | SC#3 |
| INV-6  | CORS preflight from allowed origin → 200/204 | see RESEARCH §10.3 | SC#1 |
| INV-7  | CORS preflight from disallowed origin → rejected | see RESEARCH §10.3 | SC#1 |
| INV-8  | 201st req/60s/IP → 429 + `error.code=="RATE_LIMITED"` | see RESEARCH §10.3 | D-20 |
| INV-9  | `X-Request-Id` present in every response | see RESEARCH §10.3 | D-22 |
| INV-10 | Cloud Run `minScale==1` applied | `gcloud run services describe gh-radar-server --region=asia-northeast3 --format='value(spec.template.metadata.annotations.autoscaling\.knative\.dev/minScale)'` → "1" | SC#2 (비가역) |
| INV-11 | Cloud Logging entries have `request_id`, `status`, `latency_ms` | see RESEARCH §10.3 | D-25 |

**매핑:** INV-1~INV-9는 02-04 Task 3(로컬 smoke 스크립트 작성 — `scripts/smoke-server.sh`) + 02-05 Task 2(실 Cloud Run 배포 후 동 스크립트 실행)에서 검증. INV-10은 02-05 Task 2의 `gcloud run services describe` annotation grep, INV-11은 02-05 Task 2의 `gcloud logging read` + jq 필드 존재 확인.

---

## Wave 0 Requirements

- [x] `server/vitest.config.ts` — 02-01-01이 mirror Phase 1 ingestion config로 생성
- [x] `server/tests/setup.ts` — 02-01-01 env isolation + global mock helpers
- [x] `server/tests/fixtures/supabase-mock.ts` — 02-01-03이 RESEARCH §7.3 패턴으로 생성; **02-03-01에서 누적 filter로 리팩터 (gte 추가 + or/eq 덮어쓰기 제거)**
- [x] `server/tests/fixtures/stocks.ts` — 02-01-03이 005930 삼성전자 + KOSPI/KOSDAQ mix 샘플 rows 생성
- [x] `scripts/smoke-server.sh` — 02-04-03이 INV-1~INV-9 curl 구현 (INV-10/INV-11은 02-05 인라인 gcloud 명령)
- [x] `pnpm -F @gh-radar/server add -D vitest@4 supertest@7 @types/supertest` — 02-01-01이 실행

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloud Run 실 배포 + 공개 URL 응답 | INFR-03 / SC#1 | GCP 실 환경 상호작용 필요 (로컬 시뮬레이션 불가) | `scripts/deploy-server.sh` 실행 → 출력된 URL로 INV-1~INV-11 수동 실행 |
| min-instances=1 실제 효과 검증 (no cold start) | SC#2 | 네트워크 지연 포함 실 환경 측정 | 5분 대기 후 `time curl $URL/api/health` 3회 — 모두 <500ms |
| Secret Manager 주입 경로 | D-34 | 시크릿 값 로그/응답 노출 금지 확인 | 배포 후 `gcloud logging read ...` grep에 service_role 키 문자열 0건 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s for unit layer
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (PLAN 단계 검증 완료, 실행 후 재확인)
