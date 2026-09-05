---
phase: 15
slug: dma-relay-kb-gh-trade-server-10-wss
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-05
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 초안: `15-RESEARCH.md` §Validation Architecture 에서 옮김. **Per-Task Verification Map 은 plan 단계(gsd-planner)가 PLAN.md task ID 기준으로 채운다.**
> RELAY-01/02/03 은 plan 단계에서 REQUIREMENTS.md 에 신규 등록 예정(리서치 §Phase Requirements 초안 참조).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (relay)** | vitest `^4.1.4` (server 와 동일 버전 고정) — `relay/vitest.config.ts` **없음 → Wave 0** |
| **Framework (server)** | vitest `^4.1.4` — `server/vitest.config.ts` (존재) |
| **Framework (webapp)** | vitest + @testing-library/react + Playwright (E2E, baseURL `http://localhost:3100`) (존재) |
| **Quick run (relay)** | `pnpm --filter @gh-radar/relay test` |
| **Quick run (server)** | `pnpm --filter @gh-radar/server test` |
| **Quick run (webapp)** | `pnpm --filter webapp test` |
| **Full suite command** | 위 3종 + `pnpm --filter webapp exec playwright test orderbook.spec` + `pnpm typecheck` |
| **인프라 검증** | `bash scripts/smoke-relay.sh` (INV-1~8) |
| **스키마 정합** | `/Users/alex/repos/gh-trade/server/scripts/sync-relay-schema.sh --check` 무변경 |
| **Estimated runtime** | relay/server 유닛 ~15s · webapp 유닛 ~10s · E2E ~30s · smoke ~60s |

---

## Sampling Rate

- **After every task commit:** 해당 패키지 quick run (`pnpm --filter <pkg> test`) + `pnpm typecheck`
- **After every plan wave:** relay+server+webapp 단위 테스트 전부 + `sync-relay-schema.sh --check` 무변경
- **인프라 wave:** `smoke-relay.sh` 전 INV green (배포 직후 1회 + 다음 날 1회 — 인증서 갱신·VPN 지속성 확인)
- **Before `/gsd:verify-work`:** 전 단위 테스트 green + Playwright `orderbook.spec` green + `smoke-relay.sh` INV 8/8 + mock 브로커 주문 거부 경로 증거
- **실서버 검증:** D-27 — 사용자 지시 시에만, 별도 체크포인트로 분리
- **Max feedback latency:** ~60초 (quick run 기준)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-XX-XX | — | — | RELAY-0N | T-15-XX / — | (plan 단계에서 채움) | unit | `(plan 단계에서 채움)` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*요구사항→테스트 매핑 원천: `15-RESEARCH.md` §Validation Architecture "Phase Requirements → Test Map" (RELAY-01 14행 · RELAY-02 8행 · RELAY-03 7행).*

---

## Wave 0 Requirements

- [ ] `relay/vitest.config.ts` — server 설정 복제
- [ ] `relay/tests/helpers/fake-gateway.ts` — `net.createServer` 기반 스텁(로그인 응답·시세 푸시·연결 강제 종료·쓰레기 프레임 주입)
- [ ] `relay/tests/helpers/ws-client.ts` — 인증 왕복 헬퍼
- [ ] `relay/src/dma/__tests__/codec.test.ts`
- [ ] `relay/src/dma/__tests__/envelope.test.ts`
- [ ] `relay/tests/dma-client.test.ts` · `relay/tests/session.test.ts`
- [ ] `relay/tests/hub.test.ts` · `relay/tests/fanout.test.ts` · `relay/tests/order-api.test.ts` · `relay/tests/credentials.test.ts`
- [ ] `server/tests/routes/orders.test.ts`
- [ ] `webapp/src/lib/__tests__/relay-socket.test.ts`
- [ ] `webapp/src/components/stock/__tests__/orderbook.test.tsx`
- [ ] `webapp/e2e/specs/orderbook.spec.ts` (로컬 relay + 스텁 게이트웨이 기동 픽스처 포함)
- [ ] `scripts/smoke-relay.sh` (INV-1~8, `smoke-intraday-sync.sh` 의 `check()` 패턴)
- [ ] 프레임워크 설치: **불요** — vitest/Playwright 기설치. relay 워크스페이스에 vitest devDependency 추가만

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| kbs124 VPN 선검증(연결·split-tunnel 라우팅·출발지 IP 제한·동시 세션) | RELAY-03 | KB 계정 잠금 위험 — 수동 ≤3회, 실패 시 자동 재시도 없이 중단(D-03) | 리서치 §Common Pitfalls / D-03 선검증 체크리스트 7항목. 결과(터널 IP·동시 세션·IP 제한)를 STATE/SUMMARY 에 기록 |
| mock 브로커 가격 0 주문 거부 경로 | RELAY-02 | 로컬 mock gh-trade-server 기동 필요(D-40) | `run-mac.sh` mock + `inject_b6.py --send` + `curl POST /api/orders price=0` → `OrderResp` "R" 확인, SUMMARY 기록 |
| 사용자 DNS `dma.jx1.io` A 레코드 + Let's Encrypt 발급 | RELAY-03 | 사용자 보유 도메인, 외부 좌표(D-06) | 고정 IP 전달 → 사용자 A 레코드 추가 → `dig` 확인 **후** Caddy 기동 → INV-5 |
| 실서버(10.41.1.120)·실계좌 접속 | RELAY-01/02 | D-27 — 사용자 지시 전 금지 | 별도 체크포인트. gh-trade 17 배포 + VPN 선검증 통과 후 사용자 지시 시에만 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
