---
phase: 42-tick-chart-candle-overlay
plan: 11
subsystem: deploy
tags: [deploy, supabase, vercel, uat, tick-viewer, candle-chart]

requires:
  - phase: 42-01
    provides: "마이그레이션 20261113100000_tick_open_accum_avg_px.sql(틱 열기 RPC accum.avg_px)"
  - phase: 42-10
    provides: "봉 차트 결선 완성본"
provides:
  - "운영 DB 에 accum.avg_px 키(20261113100000 Local · Remote)"
  - "운영 webapp(trade.jx1.io)에 「선 차트 | 봉 차트」 스위치와 봉 차트"
  - "UAT 1 ~ 12 폰 · PC 통과 · NXT 일 이동평균(KRX 일봉 종가) 사용자 승인"
affects: []

actuals:
  tasks: 3
  commits: 2

key-files:
  created:
    - .planning/phases/42-tick-chart-candle-overlay/42-11-SUMMARY.md
  modified:
    - .planning/phases/42-tick-chart-candle-overlay/42-VALIDATION.md

key-decisions:
  - "push 시점: 사용자 결정으로 DB 반영을 먼저 하고, 옆 세션(quick-261112-w2q 상따 작업대 VI 배지)의 relay 운영 배포 · 작업대 테스트 수정(7f1889d1)이 끝난 뒤 두 작업을 한 번에 push"
  - "NXT 화면 일 이동평균은 KRX 일봉 종가로 그린다 — 가정 A5 사용자 승인(UAT 12번 「됨」)"
  - "기존 선 차트 폐기 여부는 이번에 정하지 않음(D-04) — 두 차트가 나란히 운영에 나감"

requirements-completed: [SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7]

duration: 약 40분(게이트 · 배포 · UAT 대기 포함)
completed: 2026-11-13
---

# Phase 42 Plan 11: 배포 + 운영 UAT Summary

**누적 평단 RPC 키를 운영 DB 에 올리고 봉 차트를 운영 webapp 에 배포했다. 사용자가 `trade.jx1.io` 에서 폰 · PC 로 확인표 1 ~ 12 를 모두 「됨」 으로 확인했다.**

## Task 1 — 배포 전 게이트 (PREDEPLOY-OK)

**정적 게이트**
- 지키는 파일 · `tick-chart.tsx` · `tick-chart-band.tsx` 를 건드린 병합 아닌 커밋은 전부 Phase 42 커밋이다(다른 세션 커밋 0).
- 지키는 파일 13개의 `b72dcd0f` 대비 diff 는 0이다.
- `tick-chart.tsx` 의 diff 는 허용 범위(`titleAddon` · `initialView` · `onViewChange` · `useViewSync` · 대기 중 숨김 · `export`) 안이다. 범위 밖 줄 0.
- `tick-chart-band.tsx` 의 diff 는 `export` 4단어뿐이다.
- 양성 대조: Phase 42 커밋 필터가 `candle-chart.tsx` 커밋 6건을 잡는다.
- Phase 42 커밋 중 `server/src` · `package.json` 3개 · `pnpm-lock.yaml` 을 바꾼 것은 없다(새 의존성 0).
- 봉 차트 파일에 차트 라이브러리 import 가 없다.
- 다른 세션 변경(이 phase 판단 밖): `git log b72dcd0f..HEAD -- server/src pnpm-lock.yaml` 0건.

