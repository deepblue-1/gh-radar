---
phase: quick-261104-6lh
plan: 01
subsystem: ticks (tickgw · server · shared · webapp · supabase)
tags: [phase-38, tick-viewer, own-orders, tickgw, as-of, journal_epoch, R2-follow-up]
status: complete
requires:
  - supabase/migrations/20261104100000_tick_own_for_user.sql (운영 적용본 · 무변경)
provides:
  - tick_own_for_user fills.journal_epoch (20261104500000)
  - tickgw live 헤더 X-Tick-As-Of-Ms · server 중계 · CORS 노출
  - 웹 당일 대기 cutoff = max(마지막 수신, as-of − 2,000)
affects:
  - webapp 틱 뷰어 우리 체결 대기(pending) 판정 · 고른 줄 안정 키
tech-stack:
  added: []
  patterns:
    - "옵션 필드 + 폴백으로 배포 순서 무관 호환"
    - "as-of = 마지막 완결 폴링 시작 시각(closedThroughNs 와 같은 뜻)"
key-files:
  created:
    - supabase/migrations/20261104500000_tick_own_fills_journal_epoch.sql
  modified:
    - supabase/tests/tick_own.test.sql
    - packages/shared/src/tick-api.ts
    - tickgw/src/cache.ts
    - tickgw/src/poller.ts
    - tickgw/src/server.ts
    - tickgw/tests/server.test.ts
    - server/src/routes/ticks.ts
    - server/src/services/cors-config.ts
    - server/src/services/tickgw-client.ts
    - server/tests/routes/ticks.test.ts
    - server/tests/routes/ticks-live.test.ts
    - server/tests/services/tickgw-client.test.ts
    - webapp/src/lib/ticks/tick-api.ts
    - webapp/src/lib/ticks/own-model.ts
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-viewer-page.tsx
    - webapp/src/lib/ticks/__tests__/own-model.test.ts
    - webapp/src/lib/ticks/__tests__/use-tick-live.test.tsx
    - webapp/e2e/fixtures/ticks.ts
decisions:
  - "tickgw as-of 는 응답 시각이 아니라 그 키를 마지막으로 끝까지(has_more 없이) 읽은 인덱서 호출의 시작 시각이다"
  - "웹 as-of 여유는 2,000ms(OWN_SERVER_AS_OF_LAG_MS = tickgw CLOSE_RECORD_LAG_MS) — dt 5ms 체결의 확정 경계는 g + 3,025ms"
  - "웹은 tickgw 상태 ready 일 때만 as-of 를 쓴다(하루치 받기 중 meta 와 세션 어긋남 방지)"
  - "체결 키는 journal_epoch 가 있으면 gateway|journal_epoch|seq, 없으면 종전 gateway|order_no|gw_time_ms|seq"
metrics:
  duration: "약 25분"
  completed: 2026-11-04
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 9c5a2bc59c6a1edddc373308dabc92a975d22eeb
plan_head_after: 7c51f4dfe41f19cc87b0f73c153301ff8ad1d60e
---

# Phase quick-261104-6lh Plan 01: tickgw as-of 당일 대기 판정 · RPC fills journal_epoch Summary

tickgw 가 「이 키를 마지막으로 끝까지 읽은 폴링의 시작 시각」 을 `X-Tick-As-Of-Ms` 로 내립니다. server 가 이 값을 그대로 중계하고 CORS 로 노출합니다. 웹은 당일 대기 cutoff 를 `max(마지막 수신, as-of − 2,000)` 으로 앞당깁니다. 그래서 한산한 종목의 우리 체결도 「최신 받기」 한 번에 확정됩니다. 함께 RPC fills 에 `journal_epoch` 를 실었고, 웹 체결 키를 원천 PK(`gateway|journal_epoch|seq`)로 바꿨습니다. 옛 응답이 오면 종전 키로 폴백합니다.

## 커밋

| Task | 해시 | 메시지 |
|------|------|--------|
| 1 (트레이서) | `f4ed5016` | fix(quick-261104-6lh): 우리 체결 키를 원천 PK 로 — RPC fills 에 journal_epoch · 옛 응답은 종전 키 |
| 2 | `ac98c578` | feat(quick-261104-6lh): tickgw live 헤더 X-Tick-As-Of-Ms — 마지막 완결 폴링 시각 · server 중계 · CORS 노출 |
| 3 | `7c51f4df` | fix(quick-261104-6lh): 당일 대기 기준에 tickgw as-of — 한산한 종목의 우리 체결도 최신 받기로 확정 |

세 커밋 모두 경로를 지정해 스테이징했습니다. Co-Authored-By 는 넣지 않았고 push 도 하지 않았습니다. `tasks/lessons.md` 는 미커밋 상태 그대로 남겨 두었습니다.

