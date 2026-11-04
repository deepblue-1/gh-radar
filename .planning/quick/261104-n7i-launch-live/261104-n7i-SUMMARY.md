---
phase: quick-261104-n7i
plan: 01
status: complete
subsystem: tick-convert · supabase launch RPC · admin 발사 주문 내역
tags: [launch-queue, tickgw-live, cloud-run-job, scheduler, pgtap]
requires:
  - quick 261103-pei (launch_piece_queue · launchQueueOf · gridLaunchOf)
  - tickgw /internal/ticks/live 계약(변경 없음)
provides:
  - tick-convert 모드 launch-live(당일 발사 대기열 · live:<as-of> 표식)
  - launch_queue_set live 가드(오늘만 · live 단조 · 격자 우선) · launch_orders_for_admin queue.live_as_of
  - 배포 스크립트 Job gh-radar-tick-convert-launch-live + Scheduler -pm/-am · 알림 필터
  - 웹 「HH:MM 기준」 문구
affects:
  - workers/tick-convert · supabase/migrations · scripts/deploy-tick-convert.sh · ops/alert-tick-convert-failure.yaml · packages/shared · webapp
tech-stack:
  added: []
  patterns: [리스 인식 순차 게이트, run 예산 deferred, 표식 object_path 단조 가드]
key-files:
  created:
    - supabase/migrations/20261104710000_launch_queue_live.sql
    - workers/tick-convert/src/tickgw-live.ts
    - workers/tick-convert/src/modes/launch-live.ts
    - workers/tick-convert/tests/launch-live.test.ts
    - workers/tick-convert/tests/tickgw-live.test.ts
    - workers/tick-convert/tests/helpers/fake-tickgw-live.ts
  modified:
    - supabase/tests/launch_piece_queue.test.sql
    - workers/tick-convert/src/index.ts
    - workers/tick-convert/src/config.ts
    - workers/tick-convert/tests/entry.test.ts
    - workers/tick-convert/tests/config.test.ts
    - scripts/deploy-tick-convert.sh
    - ops/alert-tick-convert-failure.yaml
    - packages/shared/src/launch.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
decisions:
  - "launch-live 받기는 순차 + 리스 인식 4키 게이트(lastReqAt + 31초) — 리서치의 「받기만 K 동시」 대신. 119 동시성 전역 1 이라 총시간 이득이 없고 메모리 · 시험이 단순"
  - "마이그레이션 이름 20261104710000 — 옆 세션(261104-n9h)이 20261104700000 을 먼저 써서 뒤로 밀었다"
  - "fetchLiveDay 409 연속 3회 초과 → 그 키 failed(엔트리가 계속 바뀌는 경우 무한 루프 방지 · 계약 밖 안전장치)"
metrics:
  duration: ~70분
  completed: 2026-11-04
estimate:
  tokens: 90000
  tasks: 3
actuals:
  tokens: 21640
  tasks: 3
  commits: 5
  own_commits: 3
plan_head_before: 988434d0e3cfad4819eb1dff267c06504157503e
plan_head_after: e9b4df391c6f97ab5fecc0a5f50c8a8a9a64ca2f
---

# Quick 261104-n7i Plan 01: 발사 대기열 당일 자동 계산(launch-live) Summary

tick-convert 에 `launch-live` 모드를 새로 넣었다. 이 모드는 radar-gw tickgw `/internal/ticks/live` 에서 당일 바이트를 받아 shared `launchQueueOf` 를 돌리고, 결과를 `live:<as-of ISO>` 표식으로 `launch_piece_queue` 에 저장한다. DB 가드는 「live 는 KST 오늘만 · live 위에서만 단조로 덮음 · 격자 값은 언제나 live 를 덮음」 이다. 어드민 주문 내역에서는 당일 값일 때 둘째 줄에 「16:03 기준 …」 · 「… · 09:03 기준」 이 보인다.

## 커밋

`commits: 5` 는 원장(`plan_head_before..HEAD`)으로 잰 값이다. 이 범위에는 같은 트리에서 동시에 돈 옆 세션(quick 261104-n9h · inbox)의 커밋 2개(`91b49a0a` · `9da0dafb`)가 섞여 있다. 이 quick 의 커밋은 아래 3개다.

