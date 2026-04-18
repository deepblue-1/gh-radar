---
phase: 08-discussion-board
plan: 06
subsystem: infra
tags: [cloud-run-job, cloud-scheduler, secret-manager, brightdata, playwright, axe-core, e2e, oauth-invoker, deploy]

# Dependency graph
requires:
  - phase: 08-discussion-board
    provides: "Plan 08-02 worker (image-ready, BRIGHTDATA env contract) + Plan 08-03 server discussions routes (graceful degrade) + Plan 08-04/08-05 webapp UI + Plan 08-01 mockDiscussionsApi fixture"
  - phase: 07-news-ingestion
    provides: "scripts/setup-news-sync-iam.sh + scripts/deploy-news-sync.sh + scripts/smoke-news-sync.sh + scripts/deploy-server.sh (1:1 미러 기준)"
  - phase: 06.2-auth
    provides: "Playwright auth.setup.ts storageState + chromium project — discussions.spec.ts 가 그대로 재사용"
provides:
  - "Cloud Run Job gh-radar-discussion-sync (asia-northeast3, 512Mi, 600s, OAuth invoker)"
  - "Cloud Scheduler gh-radar-discussion-sync-hourly (단일 1h, CONTEXT D1)"
  - "Secret Manager gh-radar-brightdata-api-key + IAM accessor 3건"
  - "server 재배포 (revision 00011-wz7) — Phase 8 코드 + BRIGHTDATA env mount → POST /refresh 200"
  - "scripts/{setup,deploy,smoke}-discussion-sync.sh 3종 (Phase 7 미러 + PIVOT 환경변수)"
  - "webapp/e2e/specs/discussions.spec.ts — Plan 08-01 스텁 → concrete 8 시나리오 (axe-core 2건 + 무한 스크롤 1건 포함)"
  - "DEPLOY-LOG.md (200 lines, 실측 cycle 통계 포함)"
  - "worker zod schema fix — contentSwReplacedButImg nullable (deferred-items 자동 해소)"
affects: [phase-9-ai-summary, ops-monitoring]

# Tech tracking
tech-stack:
  added:
    - "GCP Secret Manager: gh-radar-brightdata-api-key (replication=automatic, version 1)"
    - "Cloud Run Job: gh-radar-discussion-sync (Artifact Registry image)"
    - "Cloud Scheduler: gh-radar-discussion-sync-hourly (OAuth, KST)"
  patterns:
    - "Phase 7 news-sync 스크립트 1:1 복제 + PIVOT sed 치환 (Secret 이름/env 이름)"
    - "단일 1h Scheduler (CONTEXT D1) — Phase 7 의 intraday/offhours 분리 미적용"
    - "OAuth invoker 강제 (Pitfall 2 — OIDC 금지)"
    - "Playwright spec 무한 스크롤 검증 — page.route URL predicate (before query 유무로 분기)"
    - "Cloud Run Job exit 0 + per-stock try/catch (cycle 의 일부 종목 실패가 전체 fail 로 escalate 되지 않는 패턴)"

key-files:
  created:
    - "scripts/setup-discussion-sync-iam.sh (165 lines)"
    - "scripts/deploy-discussion-sync.sh (190 lines, 단일 Scheduler)"
    - "scripts/smoke-discussion-sync.sh (135 lines, 8 invariants)"
    - ".planning/phases/08-discussion-board/DEPLOY-LOG.md (200 lines)"
  modified:
    - "webapp/e2e/specs/discussions.spec.ts (test.skip 5개 → concrete 8 test, 273 lines)"
    - "workers/discussion-sync/src/scraper/fetchDiscussions.ts (zod nullable 수정)"
    - "workers/discussion-sync/src/scraper/types.ts (string → string | null)"
    - ".planning/phases/08-discussion-board/deferred-items.md (08-06 inline-fix 기록)"

key-decisions:
  - "Server image rebuild — BRIGHTDATA env 만 patch 했더니 기존 image (server:fecb2bc) 가 Phase 8 코드 미포함이라 /discussions 라우트 404. 해소를 위해 server:56e6abc 새 image build + push + revision 00011-wz7 deploy"
  - "Worker zod schema inline fix — production 첫 cycle 에서 57/58 종목 reject. 본 plan 범위가 'deploy + smoke' 라 worker 코드 fix 는 out-of-scope 후보였으나, 매시간 같은 에러로 데이터 0 누적이 critical 이라 즉시 fix (Rule 1) + 재배포. discussion-sync:f5b1cbf 로 Execution 2 에서 errors=0, totalUpserted=15463 달성"
  - "Bright Data secret 사전 등록 — setup script 가 stdin 으로 받지만 사용자 제공 key 를 printf 로 직접 주입 (T-01 mitigation 유지: shell history exposure 회피)"
  - "Smoke INV-6 가 production 실제 트래픽 발생 — POC §6 예산 (~144K req/mo) 대비 첫 실행 187 req 로 1.3% 소모. 정기 trigger 영향 없음"

