---
phase: quick-261103-pei
plan: 01
status: complete
subsystem: launch-admin / ticks / tick-convert
tags: [launch, tick-convert, queue-position, golden, pgtap]
requires: [launch_pieces, tick_grids, dma_journal_events, shared ticks record-index · book]
provides:
  - "packages/shared launchQueueOf · fifoReplay · matchQueuePieces · aggressorRunsOf · runValueOf · q16LevelOf"
  - "launch_piece_queue 표 + launch_queue_inputs · launch_queue_set · launch_queue_pending · candidates.launch · 주문 내역 queue"
  - "tick-convert nightly 발사 값 저장 · backfill-launch 모드"
  - "주문 내역 「대기열 (접수 때 · 마감 때)」 · 「체결 순번」 열"
affects: [admin 발사 주문 내역, tick-convert nightly 대상(발사 ISIN 추가)]
tech-stack:
  added: []
  patterns: ["shared 순수 함수 한 벌 + 워커만 계산(D-3)", "격자 경로 가드 set", "실측 골든 픽스처(oracle.py launchcut)"]
key-files:
  created:
    - packages/shared/src/ticks/launch-queue.ts
    - packages/shared/src/__tests__/ticks-launch-queue.test.ts
    - packages/shared/src/__tests__/ticks-launch-queue.golden.test.ts
    - packages/shared/src/__fixtures__/ticks/launch1022-krx-g4.ticks.zst
    - packages/shared/src/__fixtures__/ticks/launch1030-krx-g4.ticks.zst
    - packages/shared/src/__fixtures__/ticks/launch1030-krx-0900.ticks.zst
    - packages/shared/src/__fixtures__/ticks/launch1030-nxt-0900.ticks.zst
    - supabase/migrations/20261104200000_launch_piece_queue.sql
    - supabase/tests/launch_piece_queue.test.sql
    - workers/tick-convert/src/launch-queue.ts
    - workers/tick-convert/src/modes/backfill-launch.ts
    - workers/tick-convert/tests/launch-queue.test.ts
    - workers/tick-convert/tests/backfill-launch.test.ts
  modified:
    - packages/shared/src/launch.ts
    - packages/shared/src/ticks/index.ts
    - packages/shared/src/__fixtures__/ticks/README.md
    - scripts/tick-oracle/oracle.py
    - scripts/tick-oracle/gen-fixtures.sh
    - supabase/tests/tick_viewer.test.sql
    - workers/tick-convert/src/meta.ts
    - workers/tick-convert/src/select.ts
    - workers/tick-convert/src/config.ts
    - workers/tick-convert/src/modes/nightly.ts
    - workers/tick-convert/src/index.ts
    - workers/tick-convert/tests/nightly.test.ts
    - workers/tick-convert/tests/entry.test.ts
    - workers/tick-convert/tests/too-large.test.ts
    - webapp/src/lib/launch-format.ts
    - webapp/src/lib/__tests__/launch-format.test.ts
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
decisions:
  - "골든은 거래소순으로 전부 재현 — 수신순 전환 불필요(design_decisions 5)"
  - "NXT 012450 미체결 「앞선 3건」 은 스파이크 µs 기준 오류 — CONTEXT 런 규칙(seq 연속 · B6 끊음)대로 1건으로 정정(오케스트레이터 결정 A)"
  - "10/22 픽스처는 G4 세션 전부(16~20시) — KB #1 FIFO 체결 4,405(= filled_qty)가 19:52 체결까지 있어야 나온다"
  - "LaunchPieceQueue 는 14칸(13칸 + order_est)"
metrics:
  duration: "약 1시간 25분"
  completed: 2026-11-03
actuals:
  tokens: 49172
  tasks: 3
  commits: 3
plan_head_before: 56a4da20175b40cb89445a7d8fc15c4e39d430e5
plan_head_after: f944bfc3ce9f8c6ea755481d08dbf33d1c02c8a9
---

# Quick 261103-pei Plan 01: 발사 주문 대기열 순번 · 앞 물량 Summary

어드민 「발사」 → 주문 내역 표 끝에 「16:00 대기열 몇 번째 · 앞 몇 주(금액) · 마감 때 앞 남은 것(추정)」 과 「09:00:30 몇 번째로 체결 · 왜 못 받았나」 열을 붙였다. 계산은 shared `launchQueueOf` 한 벌을 tick-convert 가 밤에 격자 바이트로 돌려 `launch_piece_queue` 에 저장하고, 웹 · 서버는 읽기만 한다. 10/22 · 10/30 원본 pcap 실측 골든을 거래소순으로 재현한다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 | `0bae3cee` | shared 순수 함수(FIFO 대기열 · 짝짓기 · 체결 런) + 실측 골든 픽스처 4개 · oracle `launchcut` |
| 2 | `be6b15bc` | 마이그레이션(표 + RPC 3 · 교체 2) · pgTAP · nightly 저장 · backfill-launch 모드 |
| 3 | `f944bfc3` | 주문 내역 열(목업 027 A) · `fmtEokMan` · `launchQueueCellOf` |