| Task | 커밋 | 내용 |
|---|---|---|
| 1 (tracer) | `ac1fede1` | 마이그레이션 · pgTAP G · tickgw-live 클라이언트/루프 · launch-live 모드 · MODES/config 등록 · 골든 시험 |
| 2 | `0abea638` | 리스 4키 게이트 · run 예산 100초 · fills_empty · tickgw-live 분기 시험 20건 · 회계 시험 · config 시험 · 배포 Section 7c · 알림 필터 |
| 3 | `e9b4df39` | shared `LaunchPieceQueueView` · `launchQueueCellOf` 「HH:MM 기준」 · 시험 5건 |

**주의:** `ac1fede1` 은 옆 세션이 push 한 `91b49a0a` 에 같이 실려 이미 origin/master 에 있다. 이 executor 는 push 하지 않았다. 그 커밋에는 웹 변경이 없어서 Vercel 화면은 그대로다. 마이그레이션도 원격 DB 에는 적용되지 않았다(db push 는 따로 해야 한다). 남은 `0abea638` · `e9b4df39` 는 로컬에만 있다(ahead 3 — 옆 세션 커밋 `9da0dafb` 포함).

## 검증 결과

- pgTAP(일회용 로컬 컨테이너): `launch_piece_queue` 47/47(기존 31 + 섹션 G 16 · 기존 D 14칸 정확 비교는 고치지 않고 통과) · `launch_gate` 62/62 · `launch_fire_base_key` 23/23 · `launch_project_mapping` 36/36 — 전부 PASS.
- `pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2` — 14 파일 · 203 통과. typecheck 통과.
- webapp `launch-format` · `launch-orders-tab` — 65 통과. webapp · server typecheck 통과. eslint 경고 없음.
- 배포 스크립트 `bash -n` 통과. 새 Job 이름과 크론 두 줄이 주석이 아닌 코드에 있다. 알림 YAML 은 파싱되고 필터에 새 Job 이 들어갔다(ruby YAML 로 확인).
- 골든: 16:00 KB wire 0 → rank 9 · ahead_qty 68,808 · 표식 `live:2026-10-30T07:04:00.000Z`. 09:00 → run rank 1 · fill_qty 281 · fill_px_min 18,000 · 표식 `live:2026-10-30T00:04:00.000Z`. 창 밖이거나 inputs 가 0 이면 tickgw 호출 0.

## Deviations from Plan

### 계획과 다르게 · 재량

1. **[Rule 3 - Blocking] 마이그레이션 파일 이름 `20261104700000` → `20261104710000_launch_queue_live.sql`.** 실행 시점에 옆 세션의 `20261104700000_tick_list_today_team_open.sql` 이 이미 있었다(계획의 전제 확인 규칙대로 뒤로 밀었다). 워커의 set_skipped 경고 문구도 새 이름을 쓴다.
2. **받기는 순차 + 리스 인식 게이트(계획 Task 2 지시 · 리서치 「받기만 K 동시」 와 다름).** 119 호출 동시성이 전역 1 이라 동시에 받아도 총시간이 줄지 않는다. 메모리와 시험도 더 단순하다. 31초 리스 창이 시간을 지배하는 것은 어느 쪽이든 같다.
3. **[Rule 2] `fetchLiveDay` 409 연속 3회 초과 → failed(`LIVE_MAX_CONFLICTS`).** 계약에는 「곧바로 다시」 만 있다. 그런데 엔트리가 계속 바뀌면 대기 없이 끝없이 돌 수 있어서(가상 시계 시험에서는 실제로 무한 루프) 안전장치를 하나 더했다. 200 응답 헤더 모양 위반(Epoch · Offset-End)과 모르는 state 도 failed 로 처리한다.
4. **run 예산은 게이트 대기 앞 · 뒤에서 두 번 본다.** 대기 때문에 100초를 넘기면 그 키를 열지 않는다.
5. **시험 도우미 새 파일 `tests/helpers/fake-tickgw-live.ts`**(계획 files 목록에 없음): `liveFetch` · `serveDay`(tickgw live 핸들러 흉내) · `virtualClock`. 두 시험 파일이 함께 쓴다.
6. **CLI(main) 경로 시험은 `vi.stubGlobal("fetch")` 로 했다.** `main` 은 tickgw 클라이언트를 주입받지 않기 때문이다. sleep 도 주입할 수 없어서, CLI 시험은 게이트가 걸리지 않는 시나리오만 쓴다.
7. **Step 0 커밋 가드(보호 브랜치 거부)는 적용하지 않고 master 에 커밋했다.** 오케스트레이터가 `<sequential_execution>` 으로 master 를 지정했고, 프로젝트 규칙도 「작업은 master」 다. 커밋 때마다 `git status -sb` 를 확인하고 경로를 지정해 stage 했다(옆 세션 파일은 섞이지 않았다).