## 실제로 쓴 마이그레이션 타임스탬프

`20261104500000_tick_own_fills_journal_epoch.sql` 을 그대로 썼습니다. 실행 시점에 브랜치별 마지막 마이그레이션을 다시 확인했습니다.

- master · origin/master: `20261104200000_launch_piece_queue.sql`
- worktree-agent-ad8eea79b05a9b487: `20261104200000_launch_piece_queue.sql`
- worktree-agent-ae6f01da1e75a19c9: `20261104300100_tick_request_requesters.sql` (계획 시점 `300000` 보다 하나 늘었지만 여전히 `500000` 보다 작음)
- phase-38-own-orders(이 브랜치): `20261104100000_tick_own_for_user.sql`

## 게이트 결과

| 게이트 | 결과 |
|--------|------|
| 마이그레이션 함수 본문 diff | `'journal_epoch', j.journal_epoch,` 한 줄만 다름. REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role · NOTIFY 를 다시 적음 |
| 원 마이그레이션 · 오라클 생성기 | `git diff 9c5a2bc5` 기준 diff 0 (ORIGINAL_UNTOUCHED · GOLDEN_UNTOUCHED) |
| pgTAP `tick_own.test.sql` | 1..53 모두 ok · `# RESULT: PASS` · 종료 0 (일회용 로컬 컨테이너 · 원격 접촉 0) |
| shared | tsc 통과 · build 통과 · vitest `src/__tests__/` 39 파일 · 1,062 통과 · 2 skip (기준과 같음. shared 테스트는 추가하지 않았고 골든 오라클 401/406 · 108 · 29/29 · 100/100 그대로) |
| tickgw | tsc 통과 · `tests/server.test.ts tests/poller.test.ts` 2 파일 30 통과 · tickgw 전체 3 파일 42 통과 |
| server | tsc 통과 · `ticks-live` · `tickgw-client` · `ticks` 3 파일 55 통과 |
| webapp | tsc 통과 · `src/lib/ticks src/components/ticks` 26 파일 · 384 통과 (기준 379 에서 5건 늘어남) |
| webapp eslint | 손댄 7개 파일(e2e 픽스처 포함) 종료 0 · 경고 0 |
| Playwright | 실행하지 않음 (동시 세션 메모리 규율 · 호출자 지시) |

## 호출자 원문과 달라진 결정 3가지

1. **as-of 는 응답 시각이 아니라 「마지막 완결 폴링의 시작 시각」 입니다.** tickgw 는 5초 폴링 캐시이고, 실패하면 최대 60초까지 백오프합니다. 그래서 캐시가 응답 시각보다 수 초에서 수십 초 늦을 수 있습니다. 응답 시각을 쓰면 원 WR-02 의 오짝(진짜 A3 가 캐시에 아직 없는데 더 이른 같은 가격 A3 로 확정)이 다시 열립니다. 그래서 `applyOk` 가 has_more 가 거짓일 때만 `entry.asOfMs = call() 의 started` 를 적습니다. 이 값은 append 와 같은 동기 블록에서 바뀌므로 캐시와 원자적입니다. 새 레코드가 0건인 폴링도 값을 앞당깁니다. 실패 · 바쁨 · 인자 오류 · 전역 차단 · 이어받기 중간 · 계약 위반 분기에서는 값을 건드리지 않습니다. 마감 마무리의 `closedThroughNs` 와 같은 뜻입니다.
2. **여유 2,000ms 를 두므로 확정 경계는 g + 3,025ms 입니다.** `OWN_SERVER_AS_OF_LAG_MS = 2_000` 은 tickgw `CLOSE_RECORD_LAG_MS` 와 같은 값입니다. 기록기 지연 약 1초에, 119 인덱서와 radar-gw 두 호스트의 시계 차를 더한 만큼을 흡수합니다. 호출자 예시 「asOf +2s → matched」 는 여유 0 을 전제한 것입니다. dt 5ms 체결(닿는 거리 25)의 경계는 as-of ≥ g + 25 + 1,000 + 2,000 = g + 3,025 입니다. 테스트로 이 경계를 잠갔습니다. 정확히 경계면 matched, 1ms 모자라면 pending 입니다.
3. **웹은 tickgw 상태가 ready 일 때만 as-of 를 씁니다.** `useTickLive` 가 하루치를 받는 동안(첫 로드 · 409 재수신) meta 는 loading · queued 응답의 값입니다. 그래서 화면 세션과 어긋날 수 있습니다. ready 면 meta 와 세션이 같은 publish 에서 바뀝니다(`use-tick-live.ts` handle 에서 확인).

## 배포 메모

이 계획은 배포하지 않았습니다. 메인 세션이 배포할 때 아래 제약을 지켜야 합니다. 실행 중에 직접 확인한 사실만 적었습니다.

