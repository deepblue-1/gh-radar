---
phase: 2
slug: backend-api
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| **Config file** | `server/vitest.config.ts` (Wave 0 to create — mirrors Phase 1 `workers/ingestion/vitest.config.ts`) |
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

*Populated by the planner in 02-PLAN.md. Each task references one of INV-1 ~ INV-11 below (or declares `manual` with reason).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 02 | TBD | INFR-03 | TBD | TBD | TBD | TBD | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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

---

## Wave 0 Requirements

- [ ] `server/vitest.config.ts` — mirror Phase 1 ingestion config
- [ ] `server/tests/setup.ts` — env isolation, global mock helpers
- [ ] `server/tests/fixtures/supabase-mock.ts` — see RESEARCH §7.3 mock pattern
- [ ] `server/tests/fixtures/stocks.ts` — 005930 (삼성전자) sample rows, KOSPI/KOSDAQ mix
- [ ] `scripts/smoke-server.sh` — INV-1 ~ INV-11 curl implementation
- [ ] `pnpm -F @gh-radar/server add -D vitest@4 supertest@7 @types/supertest`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloud Run 실 배포 + 공개 URL 응답 | INFR-03 / SC#1 | GCP 실 환경 상호작용 필요 (로컬 시뮬레이션 불가) | `scripts/deploy-server.sh` 실행 → 출력된 URL로 INV-1~INV-11 수동 실행 |
| min-instances=1 실제 효과 검증 (no cold start) | SC#2 | 네트워크 지연 포함 실 환경 측정 | 5분 대기 후 `time curl $URL/api/health` 3회 — 모두 <500ms |
| Secret Manager 주입 경로 | D-34 | 시크릿 값 로그/응답 노출 금지 확인 | 배포 후 `gcloud logging read ...` grep에 service_role 키 문자열 0건 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s for unit layer
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
