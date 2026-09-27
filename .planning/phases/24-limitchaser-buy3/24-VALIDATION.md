---
phase: "24"
slug: "limitchaser-buy3"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-27"
updated: "2026-09-28"
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> 원천: `24-RESEARCH.md` ## Validation Architecture(요구 → 테스트 표 · Wave 0 Gaps) + 플랜 9개(24-01 ~ 24-09)의 `<verify>`.
> 요구 ID 는 없다(ROADMAP `Requirements: TBD`) — 아래 「Requirement」 열은 ROADMAP 항목(relay ①~④ · webapp ⑤~⑩ · 배포)과 CONTEXT D-01~D-21 을 쓴다.
> 스펙 없는 probe fallback 은 **건너뜀(기록된 선택)** — 요구 ID 가 없어 probe 입력이 없다. 엣지 술어는 만들지 않았고, 금지 조항은 CONTEXT 의 must-NOT 을 각 플랜 `must_haves.prohibitions` 로 옮겼다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4 (relay: node · webapp: jsdom + @testing-library/react) · Playwright(webapp e2e — 진짜 relay 프로세스 + 가짜 게이트웨이 · 스텁 Supabase) · `sync-relay-schema.sh --check`(gh-trade, 생성물 대조) |
| **Config file** | `relay/vitest.config.ts` · `webapp/vitest.config.ts`(include `src/**/*.test.{ts,tsx}`) · `webapp/playwright.config.ts`(baseURL `http://localhost:3100` · 단일 워커 · relay 8090 고정) · `relay/tsconfig.tests.json` · `webapp/tsconfig.e2e.json` |
| **Quick run command** | relay: `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/relay exec vitest run <경로>` · webapp: `cd /Users/alex/repos/gh-radar && pnpm --filter @gh-radar/webapp exec vitest --run <경로>` (`… test -- <이름>` 은 필터가 먹지 않는다) |
| **Full suite command** | build: `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck` · test: `pnpm --filter @gh-radar/relay run test && pnpm --filter @gh-radar/webapp run test` · e2e: `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts` |
| **Estimated runtime** | relay 전체 ~7s(기준선 630 tests / 6.2s) · webapp 상따 관련 ~21s(기준선 1110 tests) · webapp 전체 ~60s · Playwright trading-workbench + a11y 수 분(단일 워커) |

주의: shared `dist` 는 git 비추적 — relay · webapp typecheck 전에 `pnpm --filter @gh-radar/shared build` 필수. 단위 테스트는 jsdom 이 Tailwind CSS 를 싣지 않아 `hidden` 클래스로 숨긴 행도 조회된다 — 실제 비가시는 Playwright 가 본다.

---

## Sampling Rate

