---
phase: "42"
slug: "tick-chart-candle-overlay"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
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

플래너가 채운 표다(2026-11-12). Task ID = `{플랜}-{태스크 순번}`. 명령은 모두 저장소 루트에서 실행한다(각 PLAN 의 `<verify>` 와 같은 꼴 · vitest 는 `--maxWorkers=2`). 리서치 권고 이름에서 바뀐 테스트 파일: 이동평균 계산은 `candle-chart.test.ts -t 이동평균` → `candle-ma.test.ts`, 층 · 띠 · 캡션 · 제목 줄 · 값 계산은 새 파일(`candle-price-layer` · `candle-return-layer` · `candle-lower-layers` · `candle-readout` · `candle-chart-band` · `candle-chart-caption` · `candle-chart-title`).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 42-01 | 1 | SC-1 · SC-5 · D-01 · D-02 · D-03 · D-04 · D-05 · D-07 · D-08 · D-12 · D-15 · D-18 — 트레이서: RPC `accum.avg_px`(키 없음 JSON null · 있으면 그대로 · STABLE · 권한 불변) → shared 타입 → server 통과 → 스위치로 봉 차트(1분봉 · 높이 420 · 누적 평단 긴 점선) · 기존 선 차트 테스트 무수정 | — | RPC 는 service_role 전용 유지 | tracer(pgTAP + route + component) | `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/chart-kind-switch.test.tsx src/components/ticks/__tests__/tick-chart.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-01-02 | 42-01 | 1 | SC-2 · SC-7 · D-09 · D-15 — 1 · 5 · 10 · 15 · 30 · 60분 봉의 시 · 고 · 저 · 종 · 거래대금 = 체결 직접 집계(중복 · 가격 0 · 수량 0 · 08:00 전 · 20:00 뒤 제외) · 빈 분 봉 없음 · 캐시(같은 세션 · 단위 = 같은 객체) · 판 치수 420 / 303 · 누적 평단 점(당일 · 자료 없음 · 키 없음 · 0 끊김) | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-chart.test.ts --maxWorkers=2`(`-t 집계` · `-t 캐시` · `-t 누적`) | ✅ | ✅ green |
| 42-02-01 | 42-02 | 1 | SC-4 · D-14 — 당일 수익률 점 값 = `teamKpiAt(...).pnl.ret` · 커서 rec 포함 · 첫 매수 전 값 없음 | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-returns.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 42-02-02 | 42-02 | 1 | SC-5 · D-13 · D-15 — 누적 수익률(미실현 · 0 끊김) · 두 눈금 0% 맞춤(z 공유 0.15 ~ 0.85) · 눈금 글자 | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-returns.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 42-03-01 | 42-03 | 1 | SC-3 · D-10 · D-11 — 단순 · 지수 · 일 이동평균 정의식 · 봉 수 · 종가가 모자라면 값 없음 · 30분 빈 칸 끊김 · 이름 · 검증 · 상태 | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-ma.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 42-03-02 | 42-03 | 1 | SC-3 · D-11 — 앞 거래일 종가 조회(그 날짜 앞만 · 내림차순 · 239 · 뒤집기 · 종가 0 제외) · (코드, 날짜)마다 한 번 · 취소 · 코드 없음 | — | 기존 공개 읽기 권한 그대로 | unit(supabase mock · renderHook) | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/daily-closes.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 42-03-03 | 42-03 | 1 | SC-1 · D-02 · D-09 · D-10 — 브라우저 기억 키 3 · 기본 「선 차트」 · 쓰기 실패 무시 · 빈 배열 존중 · 항목 단위 거름 · 색 재배정 · 이동평균 색 6개(라이트 · 다크 · oklch 없음) | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-prefs.test.ts src/styles/__tests__/tds-tokens.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 42-04-01 | 42-04 | 2 | SC-2 · D-06 · D-09 · D-16 — 자동 단위 = 봉 폭 4px 이상 가장 작은 단위 · 없으면 60분 · 거래대금 막대 · 가장자리 글자 배치(▾ ▴ · 「외 n개」) | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-chart.test.ts --maxWorkers=2`(`-t 자동` · `-t 가장자리`) | ✅ | ✅ green |
| 42-04-02 | 42-04 | 2 | SC-3 · SC-5 · D-08 · D-10 · D-15 · D-16 · D-17 — 가격 판 그리기(막대 · 이동평균 · 누적 평단 · 당일 평단 · 가장자리 글자 · 판 제목 · 겹침 순서) | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-price-layer.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-05-01 | 42-05 | 2 | SC-4 · D-12 · D-13 · D-17 — 수익률 판(당일 · 누적 · 0% 한 줄 · 두 눈금 · 제목 · 「팀 체결 없음」) | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-return-layer.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-05-02 | 42-05 | 2 | SC-6 · D-07 · D-19 — 순매수 · 10분 · 누적 거래대금 판 = 선 차트 같은 함수 · 새 판 위치 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-lower-layers.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-06-01 | 42-06 | 2 | SC-4 · D-14 · D-17 · D-20 — 띠 값(평단 · 수익률 = teamKpiAt · 셋째 · 넷째 칸 = tickBandAt) · 캡션 글자 | — | N/A | unit | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/ticks/__tests__/candle-readout.test.ts --maxWorkers=2` | ✅ | ✅ green |
| 42-06-02 | 42-06 | 2 | SC-4 · D-20 — 띠 4칸 · 높이 88 / 137 고정 · 띠 수익률 글자 = 팀 거래정보 패널 글자 · 기존 띠 export 만 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart-band.test.tsx src/components/ticks/__tests__/tick-chart.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-06-03 | 42-06 | 2 | D-17 — 카드 아래 캡션 줄(폰 우리 범례 → 누적 캡션 → 선 안내 · 없으면 줄 없음) | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart-caption.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-07-01 | 42-07 | 2 | D-09 · D-23 — 봉 단위 메뉴: 「자동」 일 때 「지금」 꼬리표 · 고르면 고정 · 줄이 BUTTON 이라 Space 가 재생을 건드리지 않음 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-unit-menu.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-07-02 | 42-07 | 2 | SC-3 · D-10 · D-22 — 칩 · 6개 상한 · 더하기 창 검증(2 ~ 240 · 같은 선 · 일 + 지수 불가) · 팝오버 ↔ 시트 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-ma-form.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-07-03 | 42-07 | 2 | D-05 · D-21 — 제목 줄 데스크톱 한 줄 · 폰 두 줄(둘째 줄 가로 밀기) · 확대 버튼 이름 = 선 차트 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart-title.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-08-01 | 42-08 | 2 | SC-1 · D-24 — 선 차트 새 선택 입력: 안 주면 기존과 같음 · 처음 창 1회 적용 · 반영 뒤 알림 · 대기 중 숨김 · 제목 줄 덧붙임 · diff 범위 게이트 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/tick-chart-view-sync.test.tsx src/components/ticks/__tests__/tick-chart.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-08-02 | 42-08 | 2 | SC-1 · D-02 · D-24 — 차트 종류 기억 · 선 차트 쪽 보던 구간 · 다른 종목 · 날짜면 처음 창 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/chart-kind-switch.test.tsx src/components/ticks/__tests__/tick-viewer-live.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-09-01 | 42-09 | 2 | SC-6 · D-19 — 빈 곳 클릭 시각 점프 · 확대 버튼 · `+ − 0` · Shift+끌기 구간 합계 · 커서 · 세로선 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart.test.tsx --maxWorkers=2`(`-t 조작`) | ✅ | ✅ green |
| 42-09-02 | 42-09 | 2 | SC-4 · SC-6 · D-19 — 팀 주문 원 · 우리 체결 ◆ · 근거 ○ · 짝 없음 ◇ 가 봉 차트 가격 판 안 · 클릭 · 묶음 상자 · 길게 누르기 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart.test.tsx src/components/ticks/__tests__/chart-kind-switch.test.tsx --maxWorkers=2`(`-t 겹침`) | ✅ | ✅ green |
| 42-10-01 | 42-10 | 3 | SC-2 · SC-3 · D-09 · D-10 · D-11 — 단위(기억 · 자동) · 이동평균 · 일별 종가 결선(받는 중 · 실패 · 코드 없음) | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart.test.tsx --maxWorkers=2`(`-t 결선`) | ✅ | ✅ green |
| 42-10-02 | 42-10 | 3 | SC-4 · SC-5 · D-14 · D-15 · D-17 · D-20 — 수익률 판 · 아래 판 · 띠 · 캡션 결선 · 띠 수익률 = 패널(끝-끝) | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/candle-chart.test.tsx --maxWorkers=2`(`-t 패널`) | ✅ | ✅ green |
| 42-10-03 | 42-10 | 3 | SC-1 · D-02 · D-05 · D-21 · D-24 — 제목 줄 결선 · 양쪽 보던 구간 유지 · 차트 종류 · 단위 · 이동평균 기억 | — | N/A | component | `pnpm --filter @gh-radar/webapp exec vitest run src/components/ticks/__tests__/chart-kind-switch.test.tsx src/components/ticks/__tests__/candle-chart.test.tsx src/components/ticks/__tests__/tick-chart.test.tsx src/components/ticks/__tests__/tick-chart-view-sync.test.tsx --maxWorkers=2` | ✅ | ✅ green |
| 42-11-01 | 42-11 | 4 | SC-1 · D-01 — 배포 전 게이트(지키는 파일 diff 0 · 선 차트 · 띠 diff 범위 · server · 의존성 무변경 · 차트 라이브러리 없음) + 전체 회귀(한 세션) | — | N/A | static + full suite | 42-11 Task 1 verify(PREDEPLOY-OK) + 위 Full suite command | ✅ | ✅ green |
| 42-11-02 | 42-11 | 4 | SC-5 · D-03 · D-18 — [BLOCKING] db push → server 생략 판단 → git push(메인 세션) | — | RPC 는 service_role 전용 유지 | manual(메인 세션) | `supabase migration list --linked` · `git fetch origin master --quiet && test "$(git rev-parse master)" = "$(git rev-parse origin/master)"` | — | ✅ green(DB push · server 생략 · push 2bcdfd8b · Vercel Ready) |
| 42-11-03 | 42-11 | 4 | SC-1 ~ SC-7 · 가정 A5 — 운영 UAT(폰 · PC · 실기기 체감 · backstop 다섯) | — | N/A | manual | `grep -q "status: validated" .planning/phases/42-tick-chart-candle-overlay/42-VALIDATION.md && echo UAT-SIGNED` | — | ✅ green(UAT 1 ~ 12 폰 · PC 됨 · 2026-11-13) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `webapp/src/lib/ticks/__tests__/candle-chart.test.ts` — SC-2 · SC-5 · SC-7(42-01 Task 2 가 만들고 42-04 가 늘림 · 픽스처 `@/test-fixtures/tick-synth`)
- [x] `webapp/src/lib/ticks/__tests__/candle-returns.test.ts` — SC-4 · SC-5(42-02 · `team-model.test` 의 팀 하루 픽스처)
- [x] `webapp/src/lib/ticks/__tests__/candle-ma.test.ts` — SC-3(42-03)
- [x] `webapp/src/lib/ticks/__tests__/daily-closes.test.ts` — supabase 클라이언트 mock · renderHook(42-03)
- [x] `webapp/src/lib/ticks/__tests__/candle-prefs.test.ts` — SC-1 · SC-3 브라우저 기억(42-03)
- [x] `webapp/src/lib/ticks/__tests__/candle-readout.test.ts` — SC-4 · D-17(42-06)
- [x] `webapp/src/components/ticks/__tests__/chart-kind-switch.test.tsx`(42-01 · 42-08 · 42-10) · `tick-chart-view-sync.test.tsx`(42-08) · `candle-chart.test.tsx`(42-09 · 42-10)
- [x] `webapp/src/components/ticks/__tests__/candle-price-layer.test.tsx`(42-04) · `candle-return-layer.test.tsx` · `candle-lower-layers.test.tsx`(42-05) · `candle-chart-band.test.tsx` · `candle-chart-caption.test.tsx`(42-06) · `candle-unit-menu.test.tsx` · `candle-ma-form.test.tsx` · `candle-chart-title.test.tsx`(42-07)
- [x] `supabase/tests/tick_viewer.test.sql` — D 절 단언 3 추가 + `plan(141)`(42-01)
- [x] 프레임워크 설치 불필요(기존 vitest · pgTAP 러너)

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
| UI-SPEC backstop 시각 확인 다섯 — 봉 단위 목록이 폰 360 · 390 에서 다 보임(E2) · 「단순 240」 칩 6개 가로 밀기(E3) · 더하기 창 오류 줄 줄바꿈(E4) · 값 띠 7자리 가격 · 이동평균 6개에서 높이 고정(E9) · 캡션 긴 문구 폰 360 줄바꿈(E10) | UI-SPEC UI Considerations backstop 5 | 글자 잘림 · 줄바꿈은 실제 글꼴 · 폭에서만 판정 | 42-11 Task 3 확인표 3 · 4 · 10 번 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** 2026-11-13 — 운영 UAT 1 ~ 12 폰 · PC 통과(사용자) · NXT 일 이동평균 KRX 종가 승인
