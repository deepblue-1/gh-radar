---
phase: quick-261103-pei
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — shared 순수 함수 + 실측 골든
  - packages/shared/src/launch.ts
  - packages/shared/src/ticks/launch-queue.ts
  - packages/shared/src/ticks/index.ts
  - packages/shared/src/__tests__/ticks-launch-queue.test.ts
  - packages/shared/src/__tests__/ticks-launch-queue.golden.test.ts
  - packages/shared/src/__fixtures__/ticks/launch1022-krx-g4.ticks.zst
  - packages/shared/src/__fixtures__/ticks/launch1030-krx-g4.ticks.zst
  - packages/shared/src/__fixtures__/ticks/launch1030-krx-0900.ticks.zst
  - packages/shared/src/__fixtures__/ticks/launch1030-nxt-0900.ticks.zst
  - packages/shared/src/__fixtures__/ticks/README.md
  - scripts/tick-oracle/oracle.py
  - scripts/tick-oracle/gen-fixtures.sh
  # Task 2 — DB + tick-convert
  - supabase/migrations/20261104200000_launch_piece_queue.sql
  - supabase/tests/launch_piece_queue.test.sql
  - supabase/tests/launch_gate.test.sql
  - supabase/tests/launch_fire_base_key.test.sql
  - supabase/tests/launch_project_mapping.test.sql
  - supabase/tests/tick_viewer.test.sql
  - workers/tick-convert/src/launch-queue.ts
  - workers/tick-convert/src/meta.ts
  - workers/tick-convert/src/select.ts
  - workers/tick-convert/src/modes/nightly.ts
  - workers/tick-convert/src/modes/backfill-launch.ts
  - workers/tick-convert/src/index.ts
  - workers/tick-convert/tests/launch-queue.test.ts
  - workers/tick-convert/tests/backfill-launch.test.ts
  - workers/tick-convert/tests/nightly.test.ts
  - workers/tick-convert/tests/entry.test.ts
  # Task 3 — 웹
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/__tests__/launch-format.test.ts
  - webapp/src/components/admin/launch-orders-tab.tsx
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
autonomous: true
requirements: ["261103-pei"]

estimate:
  tokens: 200000
  raw_tokens: 200000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "어드민 「발사」 → 주문 내역 16:00 탭의 조각 표 끝에 「대기열 (접수 때 · 마감 때)」 열이 있고, 접수 조각은 첫 줄 `N번째 · 앞 X주 · 금액`(접수 시점 · 정확) · 둘째 줄 작은 주황 `마감 앞 n건 · q주 · 금액 (추정)` 또는 `마감 — 취소됨` 이다 (D-1 · D-2)"
    - "09:00:30 탭(A KRX 09:00:27/29 다리 포함)의 끝 열 「체결 순번」 — 체결 조각은 `n번째 체결 · 앞 X주 · 금액` / `체결 a/b @ p~q`, 미체결은 `미체결 · 앞선 n건이 한도 안 X주 · 금액 가져감` / `적어도 n+1번째 이후` 이다 (D-1)"
    - "금액은 1억 이상 `x.xx억` · 미만 `n만`(반올림) · 값이 없으면(미계산 · 격자 없음 · 짝 못 찾음 · 거부 조각) 「—」 (D-1)"
    - "값은 tick-convert nightly 가 격자 바이트로 shared 순수 함수 한 벌(`launchQueueOf`)을 돌려 DB(`launch_piece_queue`)에 저장한다 — 웹 · 서버는 읽기만 한다(브라우저 계산 없음) (D-3)"
    - "shared 함수가 실측 골든을 재현한다 — 10/22 060900 KB #1·#3·#8·#14·#19·#23·#28 · 교보 #98·#99·#101 · 통계 369/14/90/165/6 · 10/30 184230 KB #9·#13·#17·#20·#25·#30 · 교보 #48·#52·#57 · 뒤탐침 #1~#6 · 앞 68,808주 등 · 마감 4건 30,560주 등 · 09:00 런 순번 · 미체결 4,861주 10.82억 등"
    - "그날 접수 조각의 ISIN 이 nightly 대상에 들어간다(출처 칩 없음) · 발사 값 계산 실패는 격자 변환 · 업로드 · 실행 기록 ok 에 영향이 없고 에러 로그로 남는다"
    - "`backfill-launch` 모드가 이미 있는 격자로 옛 날짜 값을 채우고, 격자가 없는 발사 키 수를 로그로 센다(변환 요청은 하지 않는다)"
  artifacts:
    - path: "packages/shared/src/ticks/launch-queue.ts"
      provides: "launchQueueOf + 순수 코어(fifoReplay · matchQueuePieces · aggressorRunsOf) — 16:00 대기열 · 09:00 체결 런"
    - path: "packages/shared/src/__tests__/ticks-launch-queue.golden.test.ts"
      provides: "CONTEXT 실측값 잠금(4개 컷 픽스처)"
    - path: "supabase/migrations/20261104200000_launch_piece_queue.sql"
      provides: "launch_piece_queue 표 + launch_queue_inputs · launch_queue_set · launch_queue_pending + tick_convert_candidates(launch) · launch_orders_for_admin(queue) 교체"
    - path: "workers/tick-convert/src/launch-queue.ts"
      provides: "gridLaunchOf — 실패 격리 · 로그(throw 안 함)"
    - path: "workers/tick-convert/src/modes/backfill-launch.ts"
      provides: "backfill-launch [--from] [--to] [--dry-run]"
    - path: "webapp/src/lib/launch-format.ts"
      provides: "fmtEokMan · launchQueueCellOf(목업 027 A 문구)"
  key_links:
    - from: "workers/tick-convert/src/modes/nightly.ts"
      to: "launch_queue_inputs · launch_queue_set RPC"
      via: "convertDay — candidates.launch 가 있으면 inputs 1회 → 키마다 gridLaunchOf(raw) → upsertGrids 뒤 set"
      pattern: "launchSet"
    - from: "supabase launch_orders_for_admin"
      to: "launch_piece_queue"
      via: "LEFT JOIN 7키 → 조각 jsonb 의 `queue`(없으면 null)"
      pattern: "launch_piece_queue"
    - from: "webapp/src/components/admin/launch-orders-tab.tsx"
      to: "launchQueueCellOf"
      via: "PiecesTable 끝 열 — fire 별 머리글"
      pattern: "launchQueueCellOf"
---