- **After every task commit:** 그 태스크 `<verify>` 의 quick 명령(해당 파일 vitest) + 그 패키지 typecheck.
- **After every plan wave:** build 명령 전체 + test 명령 전체(relay · webapp).
- **E2E:** 화면 · 문구를 바꾸는 태스크(24-01 T2 · 24-03 T3 · 24-04 T3 · 24-05 T2 · 24-06 T3 · 24-07 T2 · 24-08)는 Playwright trading-workbench(+ a11y)를 그 태스크에서 돌린다.
- **Before `/gsd-verify-work`:** Full suite + Playwright trading-workbench · a11y · me · sidebar-tree green.
- **Max feedback latency:** 단위 < 30s · e2e 는 태스크 끝에서만.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | relay ①②③④ · D-12 · D-13(래치 제거) · D-21 · D-04(신필드) | T-24-01 · T-24-02 · T-24-03 · T-24-04 | 빌더가 buy3_schema=1 고정 · buy_watch_side/S→C 4필드 미전송(vtable 부재) | tracer(unit + integration) | `sync-relay-schema.sh --check` · build 명령 · `pnpm --filter @gh-radar/relay run test` · `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts -t "⑰-buy3"` · `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading src/components/layout src/lib` | ✅ 기존 파일(케이스 추가) · ❌ W0 `webapp/src/test-fixtures/limit-chaser.ts` · `readSetLimitChaserRequest` 신설 | ⬜ pending |
| 24-01-02 | 01 | 1 | relay ② · D-12 · UI E6 overflow | T-24-05 | e2e 는 127.0.0.1 스텁 · 실 IP 0 | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-1"` · 전체 spec | ✅ spec(케이스 추가) | ⬜ pending |
| 24-02-01 | 02 | 1 | D-14 | T-24-07 · T-24-08 · T-24-09 | 네트워크 없는 읽기 전용 · 계좌 끝 4자리 마스킹 | unit(self-test) | `node .planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs --self-test` · 오류 경로 종료 코드 2 | ❌ W0 도구 신설 | ⬜ pending |
| 24-02-02 | 02 | 1 | D-14 | T-24-07 · T-24-10 | SUMMARY 에 10자리 이상 숫자 0 | manual(checkpoint) | — (사용자 실행 · `grep -cE '[0-9]{10,}' 24-02-SUMMARY.md` == 0) | — | ⬜ pending |
| 24-03-01 | 03 | 2 | relay ②(38 제거) · F-4 | T-24-11 · T-24-12 | lc.arm buy → 거부 프레임 · 소켓 OPEN · 38 조립 불가 | integration | build 명령 · `pnpm --filter @gh-radar/relay exec vitest run tests/ws-latch.test.ts src/dma/__tests__/codec.test.ts` · `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/strategy-card-flow.test.tsx src/components/trading/__tests__/strategy-card.test.tsx` | ✅ | ⬜ pending |
| 24-03-02 | 03 | 2 | F-4 · Pitfall 3 | T-24-11 · T-24-14 · T-24-15 · T-24-42 | 옛 모양 lc.set → 게이트웨이 0 · 거부 프레임 · 계좌 가드 뒤 판정 · 옛 모양 철거(게이트 4종 OFF)는 중립 채움으로 중계 | integration | `pnpm --filter @gh-radar/relay run test` | ✅(케이스 추가) | ⬜ pending |
| 24-03-03 | 03 | 2 | webapp ⑤(감시대상 제거) · Pitfall 7 | T-24-13 | 입력 계약 · zod 에서 buyWatchSide 제거 | unit + e2e | build 명령 · relay test · webapp trading/lib vitest · `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts` | ✅ | ⬜ pending |
| 24-04-01 | 04 | 3 | webapp ⑤⑥⑩ 조각 · Pitfall 12 | T-24-18 | 텍스트 노드 렌더 · 말줄임/뷰포트 분기 0 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/setting-group.test.tsx src/lib/__tests__/numpad.test.ts src/components/trading/__tests__/manual-order-form.test.tsx` | ✅(케이스 추가) | ⬜ pending |
| 24-04-02 | 04 | 3 | webapp ⑤⑥⑩ · D-09 · D-10 · D-11 · D-15 · D-02(중립 문구) | T-24-16 · T-24-17 · T-24-19 | lcRangeIssue ↔ relay zod 동형(반등 ON⇒1~100) | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/card-body.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` | ❌ W0 `lc/__tests__/lc-fields.test.ts` 신설 | ⬜ pending |
| 24-04-03 | 04 | 3 | R4 · D-09(e2e) · Pitfall 14 | — | — | unit + e2e | `vitest --run …/inline-navigation.test.tsx` · `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts` | ❌ W0 e2e `expandLcGroup` 헬퍼 | ⬜ pending |
| 24-05-01 | 05 | 4 | webapp ⑨ · D-13 · D-18 · D-01/D-02 전반(문구) · D-02 후반(「서버가 매수 그룹 해제 — 매수 그룹이 모두 꺼져 매수주문도 끔」 · `sentCause`) · Pitfall 8 | T-24-20 · T-24-21 | 서버 원문 무가공 · override 귀속 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/strategy-log.test.tsx src/lib/__tests__/strategy-log-feed.test.tsx` | ✅ | ⬜ pending |
| 24-05-02 | 05 | 4 | webapp ⑨ · Pitfall 11 · D-02 후반(`handleSent` meta · `pendingCauseRef`) | T-24-22 · T-24-23 | 마스터 해제를 발주로 표시하지 않음 · 웹이 보낸 자동 끔은 `sent`+cause 로 귀속(배너 · 발주 아님) · 카드 코드는 send 0 | unit + e2e | webapp trading/lib/layout vitest · `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts` | ✅ | ⬜ pending |
| 24-06-01 | 06 | 5 | D-01/D-02(훅) · D-03 · D-02 후반(`commit` meta `cause` → `onSent`) | T-24-25 | 동반 필드 함께 되돌림 · 주 필드 성공 판정 · 재시도 없음 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/lc/__tests__/use-lc-field-commit.test.tsx src/components/trading/lc/__tests__/lc-tracer.test.tsx` | ✅(케이스 추가) | ⬜ pending |
| 24-06-02 | 06 | 5 | D-01 · D-02 전반 · D-05 · Pitfall 5 | T-24-24 · T-24-28 | 웹 ↔ relay 무장 가드 동형 | unit + integration | `pnpm --filter @gh-radar/relay exec vitest run tests/fanout.test.ts` · `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/lc src/components/trading/__tests__/strategy-card-flow.test.tsx` | ✅(케이스 추가) | ⬜ pending |
| 24-06-02 (D-02 후반) | 06 | 5 | D-02 후반 · D-19(2026-09-28 정정 — WinForms `b066e135` 동형) | T-24-25 | 하강 전이에서만 마스터 OFF 1회 · 재수신/첫 스냅샷/재접속 0 · 삭제 가드 0 · in-flight 대기 뒤 1 · 거부 뒤 재시도 0 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/limit-chaser-form.test.tsx -t "D-02 후반" --reporter=verbose` | ✅(describe ⑰-b 추가) | ⬜ pending |
| 24-06-03 | 06 | 5 | D-03 · D-04a(R8) · D-10 · D-11(제출) · D-16 · D-20 · D-27 | T-24-26 · T-24-27 · T-24-29 | 0 → 상한가 위임 없음 · S→C 되싣기 없음 | unit + e2e | webapp trading/lib/layout vitest · `playwright test e2e/specs/trading-workbench.spec.ts` | ✅(케이스 추가) | ⬜ pending |
| 24-07-01 | 07 | 6 | D-06 · D-07 · D-08 · D-20(클라 채움) | T-24-30 · T-24-31 · T-24-33 | 자동 체크 트리거는 사람 핸들러뿐 | unit | `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-card-flow.test.tsx` | ✅(순수 함수 케이스 추가) | ⬜ pending |
| 24-07-02 | 07 | 6 | D-04 · D-17 | T-24-32 | 시딩은 제출 0 · 서버 전략/손댄 칸 보호 | unit + e2e | webapp lib/trading/layout vitest · `playwright test e2e/specs/trading-workbench.spec.ts` | ✅(케이스 추가) | ⬜ pending |
| 24-08-01 | 08 | 7 | ⑤~⑩ 실브라우저 · D-01 · D-02 전반 · D-02 후반(P24-4: 하강 전이 10 1건 · 재주입 0 · 삭제 가드 0) · D-16 · D-19 · UI E7 partial | T-24-34 · T-24-35 · T-24-43 | 실서버 IP 0 · E2E_ACCOUNT_NO · 자동 제출 루프 없음(게이트웨이 수신 개수) | e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-"` | ✅(케이스 추가) | ⬜ pending |
| 24-08-02 | 08 | 7 | 검증 훅(폭 · 44px · 0.45 · 한 화면 · axe) · UI E1 overflow · E1 long-text · E3 overflow | T-24-36 | 말줄임 · 뷰포트 분기 0 | e2e + human-check | `playwright test … -g "P24-7|P24-8"` · `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts e2e/specs/me.spec.ts e2e/specs/sidebar-tree.spec.ts` | ✅(케이스 추가) | ⬜ pending |
| 24-09-01 | 09 | 8 | 배포 순서 · D-14 선행 확인 | T-24-37 | gh-trade 예고 없이는 진행 안 함 | manual(checkpoint) | — | — | ⬜ pending |
| 24-09-02 | 09 | 8 | relay ①(배포 커밋 대조) · 전체 게이트 | T-24-41 | 생성물 스크립트 산출물만 · 배포 명령 미실행 | script + unit + e2e | `sync-relay-schema.sh --check`(배포 트리) · build + test 명령 · `playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts` | ✅ | ⬜ pending |
| 24-09-03 | 09 | 8 | 배포(relay → smoke → push) · gh-trade 회신 | T-24-38 · T-24-39 · T-24-40 | 메인 세션만 배포 · DMA_HOST 미주입 · 실패 시 push 금지 | manual(checkpoint) | `bash scripts/smoke-relay.sh`(메인 세션 실행) | ✅ 스크립트 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