**전체 회귀** (한 세션 — 시작 시 다른 vitest 0)

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| `pnpm --filter @gh-radar/webapp run typecheck` | 통과 |
| `pnpm --filter @gh-radar/webapp exec vitest run --maxWorkers=2` | 257 파일 · 6,312 통과 · 1 skip |
| `pnpm --filter @gh-radar/server run typecheck` | 통과 |
| `pnpm --filter @gh-radar/server exec vitest run tests/routes/ticks.test.ts` | 34 통과 |
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql` | 141/141 ok · RESULT PASS |

- Playwright(`ticks-viewer.spec.ts`)는 실행하지 않았다. 옆 세션이 같은 Mac 에서 작업 중이었고, 이 항목은 선택이다.
- 「기존 실패」 는 없다. 실행 중 한때 `trading-workbench.test.tsx` 1건이 실패했는데, 원인은 옆 세션 quick-261112-w2q 의 `originOf` prop 이었다. 그 세션이 `7f1889d1` 로 고친 뒤 위 전체 회귀가 green 이 됐다.
- 참고: relay 테스트 타입 검사(`relay/tests/admin-api.test.ts` 3건 · `admin-dispatcher.test.ts` 1건)는 Phase 42 이전부터 실패한다. relay 를 건드리지 않아 이 phase 범위 밖이다.

**검증 지도:** `42-VALIDATION.md` 의 자동 행 25개를 ✅ green 으로 바꿨다. Wave 0 과 서명 항목을 체크했고, `nyquist_compliant: true` · `wave_0_complete: true` 로 두었다.

## Task 2 — 배포 (메인 세션)

1. `supabase migration list --linked` 로 보니 보류는 `20261113100000` 하나뿐이었다(다른 세션 것 없음).
2. `supabase db push --linked --yes` 를 2026-11-12 23:2x KST 에 실행했고, 다시 list 해서 Local · Remote 둘 다 있는 것을 확인했다.
3. server 재배포는 생략했다. `git log b72dcd0f..HEAD -E --grep="$P42" -- server/src` 가 0건이다(accum 은 그대로 통과 · 런타임 변경 0).
4. 사용자 결정에 따라 옆 세션 작업이 끝나기를 기다렸다. 그 세션은 relay 를 c27667a1 로 23:40 경 운영 배포했고(스모크 11/11), 테스트를 7f1889d1 로 고쳤다.
5. `git push origin master`(`28959b35..2bcdfd8b`, 2026-11-12 23:51 KST). 범위는 Phase 42 · quick-261112-w2q(4 커밋) · docs(43) · docs(inbox) · docs(lessons)다.
6. Vercel 운영 배포 `gh-radar-webapp-hsqupp6jz` 가 Ready(빌드 2분)가 됐다. ignore 스크립트가 직전 배포 이후 전체 범위를 보므로, 끝 커밋이 문서여도 빌드됐다.

## Task 3 — 운영 UAT (사용자 · 폰 · PC)

| # | 항목 | 결과 |
|---|------|------|
| 1 | 스위치 위치 · 기본 선 차트 · 선 차트 불변 | 됨 |
| 2 | 봉 · 거래대금 막대 · 자동 단위(5분 → 1분) | 됨 |
| 3 | 단위 메뉴 「지금」 · 고정 · 새로고침 유지 · 폰 360/390 안 잘림(E2) | 됨 |
| 4 | 이동평균 칩 · × · 「＋」 · 6개 상한 · 긴 칩 가로 밀기(E3) · 오류 줄 줄바꿈(E4) · 기억 | 됨 |
| 5 | 일 20 이동평균 | 됨 |
| 6 | 띠 수익률 = 패널 평단 대비 수익률 | 됨 |
| 7 | 누적 평단 점선 · 누적 수익률 · 캡션 · 가장자리 글자 · 미등록/당일 처리 | 됨 |
| 8 | 조작 동등성(휠 · 끌기 · 핀치 · 클릭 · Shift+끌기 · 길게 누르기) | 됨 |
| 9 | 전환 시 보던 구간 유지 · 깜박임 없음 · 다른 종목/날짜는 처음 창 | 됨 |
| 10 | 폰 제목 두 줄 · 띠 높이 고정(E9) · 캡션 줄바꿈(E10) | 됨 |
| 11 | 대량 체결 종목 매끄러움(폰 포함) | 됨 |
| 12 | NXT 일 이동평균 = KRX 일봉 종가 | 됨(① 괜찮다) |

## Deviations from Plan

- Task 1 · 2 를 executor 없이 메인 세션이 직접 했다. 배포 명령은 서브에이전트가 실행하면 분류기에 막히고, 게이트는 그 배포 직전에 같은 세션에서 확인해야 해서다.
- DB push 와 git push 사이에 약 30분 간격이 있었다. 사용자 결정(옆 세션 작업 정리 대기) 때문이고, 그동안 운영 화면에는 영향이 없었다(키 하나 추가).

## Self-Check: PASSED
