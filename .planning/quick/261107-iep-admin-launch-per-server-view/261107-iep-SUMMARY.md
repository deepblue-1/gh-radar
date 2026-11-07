---
phase: quick-261107-iep
plan: 01
status: complete
subsystem: admin-launch
tags: [admin, launch, server-chips, kyobo112, shared-contract]
requires: []
provides:
  - "shared LAUNCH_SERVERS(KB120 · KYOBO119 · KYOBO112) · LaunchServer · launchServerLabelOf · LAUNCH_ORDER = 서버 × (Q, K)"
  - "shared LAUNCH_PLAN_GATEWAYS = LAUNCH_SERVERS(계획 대상 3대)"
  - "webapp LaunchServerChips · radioKeyTargetOf · ?gw 쿼리 · 주문 내역 · 경계 지도 서버별"
affects:
  - "server GET /api/admin/launch/plan(3대 조회) · PUT /plan/KYOBO112/* 허용"
  - "/me · 작업대 계좌 칩(MeAccountChips — 키보드 계산만 공용 함수로, 동작 불변)"
tech-stack:
  added: []
  patterns:
    - "쿼리 진실 원본 + 클라이언트 필터(서버 전환에 재요청 0)"
    - "radiogroup 화살표 문법 순수 함수 한 벌(radioKeyTargetOf) 공유"
key-files:
  created:
    - webapp/src/components/admin/launch-server-chips.tsx
    - webapp/src/components/admin/__tests__/launch-server-chips.test.tsx
    - webapp/src/lib/radio-keys.ts
  modified:
    - packages/shared/src/launch.ts
    - packages/shared/src/launch-plan.ts
    - packages/shared/src/__tests__/launch.test.ts
    - packages/shared/src/__tests__/launch-plan.test.ts
    - server/src/schemas/admin-launch.ts
    - server/src/services/relay-admin-client.ts
    - server/tests/routes/admin-launch.test.ts
    - server/tests/fixtures/fake-relay-admin.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/components/me/account-chips.tsx
    - webapp/src/components/admin/launch-client.tsx
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/components/admin/__tests__/launch-client.test.tsx
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
    - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
    - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
    - webapp/e2e/specs/admin-launch.spec.ts
decisions:
  - "발사 서버 목록은 shared 상수 한 벌(LAUNCH_SERVERS) — LAUNCH_ORDER · LAUNCH_PLAN_GATEWAYS 가 모두 이 줄에서 나온다(레지스트리 API 로 동적 조회하지 않음)"
  - "서버 표시 이름은 brokerOfServerKey 로 증권사 판정(정규식 한 벌) — KB 는 키 그대로, KYOBO 는 「교보」+번호"
  - "칩은 발사 전용 LaunchServerChips 로 두고 키보드 목표 칩 계산만 radioKeyTargetOf 로 뽑아 MeAccountChips 와 공유"
  - "출처 칩은 CONTEXT 잠금대로 고른 서버 키(「KB120 저널 80 …」) — 목업의 표시 이름 대신"
  - "경계 지도 범례 표식(방향 없음 · 뒤탐침)은 고른 서버 조각만 보고 정한다 · 범위 글 · 날짜 내비는 응답 전체 그대로"
metrics:
  duration: "약 15분(13:34 ~ 13:49 KST)"
  completed: 2026-11-07
actuals:
  tokens: 35400
  tasks: 3
  commits: 3
plan_head_before: d163d97faa73047df4170c87286cc854e479f686
plan_head_after: 930dd23615dcdaa73c7e9fec158f688768e1d344
commits: 3
---

# Quick 261107-iep: 어드민 발사 메뉴 서버별 보기 (KB120 · 교보119 · 교보112) Summary

`/admin/launch` 제목 아래 · 탭 위에 서버 칩(KB120 · 교보119 · 교보112, 목업 D radiogroup · `?gw`)을 두고, 주문 내역 · 경계 지도 · 발사 계획 고치기가 고른 서버의 코스닥 · 코스피 2칸만 다루게 했다. shared 발사 서버 목록 한 벌에서 `LAUNCH_ORDER`(6쌍)와 계획 대상(3대 — server 가 KYOBO112 계획을 묻고 PUT 을 relay 로 보냄)이 나오고, 기존 KB 기록은 KB120 칩, 교보 기록은 교보119 칩에서 그대로 보인다(DB 변경 0).

