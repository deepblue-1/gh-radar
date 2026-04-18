# Phase 8 Discussion Board — Deploy Log

**Deployed:** 2026-04-18 KST
**Region:** asia-northeast3
**Project:** gh-radar
**Plan:** 08-06 (deploy-and-e2e)

---

## Resources

| Resource | Name | Image / Schedule |
|----------|------|-----------------|
| Secret | `gh-radar-brightdata-api-key` | version 1, replication=automatic |
| SA (Job runtime) | `gh-radar-discussion-sync-sa@gh-radar.iam.gserviceaccount.com` | (created) |
| Cloud Run Job | `gh-radar-discussion-sync` | `discussion-sync:f5b1cbf` (digest sha256:0d... after re-deploy) |
| Cloud Scheduler | `gh-radar-discussion-sync-hourly` | `0 * * * *` KST, state=ENABLED |
| Cloud Run Service | `gh-radar-server` | revision `gh-radar-server-00011-wz7` (image `server:56e6abc`) |

### Image SHA history (this plan)

| Build | SHA | Component |
|-------|-----|-----------|
| 1 | `224a21c` | discussion-sync (initial deploy) |
| 2 | `56e6abc` | server (Phase 8 코드 + BRIGHTDATA env mount) |
| 3 | `f5b1cbf` | discussion-sync (zod schema fix — contentSwReplacedButImg nullable) |

---

## Schedule

- **Single hourly:** `0 * * * *` KST (CONTEXT D1 — 토론방 24/7)
- **Time-zone:** Asia/Seoul
- **Auth:** OAuth invoker = `gh-radar-scheduler-sa@gh-radar.iam.gserviceaccount.com` (Pitfall 2 — OIDC 금지)
- **URI:** `https://asia-northeast3-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/gh-radar/jobs/gh-radar-discussion-sync:run`

---

## IAM bindings (added in this plan)

| # | Grantee SA | Role | Resource |
|---|-----------|------|----------|
| 1 | gh-radar-discussion-sync-sa | roles/secretmanager.secretAccessor | gh-radar-supabase-service-role |
| 2 | gh-radar-discussion-sync-sa | roles/secretmanager.secretAccessor | gh-radar-brightdata-api-key |
| 3 | 1023658565518-compute@developer (server SA) | roles/secretmanager.secretAccessor | gh-radar-brightdata-api-key |
| 4 | gh-radar-scheduler-sa | roles/run.invoker | gh-radar-discussion-sync (Cloud Run Job) |

**Total: 4 bindings.**

---

## Cloud Run Job env / secrets

### env (`--set-env-vars`)
- `SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co`
- `BRIGHTDATA_ZONE=gh_radar_naver`
- `BRIGHTDATA_URL=https://api.brightdata.com/request`
- `NAVER_DISCUSSION_API_BASE=https://stock.naver.com/api/community/discussion/posts/by-item`
- `DISCUSSION_SYNC_DAILY_BUDGET=5000`
- `DISCUSSION_SYNC_CONCURRENCY=3` (보수적 시작 — Phase 7.2 교훈)
- `DISCUSSION_SYNC_PAGE_SIZE=100`
- `DISCUSSION_SYNC_BACKFILL_MAX_PAGES=10`
- `DISCUSSION_SYNC_BACKFILL_DAYS=7`
- `DISCUSSION_SYNC_INCREMENTAL_HOURS=24`
- `LOG_LEVEL=info`
- `APP_VERSION=f5b1cbf`

### secrets (`--set-secrets`)
- `SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest`
- `BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest`

---

## Server redeploy (gh-radar-server)

- Service: `gh-radar-server`
- Revision: `gh-radar-server-00011-wz7`
- Image: `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/server:56e6abc` (digest `sha256:6d6ffa42e0b25cada21d6fc1f1ee4c0c5886908327e85f6b1bd0acb93bc5745e`)
- Traffic: 100% to new revision
- 추가 env: `BRIGHTDATA_ZONE`, `BRIGHTDATA_URL`, `APP_VERSION=56e6abc`
- 추가 secret: `BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest`
- 검증: `GET /api/health` → 200 `{"version":"56e6abc"}`

---

## Smoke result (`scripts/smoke-discussion-sync.sh`)

| # | Invariant | Result |
|---|-----------|--------|
| INV-1 | Cloud Run Job exists | PASS |
| INV-2 | Scheduler hourly schedule (`0 * * * *`) | PASS |
| INV-3 | Scheduler OAuth invoker (Pitfall 2 — no OIDC) | PASS |
| INV-4 | discussion-sync-sa BRIGHTDATA accessor | PASS |
| INV-5 | server SA BRIGHTDATA accessor | PASS |
| INV-6 | Job execute --wait exit 0 | PASS |
| INV-7 | GET `/api/stocks/005930/discussions` 200 | PASS |
| INV-8 | POST `/refresh` not 503 (200/429 allowed) | PASS |

**Total: 8/8 PASS**

---

## Cloud Run Job execution results

### Execution 1 — `gh-radar-discussion-sync-w65gz` (initial deploy, image 224a21c)