## 검증

- shared: 단위 12 + 골든 18 = 30/30 · 전체 1113 통과(2 skip) · typecheck · build.
- pgTAP(로컬 일회용 컨테이너 · 99 마이그레이션 재생): launch_piece_queue 31 · launch_gate 62 · launch_fire_base_key 23 · launch_project_mapping 36 · tick_viewer 109 — 전부 PASS. REVOKE EXECUTE 10줄.
- tick-convert: 12파일 151/151 · typecheck.
- webapp: launch-format · launch-orders-tab 60/60 · server · webapp typecheck · 바뀐 4파일 eslint 무경고. e2e · playwright 는 돌리지 않음(지시).

## 골든(거래소순 — design_decisions 5 기본 순서로 재현)

- 10/22 060900: KB #1·#3·#8·#14·#19·#23·#28 · 교보 #98·#99·#101(KB 먼저만 성립 · 추정 아님) · 통계 369/14/90/165/6(수신 18:00 전) · KB #1 FIFO 체결 4,405.
- 10/30 184230: KB #9·#13·#17·#20·#25·#30 · 교보 #48·#52·#57 · 접수 때 앞 68,808 · 109,238 · 144,630 · 177,272 · 224,323 / 교보 547,600 · 640,028 · 마감 open 4건 30,560 · 5건 47,226 · 6건 54,992 · KB wire 3 · 4 · 교보 0 · 1 취소 · 통계 265/16/98/51/4.
- 뒤탐침 1387: KB #1~#3 · 교보 #4~#6 · `order_est` true(두 순서 모두 성립). 접수 때 앞 = 직전 B6 2575 단 + 1387 단 = 420,893 · 460,185 · 564,268 · 833,242 · 861,278 · 869,472주(오케스트레이터 결정대로 잠금 — 사용자 확인 항목 아님).
- 10/30 NXT: 425420 #1 체결 59 @84,300~84,500 · 376900 #1 281 @18,000 · 095340 #2 앞 2주 318,000원 체결 18 @159,300~160,100 · 005930 미체결 1건 4,861주 10.82억 · 012450 미체결 **1건** 134주 0.98억 · 010140 1건 3,417주.
- 10/30 KRX A: KB 5종목 · 교보 09:00:29 3종목 모두 #1 · 교보 376900 미체결 앞 ≥ 179주(KB 가 먼저 가져감).

## 계획과 다르게 한 것

1. **[Rule 3] GCS 10/22 18~20시 원본 읽기 전용 받기** — 계획의 10/22 픽스처는 16 · 17시뿐이었는데, KB #1 FIFO 체결 4,405(= filled_qty)는 G4 세션 전체(18:31 · 19:12 · 19:52 체결 포함)를 봐야 나온다. 그래서 README 에 적힌 절차대로 deployer SA 로 `gs://gh-trade-tick-archive/raw/krx/20261022/20261022-{1800,1900,2000}.pcap.zst`(약 157MB)를 읽기 전용으로 받아 `~/ticks/oracle/20261022/krx/` 에 두었다. 픽스처는 16~20시로 만들었고 크기는 15,422B 다. CONTEXT 통계는 스파이크와 같은 범위(수신 18:00 전)로 잘라 테스트한다.
2. **NXT 012450 골든 정정(3건 → 1건)** — seq 7570~7582 의 A3 13개가 끊김 없이 이어지고 B6 7583 이 닫는다. 매도 1건이다. 스파이크 `runs.py` 의 20µs 간격 기준이 이 하나를 26 · 97 · 11주 세 덩어리로 쪼갰다. 처음에는 멈추고 보고했고, 오케스트레이터 결정 (A)에 따라 기대값을 `ahead_n 1` 로 바꿨다(테스트 이름에도 반영 · CONTEXT 는 오케스트레이터가 정정함). 수량 134 · 금액 0.98억은 그대로다.
3. **[Rule 3] `workers/tick-convert/src/config.ts`** (계획 파일 목록 밖) — `backfill-launch` 도 `TICK_ARCHIVE_DIR` 없이 돌게 했다. Storage 격자만 읽으므로 backfill-team 과 같은 처리다. 테스트는 backfill-launch.test.ts 에 있다.
4. **`workers/tick-convert/tests/too-large.test.ts`** (목록 밖) — 「너무 큰 격자는 object_path null 행」 시험 1건을 여기 더했다. `GRID_MAX_BYTES` 모듈 mock 이 필요해서다.
5. `LaunchPieceQueue` 는 14칸이다(design_decisions 2 의 13칸 + order_est).
6. pgTAP 기존 4파일 중 깨진 곳은 tick_viewer 의 candidates 정확 비교 하나뿐이었고, 기대값에 `"launch": []` 만 더했다. launch_gate · launch_fire_base_key · launch_project_mapping 은 고치지 않았다.
7. 저장소 관례(작업은 master · 오케스트레이터가 메인 트리 순차 실행을 지시)에 따라 master 에 직접 커밋했다. push 는 하지 않았다.