1. **어느 순서로 배포해도 기능은 깨지지 않습니다(하위 호환).**
   - DB 를 먼저 올리면: 옛 server(`services/ticks.ts`)와 옛 웹은 fills 가 배열인지만 봅니다. 늘어난 키는 무시합니다.
   - 웹을 먼저 올리면: 응답에 epoch 가 없으므로 종전 키 `gateway|order_no|gw_time_ms|seq` 를 씁니다.
   - 새 tickgw + 옛 server: 옛 server 의 `TICK_LIVE_HEADERS` 에 이름이 없어 헤더가 중계되지 않습니다. 웹은 종전 판정을 합니다.
   - 새 server + 옛 tickgw: 헤더가 없으므로 중계하지 않습니다(server 테스트 「옛 tickgw」 로 잠금). 웹은 종전 판정을 합니다.
   - as-of 는 tickgw 와 server 가 **둘 다** 배포된 뒤에야 웹에 보입니다.
2. **마이그레이션 타임스탬프와 master · 원격 순서.** 이 브랜치에는 master 의 `20261104200000_launch_piece_queue.sql` 이 없습니다. 원격에는 이미 적용됐을 가능성이 큽니다. 이 브랜치 트리에서 바로 `supabase db push` 를 하면 CLI 가 「원격 버전이 로컬에 없음」 으로 멈출 수 있습니다. **master 를 먼저 합친 트리에서 db push 하십시오.** 새 파일 `20261104500000` 은 모든 로컬 브랜치의 끝(최대 `20261104300100`)보다 큽니다. server 도 master 쪽 shared 변경이 들어간 트리에서 배포하는 것이 안전합니다.
3. **tickgw 재기동 시각.**
   - 재기동하면 메모리 캐시가 사라집니다. 그러면 모든 당일 뷰어가 409 를 받고 08:00 부터 다시 받습니다. 마감 마무리로 closed 된 키도 사라집니다.
   - `scripts/deploy-tickgw.sh` 는 평일 08:00~20:00 KST 만 막습니다(`daytime_blocked`).
   - 그런데 승격 Job 은 Scheduler `10 20 * * 1-5` · `40 20 * * 1-5`(Asia/Seoul)에 tickgw export 를 읽습니다(`scripts/deploy-tick-convert.sh`).
   - 그래서 **평일 20:00~20:45 에 배포하면 그날 승격이 빠질 수 있습니다.** 20:40 실행이 끝난 뒤(약 20:45 이후)나 주말에 배포하십시오.
4. **웹은 마지막에 배포합니다.** master push 가 곧 webapp 프로덕션 배포입니다.

## Deviations from Plan

### 실행상 차이

**1. [Rule 3 - 차단] Plan 커밋 원장 파일을 쓰지 못함**
- **발견:** Task 1 커밋 직전
- **문제:** worktree 격리 가드가 `$(git rev-parse --git-dir)` 를 쓰는 복합 명령을 막았습니다.
- **처리:** `plan_head_before` 는 계획에 적힌 기준 HEAD `9c5a2bc5` 를 그대로 썼습니다. 커밋 수는 `git rev-list --count 9c5a2bc5..HEAD = 3` 으로 쟀습니다.

**2. TDD 순서**
- Task 2 의 server 테스트는 RED 를 확인했습니다. 옛 shared dist 상태에서 3건이 실패했고, shared 를 다시 빌드한 뒤 통과했습니다.
- Task 2 의 tickgw 테스트와 Task 3 의 웹 테스트는 구현을 먼저 하고 테스트를 뒤에 붙였습니다. 별도의 RED 실행은 하지 않았습니다. 대신 경계 테스트(경계 ±1ms)와 「없음이면 종전」 테스트가 두 방향을 모두 잠급니다.

그 밖에는 계획대로 실행했습니다. `server/src/services/ticks.ts` 와 server 로직은 고치지 않았고 주석만 6종에서 7종으로 고쳤습니다.

## 참고

- e2e 픽스처(`webapp/e2e/fixtures/ticks.ts`)는 `fill()` 헬퍼에 `journal_epoch: 'e2e-ep'` 를 더했습니다. Playwright 는 돌리지 않았습니다. 이 파일은 webapp tsc include 범위 밖이라 타입 검사를 받지 않습니다. eslint 는 이 파일까지 돌았고 경고는 0 이었습니다.
- shared 의 `dist` 는 Task 1 · Task 2 에서 다시 빌드했습니다. Task 3 에서는 shared 를 바꾸지 않았습니다.

## Known Stubs

없습니다.

## Self-Check: PASSED

- FOUND: supabase/migrations/20261104500000_tick_own_fills_journal_epoch.sql
- FOUND: f4ed5016 · ac98c578 · 7c51f4df (HEAD 조상)
