---
phase: quick-261106-p8h
plan: 01
subsystem: launch-queue
tags: [launch-queue, tick-convert, supabase, fifo, dma_account_orders]
status: complete
requires: [launch_queue_inputs (20261104200000), dma_account_orders, uq_dma_account_orders_order_no]
provides: [launch_queue_inputs alive 키, fifoReplay protect, queueLevelValuesOf]
affects: [workers/tick-convert nightly · launch-live · backfill-launch 의 16:00 Q16 마감 때 값]
tech-stack:
  added: []
  patterns: [주문로그 정답으로 추정 재생 보정(protect 재생 + false 덮어쓰기)]
key-files:
  created:
    - supabase/migrations/20261106400000_launch_queue_inputs_alive.sql
    - supabase/tests/launch_queue_inputs_alive.test.sql
    - workers/tick-convert/tests/meta-launch-inputs.test.ts
  modified:
    - packages/shared/src/ticks/launch-queue.ts
    - packages/shared/src/__tests__/ticks-launch-queue.test.ts
    - supabase/tests/launch_piece_queue.test.sql
    - workers/tick-convert/src/meta.ts
decisions:
  - "alive true 는 짝지은 뒤 protect 로 한 번 더 재생(짝 m 은 다시 짓지 않음 · 추가 열 불일치면 throw)"
  - "alive false 덮어쓰기는 레벨 전체에 먼저 적용한 뒤 end_n 계산 — 체결·취소로 이미 0 이면 그대로"
  - "조각 account NULL 이면 alive = null(fills 와 달리 계좌 무시 안 함)"
metrics:
  completed: 2026-11-06
actuals:
  tokens: 8570
  tasks: 2
  commits: 0
plan_head_before: f5839077
plan_head_after: f5839077
---

# Quick 261106-p8h: 발사 대기열 16:00 Q16 「마감 때」 주문로그 덮어쓰기 Summary

`launch_queue_inputs` 가 행마다 우리 주문로그 상태(`alive`)를 싣고, shared `queueLevelValuesOf` 가 alive true 주문을 취소 귀속 후보에서 빼고 다시 재생(`fifoReplay` protect), false 주문은 마감 때 계산 전에 0(취소)으로 덮는다 — 11/06 덕성우 교보 53200140 꼴이 합성 재현에서 cancelled → open(end_n 3 · end_qty 7500)으로 바뀐다.

> **커밋 · 배포 완료** — executor 는 커밋하지 않았고(사용자 커밋 메시지 확인이 먼저) 오케스트레이터가 Task 3 을 마쳤다: 커밋 `0e91d7a5` · db push · tick-convert 배포 · 실데이터 검증 · push(2026-11-06 19:55 KST).

## 한 일

### Task 1 — shared 계산 코어
- `LaunchQueuePieceIn.alive?: boolean | null` 추가(JSDoc — true/false/null 뜻 · 16:00 Q16 만).
- `fifoReplay(events, protect?)` — 취소 후보 조건에 `!protect?.has(i)` 하나만 추가. 체결 소진 · head · 추가 로직 무변경.
- 새 공개 순수 함수 `queueLevelValuesOf(events, price, pieces)` — 기존 `queueValuesOf` 레벨 몸통을 로컬 색인으로 옮기고, 짝 뒤 (c) protect 재생(추가 열 불일치 시 Error) · (d) alive false 덮어쓰기 · (e) 값 조립 순.
- `queueValuesOf` 는 레벨마다 `levelEvents` 를 배열로 펼쳐 `queueLevelValuesOf` 를 부르는 얇은 래퍼.
- 머리 주석 16:00 절에 덮어쓰기 단락 · 취소 규칙 줄에 「protect 주문은 후보 아님」.
- 테스트 10개 추가(fifoReplay protect 4 · queueLevelValuesOf 6) — RED 8 실패 확인 뒤 GREEN.

