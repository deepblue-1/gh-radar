---
phase: "42"
slug: "tick-chart-candle-overlay"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-12"
---

# Phase 42 — Validation Strategy

> 실행 중 되먹임 표본을 어떻게 뜰지 정한 phase 별 검증 계약. 근거는 `42-RESEARCH.md` 「Validation Architecture」 절. 성공 기준 번호(SC-1 ~ SC-7)는 `42-CONTEXT.md` 의 7개 기준을 따른다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2.1.9(jsdom · globals · setup `tests/setup.ts`) · pgTAP(일회용 Supabase Postgres 컨테이너 · 원격 DB 접촉 0) · Playwright ^1.59.1(선택 — 기존 회귀 확인용) |
| **Config file** | `webapp/vitest.config.ts`(maxWorkers 기본 2) · `server/vitest.config.ts` · `webapp/playwright.config.ts`(baseURL 3100) |
| **Quick run command** | `cd webapp && pnpm exec vitest --run src/lib/ticks/__tests__/candle-chart.test.ts --maxWorkers=2` |
| **Ticks suite command** | `cd webapp && pnpm exec vitest --run src/lib/ticks src/components/ticks src/styles --maxWorkers=2` |
| **Full suite command** | `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest --run --maxWorkers=2 && pnpm --filter @gh-radar/server exec vitest --run tests/routes/ticks.test.ts --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` |
| **Estimated runtime** | 파일 하나 약 2초 · Ticks suite 약 30초 · 전체 약 180초(pgTAP 컨테이너 기동 포함) |

다른 세션이 같은 Mac 에서 동시에 돌고 있다 — vitest 는 반드시 `--maxWorkers=2`, Playwright 는 `--workers=1`, 전체 회귀는 한 번에 한 세션만.

---

## Sampling Rate

- **After every task commit:** 그 task 가 손댄 테스트 파일 하나(`--maxWorkers=2`)
- **After every plan wave:** Ticks suite command + `pnpm --filter @gh-radar/webapp run typecheck`(shared 를 바꾼 wave 는 `pnpm --filter @gh-radar/shared build` 먼저)
- **Before `/gsd-verify-work`:** Full suite command green. Playwright 는 다른 세션과 겹치지 않을 때만 `--workers=1` 로(기존 `ticks-viewer.spec.ts` 선 차트 높이 회귀 확인용 · 선택)
- **Max feedback latency:** 180초

---

## Per-Task Verification Map