### Auto-fixed Issues

없음 — 계획한 계약대로 처음부터 통과했다(tickgw-live 분기 시험 20건도 Task 1 구현으로 바로 통과).

## Known Stubs

없음.

## 메인 세션 배포 체크리스트(executor 는 하지 않음 · 서브에이전트 배포 금지)

1. DB — `supabase db push --linked --yes`. 옆 세션이 더 늦은 타임스탬프를 먼저 올려 out-of-order 로 거부되면, 파일 이름만 더 늦게 바꾸고 pgTAP 4파일을 다시 돌린 뒤 push 한다. 새 파일은 **`20261104710000_launch_queue_live.sql`** 이고, 옆 세션의 `20261104700000_tick_list_today_team_open.sql` 이 함께 올라간다. db push 는 Job 배포보다 먼저 한다. 반대 순서면 live 행이 옛 가드에 버려져 `set_skipped` 로만 보인다(무해).
2. 배포 전에 운영 이미지가 조상인지 확인한다. `gcloud run jobs describe gh-radar-tick-convert-promote --region=asia-northeast3` 의 이미지 SHA 가 지금 HEAD 의 조상이어야 한다(옆 세션 배포를 덮어쓰지 않도록).
3. tick-convert — `TICKGW_URL=<승격 Job 라이브 env> GCP_PROJECT_ID=gh-radar SUPABASE_URL=<라이브 env> NOTIFICATION_CHANNEL_ID=<기존 값> bash scripts/deploy-tick-convert.sh`. nightly · promote · launch-live 세 Job 을 같은 이미지로 올리고 알림 정책도 갱신한다.
4. Scheduler 확인 — `gcloud scheduler jobs describe gh-radar-tick-convert-launch-live-pm --location=asia-northeast3`(schedule `1,3,10 16 * * 1-5` · Asia/Seoul) · `…-am`(`1,3 9 * * 1-5`).
5. 첫 평일 16:01 · 09:01 로그 — `gcloud logging read 'resource.labels.job_name="gh-radar-tick-convert-launch-live" AND jsonPayload.msg:"mode=launch-live"' --limit 10`. 여기서 `keys=`(A1 가정: 09:00 5~15 · 16:00 1~5) · `deferred=` · `failed=0` · `fills_empty=` · `set_skipped=0` 을 확인한다.
6. 어드민 「발사」 → 주문 내역 오늘: 16:00 탭 둘째 줄이 「16:0x 기준 앞 …」, 09:00:30 탭이 「… · 09:0x 기준」 으로 나오는지 본다. 그날 밤 nightly 뒤에는 「마감 …」 문구로 바뀌는지도 본다.
7. 웹 — git push(= Vercel 프로덕션 배포)는 백엔드 배포 뒤에 한다. 순서가 바뀌어도 안전하다(`live_as_of` 가 없으면 지금 문구). 참고로 Task 3 커밋 `e9b4df39` 는 아직 push 전이다. 옆 세션이 push 하면 같이 나간다(무해).

## 관찰 지표(처음 며칠 · RESEARCH A4)

radar-gw tickgw `catchup done`(lost · left)과 promote 요약 `incomplete` · `unclosed` 를 본다. 이 값들이 나빠지면 후속 quick 으로 tickgw 에 「잡 요청은 유휴 면제 · 승격 pin 제외」 플래그를 제안한다. 09:01 사용자 체감(「대기 k건」)이 나쁘면 `LIVE_KEY_SLOTS` 를 3 으로 낮춘다.

## Self-Check: PASSED

- 파일 존재: 마이그레이션 · tickgw-live.ts · launch-live.ts · 시험 3파일 · 헬퍼 — 모두 있음.
- 커밋 존재: `ac1fede1` · `0abea638` · `e9b4df39` — 모두 HEAD 의 조상.