patterns-established:
  - "production 배포 plan 의 deploy-and-verify 사이클: setup IAM → push image → deploy Cloud Run Job + Scheduler → smoke → 첫 수동 실행 → cycle log inspect → 발견된 worker bug 즉시 fix + 재배포"
  - "schema 호환성 검증: POC fixture (항상 string) vs production 실데이터 (null 가능) — Plan 08-06 smoke 가 첫 발견 지점. 후속 plan 의 zod schema 는 nullable 보수적으로 시작"

requirements-completed: [DISC-01]

# Metrics
duration: ~30min
completed: 2026-04-18
---

# Phase 8 Plan 06: deploy-and-e2e Summary

**Bright Data 경유 토론방 수집 Cloud Run Job 가동 (KST 매시 정각, 단일 schedule) + server 재배포로 POST /refresh 503 해소 + Playwright concrete 8 시나리오 (무한스크롤 + a11y 포함) + production 첫 cycle 15,463 discussions upsert (zod schema 즉시 fix 후) — smoke 8/8 PASS**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-18T04:25:00Z
- **Completed:** 2026-04-18T04:55:00Z
- **Tasks:** 5 (A: E2E spec / B: 3 scripts / C: GCP IAM+Job+Scheduler 배포 / D: server 재배포 / E: smoke + log + summary)
- **Files modified:** 5 created + 4 modified (E2E + 3 scripts + 2 worker patch + DEPLOY-LOG + deferred-items)

## Accomplishments

- **GCP 리소스 4종 신규 배포**:
  - Secret `gh-radar-brightdata-api-key` (version 1, replication automatic)
  - SA `gh-radar-discussion-sync-sa@gh-radar.iam.gserviceaccount.com`
  - Cloud Run Job `gh-radar-discussion-sync` (image `discussion-sync:f5b1cbf`)
  - Cloud Scheduler `gh-radar-discussion-sync-hourly` (`0 * * * *` KST, OAuth invoker = scheduler-sa)
- **IAM 4건 바인딩**: discussion-sync-sa → SUPABASE+BRIGHTDATA(2), server SA → BRIGHTDATA, scheduler-sa → run.invoker
- **server 재배포** revision `00011-wz7` (image `server:56e6abc`):
  - Phase 8 discussions router 활성화 (이전 image 는 미포함)
  - BRIGHTDATA_API_KEY (Secret) + BRIGHTDATA_ZONE/URL (env) mount
  - `POST /api/stocks/:code/discussions/refresh` 503 → 200 해소 (실시간 Bright Data 호출 → 5건 데이터 반환)
- **Playwright E2E concrete 8 시나리오** (test.skip 0):
  - detail Card 5건 + target=_blank/rel + title/author/time
  - 풀페이지 50건 + Compact 3열 헤더 + 새로고침 버튼 0 + ← back
  - refresh 쿨다운 (429 → disabled + data-remaining-seconds)
  - 무한 스크롤 (sentinel scroll → before cursor → +30건 append, 최종 80건)
  - axe-core a11y 2 (detail + 풀페이지, serious/critical=0)
- **Smoke 8/8 PASS** (INV-1 ~ INV-8) — Job exists / Scheduler hourly+OAuth / 양 SA accessor / Job exec exit 0 / GET /discussions 200 / POST /refresh not 503
- **Production 첫 cycle 결과** (Execution 2, post-fix): targets=58, requests=187, **upserted=15,463**, errors=0, skipped=0 → DB 에 50+ 종목 분포

## Task Commits

1. **A — Playwright E2E spec** — `e7d0724` (test)
2. **B — 3 배포 스크립트** — `224a21c` (feat)
3. **C — GCP IAM/Secret/Job/Scheduler production** — `56e6abc` (chore, --allow-empty)
4. **D — server 재배포 (Phase 8 코드 + BRIGHTDATA mount)** — `1636aa0` (chore, --allow-empty)
5. **inline-fix — worker zod schema nullable** — `f5b1cbf` (fix, Rule 1 auto-fix)
6. **E — DEPLOY-LOG + SUMMARY (이 commit)** — pending