| Metric | Value | Note |
|--------|-------|------|
| targets | 58 | top_movers ∪ watchlists |
| totalRequests | 84 | incremental + backfill |
| totalUpserted | 98 | **only 005930** survived schema validation |
| errors | 57 | `naver api schema mismatch` — `contentSwReplacedButImg=null` |
| skipped | 0 | |
| status | exit 0 | per-stock errors caught, cycle continued |

→ Inline fix `f5b1cbf` (zod schema nullable) applied.

### Execution 2 — `gh-radar-discussion-sync-hrkcj` (post-fix, image f5b1cbf)

| Metric | Value | Note |
|--------|-------|------|
| targets | 58 | (동일) |
| totalRequests | 187 | backfill loop 활성화 |
| totalUpserted | **15,463** | 158x 증가 |
| errors | **0** | schema fix 후 완전 해소 |
| skipped | 0 | |
| status | exit 0 | |

---

## Database state (post-Execution 2)

- `discussions` total rows: **15,473** (98 from exec1 + 15,375 net from exec2 with dedup via UPSERT)
- `discussions` distinct stock_code: **50+** (PostgREST default page=1000 — 페이지네이션으로 50+ 확인)
- Top stocks by volume: 006400 삼성SDI (892), 005930 삼성전자 (108) + 50+ tail
- `api_usage` (proxy_naver_discussion, KST today): **272 requests** / 5000 budget = 5.4% usage

---

## Server endpoint verification (production)

### `GET /api/stocks/005930/discussions?days=7&limit=3`

```json
[
  { "title": "대박~~[속보]트럼프...", "author": "세렝게티", "postedAt": "2026-04-18T04:43:12+00:00" },
  { "title": "이재명 혐오는 100% 조작된겁니다", "author": "보수사기에세뇌이용당한노인들", "postedAt": "2026-04-18T04:42:52+00:00" },
  { "title": "나는 하루에 책을 두권 읽는다", "author": "Guess", "postedAt": "2026-04-18T04:42:36+00:00" }
]
```
HTTP 200, 실제 토론방 데이터 반환.

### `POST /api/stocks/005930/discussions/refresh`

HTTP 200 + 5건 ([첫 detail trace 시 즉시 Bright Data 경유 stock.naver.com JSON API 호출 → upsert → top5]).
`error.code=PROXY_UNAVAILABLE` (503) 미발생 — server SA 가 BRIGHTDATA Secret accessor 보유.

---

## Operational notes

- **프록시:** Bright Data Web Unlocker zone `gh_radar_naver` (POC §1 확정)
- **월 예상 비용:** 4,800 req/일 × 30일 = ~144K req/mo × ~$1/1K = ~$144/mo (사용자 기존 Bright Data 계약 흡수)
- **첫 배치 credit 소모:** ~187 req (backfill 포함, 한 종목당 평균 3.2 페이지)
- **차단률:** 0/187 (POC 와 동일 — 안정 운영 시그널)
- **Scheduler 다음 trigger:** 2026-04-18T05:00:00Z (~17:00 KST 다음 정각)
- **권장 모니터링:**
  - Bright Data dashboard daily request 추이 (zone=gh_radar_naver)
  - cycle log `errors > 0` alert (현 0 baseline)
  - api_usage 일일 5000 한도 도달 alert (현 5.4%)

---

## Issues encountered (resolved in this plan)

### 1. server image 가 Phase 8 코드 미반영 (해소)

- 첫 `gcloud run services update` (env+secret만 patch) 후 `/api/stocks/:code/discussions` → 404.
- 원인: 기존 image `gh-radar-server:fecb2bc` 이 Phase 8 router 미포함.
- 해소: 새 image `server:56e6abc` rebuild + push + revision update → revision `00011-wz7`.

### 2. zod schema reject — contentSwReplacedButImg null (해소)

- 첫 cycle 에서 57/58 종목 fail.
- 원인: Naver API 의 일부 post 에 본문 null (이미지/투표 only).
- 해소: `z.string()` → `z.string().nullable()` (commit `f5b1cbf`). 다음 cycle errors=0.
- 자세한 내용은 `deferred-items.md` §"08-06 inline-fix" 참조.

---

## Threat coverage (Plan 08-06 threat_model)

| Threat | Mitigation status |
|--------|---|
| T-01 (PROXY_API_KEY leak) | Secret Manager + stdin-only injection; DEPLOY-LOG 평문 0 (자체 감사 — `! grep -q "8c519d6e" DEPLOY-LOG.md`) |
| T-02 (URL tabnabbing) | Playwright spec 의 `target=_blank`+`rel=noopener noreferrer` 검증 |
| T-03 (smoke output secret leak) | smoke 가 `>/dev/null` 으로 PASS/FAIL 만 출력 |
| T-04 (log injection) | Plan 08-02 logger redact 유지 (`brightdataApiKey` redacted in pino paths) |
| T-05 (proxy 예산 소진) | DAILY_BUDGET=5000 + atomic incr_api_usage RPC; smoke 후 272/5000 (5.4%) baseline |
| T-09 (Cloud Run Job SA 권한 최소) | discussion-sync-sa: secretAccessor x2 only; scheduler-sa: run.invoker only |