## 설계 메모

- nightly: `candidates.launch` 가 있을 때만 `launch_queue_inputs` 를 1회 부른다. 키마다 `buildGridFile` 직후(크기 판정 전) `gridLaunchOf` 를 돌리고, 업로드에 성공한 키만 그 격자 경로로 싣는다. 너무 큰 키는 `object_path` null 로 바로 싣는다. `tick_grid_upsert` 뒤에 50행씩 set 한다. inputs · 계산 · set 실패는 에러 로그와 `launch_failed` 만 남긴다. `day.failed` · 실행 기록 ok 는 바뀌지 않는다.
- 옛 RPC(launch 키 없음)는 [] 로 받고 warn 을 한 번 남긴다 → 배포 순서와 무관하게 안전하다.
- `launch_queue_pending` 은 「그 격자 경로로 계산된 값이 없는 대상 조각」 이 있는 격자를 고른다. 그래서 격자가 바뀌면(request → nightly 등) 다시 대상이 된다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표 · 함수는 모두 service_role 전용이다(RLS 정책 0 · REVOKE PUBLIC/anon/authenticated). 새 엔드포인트는 없다(server 무변경).

## 메인 세션 배포 체크리스트 (executor 는 하지 않음 · 서브에이전트 배포 금지)

1. 마이그레이션 — `supabase db push --linked --yes`. 옆 세션이 더 늦은 타임스탬프를 먼저 올려 out-of-order 로 거부되면, 파일 이름만 더 늦은 타임스탬프로 바꾸고 pgTAP 5파일을 다시 돌린 뒤 push 한다.
2. tick-convert 재배포 — `bash scripts/deploy-tick-convert.sh`(nightly/request Job · promote Job 같은 이미지 · env 는 라이브 Cloud Run 에서 추출). 마이그레이션이 먼저다.
3. 백필 — 23:30 · 01:30 nightly 창을 피해서 한다.
   - `gcloud run jobs execute gh-radar-tick-convert --region asia-northeast3 --args=backfill-launch,--dry-run --wait` 로 키별 값과 `no_grid` 를 먼저 확인한다.
   - 이어서 `--args=backfill-launch` 본 실행 → 요약에 `launch_failed=0 failed=0 deferred=0` 이 나와야 한다.
   - 다시 dry-run 하면 `pending=0` 이어야 한다.
   - 10/22 처럼 격자가 없는 날짜는 `no_grid` 로만 센다(범위 밖).
4. server — 재배포 불필요(RPC 응답 통과 · 매퍼 없음).
5. 웹 — git push(= Vercel 프로덕션 배포). 배포 순서와 무관하게 안전하다(queue 키 없음 = 「—」).
6. 확인 — 어드민 「발사」 → 주문 내역 10/30:
   - 09:00:30 탭 ISC 095340 KB 행: `2번째 체결 · 앞 2주 · 32만` / `체결 18/20 @ 159,300~160,100`
   - 삼성전자 005930 KB 행: `미체결 · 앞선 1건이 한도 안 4,861주 · 10.82억 가져감`
   - 16:00 탭 SGA솔루션즈 184230 KB wire 0: `9번째 · 앞 68,808주 · 1.77억`
   - 실서버 격자는 원본 시간 범위가 달라 마감(추정) 줄이 목업의 16:59 값과 다를 수 있다 — 정상이다.

## Self-Check: PASSED

- 생성 파일 13개가 모두 있다(launch-queue.ts · 테스트 4 · 픽스처 4 · 마이그레이션 · pgTAP · 워커 2).
- 커밋 `0bae3cee` · `be6b15bc` · `f944bfc3` 는 HEAD 의 조상이다(`git rev-list --count 56a4da20..HEAD` = 3).