## 커밋

| Task | 커밋 | 내용 |
| ---- | ---- | ---- |
| 1 (tracer) | `033ace68` | feat — shared LAUNCH_SERVERS · 서버 라벨 · LAUNCH_ORDER 6쌍 / radioKeyTargetOf(계좌 칩 공유) / LaunchServerChips · `?gw` 정본화 / 주문 내역 서버별(카드 2 · 묶음 · 출처 칩) / e2e 주문 내역 describe + P-SV1 |
| 2 | `ee6fcb3d` | feat — LAUNCH_PLAN_GATEWAYS = LAUNCH_SERVERS · server 테스트 3서버 · KYOBO112 PUT / 경계 지도 서버별(요약 2 · 패널 2) · 서버 전환 시 편집 칸 · 결과 줄 닫힘 |
| 3 | `930dd236` | test — e2e 경계 지도 · 계획 읽기 · 고치기 서버별 · P-SV2 · P35-P6 서버 칩 닫힘 · P35-P4 ③ 기대 갱신 |

## 실행한 검증 명령과 결과

Task 1 verify:
- `pnpm --filter @gh-radar/shared build` — 성공
- `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts src/__tests__/ticks-launch-queue.test.ts src/__tests__/ticks-launch-queue.golden.test.ts --maxWorkers=2` — 3 files · **97 passed**
- `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch-format.test.ts src/components/admin/__tests__/launch-server-chips.test.tsx src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-orders-tab.test.tsx src/components/admin/__tests__/launch-gate-chart.test.tsx src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx --maxWorkers=2` — 7 files · **181 passed**(account-chips · workbench 무수정 통과)
- `pnpm --filter @gh-radar/webapp run typecheck` — 통과
- `pnpm --filter @gh-radar/webapp exec playwright test admin-launch.spec.ts --workers=1 --grep "주문 내역"` — 주문 내역 7건 + setup 통과(8 passed). grep 이 제목에 「주문 내역」 이 든 P35-M2(경계 지도 · Task 3 몫)도 잡아 그 1건은 그 시점에 옛 4패널 기대로 실패 — Task 3 에서 고침.

Task 2 verify:
- `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts src/__tests__/launch-plan.test.ts --maxWorkers=2` — **77 passed**
- `pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-launch.test.ts --maxWorkers=2` — **73 passed**
- `pnpm --filter @gh-radar/server run typecheck` — 통과
- `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/launch-map-tab.test.tsx src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-gate-chart.test.tsx src/components/admin/__tests__/launch-plan-bar.test.tsx src/components/admin/__tests__/launch-plan-editor.test.tsx --maxWorkers=2` — 5 files · **118 passed**
- `pnpm --filter @gh-radar/webapp run typecheck` — 통과

Task 3 verify(전 범위 회귀 한 번에):
- shared build 성공 · shared 4 files **117 passed**
- `pnpm --filter @gh-radar/tick-convert exec vitest run tests/launch-queue.test.ts tests/launch-live.test.ts --maxWorkers=2` — **19 passed**(무수정 — launch-queue 결과 불변 S-8)
- server admin-launch **73 passed**(이 회차 1번은 1 failed — 아래 Deferred 의 P35-S9 65칸 간헐 실패. 이후 재실행 18회 전부 73 passed)
- `pnpm --filter @gh-radar/server run typecheck` · `pnpm --filter @gh-radar/relay run typecheck` — 통과
- `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch- src/components/admin/__tests__/launch- src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx --maxWorkers=2` — 13 files · **351 passed**
- `pnpm --filter @gh-radar/webapp run typecheck` — 통과
- `pnpm --filter @gh-radar/webapp exec playwright test admin-launch.spec.ts --workers=1` — **21 passed**(setup + 주문 내역 7 · 경계 지도 5 · P-SV2 1 · 계획 읽기 3 · 고치기 4)

## must_haves 대응