<objective>
발사 주문 내역(어드민 「발사」 → 주문 내역 탭)의 16:00 · 09:00:30 조각 행에 대기열 순번 · 앞 물량(주 · 금액)을 보인다 — 계산은 밤 틱 변환 Job 이 격자 바이트로 하고 DB 에 저장, 서버 · 웹은 읽기만 한다 (D-1 · D-2 · D-3).

Purpose: 트레이더가 「우리 16:00 예약이 대기열 몇 번째였고 앞에 얼마가 남았나」 · 「09:00:30 공격 주문이 몇 번째로 체결됐나 / 왜 못 받았나」 를 표 한 열로 바로 본다.
Output: shared 순수 함수 + 실측 골든 픽스처 · DB 표/RPC + tick-convert nightly 저장 · backfill-launch 모드 · 주문 내역 표 「대기열 / 체결 순번」 열.

분할 메모: quick 범위 상한(태스크 3 · 오케스트레이터 제시 분할)을 따른다 — shared → DB/워커 → 웹 순서로 순차 실행(병렬 없음 · 메인 트리 · worktree 없음).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261103-pei-launch-order-queue-position/261103-pei-CONTEXT.md
@.planning/sketches/027-launch-queue-position/index.html
@.planning/quick/261103-j4d-tick-list-team-day-net-pnl/261103-j4d-SUMMARY.md

# 따라 할 선례(읽고 같은 꼴로)
@packages/shared/src/ticks/team-day.ts
@packages/shared/src/ticks/own-fills.ts
@packages/shared/src/ticks/record-index.ts
@packages/shared/src/ticks/book.ts
@packages/shared/src/launch.ts
@workers/tick-convert/src/team-day.ts
@workers/tick-convert/src/modes/backfill-team.ts
@workers/tick-convert/src/modes/nightly.ts
@workers/tick-convert/src/meta.ts
@workers/tick-convert/src/select.ts
@supabase/migrations/20261030120000_launch_orders_filled_join.sql
@supabase/migrations/20261103230000_tick_grid_team_day.sql
@webapp/src/components/admin/launch-orders-tab.tsx
@webapp/src/lib/launch-format.ts

<design_decisions>
CONTEXT 밖 재량(planner) — executor 는 그대로 따른다. 바꿔야 하면 멈추고 SUMMARY 에 사유를 남긴다.

