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

요구사항 → 명령 매핑 (RESEARCH.md §Validation Architecture 정본 · 플랜 확정 2026-10-11). relay · server · webapp 명령 앞에는 늘 `pnpm --filter @gh-radar/shared build &&` 를 붙인다(shared 는 dist 소비).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-T1 (tracer) | 30-01 | 1 | IPMAC-02 · IPMAC-03 | — | orderEndpoint 원문 → op 3 · RPC p_account 에 IP/MAC 없음 · 교보 400 · 감사 set/clear 만 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts -t "P30"` · `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-dma.test.ts -t "P30"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-01-T2 | 30-01 | 1 | IPMAC-01 · IPMAC-05 | — | relay 밖 IP/MAC 보존 · op 5 실패 시 44 미송신(fail closed) | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts -t "IPMAC-01"` (+ 파일 전체) | ✅ 파일 · ❌ 케이스 W0(FakeConn op 5 분기) | ⬜ pending |
| 30-01-T3 | 30-01 | 1 | IPMAC-01(D-16 R3-02) | — | 다른 DMA 유저 계좌에 op 없음(D-11) | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-planner.test.ts -t "R3-02"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-02-T1 | 30-02 | 1 | IPMAC-02 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/order-endpoint.test.ts` | ❌ W0(신규 파일) | ⬜ pending |
| 30-02-T2 | 30-02 | 1 | IPMAC-02 | — | DB 무변경 · IP/MAC 로그 금지 주석 | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/admin.test.ts src/__tests__/admin-overview.test.ts -t "P30"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-02-T3 | 30-02 | 1 | IPMAC-02 | — | N/A | unit | `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/order-endpoint.test.ts -t "summarizeOrderEndpoint"` · 끝에 `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run` | ❌ W0(30-02-T1 이 만든 파일) | ⬜ pending |
| 30-03-T1 | 30-03 | 2 | IPMAC-02 | — | 읽기 경로 로그에 IP/MAC 없음 · 44 미송신 | integration | `pnpm --filter @gh-radar/relay exec vitest run tests/admin-api.test.ts -t "P30"` · `tests/quote-switch.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-03-T2 | 30-03 | 2 | IPMAC-02 | — | N/A | unit | `pnpm --filter @gh-radar/server exec vitest run tests/services/relay-admin-client.test.ts` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-03-T3 | 30-03 | 2 | IPMAC-02 | — | relay 실패 → 200 · null · 감사 set/clear 만 | integration | `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin.test.ts tests/routes/admin-dma.test.ts -t "P30"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-04-T1 | 30-04 | 2 | IPMAC-02(표시) | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/account-editor.test.tsx -t "P30"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-04-T2 | 30-04 | 2 | IPMAC-05 | — | 이름만 저장에 orderEndpoint 없음 | component | 같은 파일 `-t "P30"` + `user-sheet.test.tsx` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-04-T3 | 30-04 | 2 | IPMAC-03 | — | 서버 문구 원문 · BusyLines 중복 없음 | component | 같은 파일 `-t "P30"` · `pnpm --filter @gh-radar/webapp run typecheck` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-05-T1 | 30-05 | 3 | IPMAC-02 | — | N/A | component | `… account-editor.test.tsx -t "P30 IP/MAC 편집칸"` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-05-T2 | 30-05 | 3 | IPMAC-02 · IPMAC-03 | — | 원문 전송(D-07) · 이름만 저장 미적재 | component | `… account-editor.test.tsx -t "P30 보내기 규칙"` · `pnpm --filter @gh-radar/webapp run test` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-06-T1 | 30-06 | 4 | IPMAC-02 · IPMAC-03 · IPMAC-05 | — | N/A | e2e(픽스처) | `pnpm --filter @gh-radar/webapp run typecheck:e2e` · `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts -g "P29" --workers=1` | ✅ 파일 · ❌ 케이스 W0(픽스처) | ⬜ pending |
| 30-06-T2 | 30-06 | 4 | UI backstop(E1 · E2 · E4) | — | N/A | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/admin.spec.ts -g "P30" --workers=1` | ✅ 파일 · ❌ 케이스 | ⬜ pending |
| 30-07-T1 | 30-07 | 5 | (배포) | — | relay 20:00 KST 이후 · relay/server 실패면 push 금지 | manual(checkpoint) | — (메인 세션 배포 · smoke-relay.sh) | — | ⬜ pending |
| 30-07-T2 | 30-07 | 5 | IPMAC-01 · IPMAC-02(라이브) | — | 실험 값 원복 | manual(checkpoint) | — (relay_docker 로그 · 화면) | — | ⬜ pending |
| 30-07-T3 | 30-07 | 5 | IPMAC-04 | — | N/A | doc check | `grep -qE '^status: done$' docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md && grep -qE '^done_commit: [0-9a-f]{7,}' docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md` | ✅ | ⬜ pending |

기존 회귀(변경 없음 확인): IPMAC-03 relay 경로 = `pnpm --filter @gh-radar/relay exec vitest run tests/admin-dispatcher.test.ts -t "D15"`(86 code 13 → failed · message 원문) — 30-01-T2 의 파일 전체 실행에 포함.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `relay/tests/admin-dispatcher.test.ts` — `FakeConn.command` op 5 분기 (`refreshes` 카운터 · `sent` 제외 · 별도 `refreshMode`/`refreshDelayMs` — 기존 `mode`/`delayMs` 는 op 5 에 적용하지 않아 D7 · D10 단언 보존) → **30-01-T2**
- [ ] `packages/shared/src/__tests__/order-endpoint.test.ts` — 정규화 · 검증(30-02-T1) · 요약(30-02-T3) (신규)
- [ ] `webapp/e2e/fixtures/admin.ts` — `ADMIN_USERS_FIXTURE_P30`(계좌 `orderEndpoints`) · PUT 이 이름 · IP/MAC(shared 정규화) 반영 · code 13 흉내 → **30-06-T1**
- [ ] relay `admin-api.test.ts` 하네스는 실 `AdminConn` 을 써 `currentSnapshot` 을 이미 만족 · `quote-switch.test.ts` 의 `get: () => undefined` 스텁도 호환 — 타입 확장 뒤 `typecheck:tests` 로 확인 → **30-03-T1**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| relay 밖 설정 → 웹 이름 변경 → 87 보존 | IPMAC-01 | 실 gh-trade 서버 · relay 배포 필요 | **30-07-T2** — relay 배포 뒤 웹 이름만 변경 저장 → Cloud Logging `relay_docker` 에서 op 3 앞 87 수신(op 5) · 카드 IP/MAC 유지. gh-trade 도구 접근이 되면 relay 밖 설정 후 같은 확인 |
| `10.41.1.124` · `1c:fd:08:7d:97:8e` 저장 → `010041001124` · `1CFD087D978E` 표시 · 재저장 「변경 없음」 | IPMAC-02 | 실 서버 정규화 응답(운영 KB 서버가 gh-trade 4bf6d8f1 이후 빌드여야 함) | **30-07-T2** — 실험 계좌로 저장 · 재저장 후 원복. 운영 gh-trade 미배포면 보류 사유 기록 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