- S-1 · S-2: `launch-server-chips.test.tsx`(칩 3개 · 순서 · 키보드 돌기 · Home/End) · `launch-client.test.tsx`(기본 KB120 · KYOBO112 그대로 · KB121/kyobo119/빈 값 지움 · fire 와 함께 한 번에 · 칩 클릭 replace 키 보존) · e2e P-SV1
- S-3: `launch-orders-tab.test.tsx` 서버별 describe(KB120 · KYOBO119 · KYOBO112 빈 카드 2장 · 출처 칩 · 09:00:31 · 날짜 내비) · e2e P35-L1/L2 · P-SV1(orders 1건)
- S-4: `launch-map-tab.test.tsx` 「LaunchMapTab — 서버 전환」(재요청 0 · 편집 칸 닫힘 돌아와도 닫힘) · e2e P-SV2 · P35-P6
- S-5: 라벨 테스트(launch-format · orders · map · gate-chart · e2e)
- S-6: 점 합 196 = KB120 + KYOBO119 · KYOBO112 0(단위 · e2e P35-M1) · 교보112 빈 카드 · 「이 범위에 발사 없음」 2패널 · DB 변경 0
- S-7: server 테스트 PLAN_READ_PATH 3서버 · 키 순서 · offline 3서버 · KYOBO112 누락만 offline · PUT KYOBO112 · KB121 400
- S-8: ticks-launch-queue(.golden) · tick-convert launch-queue/launch-live 무수정 통과 · `packages/shared/src/ticks/launch-queue.ts` 무변경

## 배포 메모 (실행하지 않음 — 메인 세션 몫)

1. **server 먼저** — `packages/shared` · `server/` 가 바뀌었다. `deploy-server.sh` 로 server 새 revision(교보112 계획 조회 · 저장은 이 뒤부터). 배포 전 운영 이미지가 이 빌드의 조상인지 확인.
2. **그 뒤 webapp push**(push = Vercel 프로덕션 배포). server 배포 전에 webapp 만 나가도 교보112 패널은 계획 「대신 값」 경로로 안전하다(`panelPlanOf` 가 응답에 없는 서버를 대신 값으로 그린다).
3. relay · DB · tick-convert 재배포 불필요 — relay 는 서버 키 형식 · 상한 8 만 본다 / 마이그레이션 0 / tick-convert 는 shared 를 쓰지만 KYOBO112 의 게이트웨이 순위(rank 2)가 전과 같다.
4. relay `admin-api.ts` 의 「대상은 지금 2대」 주석은 relay 무변경 원칙상 이번에 고치지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] e2e P35-P4 ③ 502 결과 줄 기대가 이미 깨져 있었다**
- **Found during:** Task 3 (전체 spec 실행)
- **Issue:** `9b14921b`(R3-IN-01, 2026-11-01)가 요청 throw(502) 뒤 다시 읽기는 이력에 이 저장의 행이 있을 때만 「다시 읽은 계획으로 확인」 이도록 문구를 바꿨는데 e2e 를 갱신하지 않아, P35-P4 ③ 이 옛 문구를 기대해 실패했다(이 작업의 변경과 무관 · 단위 테스트 R2-IN-01 5xx 는 이미 새 문구).
- **Fix:** 기대를 「다시 읽었지만 서버가 이 저장을 처리하기 전 값일 수 있어요 · 잠시 뒤 새로고침」 으로 맞추고 이유 주석을 달았다.
- **Files modified:** webapp/e2e/specs/admin-launch.spec.ts
- **Commit:** `930dd236`

### 계획과 다르게 한 작은 선택

- R3-IN-03 단위 테스트(늦은 다시 읽기 R1 이 다른 서버 값은 반영)는 서버별 화면에서 교보119 패널을 같은 렌더에 볼 수 없어, R2 응답의 KYOBO119 를 offline 으로 두고 마지막에 교보119 칩으로 바꿔 R1 이 반영한 값(−515)을 확인하도록 바꿨다(같은 불변식 · KB120 쪽 숫자 · 문구는 그대로).
- R2-WR-01 「늦게 온 다시 읽기」 단위 테스트는 교보119 로 돌아오면 편집 칸이 닫혀 있으므로, 다시 연 편집 칸의 입력값(−515)과 저장 비활성으로 「되돌리지 않음」 을 단언한다.

## Deferred Issues

- server `admin-launch.test.ts` P35-S9 「400 65칸」 간헐 실패(약 30회 중 2회 · 이 작업이 건드리지 않은 경로) — `deferred-items.md` 참조.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: webapp/src/components/admin/launch-server-chips.tsx · webapp/src/components/admin/__tests__/launch-server-chips.test.tsx · webapp/src/lib/radio-keys.ts
- FOUND: 033ace68 · ee6fcb3d · 930dd236 (HEAD 조상)
