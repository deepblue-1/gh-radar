---
phase: quick-261030-dz7
plan: 01
subsystem: launch-map
tags: [launch, admin, tail-probe, pgtap, shared, relay, webapp]
status: complete
requires: [gh-trade 261030 kind 17 뒤탐침(probe true · round −2)]
provides:
  - launch_map_for_admin 조각 14키(probe · round · result_code)
  - shared isLaunchTailProbe · launchGateSideOf(경계 판정 한 벌)
  - 16:00 지도 뒤탐침 삼각형 · 툴팁 · 표 탐침 수 · 범례
affects: [webapp /admin/launch 지도 · 주문 내역 키 열, relay launch-backfill CLI]
tech-stack:
  added: []
  patterns: [판정 한 벌(launchGateSideOf)을 경계 · 표식 색 · 툴팁이 공유, 선택 칸으로 배포 순서 무관]
key-files:
  created:
    - supabase/migrations/20261030210000_launch_map_tail_probe.sql
  modified:
    - supabase/tests/launch_gate.test.sql
    - packages/shared/src/launch.ts
    - packages/shared/src/__tests__/launch.test.ts
    - relay/src/tools/launch-backfill.ts
    - relay/tests/launch-backfill.test.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/lib/launch-map.ts
    - webapp/src/lib/__tests__/launch-map.test.ts
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
decisions:
  - 뒤탐침 경계 판정은 shared launchGateSideOf 한 곳 — 101/515 거부 · 접수/기타(E127 아님 · rc null 포함) 열림 · E127/무응답 경계 밖, 실조각 · 앞쪽 탐침 규칙 무변경
  - 지도 표식 색도 launchGateSideOf 로 정한다(실조각에선 resultToneOf 와 같은 값) — resultToneOf 는 주문 내역 알약용으로 그대로
  - 백필 머리는 실조각만 · 뒤탐침만 온 묶음은 머리 생략(조각만 적재 · throw 없음)
metrics:
  duration: ~20분
  completed: 2026-10-30
actuals:
  tokens: 16500
  tasks: 3
  commits: 3
plan_head_before: 5ee203c5
plan_head_after: 030e39d2
---

# Quick 261030-dz7: 발사 경계 지도 16:00 뒤탐침 Summary

gh-trade 16:00 뒤탐침(kind 17 · probe true · round −2)을 지도 RPC 가 싣고, shared 판정 한 벌(`launchGateSideOf`)이 경계 계산에 넣으며, 16:00 패널이 목업 A안 삼각형 · 결과 톤 · 「뒤탐침 n · 가격거부(열림) · F083」 툴팁 · 표 「3 · 탐침 3」 · 범례 항목으로 그린다.

## 커밋

| Task | 커밋 | 제목 |
| ---- | ---- | ---- |
| 1 | `0985ae82` | feat(launch): 경계 지도 조각에 probe · round · result_code — 뒤탐침 판정 재료 |
| 2 | `7df7ff75` | feat(launch): 뒤탐침 경계 판정 한 벌 — 경계 계산에 넣고 백필 머리는 실조각만 |
| 3 | `030e39d2` | feat(launch): 경계 지도 16:00 뒤탐침 삼각형 · 툴팁 · 표 탐침 수 · 범례 |

`git diff --stat 5ee203c5 HEAD` = 계획 files_modified 14개와 정확히 같다(server · e2e 픽스처 · upsert 헬퍼 · 투영 함수 무변경). 원격 db push · 배포 · git push 없음.

## Task 1 — 지도 RPC 3키(pgTAP)

- RED(옛 함수 위 · plan 62) — not ok 2건:
  - `not ok 49 - (q16, —, —, —, —, 지도 열) 지도 조각은 14열만(…)` — have 11키 · want 14키
  - `not ok 50 - (20261022, KB120, Q16, KRX, K, 뒤탐침) …` — have `[[0,null,null,null],[1,null,null,null]]` · want `[[0,null,null,null],[1,true,-2,"F083"]]`
- GREEN(새 마이그레이션 20261030210000 재생 · 일회용 로컬 컨테이너 · 원격 접촉 0):
  - `launch_gate.test.sql` 62/62 ok
  - `launch_project_mapping.test.sql` 36/36 ok
  - `launch_fire_base_key.test.sql` 23/23 ok
- grep 게이트(주석 제외 `'probe', p.probe` · `'round', p.round` · `'result_code', p.result_code` · `SELECT plan(62)`) 통과.

## Task 2 — shared 판정 · relay · 키 열

