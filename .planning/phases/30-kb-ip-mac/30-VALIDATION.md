---
phase: "30"
slug: "kb-ip-mac"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-11"
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4 (relay · shared · server · webapp) · Playwright 1.59 (webapp E2E · 목 API) |
| **Config file** | `relay/vitest.config.ts` · `packages/shared/vitest.config.ts` · `server/vitest.config.ts` · `webapp/vitest.config.ts` · `webapp/playwright.config.ts` |
| **Quick run command** | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts tests/admin-planner.test.ts tests/admin-api.test.ts` (워크스페이스별 파일 단위 — 아래 표) |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/server exec vitest run && pnpm --filter @gh-radar/webapp run test` |
| **Estimated runtime** | ~120 seconds |

주의: shared · server 의 `test` 스크립트는 watch 다 — 반드시 `exec vitest run`. 동시 세션이면 vitest `--maxWorkers=2` · playwright `--workers=1`.

---

## Sampling Rate

- **After every task commit:** 해당 워크스페이스 quick 명령 (아래 표의 파일 단위)
- **After every plan wave:** Full suite command + 타입체크(build)
- **Before `/gsd-verify-work`:** Full suite + E2E P30 (390 · 1080) green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

플래너가 Task ID 를 확정하면 채운다. 요구사항 → 명령 매핑 (RESEARCH.md §Validation Architecture 정본):

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | IPMAC-01 | — | relay 밖 IP/MAC 보존 · op 5 실패 시 44 미송신 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts tests/admin-planner.test.ts -t "IPMAC-01"` | ✅ 파일 · ❌ 케이스 W0 | ⬜ pending |
| TBD | TBD | TBD | IPMAC-02 | — | IP/MAC 로그·감사 줄 미노출 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/order-endpoint.test.ts src/__tests__/admin-overview.test.ts src/__tests__/admin.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | IPMAC-02 | — | 교보 `orderEndpoint` 400 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts` · `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts tests/routes/admin.test.ts tests/services/relay-admin-client.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | IPMAC-02/03/05 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| TBD | TBD | TBD | IPMAC-03 | — | 서버 문구 원문 표시 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts -t "D15"` | ✅ | ⬜ pending |
| TBD | TBD | TBD | IPMAC-04 | — | N/A | doc check | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` | ✅ | ⬜ pending |
| TBD | TBD | TBD | UI backstop | — | N/A | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts -g "P30" --workers=1` | ✅ 파일 · ❌ 케이스 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `relay/tests/admin-dispatcher.test.ts` — `FakeConn.command` op 5 분기 (`refreshes` 카운터 · `sent` 제외 · mode 존중) — 기존 단언 보존
- [ ] `packages/shared/src/__tests__/order-endpoint.test.ts` — 정규화 · 검증 · 요약 (신규)
- [ ] `webapp/e2e/fixtures/admin.ts` — 계좌 `orderEndpoints` 픽스처 · PUT 본문 기록 · 이름/IP 반영
- [ ] relay `admin-api.test.ts` 의 `pipelines` 스텁에 `currentSnapshot` (타입 확장 뒤 `typecheck:tests`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| relay 밖 설정 → 웹 이름 변경 → 87 보존 | IPMAC-01 | 실 gh-trade 서버 · relay 배포 필요 | relay 배포 뒤 gh-trade 도구로 IP/MAC 설정 → 웹 이름만 변경 저장 → op 5 87 에 값 유지 확인 (Cloud Logging `relay_docker`) |
| `10.41.1.124` · `1c:fd:08:7d:97:8e` 저장 → `010041001124` · `1CFD087D978E` 표시 · 재저장 「변경 없음」 | IPMAC-02 | 실 서버 정규화 응답 | 배포 뒤 Admin 화면에서 저장 · 재저장 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