플래너가 PLAN 을 쓴 뒤 Task ID · Plan · Wave 칸을 채운다. 아래는 리서치가 정한 「무엇을 어떤 테스트로 확인하나」 표다. 새 테스트 파일 이름은 리서치 권고 이름이며, 플래너가 다른 이름을 고르면 이 문서의 명령도 같이 고친다. 명령은 모두 `webapp/` 에서 `pnpm exec vitest --run <파일> --maxWorkers=2` 꼴이다(표에서는 파일만 적는다).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | SC-1 · D-02 · D-09 · D-10 — 브라우저 기억: 기본 「선 차트」 · 쓰기 실패 무시 · 빈 배열 존중 · 항목 단위 거름 · 색 재배정 | — | N/A | unit | `src/lib/ticks/__tests__/candle-prefs.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-1 · D-05 · D-24 — 스위치로 봉 차트 ↔ 선 차트 · 보던 구간 유지 · 종목이 바뀌면 처음 창 | — | N/A | component | `src/components/ticks/__tests__/chart-kind-switch.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-1 · D-24 — 선 차트 새 선택 입력: 안 주면 기존과 같음 · 처음 창 1회 적용 · 바뀐 창 알림 · 제목 줄 덧붙임 렌더 | — | N/A | component | `src/components/ticks/__tests__/tick-chart-view-sync.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-1 — 기존 선 차트 테스트가 수정 없이 통과 | — | N/A | regression | `src/components/ticks/__tests__/tick-chart.test.tsx src/lib/ticks/__tests__/tick-chart.test.ts src/lib/ticks/__tests__/tick-chart-tip.test.ts src/components/ticks/__tests__/tick-viewer-live.test.tsx` | ✅ | ⬜ pending |
| TBD | TBD | TBD | SC-2 · D-09 — 1 · 5 · 10 · 15 · 30 · 60분 봉의 시 · 고 · 저 · 종 · 거래대금 = 체결 직접 집계(중복 · 가격 0 · 수량 0 · 08:00 전 제외) · 빈 분은 봉 없음 | — | N/A | unit | `src/lib/ticks/__tests__/candle-chart.test.ts -t 집계` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-2 · D-09 — 자동 단위 = 봉 폭 4px 이상 되는 가장 작은 단위 · 없으면 60분 | — | N/A | unit | `src/lib/ticks/__tests__/candle-chart.test.ts -t 자동` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-2 · SC-7 — 집계 캐시: 같은 세션 · 단위면 같은 객체 · 새 세션이면 새 집계 | — | N/A | unit | `src/lib/ticks/__tests__/candle-chart.test.ts -t 캐시` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-3 · D-10 · D-11 — 단순 · 지수 · 일 이동평균 정의식 · 봉 수가 기간에 못 미치는 앞 구간은 값 없음 · 종가가 모자라면 전부 값 없음 | — | N/A | unit | `src/lib/ticks/__tests__/candle-chart.test.ts -t 이동평균` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-3 · D-11 — 앞 거래일 종가 조회 모양(그 날짜 앞만 · 내림차순 · 개수 상한 · 뒤집기 · 종가 0 제외) | — | 기존 공개 읽기 권한 그대로 | unit(supabase mock) | `src/lib/ticks/__tests__/daily-closes.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-3 · D-10 · D-22 — 이동평균 더하기 창 검증(기간 2 ~ 240 · 같은 선 중복 · 일 + 지수 불가 · 6개 상한) | — | N/A | component | `src/components/ticks/__tests__/candle-ma-form.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-23 — 봉 단위 메뉴: 「자동」 일 때 「지금」 꼬리표 · 고르면 고정 · Space 가 재생을 건드리지 않음 | — | N/A | component | `src/components/ticks/__tests__/candle-unit-menu.test.tsx` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-4 · D-14 — 수익률 점 값 = `teamKpiAt(...).pnl.ret` · 커서 시점 포함 · 첫 매수 전 값 없음 | — | N/A | unit | `src/lib/ticks/__tests__/candle-returns.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-4 · D-20 — 봉 차트 값 띠의 수익률 글자 = 팀 거래정보 패널 글자(같은 세션 · 같은 커서) | — | N/A | component | `src/components/ticks/__tests__/candle-chart.test.tsx -t 패널` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-4 · D-19 — 팀 주문 원 · 우리 체결 ◆ · 근거 ○ 가 봉 차트 가격 판 안에 그려짐 | — | N/A | component | `src/components/ticks/__tests__/candle-chart.test.tsx -t 겹침` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-5 · D-15 — 누적 평단 점: 당일 화면 없음 · 자료 없음 · 키 없음 · 평단 0 구간 끊김 | — | N/A | unit | `src/lib/ticks/__tests__/candle-chart.test.ts -t 누적` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | SC-5 · D-18 — 틱 열기 RPC: 키 없는 행은 JSON null · 있는 행은 그대로 · `pos_net` 불변 · 권한 불변 | — | RPC 는 service_role 전용 유지 | pgTAP | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql`(저장소 루트) | ✅ 단언 추가 | ⬜ pending |
| TBD | TBD | TBD | SC-5 · D-18 — server 가 `accum.avg_px` 를 그대로 넘김 | — | N/A | unit | `pnpm --filter @gh-radar/server exec vitest --run tests/routes/ticks.test.ts --maxWorkers=2`(저장소 루트) | ✅ 픽스처 수정 | ⬜ pending |
| TBD | TBD | TBD | SC-6 · D-19 — 빈 곳 클릭 시각 점프 · 원 클릭 · ◆ 클릭 · Shift+끌기 구간 합계 · 확대 버튼 · `+ − 0` | — | N/A | component | `src/components/ticks/__tests__/candle-chart.test.tsx -t 조작` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | 이동평균 색 6개 — 라이트 · 다크 정의 · oklch 없음 | — | N/A | unit | `src/styles/__tests__/tds-tokens.test.ts` | ✅ 수정 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `webapp/src/lib/ticks/__tests__/candle-chart.test.ts` — SC-2 · SC-3 · SC-5(픽스처 `@/test-fixtures/tick-synth` 의 `synthSession` · `a3Msg` · `synthNs` 재사용)
- [ ] `webapp/src/lib/ticks/__tests__/candle-returns.test.ts` — SC-4(`team-model.test` 의 팀 하루 픽스처 재사용)
- [ ] `webapp/src/lib/ticks/__tests__/candle-prefs.test.ts` — SC-1 · SC-3 브라우저 기억
- [ ] `webapp/src/lib/ticks/__tests__/daily-closes.test.ts` — supabase 클라이언트 mock
- [ ] `webapp/src/components/ticks/__tests__/tick-chart-view-sync.test.tsx` · `chart-kind-switch.test.tsx` · `candle-chart.test.tsx` · `candle-ma-form.test.tsx` · `candle-unit-menu.test.tsx`
- [ ] `supabase/tests/tick_viewer.test.sql` — D 절 단언 추가 + `plan(N)` 개수 증가
- [ ] 프레임워크 설치 불필요(기존 vitest · pgTAP 러너)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 선 차트 파일 변경 범위가 「스위치 연결부 + 선택 입력」 뿐인지 | SC-1 · D-24 | diff 범위 판단은 사람이 읽어야 한다 | `git diff --stat <phase 시작 커밋>.. -- webapp/src/components/ticks/tick-chart.tsx` 와 diff 본문 검토 |
| 폰 길게 누르기 살펴보기 · 휠/핀치 확대 체감 · 폰 제목 줄 둘째 줄 옆으로 밀기 | SC-6 · D-19 · D-21 | 터치 · 관성은 jsdom 으로 재현 불가 | 실기기 폭 390 과 데스크톱에서 같은 종목 · 같은 날짜로 선 차트와 번갈아 조작 |
| 하루 수십만 체결 종목에서 확대/이동이 선 차트만큼 매끄러운지 | SC-7 | 체감 성능은 실기기에서만 판정 | 거래가 많았던 종목 · 날짜를 열어 봉 차트에서 확대/이동 · 마우스 훑기(폰 포함) |
| 차트 전환 때 한 프레임 「하루 전체」 로 깜박이지 않는지 | D-24 | 프레임 단위 깜박임은 눈으로만 확인 | 확대한 상태에서 「선 차트 | 봉 차트」 를 여러 번 전환 |
| 운영 DB 반영 뒤 과거 날짜 · 매집감지 등록 종목에서 누적 평단 선 · 누적 수익률이 보이는지 | SC-5 · D-15 · D-18 | 운영 자료가 있어야 한다 | DB 반영 → webapp 배포 뒤 등록 종목의 과거 날짜를 열어 회색 긴 점선과 수익률 판 회색 선 확인 · 당일 화면과 미등록 종목은 그 선만 없는지 확인 |
| NXT 화면에서 일 이동평균(KRX 일봉 종가 기준)이 받아들일 만한지 | D-11(리서치 가정 A5) | 사용자 판단 | NXT 화면에서 일 이동평균 칩을 켜고 값이 일봉 차트 값과 같은 뜻으로 읽히는지 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
