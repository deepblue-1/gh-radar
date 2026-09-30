---
phase: "26"
slug: "shared-quote-feed"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: true) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-30"
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 (relay · shared · webapp) · Playwright ^1.59 (webapp e2e — 실 relay 프로세스 + 스텁 게이트웨이 · dev 포트 3100) |
| **Config file** | `relay/vitest.config.ts` · `relay/tsconfig.tests.json` · `webapp/vitest.config.*` · `webapp/playwright.config.ts` · `webapp/tsconfig.e2e.json` |
| **Quick run command** | `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts tests/fanout.test.ts` |
| **Full suite command** | `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` |
| **Estimated runtime** | relay 전체 ~10s(기준선 30 파일 · 752 테스트 · 9.35s) · webapp vitest ~60s · e2e 대상 spec 수 분 |

---

## Sampling Rate

- **After every task commit:** 그 태스크의 대상 테스트 파일(`-t` 필터 포함) + `typecheck` / `typecheck:tests`
- **After every plan wave:** Full suite command (build_command + test_command)
- **Phase gate(26-15 Task 2):** Full suite + Playwright 7 spec(trading-workbench · stock-detail-tabs · me · sidebar-tree · unfilled-progress · order-log · a11y) + `sync-relay-schema.sh --check` · 배포 뒤 `smoke-relay.sh`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds(대상 단위 테스트 기준 — e2e 는 웨이브/게이트 단위)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | 확정-와이어 · 확정-착수 순서 | T-26-06 · 05 | 생성물은 스크립트 산출물만 · role RangeError 문구에 비밀 없음 · 재생성+호출부 한 커밋 | schema + unit | `sync-relay-schema.sh --check`(ed2e0240 · blob 2cf7b760) · `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts -t "role"` · relay 전체 | ✅ 헬퍼 · 저널 테스트 기대값 수정 | ⬜ pending |
| 26-02-01 | 02 | 2 | 확정-로그인 · 확정-인증 · Pitfall 2 | T-26-04 · 05 · 08 | role_mismatch/rejected 정지 · 비밀 로그 0 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/quote-feed.test.ts` | ❌ 태스크가 RED 먼저 생성 | ⬜ pending |
| 26-02-02 | 02 | 2 | 확정-로그인 · Pitfall 2 | T-26-04 · 07 | 스텁 저널 목록 role 0 분리 · 정지 뒤 재로그인 0 | TCP | `pnpm --filter @gh-radar/relay exec vitest run tests/quote-gateway.test.ts tests/journal-gateway.test.ts` | ❌ 태스크가 생성 | ⬜ pending |
| 26-03-01 | 03 | 3 | 확정-프레임 · D-03 · D-06 · D-08 · D-09 · D-12 | T-26-01 · 02 · 03 · 07 | `"market"` 페이로드 `RelayQuote \| RelayTape` 한정 · 미등록 소켓 0 · quote 83 무시 | unit + wss(트레이서) | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "Phase 26 트레이서"` · relay 전체 | ✅ hub/fanout 재작성 | ⬜ pending |
| 26-04-01 | 04 | 4 | D-17 | T-26-05 · 34 | 새 env 이름 redact · 배포 스크립트 무변경 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/config-quote.test.ts tests/config-upstreams.test.ts` | ❌ 태스크가 RED 먼저 생성 | ⬜ pending |
| 26-04-02 | 04 | 4 | 확정-로그인 · D-17 · D-12 | T-26-05 | 부팅 출력에 비밀 0 · SIGTERM 정상 종료 | 실 프로세스 부팅 | `pnpm --filter @gh-radar/relay exec vitest run tests/journal-boot.test.ts` | ✅ 케이스 추가 | ⬜ pending |
| 26-05-01 | 05 | 5 | D-17 · Pitfall 8 | T-26-05 · 10 | 83 주입은 사용자 세션 소켓 유지 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/stock-detail-tabs.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/unfilled-progress.spec.ts e2e/specs/order-log.spec.ts` | ✅ 픽스처 수정 | ⬜ pending |
| 26-06-01 | 06 | 6 | 확정-프레임 · PC-12 · Open Q2(RESOLVED) | T-26-02 | quote 83 무시 · 사용자 83 캐시 불변 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "quote 연결 프레임 경계"` | ✅ | ⬜ pending |
| 26-06-02 | 06 | 6 | 확정-재접속 · 확정-통과 MsgType | T-26-04 · 09 | quote 연결 송신 ⊆ {4,5,28,29,32} | TCP | `pnpm --filter @gh-radar/relay exec vitest run tests/quote-gateway.test.ts` | ✅ | ⬜ pending |
| 26-07-01 | 07 | 7 | D-05 · D-06 · D-07 | T-26-11 | — | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "PRICE 판정"` | ✅ | ⬜ pending |
| 26-07-02 | 07 | 7 | D-05 · D-07 | T-26-11 | 75 브라우저 0 · D-05 편차 근거 SUMMARY | wss | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "PRICE/FULL 혼합"` | ✅ | ⬜ pending |
| 26-08-01 | 08 | 8 | D-10 | T-26-12 | 캐시 유계 | unit + wss | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "linger"` | ✅ | ⬜ pending |
| 26-08-02 | 08 | 8 | D-10(노브) | T-26-13 | 음수 · 비숫자 거부 | unit + e2e | `pnpm --filter @gh-radar/relay exec vitest run tests/config-quote.test.ts` · playwright trading-workbench · stock-detail-tabs | ✅ | ⬜ pending |
| 26-09-01 | 09 | 9 | D-11 · D-15 · 확정-상한 | T-26-14 · 15 · 17 | 업스트림 송신 전 거부 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "구독 한도"` | ✅ | ⬜ pending |
| 26-09-02 | 09 | 9 | D-11 · D-15 | T-26-14 | 거부는 그 소켓만 | wss | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "구독 한도"` | ✅ | ⬜ pending |
| 26-10-01 | 10 | 10 | Pitfall 3 · 확정-재접속 | T-26-16 | in-flight ≤ 32 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/subscribe-pacer.test.ts` | ❌ 태스크가 RED 먼저 생성 | ⬜ pending |
| 26-10-02 | 10 | 10 | Pitfall 3 · 확정-재접속 | T-26-16 · 17 | 실 TCP 창 상한 | unit + TCP | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "페이싱"` · `pnpm --filter @gh-radar/relay exec vitest run tests/quote-gateway.test.ts tests/subscribe-pacer.test.ts` | ✅ | ⬜ pending |
| 26-11-01 | 11 | 11 | Pattern 10 · Pitfall 6 · D-10 정합 | T-26-02 · 20 | quote 83 재라우팅 0 | unit + wss | `pnpm --filter @gh-radar/relay exec vitest run tests/hub.test.ts -t "잔량진행률 넛지"` | ✅ | ⬜ pending |
| 26-11-02 | 11 | 11 | D-02 · D-16 | T-26-18 · 19 | 7키 · 식별자 정규식 0 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/quote-status.test.ts` | ❌ 태스크가 RED 먼저 생성 | ⬜ pending |
| 26-12-01 | 12 | 12 | D-02 · D-16 | T-26-18 · 19 | smoke health_probe 정규식 0 | unit | `pnpm --filter @gh-radar/relay exec vitest run tests/order-api.test.ts` | ✅ | ⬜ pending |
| 26-12-02 | 12 | 12 | D-01 · D-09 | T-26-21 | 미등록 연결 0 | wss | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "quote.state"` | ✅ | ⬜ pending |
| 26-12-03 | 12 | 12 | D-01 · D-04 | T-26-22 | isStale 불변 | webapp unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/relay-socket.test.ts` | ✅ | ⬜ pending |
| 26-13-01 | 13 | 13 | D-14 | T-26-23 | 실데이터 없음 · 미커밋 | file check | 목업 grep 체인(표식 ≥ 20 · 토큰 · 문구 · `??`) | ❌ 태스크가 생성 | ⬜ pending |
| 26-13-02 | 13 | 13 | D-14 | — | — | checkpoint:decision | 사용자 채택(안 A/B) | — | ⬜ pending |
| 26-13-03 | 13 | 13 | D-14 | T-26-24 | 게이트 뒤 커밋 | file check | `채택: 안 [AB]` grep · 미커밋 0 | ✅ | ⬜ pending |
| 26-14-01 | 14 | 14 | D-01 · D-04 | T-26-25 · 26 | since 파싱 방어 · 식별자 없음 | webapp unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/quote-state.test.ts src/components/trading/__tests__/workbench-status-bar.test.tsx` | ❌ quote-state 테스트 태스크가 생성 | ⬜ pending |
| 26-14-02 | 14 | 14 | D-01 · D-04 | T-26-27 | 주문 필 불변 · 호가 불투명도 불변 | webapp unit + e2e | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/me-client.test.tsx` · playwright trading-workbench · me · a11y | ✅ | ⬜ pending |
| 26-15-01 | 15 | 15 | 확정-배포 · A11 · Open Q6(RESOLVED) | T-26-28 | — | checkpoint:human-action | 사용자 — 120 가동본 ed2e0240 포함 | — | ⬜ pending |
| 26-15-02 | 15 | 15 | 확정-배포 · D-13 | T-26-29 · 31 | 배포 명령 미실행 | schema + full + e2e 7 | `--check` · Full suite · playwright 7 spec | ✅ | ⬜ pending |
| 26-15-03 | 15 | 15 | 확정-배포 · D-12 롤백 · D-13 | T-26-28 · 30 · 32 | DMA_HOST 미주입 · push 는 검증 뒤 | checkpoint:human-action | 메인 세션 — `smoke-relay.sh` · `/healthz` quote · 서버 로그 | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

별도 Wave 0 플랜은 두지 않는다 — 새 테스트 파일은 그것이 필요한 태스크 안에서 RED 먼저 만든다(`MISSING` 센티널 없음).

- [ ] `relay/tests/helpers/fake-gateway.ts` — `ObserverLoginRequest.role` (26-01-01) · quote 모드 `respondQuoteLogin` · `quoteLoginRequests` · `waitForQuoteConnection` · `readSubscribeRequest` (26-02-02)
- [ ] `relay/tests/helpers/frames.ts` — `FakeObserverLoginRespInput.role` (26-01-01)
- [ ] `relay/tests/quote-feed.test.ts` (26-02-01) · `relay/tests/quote-gateway.test.ts` (26-02-02)
- [ ] `relay/tests/config-quote.test.ts` (26-04-01)
- [ ] `webapp/e2e/fixtures/relay.ts` — quote 비밀 · `userSocket()` · `quoteSocket()` (26-05-01)
- [ ] `relay/tests/subscribe-pacer.test.ts` (26-10-01)
- [ ] `relay/tests/quote-status.test.ts` (26-11-02)
- [ ] `webapp/src/lib/__tests__/quote-state.test.ts` (26-14-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 배지 2축 채택안 | D-14 | 시각 · 문구 판단은 사용자 몫 | 26-13 Task 1 목업 `open` → Task 2 에서 안 A/B + 수정 사항 답 |
| gh-trade 120 가동본 `ed2e0240` 포함 | 확정-배포 · RESEARCH A11 | 외부 저장소 · 운영 서버 상태 | 26-15 Task 1 — `git -C gh-trade merge-base --is-ancestor ed2e0240 <가동 커밋>` |
| 프로덕션 relay 배포 · smoke · 서버 로그 · push | 확정-배포 · D-12 롤백 | 메인 세션 전용(서브에이전트 배포 차단) | 26-15 Task 3 1~9 단계 |
| 첫 거래일 장중 관측 | D-05 · D-10 · D-11 · D-15 · Pattern 10 · D-13 | 실시장 틱 · 다중 사용자 | 26-15 Task 3 10단계 (a)~(e) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or are checkpoints with manual instructions
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (MISSING 센티널 없음 — 테스트는 태스크 안에서 생성)
- [x] No watch-mode flags (`vitest run` · `vitest --run` · `playwright test`)
- [x] Feedback latency < 30s(대상 단위 테스트)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending(validate-phase 가 실행 결과로 확정)