1. 저장 = 새 표 `launch_piece_queue`(launch_pieces 7키 PK + FK ON DELETE CASCADE). launch_pieces 칸을 늘리지 않는다 — 조각 행은 저널 투영 · `launch_reproject` 가 upsert 하는 정본이고, 대기열 값은 수명이 다르다(격자에서 계산 · 격자 경로 표식 · 재계산).
2. 칸(`LaunchPieceQueue` · DB 칸 이름 = TS 키): `kind`('queue' 16:00 | 'run' 09:00) · `matched`(false = 우리 조각/런을 격자에서 못 찾음 → 값 전부 null → 「—」) · `rank` · `ahead_n` · `ahead_qty` · `ahead_amt` · `end_state`('open' | 'cancelled' | 'filled') · `end_n` · `end_qty` · `end_amt` · `fill_qty` · `fill_px_min` · `fill_px_max` · `order_est`(게이트웨이 순서 추정 — design_decisions 3). 표에만 `object_path`(계산에 쓴 격자 · null = 너무 커서 안 올린 격자의 원시 바이트로 계산) · `computed_at`.
3. 게이트웨이 그룹 순서 = **실현 가능성으로 고른다**(오케스트레이터 결정 2026-11-03 — 서버 이름 고정 순서 금지). 같은 (종목, 가격) 에 게이트웨이가 둘 이상이면 게이트웨이 순열마다(실제는 2개 → 2가지) matchQueuePieces 를 돌려 **모든 조각이 짝지어지는 순열**을 쓴다. 각 게이트웨이 조각은 그 안에서 wire 순 부분열이어야 하므로 수량 패턴이 다르면 한 순열만 성립한다(실측: 10/22 교보 먼저면 KB 23333 이 #98 뒤로 밀려 18691 이 없음 · 10/30 교보 먼저면 KB 7766 이 #48 뒤에 없음 → 둘 다 KB 먼저만 성립). 둘 다 성립하면 matched 가 더 많은 쪽 → 그래도 같으면 `LAUNCH_ORDER` 순(KB120 → KYOBO119)을 쓰고 행에 `est`(추정) 표식을 둔다(LaunchPieceQueue 에 `order_est: boolean` 칸 — 화면은 첫 줄 끝에 「(추정)」). `sent_rel_us` 는 쓰지 않는다 — 실측 반례: 10/30 184230 교보 wire0 송신 rel −530µs < KB wire0 −352µs 인데 도착은 교보 #48 · KB #9. 순열 판정 단위 테스트(합성 사건 열: 패턴이 달라 한쪽만 성립 · 패턴이 같아 둘 다 성립 → est)를 넣는다.
4. 대상 조각 = `isLaunchAccept(result)`(접수) ∧ isin · side · price · qty 가 null 아님 ∧ profile ∈ {Q16, N, A}. 거부 조각은 대기열에 들어가지 않으므로 값이 없다(「—」). Q16 → 대기열 방식(보드 G4) · N/A → 체결 런 방식(보드 G1). 격자 거래소 = 조각 `fire_exchange`.
5. 레코드 순서 = 거래소순(`exchangeOrderOf(index, recvOrderOf(index))` — 틱뷰어 표준). 스파이크(queue.py)는 (수신 ns, seq) 순이었다. **골든이 정본**: 거래소순이 16:00 통계 · 마감 값을 재현하지 못하면 수신순으로 바꾸고 어느 쪽이 재현했는지 SUMMARY 에 적는다(순번 · 접수 때 앞은 두 순서에서 같아야 한다 — 다르면 멈추고 보고).
6. 「접수 때 앞」 = CONTEXT 그대로 — 직전 B6 의 같은 가격 잔량 + 그 B6 10단에 보이는 더 좋은 가격 단(매수 px > P · 매도 0 < px < P) 잔량. 금액 = 단마다 잔량 × 그 단 가격의 합. 「마감 때 앞(추정)」 = 같은 가격 FIFO 재구성만(CONTEXT 정의). 결과: 뒤탐침(1387)은 상한가 대기열이 「더 좋은 가격」 이라 접수 때 앞이 크게 나온다(목업은 0) — **오케스트레이터 결정: 이 규칙이 맞다**(더 좋은 가격 매수가 체결 우선이라 실제로 앞이다 · 목업 0 은 예시 오류). 골든은 뒤탐침 순번 + 접수 때 앞 = 직전 B6 의 2575 단 잔량 + 1387 단 잔량으로 잠근다. 「사용자 확인 필요」 로 올리지 않는다.
7. nightly 대상: `tick_convert_candidates` 응답에 `launch`(그날 접수 조각 ISIN · 중복 없음) 키를 더하고 `selectTargets` 가 출처 없는 대상(빈 집합 → `sources: []`)으로 넣는다 — 새 출처 칩을 만들지 않는 최소안(CHECK `sources <@ …` 는 빈 배열 통과 · 목록은 칩 없이 보인다). ISIN 단위다(대상 선별이 ISIN 단위 — 레코드가 있는 두 거래소 모두 격자).
8. `GRID_MAX_BYTES` 를 넘어 올리지 않는 격자(예: 삼성전자 — CONTEXT 가 든 예)도 이미 손에 있는 원시 바이트로 발사 값을 계산해 `object_path` null 로 저장한다.
9. 서버 무변경 — `getLaunchOrders` 는 RPC 응답을 그대로 넘긴다(매퍼 없음). server 재배포 불필요.
10. 미체결인데 1초 창 안 한도 안 런이 0건이면 문구 `미체결 · 1초 안 한도 안 체결 없음`(목업에 없는 경우 · 재량). 체결 조각의 앞 금액이 0 이면 금액을 생략한다(목업 `nA` 그대로 — `1번째 체결 · 앞 0주`).
11. 추정 줄 색 = `var(--vi)`(목업 `--est` 와 같은 #d97706 / 다크 #ffb020). globals.css 는 건드리지 않는다(동시 세션 미커밋 변경을 함께 커밋할 위험).
</design_decisions>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: shared 대기열 · 체결 런 순수 함수 + 실측 골든 픽스처(10/22 · 10/30)</name>
  <files>packages/shared/src/launch.ts, packages/shared/src/ticks/launch-queue.ts, packages/shared/src/ticks/index.ts, packages/shared/src/__tests__/ticks-launch-queue.test.ts, packages/shared/src/__tests__/ticks-launch-queue.golden.test.ts, packages/shared/src/__fixtures__/ticks/launch1022-krx-g4.ticks.zst, packages/shared/src/__fixtures__/ticks/launch1030-krx-g4.ticks.zst, packages/shared/src/__fixtures__/ticks/launch1030-krx-0900.ticks.zst, packages/shared/src/__fixtures__/ticks/launch1030-nxt-0900.ticks.zst, packages/shared/src/__fixtures__/ticks/README.md, scripts/tick-oracle/oracle.py, scripts/tick-oracle/gen-fixtures.sh</files>
  <precondition>로컬 원본 5개(`~/ticks/oracle/20261022/krx/20261022-1600.pcap.zst` · `20261022-1700.pcap.zst` · `~/ticks/queue-spike/1030/krx-1600.pcap.zst` · `krx-0900.pcap.zst` · `nxt-0900.pcap.zst`)와 gh-trade venv(`/Users/alex/repos/gh-trade/server/tools/analysis/.venv/bin/python`)가 있다 — 없으면 멈추고 보고.</precondition>
  <behavior>
    - fifoReplay(순수 · 사건 열): 증가 = 주문 추가(추가 번호 1부터) · 그 가격 체결은 쌓아 두었다가 감소 때 먼저 앞에서부터 소진(체결 이벤트 수 +1) · 남은 감소 = 남은 수량이 정확히 같은 주문 1개면 그것(정확취소) · 여럿이면 가장 뒤(모호취소) · 없으면 설명불가(무시 · 세기만) · 0 이 된 주문은 0 으로 만든 사건(체결 · 취소)을 기억
    - matchQueuePieces: 게이트웨이 순서 = design_decisions 3(순열 실현 가능성 · 동률이면 LAUNCH_ORDER + order_est) · 그룹 안 wire 순 · 직전 짝 뒤 · 이미 잡힌 이벤트 제외 · 증가분 == 조각 수량 인 첫 이벤트 · 못 찾으면 matched false 이고 다음 조각은 직전 짝 위치에서 계속
    - aggressorRunsOf: 같은 보드 거래소순에서 A3 가 직전 레코드도 A3 ∧ seq = 직전 + 1 ∧ 같은 bs 면 같은 런 · B6 · seq 틈 · bs 바뀜은 런을 끊음 · µs 간격 기준 없음
    - 런 위치: 매수 bs '2' · 매도 bs '1' · 시작(첫 A3 체결 시각) ≥ 발사 기준시각 · 우리 런 = (px, qty) 열이 우리 체결 열과 정확히 같은 첫 미점유 런 · 한도 안 = 매수 px ≤ 가격 · 매도 px ≥ 가격 · 미체결은 기준시각 + 1초 미만 시작 런만
    - 골든 10/22 KRX G4 060900(가격 2140 매수): KB wire 2·4·6·8·10·12·14 → 순번 1·3·8·14·19·23·28 · 교보 wire 0·2·4 → 98·99·101 · 2140 레벨 통계 추가 369 · 체결 14 · 정확취소 90 · 모호취소 165 · 설명불가 6 · KB wire 2 의 FIFO 체결 소진 합 4,405(= 그날 filled_qty)
    - 골든 10/30 KRX G4 184230(2575 매수 · 16:00~16:59 원본): KB wire 0~5 → 9·13·17·20·25·30 · 접수 때 앞 wire 0~4 = 68,808 · 109,238 · 144,630 · 177,272 · 224,323주(금액 = 주 × 2575) · 마감 wire 0 open 4건 30,560주 · wire 1 open 5건 47,226주 · wire 2 open 6건 54,992주 · wire 3 · 4 cancelled · 교보 wire 0·1·2 → 48·52·57 · 앞 547,600 · 640,028주 · 교보 wire 0 · 1 cancelled · 뒤탐침(1387) KB wire 6·7·8 → 1·2·3 · 교보 wire 3·4·5 → 4·5·6 · 2575 레벨 통계 265 · 16 · 98 · 51 · 4
    - 골든 10/30 NXT 09:00:30: KB 425420 매수 59 → 1번째 · 앞 0 · 체결 59 · 84,300~84,500 / 376900 매도 281 → 1번째 · 체결 281 @ 18,000 / 095340 매수 20 → 2번째 · 앞 2주 · 318,000원 · 체결 18 · 159,300~160,100 / 005930 매수 22@222,500 미체결 → 앞선 1건 · 4,861주 · (금액/1e8).toFixed(2) = '10.82' / 012450 매도 7@723,000 미체결 → 3건 · 134주 · '0.98' / 010140 매수 326@15,310 미체결 → 1건 · 3,417주
    - 골든 10/30 KRX A: KB 376900 매수 281 · 033640 208 · 272210 81 · 010060 25 · 012450 7(09:00:27) · 교보 249420 74 · 222800 8 · 445680 16(09:00:29) = 각각 1번째 · 교보 376900 매수 56@17,770(09:00:27) 미체결 → ahead_n ≥ 1 ∧ ahead_qty ≥ 179(KB 런 중 17,770 이하 16+4+159 — 「KB(우리)가 먼저 가져감」)
  </behavior>
  <action>
(A) 타입 — `packages/shared/src/launch.ts` 행 절에 `LaunchQueueKind`('queue' | 'run') · `LaunchQueueEndState`('open' | 'cancelled' | 'filled') · `LaunchPieceQueue`(design_decisions 2 의 13칸 · 칸마다 한 줄 JSDoc — 단위 원 · 주)를 더하고 `LaunchPieceRow` 에 `queue?: LaunchPieceQueue | null`(응답 전용 · 표 열 아님 · 키 없음 = 옛 RPC — 선택 필드라 기존 테스트 픽스처가 깨지지 않는다)를 더한다. 파일 머리 주석에 한 줄(quick-261103-pei — 주문 내역 RPC 가 launch_piece_queue 를 `queue` 로 싣는다).

(B) `packages/shared/src/ticks/launch-queue.ts`(새 · `ticks/index.ts` 배럴에 한 줄) — 머리 주석에 CONTEXT 규칙 · design_decisions 3~6 · 「계산 정본 한 벌(워커만 부른다 · 브라우저 계산 금지 D-3)」 을 적는다. own-fills.ts · team-day.ts 처럼 typed array · 인덱스 한 번 · 행 객체 최소. 구조:
- 입력 `LaunchQueuePieceIn` = gateway · profile · fire_exchange · fire_base('HH:MM:SS') · market · wire · side('buy' | 'sell') · isin · price · qty · fills(우리 체결 [px, qty] 쌍 배열 · 저널 순서 gw_time, seq).
- 진입 `launchQueueOf(buf, ex, date, pieces)` → 입력과 같은 순서의 `{ piece, value: LaunchPieceQueue | null }` 배열(null = profile 밖 · design_decisions 4). 모든 조각의 isin 이 같아야 한다(격자 = 한 ISIN · 아니면 RangeError). `buildTickIndex(buf, ex 소문자)` · 거래소순 · `a3ColumnsOf` 를 한 번 만들고, B6 isin 은 오프셋 17(team-day.ts `ISIN_OFF_QUOTE` 와 같은 상수)로 확인해 다른 ISIN 레코드는 건너뛴다. 기준시각 ns = `parseTickTime(fire_base, date)`.
- 16:00(Q16 · G4): (side, price) 레벨마다 한 번 재생 — 그 보드 · 수신 ≥ 기준시각 인 B6 · A3 를 거래소순으로. B6 마다 `bookAt` 으로 그 방향 10단을 읽어 cur(가격 == P 인 단 잔량 · 없으면 0)와 더 좋은 가격 단 합(잔량 · 금액)을 얻고 d = cur − prev(처음 prev 0) → B 사건. A3 가격 == P 이면 A 사건(체결 수량). 사건 열을 순수 코어 `fifoReplay` 에 넣어 추가 이벤트 목록(증가분 · 직전 B6 의 P 잔량 · 더 좋은 단 잔량 · 금액) · 주문 최종 상태(rem · 0 으로 만든 사건) · 통계 {adds, fills, cancelExact, cancelAmbig, cancelNone} 를 얻는다. 조각 짝은 `matchQueuePieces`(behavior 규칙 · 게이트웨이 순서는 `LAUNCH_ORDER` 에서 유도). 값: rank = 추가 번호 · ahead_qty = 직전 B6 P 잔량 + 더 좋은 단 잔량(첫 B6 이면 0) · ahead_amt = P 잔량 × P + 더 좋은 단 금액 · 우리 주문 rem 0 이면 end_state = 0 으로 만든 사건이 취소면 'cancelled' · 체결이면 'filled'(end_n · qty · amt null) · 아니면 'open' + end_n = 우리 앞 rem > 0 주문 수 · end_qty = 그 rem 합 · end_amt = end_qty × P · ahead_n · fill_* null. 레벨에 B6 가 없거나 짝을 못 찾으면 matched false · 나머지 null. 레벨 재생 결과(통계 포함)를 테스트가 볼 수 있게 `q16LevelOf`(또는 같은 뜻의 이름)로 내보낸다.
- 09:00(N · A · G1): `aggressorRunsOf` 로 그 보드 런 목록(방향 · 시작 ns · [px, qty] 열)을 만든다. 조각 처리 순서 = (fire_base, 게이트웨이 순서, wire) · 런 점유는 조각끼리 공유. fills 가 비어 있지 않으면 같은 방향 ∧ 시작 ≥ 기준시각 인 후보 런 중 미점유 ∧ 열이 정확히 같은 첫 런 → rank = 후보 중 몇 번째(1부터) · ahead = 우리 런 앞 후보 런들의 한도 안 체결 수량 합 · 금액 합(Σ px × qty) · ahead_n = 그중 한도 안 체결이 있는 런 수 · fill_qty = fills 수량 합 · fill_px_min/max · matched true(못 찾으면 matched false · 값 null). fills 가 비면 rank null · 시작 ∈ [기준, 기준 + 1초) 후보 런들의 한도 안 합으로 ahead_n · ahead_qty · ahead_amt · fill_qty 0 · fill_px null · matched true. end_* null. 런 시작 시각 = 첫 A3 의 체결 시각 tNs(−1n 이면 수신 ns).

(C) 픽스처 생성 — `scripts/tick-oracle/oracle.py` 에 부명령 `launchcut`(`--pcap` 여러 번 · `--date YYYYMMDD` · `--isins I1,I2,…` · `--board G4` 선택 · `--from HH:MM:SS[.fff]` · `--to HH:MM:SS[.fff]`(수신 시각 KST · 생략 = 끝까지) · `--out <.ticks.zst>`)를 `extract_isin_a3` 와 같은 프레임 판정으로 만든다: 태그 A3 · B6 ∧ 오프셋 17 ISIN ∈ 집합 ∧ (보드 지정 시 오프셋 13 일치) ∧ 수신 창 → 레코드 프레이밍 이어 붙여 zstd 19 한 프레임. 표준오류에 ISIN 별 A3 · B6 수 · 바이트. 결정적(같은 원본 = 같은 바이트). `gen-fixtures.sh` 에 `launch` 부명령(사용법 머리 주석 · case · 1.5MB 초과 시 종료 1 — 기존 decode 루프 꼴):
  · launch1022-krx-g4 = 20261022-1600 · 1700 · KR7060900008 · G4 · from 15:59:00
  · launch1030-krx-g4 = queue-spike/1030/krx-1600 · KR7184230001 · G4 · from 15:59:00
  · launch1030-krx-0900 = krx-0900 · KR7376900007 KR7033640004 KR7272210006 KR7010060002 KR7012450003 KR7249420001 KR7222800005 KR7445680002 · 09:00:26 ~ 09:00:31.500
  · launch1030-nxt-0900 = nxt-0900 · KR7425420007 KR7376900007 KR7095340006 KR7005930003 KR7012450003 KR7010140002 · 09:00:29.500 ~ 09:00:32
  `bash scripts/tick-oracle/gen-fixtures.sh launch` 를 한 번 돌려 4파일을 만든다. `__fixtures__/ticks/README.md` 재생성 절에 한 줄.

(D) 테스트(먼저 쓰고 빨강 확인 → 구현):
- `ticks-launch-queue.test.ts`(바이트 없는 순수 코어) — behavior 첫 네 줄 각각 작은 사건 열/런 열로(체결 앞에서부터 · 정확/모호/설명불가 · 0 만든 사건 · 게이트웨이 순서 · 점유 · seq 틈 · bs 바뀜 · B6 끊김 · 한도 매수/매도 · 1초 창 경계).
- `ticks-launch-queue.golden.test.ts` — `helpers/tick-digest.ts` `readTicksZst` 로 4파일을 읽는다. 0900 두 파일은 여러 ISIN 이라 테스트 안 작은 도우미가 `framing.ts` 레코드 순회로 ISIN(오프셋 17)별 바이트를 나눠 ISIN 마다 `launchQueueOf` 를 부른다(실제 격자 = ISIN 하나). 조각 입력은 테스트 안 상수 — 값은 scratchpad JSON(`/private/tmp/claude-501/-Users-alex-repos-gh-radar/7b09e0db-d37a-4e56-8b5d-e148c08a0f41/scratchpad/` 의 accepted.json · n1030pieces.json · a1030pieces.json · fills1030.json · afills.json — 체결은 (gateway, order_no) 로 묶고 gw_time 오름차순 · 동률은 파일 순서)에서 옮기고, 키 칸(profile · market · fire_base · fire_exchange)이 비면 같은 디렉터리 `q.sh` 로 `launch_pieces` 를 읽기 전용 조회해 채운다. 계좌 · dma_user_id 는 싣지 않는다. 기대값 = behavior 골든 다섯 줄(CONTEXT · 목업 실측값 그대로 — 손으로 바꾸지 않는다 · 틀리면 design_decisions 5 순서 대안만 시도 · 그래도 다르면 멈추고 보고). 10/30 G4 비뒤탐침 조각은 ahead_amt = ahead_qty × 2575 도 단언(더 좋은 단 0).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-launch-queue.test.ts src/__tests__/ticks-launch-queue.golden.test.ts --maxWorkers=2 && test "$(ls packages/shared/src/__fixtures__/ticks/launch10*.ticks.zst | wc -l | tr -d ' ')" = "4" && test "$(find packages/shared/src/__fixtures__/ticks -name 'launch10*.ticks.zst' -size +1536k | wc -l | tr -d ' ')" = "0"</automated>
  </verify>
  <done>픽스처 4개(각 ≤ 1.5MB)가 생성기로 재생성 가능하고, 순수 코어 단위 테스트 + 골든(behavior 실측값 전부)이 통과한다. `LaunchPieceRow.queue` 선택 필드 · `LaunchPieceQueue` 가 shared 에서 export 된다. 이 태스크 files 경로만 커밋(한글 메시지 · Co-Authored-By 없음 · push 금지) — 예 「feat(shared): 발사 조각 대기열 순번 · 체결 런 순번 순수 함수 + 10/22 · 10/30 실측 골든」.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: DB launch_piece_queue + RPC 5개 · tick-convert nightly 저장 · backfill-launch 모드</name>
  <files>supabase/migrations/20261104200000_launch_piece_queue.sql, supabase/tests/launch_piece_queue.test.sql, supabase/tests/launch_gate.test.sql, supabase/tests/launch_fire_base_key.test.sql, supabase/tests/launch_project_mapping.test.sql, supabase/tests/tick_viewer.test.sql, workers/tick-convert/src/launch-queue.ts, workers/tick-convert/src/meta.ts, workers/tick-convert/src/select.ts, workers/tick-convert/src/modes/nightly.ts, workers/tick-convert/src/modes/backfill-launch.ts, workers/tick-convert/src/index.ts, workers/tick-convert/tests/launch-queue.test.ts, workers/tick-convert/tests/backfill-launch.test.ts, workers/tick-convert/tests/nightly.test.ts, workers/tick-convert/tests/entry.test.ts</files>
  <precondition>docker 데몬이 떠 있다(`docker info` 성공) — pgTAP 는 일회용 로컬 컨테이너에서만 돈다. 꺼져 있으면 Docker Desktop 을 직접 띄운다(묻지 말 것).</precondition>
  <behavior>
    - pgTAP: 새 함수 3 + 교체 2(launch_queue_inputs · launch_queue_set · launch_queue_pending · tick_convert_candidates · launch_orders_for_admin) anon · authenticated EXECUTE 없음 · service_role 있음 · launch_piece_queue 는 anon · authenticated SELECT 없음
    - pgTAP: inputs = 그날 접수 ∧ 대상 profile 조각만 + 조각별 fills(dma_journal_events E ∧ exec_qty > 0 ∧ gateway · trade_date · order_no 일치 ∧ (조각 account null 또는 account_no 일치) · gw_time, seq 순 · order_no null 이면 [])
    - pgTAP: set = 있는 조각에만 upsert(없는 키는 0) · object_path null 이거나 같은 (date, fire_exchange, 조각 isin) tick_grids.object_path 와 같을 때만 · 다시 부르면 값 덮음 · 반환 = 쓴 행 수 · CHECK(kind · end_state 값) 위반은 오류
    - pgTAP: pending = 대상 조각이 있는데 그 격자 object_path 로 계산된 값이 없는 tick_grids 행(date 내림차순 · 범위) + no_grid = 격자도 값도 없는 (날짜, 거래소, isin) 수 · candidates 에 launch 키 · 주문 내역 조각마다 queue(값 있으면 13칸 · 없으면 null)
    - 워커: gridLaunchOf 는 throw 하지 않는다 — 계산 throw 면 그 키 행 없음 + logger.error(date · ex · isin · mode · err) · matched false 가 있으면 info 한 줄(수)
    - 워커 nightly: candidates.launch 가 비어 있으면 inputs RPC 를 부르지 않는다 · launch 전용 ISIN 은 sources [] 로 격자 · upsertGrids 뒤 launch_queue_set(50행 묶음) · inputs/set 실패는 day.failed · 실행 기록 ok 를 바꾸지 않고 에러 로그 + launch_failed · 너무 큰 격자는 object_path null 행
    - 워커 backfill-launch: 실제 G4 픽스처 바이트로 set 행 값 = launchQueueOf 결과(KB wire 0 rank 9) · dry-run 은 set 안 부름 · 날짜마다 inputs 1회 · no_grid 로그 · 다운로드/inputs/set 실패 = failed(종료 1) · 시간 예산 deferred · 인자 오류 UsageError
  </behavior>
  <action>
(A) 마이그레이션 `supabase/migrations/20261104200000_launch_piece_queue.sql` — 저장소 관례 머리 주석(무엇 · 왜 · 칸 의미 · 권한 · 원격 적용 「커밋만 — 메인 세션 db push」 · 되돌리기 DROP 목록), BEGIN/COMMIT 한 덩어리:
  ① 표 `public.launch_piece_queue` — launch_pieces 7키(trade_date date · gateway · profile · fire_exchange · fire_base time · market · wire) PK + 같은 7칸 FK → launch_pieces ON DELETE CASCADE · object_path text null · design_decisions 2 값 칸(수량 · 금액 bigint · 순번 · 건수 integer) · computed_at timestamptz NOT NULL DEFAULT now() · CHECK(kind ∈ queue/run · end_state null 또는 open/cancelled/filled · kind run 이면 end_* null · kind queue 면 fill_* null · rank null 또는 ≥ 1). launch_pieces 와 같은 권한 꼴: RLS ENABLE · 정책 0 · REVOKE ALL FROM PUBLIC 과 FROM anon, authenticated · GRANT SELECT/INSERT/UPDATE/DELETE TO service_role. 칸 COMMENT.
  ② `launch_queue_inputs(p_date text)` RETURNS jsonb(배열) — behavior 규칙 · 칸 {trade_date 'YYYYMMDD', gateway, profile, fire_exchange, fire_base 'HH24:MI:SS', market, wire, side, isin, price, qty, fills [[px, qty], …]} · 정렬 fire_exchange, isin, fire_base, gateway, wire. 저널 칸 이름은 20261104100000 tick_own_for_user 와 같다(notice_type · exec_price · exec_qty · gw_time · seq · account_no).
  ③ `launch_queue_set(p_rows jsonb)` RETURNS integer — 배열 검사 · jsonb_to_recordset · launch_pieces JOIN(7키 · trade_date 는 to_date 'YYYYMMDD' · fire_base ::time) · object_path 가드(behavior) · ON CONFLICT 7키 DO UPDATE(값 전부 · object_path · computed_at = now()) · ROW_COUNT 반환.
  ④ `launch_queue_pending(p_from text DEFAULT NULL, p_to text DEFAULT NULL)` RETURNS jsonb {grids: [{date, exchange, isin, object_path, bytes}], no_grid: n} — 대상 조각 = design_decisions 4 와 같은 조건.
  ⑤ `tick_convert_candidates(p_date)` CREATE OR REPLACE — 20261102200100 본문 그대로 + `'launch'`(그날 접수 ∧ isin 비지 않음 · DISTINCT · 정렬) · COMMENT 갱신.
  ⑥ `launch_orders_for_admin(p_date)` CREATE OR REPLACE — 20261030120000 본문 그대로 + launch_piece_queue LEFT JOIN(7키) · 조각 jsonb_build_object 에 `'queue'`(조인 행 없으면 null · 있으면 to_jsonb(q) 에서 7키 · object_path · computed_at 을 뺀 13칸) · COMMENT 끝에 한 구절.
  모든 함수: LANGUAGE · STABLE/VOLATILE 알맞게 · SECURITY INVOKER · SET search_path = public, pg_temp · 함수마다 `REVOKE EXECUTE … FROM PUBLIC;` 와 `REVOKE EXECUTE … FROM anon, authenticated;` 두 줄 + GRANT service_role(자동 메모리 feedback_supabase_rpc_revoke — 5함수 × 2 = REVOKE EXECUTE 10줄).

(B) pgTAP `supabase/tests/launch_piece_queue.test.sql` — 실행법 머리 주석(`bash scripts/verify-dma-orders-price-check.sh --test …`) · 한 트랜잭션 + ROLLBACK · launch_pieces · dma_journal_events · tick_grids 삽입은 기존 launch_gate.test.sql · tick_own.test.sql · tick_grid_team_day.test.sql 꼴(키 · 사용자 값은 겹치지 않게). behavior pgTAP 네 줄을 단언. 기존 launch_gate · launch_fire_base_key · launch_project_mapping · tick_viewer 테스트가 주문 내역 조각 · candidates 응답을 정확 비교해 깨지면 기대 jsonb 에 `"queue": null` · `"launch": []` 만 더한다(단언 수가 바뀌면 plan() 숫자도).

(C) 워커:
  · `meta.ts` — 머리 주석 표에 3줄 · `Candidates` 에 `launch: string[]`(키 없음 = 옛 RPC → [] + logger.warn 한 번 · 있는데 문자열 배열이 아니면 throw) · `launchInputs(date)` · `launchSet(rows)` · `launchPending(from, to)` 래퍼(모양 검사 · error → throw — 기존 래퍼 꼴) · 행 타입 `LaunchInputRow`(shared `LaunchQueuePieceIn` + trade_date) · `LaunchSetRow`(7키 + object_path + `LaunchPieceQueue`) · `LaunchPendingOut`.
  · `select.ts` — `selectTargets` 가 cands.launch ISIN 을 빈 출처 집합으로 넣는다(이미 있으면 그대로) · 머리 주석 한 줄(design_decisions 7).
  · `launch-queue.ts`(새) — workers/tick-convert/src/team-day.ts 꼴: `gridLaunchOf(raw, ex, date, pieces, ctx, compute = launchQueueOf)` → `{ rows, ms, ok, unmatched }`(rows = value 가 null 아닌 조각의 LaunchSetRow · object_path 는 호출자가 채운다) · 절대 throw 안 함 · 무로그 fail-safe 금지 · 느림(> 1초) info.
  · `modes/nightly.ts` — convertDay: candidates 뒤 launch 가 있으면 `launchInputs(date)` 1회(실패 = 에러 로그 · 그 날짜 발사 값만 건너뜀) → `${isin}|${fire_exchange}` 로 묶음. 키 루프에서 `buildGridFile` 직후 · too-large `continue` 전에 묶음이 있으면 gridLaunchOf(object_path = 크기 초과면 null · 아니면 path). ⑤ upsertGrids 뒤 모은 행을 50행씩 `launchSet`(실패 = 에러 로그 · launchFailed — errs · day.failed 에 넣지 않는다). `ExchangeResult` 에 `launchRows` · `launchFailed` · 요약 로그 줄에 `launch=… launch_failed=…`. 머리 주석 ④ 에 한 문단.
  · `modes/backfill-launch.ts`(새) — backfill-team.ts 를 그대로 본뜬다: 인자 `[--from] [--to] [--dry-run]`(UsageError 규칙 같음) · ① pending → no_grid 를 warn 로그(「격자 없는 발사 키 n — 범위 밖 · 세기만」) ② 격자마다 순차 다운로드 → zstdDecompressSync → 그 날짜 inputs(날짜별 캐시 · 실패면 그 날짜 격자 전부 failed) 중 (exchange, isin) 조각 → gridLaunchOf(object_path = 격자 경로) ③ 50행 묶음 set(dry-run 은 행을 info 로그) · 시간 예산 deferred · 요약 한 줄 `mode=backfill-launch pending=… computed=… written=… launch_failed=… failed=… deferred=… no_grid=… dry_run=…` · Outcome 타입.
  · `index.ts` — MODES 에 `backfill-launch` · CLI 머리 주석 한 줄 · BOOL_FLAGS 주석(두 모드 공용).

(D) 워커 테스트 — `launch-queue.test.ts`(정상 · compute throw · 이상 · unmatched 로그) · `backfill-launch.test.ts`(backfill-team.test.ts 꼴 · Storage 가짜가 `launch1030-krx-g4.ticks.zst` 를 돌려줌 · inputs 가짜가 10/30 184230 KB/교보 조각 몇 개 · set 행 값 = 같은 바이트로 shared launchQueueOf 를 부른 값 ∧ KB wire 0 rank 9 · dry-run · 실패 · 예산 · CLI 종료 코드) · `nightly.test.ts`(candidates 에 launch 키 · 비등록 ISIN 이 sources [] 격자 · inputs → set 순서가 upsert 뒤 · inputs 실패/set 실패에도 실행 기록 ok · launch 키 없는 옛 응답 = 기존 기대 그대로 · ExchangeResult 새 칸 반영) · `entry.test.ts`(새 모드 디스패치 · 인자 오류 종료 2).

커밋(경로 지정 · `.planning/*` · milestone.lock 제외): 「feat(tick-convert,db): 발사 조각 대기열 · 체결 순번을 밤 변환에서 계산해 저장 + backfill-launch 모드 · 주문 내역 RPC queue」.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/tick-convert run typecheck && pnpm --filter @gh-radar/tick-convert exec vitest run --maxWorkers=2 && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_piece_queue.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_fire_base_key.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_project_mapping.test.sql && bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/tick_viewer.test.sql && test "$(grep -v '^[[:space:]]*--' supabase/migrations/20261104200000_launch_piece_queue.sql | grep -c 'REVOKE EXECUTE')" = "10"</automated>
  </verify>
  <done>마이그레이션이 로컬 재생되고 pgTAP 5파일 통과(REVOKE EXECUTE 10줄). 워커 vitest 전부 통과 — nightly 저장 · 실패 격리 · 옛 응답 호환 · backfill-launch(실제 G4 픽스처로 rank 9) · CLI. 이 태스크 files 경로만 커밋(push · 배포 금지).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: 주문 내역 표 「대기열 (접수 때 · 마감 때)」 · 「체결 순번」 열(목업 027 A)</name>
  <files>webapp/src/lib/launch-format.ts, webapp/src/lib/__tests__/launch-format.test.ts, webapp/src/components/admin/launch-orders-tab.tsx, webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx</files>
  <behavior>
    - fmtEokMan: 177,180,600 → '1.77억' · 1,081,572,500 → '10.82억' · 100,000,000 → '1.00억' · 78,692,000 → '7,869만' · 318,000 → '32만' · 0 → '0만'
    - queue open: `9번째` + ` · 앞 68,808주 · 1.77억` / 주황 `마감 앞 4건 · 30,560주 · 7,869만 (추정)` · cancelled → 회색 `마감 — 취소됨` · filled → 둘째 줄 없음
    - run 체결: `2번째 체결` + ` · 앞 2주 · 32만` / `체결 18/20 @ 159,300~160,100` · 앞 금액 0 → ` · 앞 0주`(금액 생략) · px 같으면 `@ 18,000`
    - run 미체결: 빨강 `미체결` + ` · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감` / `적어도 2번째 이후` · ahead_n 0 → ` · 1초 안 한도 안 체결 없음`(둘째 줄 없음)
    - queue 없음(undefined · null) · matched false → null(칸은 「—」)
    - 표: 16:00 머리글 「대기열 (접수 때 · 마감 때)」 · 09:00:30 머리글 「체결 순번」 · 열은 「주문번호」 뒤 마지막 · 추정 줄은 var(--vi) 색
  </behavior>
  <action>
(A) `webapp/src/lib/launch-format.ts` — 머리 주석 ①~③ 다음에 ④ 한 줄(대기열 열 = 목업 027 변형 A · 값은 DB 저장값만 · D-1 · D-3). `fmtEokMan(won)`(D-1 금액 규칙 — 1억 이상 `(w/1e8).toFixed(2)+'억'` 뜻 · 미만 ko-KR 천 단위 `Math.round(w/1e4)+'만'` 뜻 · 파일의 기존 NUM 포맷터 재사용)와 `launchQueueCellOf(p: Pick<LaunchPieceRow, 'qty' | 'queue'>)` → `{ lead, leadTone: 'bad' | null, rest, sub, subTone: 'est' | 'dim' } | null` 를 더한다. 문구는 behavior 그대로(목업 `q16A` · `nA` 함수가 정본 · 체결 n/m 의 m = 조각 qty · 금액은 저장된 ahead_amt · end_amt 를 쓴다 — 주 × 가격을 다시 곱하지 않는다(더 좋은 단 금액 포함 · design_decisions 6)). kind 로 분기하고 fire 에 의존하지 않는다.

(B) `webapp/src/components/admin/launch-orders-tab.tsx` `PiecesTable` — 머리글 끝(「주문번호」 뒤)에 `<th className={TH}>` 하나(q16 이면 「대기열 (접수 때 · 마감 때)」 · 아니면 「체결 순번」), 행 끝에 칸 하나: cell null 이면 DIM 「—」, 아니면 `<b>`(font-semibold · leadTone bad 면 `text-[var(--launch-bad)]`) lead + rest + sub 가 있으면 block 작은 줄(10.5px · subTone est 면 `text-[var(--vi)]` · dim 이면 `text-[var(--muted-fg)]`). 추정 색 상수에 주석(목업 `--est` 와 같은 값을 `--vi` 에서 빌린다 · design_decisions 11). 폰은 기존 표 가로 스크롤 그대로(목업 A 설명) — 레이아웃 다른 곳은 바꾸지 않는다. 손보는 표면 안 줄바꿈 · 잘림이 보이면 바로 고치고 SUMMARY 에 한 줄.

(C) 테스트 — `launch-format.test.ts` 에 behavior 1~5줄 · `launch-orders-tab.test.tsx` 의 기존 `piece()` 도우미로 queue 있는/없는 조각을 넣어 16:00 · 09:00:30 각 머리글 · 두 줄 문구 · 추정 줄 클래스(var(--vi)) · 「—」 를 단언(기존 단언은 열 수가 늘어 깨지면 그 부분만 맞춘다).

커밋(경로 지정): 「feat(webapp): 발사 주문 내역 대기열 순번 · 앞 물량 열(접수 때 정확 · 마감 때 추정 · 09:00:30 체결 순번) — 목업 027 A」.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch-format.test.ts src/components/admin/__tests__/launch-orders-tab.test.tsx --maxWorkers=2</automated>
  </verify>
  <done>두 탭에 끝 열이 목업 A 문구 · 색으로 나오고 값 없는 조각은 「—」. server · webapp typecheck 와 두 테스트 파일 통과(e2e 전체 실행 없음). 이 태스크 files 경로만 커밋(push 금지).</done>
</task>

</tasks>

<verification>
- 태스크별 `<automated>` 를 순서대로 모두 녹색(2 는 1 의 shared 함수 · 3 은 1 의 타입과 2 의 RPC 키를 쓴다).
- 골든: CONTEXT 실측값(behavior 골든 줄)을 손대지 않고 재현 — 순서 대안(design_decisions 5)을 썼다면 SUMMARY 에 기록.
- DB: 새/교체 함수 5개 REVOKE PUBLIC · anon/authenticated + GRANT service_role · 표 RLS 정책 0 · pgTAP 5파일 통과.
- 실패 격리: nightly 테스트가 inputs/set 실패 · 계산 throw 에도 격자 업로드 · upsert · 실행 기록 ok 가 그대로임을 단언.
- 커밋 3개 · 각 커밋에 그 태스크 경로만(`git show --stat` 로 `.planning/*` · milestone.lock · 남의 파일 없음 확인 · `git add -A` 금지 · 커밋 직전 `git status -sb` 재확인).
- vitest 는 `--maxWorkers=2` · e2e 전체 실행 없음(동시 세션 메모리).
</verification>

<success_criteria>
- 16:00 · 09:00:30 주문 내역 행이 목업 027 A 대로 「순번 · 앞 물량(주 · 금액)」 두 줄을 보인다(D-1 · D-2).
- 값은 밤 변환이 shared `launchQueueOf` 로 계산해 `launch_piece_queue` 에 저장한 것만 쓴다(D-3) · 발사 종목은 nightly 대상(칩 없음) · 계산 실패는 변환을 막지 않고 로그.
- backfill-launch 로 이미 있는 격자의 옛 날짜를 채울 수 있다(격자 없는 수는 로그로만).
</success_criteria>

<output>
`.planning/quick/261103-pei-launch-order-queue-position/261103-pei-SUMMARY.md` 를 쓴다(커밋은 오케스트레이터 · executor 는 코드 커밋만). SUMMARY 에 다음을 남긴다: 골든 재현 순서(거래소순 / 수신순) · 뒤탐침 접수 때 앞 값(design_decisions 6 — 「사용자 확인 필요」) · 픽스처 4개 바이트 · 아래 배포 체크리스트.

## 메인 세션 배포 체크리스트 (executor 는 하지 않음 · 서브에이전트 배포 금지)

1. 마이그레이션 — `supabase db push --linked --yes`. 옆 세션이 더 늦은 타임스탬프를 먼저 올려 out-of-order 로 거부되면 파일을 더 늦은 타임스탬프로 이름만 바꾸고 pgTAP 5파일을 다시 돌린 뒤 push.
2. tick-convert 재배포 — `bash scripts/deploy-tick-convert.sh`(nightly/request Job · promote Job 같은 이미지 · env 는 라이브 Cloud Run 에서 추출 — 메모리 「워커 배포 스크립트 env」). 마이그레이션이 먼저다(옛 RPC 면 launch 키 없음 → 워커는 []로 진행하지만 set RPC 가 없다).
3. 백필 — 23:30 · 01:30 nightly 창을 피해서: `gcloud run jobs execute gh-radar-tick-convert --region asia-northeast3 --args=backfill-launch,--dry-run --wait` → 로그의 키별 값 · `no_grid` 확인 → `--args=backfill-launch` 본 실행 → 요약 `launch_failed=0 failed=0 deferred=0` · 다시 dry-run 하면 `pending=0`. 10/22 처럼 격자가 없는 날짜는 `no_grid` 로만 센다(범위 밖).
4. server — 재배포 불필요(RPC 응답 통과 · 매퍼 없음).
5. 웹 — git push(= Vercel 프로덕션 배포). 웹은 배포 순서와 무관하게 안전(queue 키 없음 = 「—」).
6. 확인 — 어드민 「발사」 → 주문 내역 10/30: 09:00:30 탭 ISC 095340 KB 행 `2번째 체결 · 앞 2주 · 32만` / `체결 18/20 @ 159,300~160,100` · 삼성전자 005930 KB 행 `미체결 · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감`. 16:00 탭 SGA솔루션즈 184230 KB wire 0 `9번째 · 앞 68,808주 · 1.77억` (실서버 격자는 18:00 까지라 마감(추정) 줄은 목업 16:59 값과 다를 수 있다 — 정상).
</output>