추가 incidental: `9affb52` (dev.sh HMR fix — 무관 working tree 변경이 D 커밋 직전 분리 commit 됨)

## Files Created/Modified

### Created (4)
- `scripts/setup-discussion-sync-iam.sh` — IAM (SA + Secret + 3 accessor)
- `scripts/deploy-discussion-sync.sh` — Cloud Build + Job deploy + 단일 1h Scheduler (OAuth)
- `scripts/smoke-discussion-sync.sh` — 8 invariants (exec/Scheduler/OAuth/accessor/HTTP)
- `.planning/phases/08-discussion-board/DEPLOY-LOG.md` — 200 lines 실측 기록

### Modified (4)
- `webapp/e2e/specs/discussions.spec.ts` — test.skip 5 → concrete 8 (273 lines)
- `workers/discussion-sync/src/scraper/fetchDiscussions.ts` — `z.string().nullable()`
- `workers/discussion-sync/src/scraper/types.ts` — `contentSwReplacedButImg: string | null`
- `.planning/phases/08-discussion-board/deferred-items.md` — 08-06 inline-fix 기록 추가

## Decisions Made

- **server 새 image rebuild (D 단계)**: 첫 `gcloud run services update --update-secrets/--update-env-vars` 만으로는 기존 image (server:fecb2bc, Phase 8 router 미포함) 라 /discussions → 404. 따라서 같은 SHA `56e6abc` 로 server image 새 build → push → `--image=` 명시 update → revision `00011-wz7` 100% traffic. health version 이 `56e6abc` 으로 갱신되었음으로 확증.
- **worker schema fix 즉시 적용 (E 단계)**: scope-boundary 측면에서 worker 코드 변경은 본 plan 범위 밖 후보였으나, production 매시간 cycle 마다 같은 에러로 데이터 0 누적되는 것이 critical (Rule 1). inline fix 후 재배포 → 다음 cycle 에서 errors=0, upserted=15,463 검증.
- **Single Scheduler (CONTEXT D1)**: Phase 7 news-sync 의 intraday/offhours 2개 분리를 미적용. 토론방은 24/7 커뮤니티라 평일 장중/장외 구분 무의미.
- **Concurrency=3 보수적 시작**: Phase 7.2 교훈 (Naver API 가 동시성 높을 때 일시 차단) 따라 PLAN 의 8 대신 3 으로 시작. cycle 결과 안정 — 추후 monitoring 보고 점진 증가.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] worker zod schema reject — contentSwReplacedButImg null**
- **Found during:** Step E (smoke INV-6 후 cycle log 검토)
- **Issue:** Production 첫 cycle 에서 58 종목 중 57개가 `naver api validation error` 로 reject. Naver API 가 본문 없는 post (이미지/투표 only) 에 `contentSwReplacedButImg=null` 반환하는데 zod `z.string()` 강제 → 페이지 전체 fail. POC fixture 가 전부 string 이라 단위/통합 테스트로 잡히지 않음.
- **Fix:** `workers/discussion-sync/src/scraper/fetchDiscussions.ts` 의 `z.string()` → `z.string().nullable()`. `types.ts` 동기화. parser 의 `?? ""` 처리는 이미 null-safe 라 추가 변경 불필요.
- **Files modified:** `workers/discussion-sync/src/scraper/fetchDiscussions.ts`, `types.ts`
- **Verification:** 64 worker tests green, 다음 cycle (`gh-radar-discussion-sync-hrkcj`) 에서 errors=0, totalUpserted=15463
- **Committed in:** `f5b1cbf`

**2. [Rule 3 - Blocking] server image 가 Phase 8 코드 미포함**
- **Found during:** Step D (재배포 직후 health version=fecb2bc 확인)
- **Issue:** 단순 env+secret update 만 했더니 기존 image 가 그대로라 /discussions 라우트 404.
- **Fix:** SHA `56e6abc` 으로 server image 새 build + push + `gcloud run services update --image=...` → revision `00011-wz7` 100% traffic.
- **Files modified:** none (image rebuild)
- **Verification:** GET /api/health → version `56e6abc`, GET /discussions → 200 [], POST /refresh → 200 + 5건 실데이터
- **Committed in:** `1636aa0` (chore commit 에 결과 기록)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 production data bug, 1 Rule 3 deploy blocker)
**Impact on plan:** 양쪽 모두 production 활성화에 필수. 범위 확장 0 — fix 의 결과 production 이 본 plan 의 success criteria (POST /refresh 200, GET /discussions 200, smoke 8 PASS) 를 모두 만족.