- shared: `LAUNCH_TAIL_PROBE_ROUND` · `LAUNCH_TAIL_PROBE_OUTSIDE_CODES`(E127) · `isLaunchTailProbe` · `LaunchGateSide` · `launchGateSideOf`. `LaunchCalcPiece` · `LaunchMapPiece` 에 선택 3칸. `launchDaysOf` lo/hi = 판정 한 벌. `launchHeadOf` 는 뒤탐침 제외(뒤탐침만 → 「실조각이 없습니다(뒤탐침만)」 throw).
- 목업 10/30 = lo −260 · hi −250 · gate, 패널 집계 경계 3 · 접수 0 · 거부 1, 리본(−250) ok 3 · bad 0 · unknown 1 — 테스트로 잠금.
- relay `planLaunchBackfill`: 실조각 있는 묶음만 머리 — Q(실 3 + 탐침 3) 머리 1(n_pieces 3) · K(탐침 1) 머리 없음 · 조각 7 · groups 2.
- 주문 내역 키 열 `pieceKeyLabelOf`: 「Q153015001 · 뒤탐침 2」 · piece_idx null 「… · 뒤탐침」 · 앞쪽 탐침 R-1 그대로.
- RED: shared 6 failed · relay 1 failed(`launchHeadOf: 실조각이 없습니다(뒤탐침만)` throw) · webapp 2 failed → GREEN.

## Task 3 — 지도 그림

- `LAUNCH_CHART.TRI_R` 5.6 · `trianglePathOf`(tidy — 「M10 10 L19.5 27 L0.5 27 Z」) · `LaunchMark.shape` 'triangle' · 색 = `launchGateSideOf`.
- 툴팁 · 호버 공용 꼬리 도우미(`tipPartsOf` · `tailProbeTipParts`) — 실조각 · n0930 출력은 한 글자도 안 바뀜(기존 테스트 통과).
- 차트: `path[data-shape="triangle"]` · hollow 규칙 그대로 · 표 조각 칸 = 실조각 수 + muted `launch-day-probes` 「 · 탐침 n」.
- 범례: `tailProbed`(q16 · 뒤탐침 있음)일 때 12×12 svg 회색 삼각형 + 「삼각형 = 뒤탐침(가격거부도 열림 · E127·무응답은 경계 밖)」. `LegendItem` 에 선택 `legend` prop(data-legend) 추가.
- RED: launch-gate-chart 3 failed · launch-map-tab 1 failed → GREEN.

## 실행한 검증

| 명령 | 결과 |
| ---- | ---- |
| pgTAP launch_gate / launch_project_mapping / launch_fire_base_key | 62/62 · 36/36 · 23/23 ok |
| `pnpm --filter @gh-radar/shared build` · `typecheck` | 통과 |
| shared vitest launch · launch-plan | 70 passed |
| relay typecheck · vitest launch-backfill | 통과 · 19 passed |
| server typecheck | 통과 |
| webapp vitest launch-format · launch-orders-tab · launch-plan-editor | 64 passed |
| webapp vitest launch-map · launch-gate-chart · launch-map-tab · launch-format | 137 passed |
| webapp typecheck(tsc + e2e tsconfig) · eslint 변경 4파일 | 통과 |
| 전체 회귀 shared(--maxWorkers=2) | 26 files · 837 passed |
| 전체 회귀 relay | 60 files · 1780 passed |
| 전체 회귀 webapp src/lib src/components/admin | 85 files · 2009 passed · 1 skipped(기존) |

실행 안 함: e2e(Playwright — 계획상 제외 · 픽스처 무변경). prettier 는 webapp 에 설치되어 있지 않아 eslint 만.

## Deviations from Plan

- [순서] Task 3 의 launch-map.ts 는 테스트를 먼저 쓰고 실행 전에 구현했다(새 export `trianglePathOf` import 라 RED 는 자명 — 차트 · 범례 테스트는 구현 전 실행으로 RED 확인).
- [Rule 2 - 작은 추가] 범례 테스트가 항목을 찾도록 `LegendItem` 에 선택 `legend` prop(`data-legend`)을 더했다 — 새 컴포넌트 · 파일 없음.
- 그 밖 계획대로.

## Known Stubs

없음.

## 메인 세션 체크리스트(executor 는 하지 않았다)

1. 원격 DB: `supabase db push --linked --yes`(20261030210000 — 읽기 함수 재정의뿐이라 장중 무해 · 그래도 관례대로 확인 후).
2. db push 뒤 git push(= webapp 프로덕션 배포). 순서가 뒤바뀌어도 웹은 세 칸이 없으면 실조각으로 읽어 깨지지 않는다. relay 런타임 배포는 불필요(launch-backfill 은 CLI 도구).
3. gh-trade 10/30 백필 ndjson 도착 시 기존 `bash scripts/launch-backfill.sh` 로 dry-run → apply — 뒤탐침만 온 묶음도 이제 throw 없이 조각만 적재된다(머리는 journal kind 18 이 정본).
4. 10/31 16:00 뒤: 요청 노트 「확인 방법」 4항목(뒤탐침 kind 17 건수 · wire 가 실조각 다음 번호 · kind 18 n_pieces 실조각 수 · 지도 16:00 패널 삼각형이 마지막 실조각 오른쪽 +10/20/30µs).

## Self-Check: PASSED

- 파일 14개 존재 · 커밋 `0985ae82` · `7df7ff75` · `030e39d2` 가 HEAD 조상.