(트레이서-우선 규칙상 테스트 기반은 각자 **처음 쓰는 태스크 안**에서 만든다 — 별도 선행 웨이브 없음.)

- [ ] `webapp/src/test-fixtures/limit-chaser.ts` — `LC_BUY3_ECHO_DEFAULTS` · `makeLimitChaser(over)` 공용 픽스처 + 인라인 팩토리 16곳 치환(24-01 T1 — shared 신필드로 typecheck 가 깨지기 전에)
- [ ] `relay/tests/helpers/fake-gateway.ts` — `readSetLimitChaserRequest(msgType, payload)` 디코더(`buy3Schema` · C→S 12 · `buyWatchSide` null · `serverOnlySlots` vtable 부재)(24-01 T1) · e2e 픽스처 재export(24-01 T2)
- [ ] `relay/tests/helpers/frames.ts` — `FakeLimitChaserInput` 신필드 17(S→C 포함 · `buy3Schema` 기본 1, 구 서버 흉내 0) · 매수 진입 래치 제거(24-01 T1)
- [ ] `webapp/src/components/trading/lc/__tests__/lc-fields.test.ts` — 표시 순수 함수(`lcValueTextOf` · `lcSummaryOf` · `lcRangeIssue` 조건 규칙) 테스트 파일 신설(24-04 T2)
- [ ] 선매수 자동 체크 · 시딩 순수 함수 테스트 — `webapp/src/lib/__tests__/limit-chaser.test.ts` 에 `preBuyAutoChecksOf` · `preBuyAutoCheckLogLine` · `seedListSharesDefaults` describe(24-07)
- [ ] 「그룹 펼치기」 헬퍼 — e2e `expandLcGroup(card, slot)` + 클릭 헬퍼 자동 펼침(24-04 T3) · 단위 테스트는 `hidden` 클래스라 jsdom 에서 펼치지 않아도 조회된다
- [ ] D-14 도구 self-test — `.planning/phases/24-limitchaser-buy3/tools/lc-watch-side-audit.cjs --self-test`(24-02 T1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 운영 옛 서버의 「감시대상 = 매수잔량」 전략 목록 추출 · 보고 | D-14 | 운영 로그인 세션의 WS 프레임이 필요하고 gh-trade 24-12 재기동 **전**에만 가능 | 24-02 Task 2 — 운영 웹 DevTools WS 에서 `lc.snap` 복사 → `pbpaste \| node …/lc-watch-side-audit.cjs` → 출력(마스킹)을 SUMMARY 로 · gh-trade-38 회신 |
| 상따 매수 탭 시각 확인(폰 390 · 데스크톱 1280 × 라이트 · 다크) · 한방 두 행(R6) 수용 | webapp ⑤ · UI-SPEC R6 | 스케치 009 D 와 의도적으로 다른 곳이라 사용자 판단이 필요 | 24-08 Task 2 `<human-check>` — dev 서버 3100 에서 확인 후 답을 SUMMARY 에 |
| relay 배포 · smoke · webapp push · Vercel 빌드 확인 · 새로고침 안내 · gh-trade 회신 | 배포 순서 · relay ① | 프로덕션 배포는 메인 세션 · 사용자 확인 뒤(서브에이전트 분류기 차단) · 외부 이벤트(gh-trade 24-12 · WinForms 발행)에 묶임 | 24-09 Task 1 · Task 3 — 20:00 KST 이후 `deploy-relay.sh` → `smoke-relay.sh` → (통과 시) push → Vercel 확인 → gh-trade-38 SendMessage |
| 후매수 소진 푸시(300ms) 전 옛 ON 재제출 창이 웹에서 실제로 생기는지 | CONTEXT Deferred(실기 검증 항목) | 실서버 타이밍 의존 — 가짜 게이트웨이로 재현하지 않는다 | 24-09 Task 3 단계 9(선택) — 배포 뒤 실전략에서 관찰해 SUMMARY 에 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (checkpoint 3건 제외 — Manual-Only 표)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest --run` · `vitest run` 만)
- [ ] Feedback latency < 30s (단위) — e2e 는 태스크 끝
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