## Issues Encountered

- **Bright Data API key 등록 first-run 흐름**: setup 스크립트가 `gcloud secrets versions add --data-file=-` 로 stdin 받도록 설계되었으나, auto mode 에서는 사용자 입력 없이 `printf '%s' '$KEY' | gcloud secrets create` 로 사전 등록 후 setup 스크립트 SKIP 경로를 탔다. T-01 (shell history exposure) 는 printf 단일 호출로 노출 위험 최소화.
- **Cloud Run Job per-stock 에러가 cycle exit 0 으로 mask 됨**: Execution 1 에서 errors=57 였는데 INV-6 가 PASS. 원인은 worker 의 per-stock try/catch 가 의도된 동작 (한 종목 fail 이 전체 fail 로 escalate 안 됨). smoke 단계에서 cycle log 의 errors metric 도 검증해야 함을 학습 — 향후 INV-9 후보로 deferred.

## Known Stubs

없음. 모든 GCP 리소스는 실제로 동작 중이며 production 첫 cycle 결과 검증됨.

## User Setup Required

없음 — Bright Data API key 는 사용자가 직접 제공한 값을 GCP Secret Manager 에 등록 완료. 별도 dashboard 설정 불필요.

## Next Phase Readiness

- **Phase 9 AI 요약 준비**: discussions 테이블에 15,000+ row 누적 → AI 요약 input 충분. Phase 9 가 시작될 때 추가 데이터 확보 (시간 경과로 매시간 수집).
- **Operational monitoring (별도)**:
  - Bright Data dashboard daily request 추이 (zone=gh_radar_naver) — 144K/mo 예상 대비 실측
  - cycle log `errors > 0` alert (현 0 baseline)
  - api_usage 일일 5000 한도 alert (현 272 = 5.4%)
  - smoke INV-9 추가 후보: cycle errors metric 검증 (per-stock 실패 mask 방지)

## Threat coverage

| Threat | Status |
|--------|--------|
| T-01 PROXY_API_KEY leak | Secret Manager + stdin/printf-only injection. DEPLOY-LOG 평문 0 (자체 grep 검증) |
| T-02 URL tabnabbing | Playwright spec test 1 이 `target=_blank` + `rel noopener noreferrer` 검증 |
| T-03 smoke output secret leak | smoke 가 `>/dev/null` 으로 PASS/FAIL 만 출력 |
| T-04 log injection | Plan 08-02 logger redact 유지, Cloud Run 로그에 brightdataApiKey 평문 없음 |
| T-05 proxy 예산 소진 | DAILY_BUDGET=5000 + atomic incr_api_usage RPC; 실측 272/5000 (5.4%) baseline |
| T-09 Cloud Run Job SA 권한 최소 | discussion-sync-sa: secretAccessor x2 only; scheduler-sa: run.invoker only |

## Self-Check: PASSED

- `[ -f scripts/setup-discussion-sync-iam.sh ]` ✓
- `[ -f scripts/deploy-discussion-sync.sh ]` ✓
- `[ -f scripts/smoke-discussion-sync.sh ]` ✓
- `[ -f webapp/e2e/specs/discussions.spec.ts ]` + 273 lines + 8 test() ✓
- `[ -f .planning/phases/08-discussion-board/DEPLOY-LOG.md ]` 200 lines ✓
- `git log --oneline | grep -q e7d0724` (A) ✓
- `git log --oneline | grep -q 224a21c` (B) ✓
- `git log --oneline | grep -q 56e6abc` (C) ✓
- `git log --oneline | grep -q 1636aa0` (D) ✓
- `git log --oneline | grep -q f5b1cbf` (inline-fix) ✓
- `gcloud run jobs describe gh-radar-discussion-sync` exit 0 ✓
- `gcloud scheduler jobs describe gh-radar-discussion-sync-hourly` exit 0 ✓
- `gcloud secrets describe gh-radar-brightdata-api-key` exit 0 ✓
- Smoke 8/8 PASS ✓
- DEPLOY-LOG 평문 secret grep 결과 0 ✓
- DB discussions count 15,473 ✓ (cycle 2 후)

---
*Phase: 08-discussion-board*
*Completed: 2026-04-18*