### Task 2 — 입력 경로
- 마이그레이션 `20261106400000_launch_queue_inputs_alive.sql`(실행 시 최대 = 20261106300000 → 계획 파일명 그대로) — `CREATE OR REPLACE launch_queue_inputs`, 원 정의와 diff 는 `'alive'` 스칼라 부분질의 한 덩어리뿐(scratchpad diff 로 확인). COMMENT 갱신 · REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role 재기술.
- pgTAP 새 파일 `launch_queue_inputs_alive.test.sql` — 13칸 매핑 · alive 키 존재 · 권한 4 = plan(6).
- `launch_piece_queue.test.sql` — B 절 행 모양에 `"alive": null` · 설명 끝 · 머리 「대상:」 한 줄. plan(47) 무변경.
- `meta.ts` `isLaunchInput` — alive 가 undefined · null · boolean 인지 조건 하나 · 머리 주석.
- `meta-launch-inputs.test.ts` — 통과 · 값 보존 1 + 잘못된 타입 2(it.each). 가드를 잠시 빼고 2 실패(RED) 확인 후 원복.

## 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared typecheck` | 오류 0 |
| `pnpm --filter @gh-radar/shared exec vitest run --maxWorkers=2` | 44 파일 · 1159 통과 · 2 skip(HEAD 1149 + 새 10) |
| 골든 `ticks-launch-queue.golden.test.ts` | `git diff --quiet` 무변경 · skip 없이 통과 |
| `grep -c "export function queueLevelValuesOf"` | 1 |
| `pnpm --filter @gh-radar/shared build` | 성공 |
| `pnpm --filter @gh-radar/tick-convert typecheck` | 오류 0 |
| `pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2` | 15 파일 · 207 통과(HEAD 204 + 새 3) |
| pgTAP `launch_queue_inputs_alive.test.sql` | 마이그레이션 115개 재생 · 1..6 전부 ok · RESULT PASS |
| pgTAP `launch_piece_queue.test.sql` | 마이그레이션 115개 재생 · 1..47 · `not ok` 0 · RESULT PASS |

pgTAP 은 일회용 로컬 컨테이너(`public.ecr.aws/supabase/postgres:17.6.1.104`)에서만 돌았다 — 원격 DB 접촉 0.

## Deviations from Plan

없음 — 계획대로 실행. 참고 1건: 주문로그 픽스처 꼴을 따온 `dma_gateway_identities.test.sql` 은 개명 전 키('KB' · 'KYOBO')를 쓰지만, 개명(20261007200000) 뒤 `dma_account_orders.gateway` 는 'KB120' · 'KYOBO119' 이고 기존 `launch_orders_filled_join` 도 같은 4키 조인이라 계획의 `o.gateway = p.gateway` 를 그대로 썼다.

## 배포 · 실데이터 검증

**완료(Task 3 · 오케스트레이터 · 2026-11-06)**
- 커밋 `0e91d7a5` (사용자 메시지 확인 후).
- `supabase migration list --linked` — 미적용은 `20261106400000` 하나 → `supabase db push --linked --yes` 적용.
- `launch_queue_inputs('20261106')` 덕성우 5380: KB120 wire0(538) alive=true · 나머지 KB false · KYOBO119 wire1(53200140) true · wire2~4(141·142·143) false.
- 배포 전 운영 이미지 `tick-convert:7257f0a0` 이 HEAD 조상 확인 → `scripts/deploy-tick-convert.sh` → `tick-convert:0e91d7a5` (nightly · promote · launch-live 3 Job).
- `gh-radar-tick-convert-launch-live --args=launch-live,--all-today` 실행: keys 16 · computed 16 · written 60 · set_skipped 0 · failed 0.
- `launch_orders_for_admin('20261106')`: 교보 53200140 **end_state open** · rank 94 · end_n 6 · end_qty 39,633 / 141·142 cancelled · 143 matched false / KB 538 open · 나머지 cancelled (as-of 16:10:42 KST).
- 남은 점: live 값은 16:10 틱 기준인데 alive 는 계산 시점 주문로그라 17:58 취소한 KB 543 이 이미 cancelled — 밤 nightly(장 마감 격자)가 다시 계산하면 일치.

## Self-Check: PASSED

- 생성 파일 3개 존재 확인(`git status --short` 의 `??` 항목).
- 코드 커밋 `0e91d7a5` 는 오케스트레이터가 했다(executor 는 커밋하지 않음 — 의도).
