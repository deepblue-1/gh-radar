---
phase: 19-account-order-journal
plan: 05
subsystem: relay
tags: [relay, journal, writer, fanout, wss, supabase-rpc, T-19-02, D-03, D-12]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-01 dma_journal_apply(p_gateway, p_epoch, p_events) · dma_journal_sync_access(p_gateway, p_rows) · dma_journal_cursor"
  - phase: 19-account-order-journal
    provides: "19-02 relay 사용자 세션 경로 DB 쓰기 0 (기록은 관찰자 기록기 단독)"
  - phase: 19-account-order-journal
    provides: "19-04 shared JournalOrderRow · toJournalOrderRow · RelayJournalRowsMsg({t:'journal.rows'})"
provides:
  - "relay/src/journal/types.ts — JournalRecord · ObserverAccountRow · ObserverLoginResult · JournalBatchFrame · ObserverFrame · JournalCodec · ObserverTransport · JournalCursor · JournalObserverState · JournalAccessView · JournalPushResult · JournalWriterHealth"
  - "JournalWriter — push(동기) · readCursor · beginEpoch · drain · close · health · 이벤트 applied/health · toApplyEvent · JOURNAL_BATCH_SIZE=200 · JOURNAL_MAX_QUEUE=5000 · journalRetryDelayMs"
  - "JournalAccess — replace · accountsOf · size · close (메모리 즉시 교체 + dma_journal_sync_access 백오프 재시도)"
  - "WsFanout.deliverJournalRows · WsFanoutDeps.journalAccess · UserEntry.dmaUserId"
affects: [19-07, 19-09, 19-10, 19-11, 19-12]

actuals:
  tokens: 18100
  tasks: 2
  commits: 2
plan_head_before: 91abc65c0d837d3ceb8e304e2bf092d8a95ef32a

tech-stack:
  added: []
  patterns:
    - "수신 콜백은 동기 push 만, 직렬 워커가 RPC 를 한 번에 하나 — 진행 중 배치는 성공할 때까지 큐 머리에 남아 실패 시 같은 배치 재전송"
    - "재시도 지연 = dma-client backoffDelayMs 의 배율 × 주입 기준값(기본값이면 1→2→4→…→30초 그대로)"
    - "사용자 데이터 푸시는 사용자별 부분집합 → #deliver(userId) 로만 (전역 브로드캐스트 함수 없음)"

key-files:
  created:
    - relay/src/journal/types.ts
    - relay/src/journal/writer.ts
    - relay/src/journal/access.ts
    - relay/tests/journal-push.test.ts
    - relay/tests/journal-writer.test.ts
  modified:
    - relay/src/ws/fanout.ts

key-decisions:
  - "JournalAccess.replace 는 빈 dmaUserId/accountNo 행을 버린다(warn·행 수만) — DB RPC 는 그런 행이 하나라도 있으면 교체 전체를 거부하므로, 그대로 보내면 한 행 때문에 매핑 동기화가 영원히 재시도에 갇힌다"
  - "push 는 epoch 미설정·close 후에 적재하지 않고 overflow 를 돌린다 — 적용 RPC 가 빈 epoch 를 거부해 무한 재시도가 되므로, overflow(적재 0 · 연결을 끊어라)와 같은 의미로 묶었다"
  - "beginEpoch 는 resync 가 아니어도 epoch 가 비어 있지 않은 값에서 다른 값으로 바뀌면 error 로그 — 커서가 가리키던 저장소가 사라졌다는 뜻이라 Pitfall 3(조용한 누락) 신호로 본다"
  - "applied 리스너(푸시) 예외는 워커 안에서 잡는다 — 이미 확정된 배치를 재전송하거나 워커를 멈추게 두지 않는다"
  - "UserEntry.dmaUserId 는 같은 세션 재등록(추가 탭)에서도 최신 조회값으로 덮는다 — 자격증명은 인증마다 다시 조회하는 규율과 맞춘다"

requirements-completed: [D-03, D-06, D-11, D-12]

coverage:
  - id: D1
    description: "레코드 → 기록기 → dma_journal_apply(snake 23키) → 반환 행 → 같은 DMA 계정 공유 사용자 A1·A2 가 같은 journal.rows 를 받고 B·U 는 0프레임 (T-19-02)"
    requirement: D-03
    verification:
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#① · ②"
        status: pass
    human_judgment: false
  - id: D2
    description: "매핑 밖 계좌(ACC9) 레코드도 적용 RPC 로 가고 그 행은 아무에게도 푸시되지 않는다"
    requirement: D-11
    verification:
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#③"
        status: pass
    human_judgment: false
  - id: D3
    description: "JournalAccess.replace — 메모리 즉시 교체, dma_journal_sync_access p_rows snake 4키, RPC 실패에도 accountsOf 유효, 재시도 대기 중 최신 스냅샷만 전송"
    requirement: D-06
    verification:
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#④"
        status: pass
    human_judgment: false
  - id: D4
    description: "기록기 직렬 배치(200·200·50, 동시 호출 0) · 같은 배치 재시도 · db_error 전이 · 갭/중복/상한 · 커서 · epoch · drain · close"
    requirement: D-12
    verification:
      - kind: unit
        ref: "relay/tests/journal-writer.test.ts (10 cases)"
        status: pass
    human_judgment: false
  - id: D5
    description: "relay 타입체크 2종 0 error · 전체 relay 스위트 회귀 없음"
    verification:
      - kind: typecheck
        ref: "pnpm --filter @gh-radar/relay run typecheck && typecheck:tests"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay run test → 23 files / 541 passed"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-09-25
---

# Phase 19 Plan 05: relay 기록기 · 매핑 · 계좌 권한 푸시 Summary

**저널 레코드를 동기 push 로 받아 직렬 워커가 `dma_journal_apply` 에 배치(≤200, 한 epoch)로 보내고, 돌려받은 행을 그 계좌에 접근할 수 있는 사용자에게만 `journal.rows` 로 푸시한다. 실패하면 같은 배치를 지수 백오프로 다시 보내고, seq 중복·갭·큐 상한·epoch 교체를 push 시점에 동기로 판정한다.**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-24T15:58:07Z
- **Completed:** 2026-09-24T16:06Z (KST 2026-09-25 01:06)
- **Tasks:** 2/2
- **Files:** 신규 5 · 수정 1

## Accomplishments

- **도메인 타입(`types.ts`)**: 관찰자(19-07)와 코덱(19-09)이 붙을 타입을 정의했다. 와이어 계약이 바뀌면 `JournalCodec` 한 곳만 고치면 된다. `ObserverTransport` 는 `DmaClient` 를 구조적으로 그대로 만족한다.
- **기록기(`writer.ts`)**:
  - `push` 는 동기다. 중복 seq 는 건너뛰고, 갭이 보이면 그 앞까지만 적재한 뒤 `gap` 을 돌린다. 큐 상한을 넘으면 아무것도 적재하지 않고 `overflow` 를 돌린다.
  - 워커는 RPC 를 한 번에 하나만 부르고, 한 배치에는 한 epoch 만 담는다.
  - 실패하면 같은 배치를 `backoffDelayMs` 배율로 다시 보낸다. `lastAppliedSeq` 는 성공했을 때만 전진한다. 연속 3회 실패하면 `dbError` 를 켜고 `health` 이벤트를 낸다.
  - 그 밖의 메서드: `readCursor`(커서 테이블 1행) · `beginEpoch`(resync 는 error 로그) · `drain(timeout)` · `close()`.
- **매핑(`access.ts`)**: 관찰자 로그인 스냅샷으로 `Map<dmaUserId, Set<accountNo>>` 를 동기로 교체하고, `dma_journal_sync_access` 호출을 비동기로 예약한다. 실패하면 백오프로 재시도하되, 그 사이 새 스냅샷이 오면 최신 것만 보낸다. 계좌번호는 재정규화하지 않는다. 로그에는 행 수만 남긴다.
- **fanout**: `WsFanoutDeps.journalAccess` 와 `UserEntry.dmaUserId` 를 추가했다. 인증 때 `creds.dmaUserId` 를 받고, 로그에는 싣지 않는다. `deliverJournalRows` 는 사용자마다 `accountsOf(entry.dmaUserId)` 로 거른 부분집합을 `#deliver(userId)` 로만 보낸다. 거르지 않은 원본을 보내는 경로는 없다. 매핑이 주입되지 않았으면 warn 을 한 번만 남기고 아무것도 보내지 않는다.

## Task Commits

1. **Task 1: [tracer] 레코드 → 기록기 → 적용 RPC → 계좌 권한 사용자 journal.rows** — `aee92e0` (feat)
2. **Task 2: 기록기 견고성 — 직렬 배치·재시도·db_error·갭/중복/상한·epoch·커서·drain** — `0c8bf51` (feat)

## TDD 증거

- Task 1: `deliverJournalRows` 의 계좌 필터를 원본 복사(`[...rows]`)로 바꿔 돌리면 journal-push **3/4 실패**(①②③ — B 가 ACC1 행을 받고, ACC9 행이 새어 나간다). 필터를 되돌리면 4/4 통과한다.
- Task 2: 기록기 코드에 변이 3개(배치 epoch 경계 제거 · 갭 판정 제거 · `#kick` 의 inFlight 가드 제거)를 넣으면 journal-writer **3/10 실패**(① 직렬 · ④ 갭 · ⑦ epoch 혼합). 처음 쓴 ① 은 push 를 한 번만 해서 inFlight 가드 변이를 잡지 못했다. 그래서 push 를 둘로 나눠 첫 호출이 진행 중일 때 두 번째 push 가 들어오게 보강했다.
- 테스트와 구현은 task 마다 한 커밋에 들어 있다. RED 증거는 위 변이 실행으로 대신한다.

### journal-writer `<behavior>` 대응표

| behavior | it |
|----------|----|
| 450건 → rpc 3회(200·200·50) · 오름차순 · 직렬 | ① |
| rpc 오류 2회 뒤 성공 → 같은 배치 · lastAppliedSeq 불변 · safePgError 필드만 | ② |
| 연속 3회 실패 → dbError + health 이벤트 · 성공 → false + 이벤트 | ③ |
| 갭 [7] · 중복 [4,5] · [6,7,9] → 6·7 적재 후 gap | ④ |
| maxQueue 10 · 큐 8 + 3건 → overflow · 적재 0 | ⑤ |
| readCursor 행 있음 / 없음 / 오류 throw | ⑥ |
| beginEpoch 같은 epoch 유지 · resync 새 epoch · 옛 epoch 먼저 · 배치 혼합 없음 · 첫 레코드 무판정 | ⑦ |
| drain 비면 true · 시간 초과 false | ⑧ |
| close 뒤 재시도 타이머 0 · push 거부 | ⑨ |
| (추가) 상수 정본 200 · 5,000 | 상수 |

## Verification

- `pnpm --filter @gh-radar/shared build` — 성공
- `pnpm --filter @gh-radar/relay exec vitest run tests/journal-push.test.ts tests/fanout.test.ts tests/journal-writer.test.ts` — 3 files / 63 passed
- `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` — 0 error
- `pnpm --filter @gh-radar/relay run test` — **23 files / 541 passed**(기준선 21 / 527 → 신규 2 파일 14건)
- 수용 기준 grep:
  - `deliverJournalRows` 본문의 `#send(` 0
  - `dma_journal_apply` ∈ writer · `dma_journal_sync_access` ∈ access
  - fanout 에서 `dmaUserId` 와 `logger.` 가 같은 줄에 있는 경우 0
  - `backoffDelayMs` import ∈ writer
  - `"gap"`/`"overflow"` 4줄
  - `push(` 본문의 `await` 0

## Decisions Made

frontmatter `key-decisions` 5건 참조. 요지:
- 빈 식별자 매핑 행은 relay 에서 버린다. 한 행 때문에 동기화 전체가 막히는 것을 피하려는 것이다.
- epoch 미설정 상태나 close 뒤의 push 는 `overflow` 와 같은 의미로 처리한다(적재 0).
- 비어 있지 않은 epoch 가 다른 값으로 바뀌면 resync 플래그가 없어도 error 로그를 남긴다.
- `applied` 리스너 예외는 워커 안에서 잡는다.
- `dmaUserId` 는 인증할 때마다 최신 값으로 덮는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] 매핑 스냅샷의 빈 식별자 행 필터링**
- **Found during:** Task 1
- **Issue:** 19-01 `dma_journal_sync_access` 는 빈 `dma_user_id`/`account_no` 행이 하나라도 있으면 교체 전체를 거부한다. relay 가 그대로 보내면 백오프 재시도가 끝없이 이어진다.
- **Fix:** `replace` 가 그런 행을 메모리 맵과 p_rows 양쪽에서 빼고, 버린 행 수만 warn 으로 남긴다.
- **Files modified:** relay/src/journal/access.ts
- **Commit:** aee92e0

**2. [Rule 2 - 정확성] epoch 미설정 push 거부 · applied 리스너 예외 격리 · 반환 형식 검증**
- **Found during:** Task 2
- **Issue:**
  - 빈 epoch 는 RPC 가 거부하므로 무한 재시도가 된다.
  - 푸시 리스너가 예외를 던지면 확정된 배치를 재전송할 수 있다.
  - RPC 가 형식이 틀린 data 를 돌려주면 `rows.map` 에서 워커가 죽는다.
- **Fix:**
  - epoch 가 비어 있으면 `overflow` 를 돌리고 error 로그를 남긴다.
  - `emit("applied")` 를 try/catch 로 감쌌다.
  - `isApplyResult` 로 형식을 검사하고, 틀리면 실패로 처리해 재시도한다.
- **Files modified:** relay/src/journal/writer.ts
- **Commit:** 0c8bf51

**3. [구조] 재시도 지연 헬퍼 위치**
- **Issue:** `journalRetryDelayMs` 는 Task 1 에서 access.ts 에 만들었다. 기록기도 같은 규칙을 써야 한다.
- **Fix:** Task 2 에서 writer.ts 로 옮겨 export 하고, access 는 import 한다. 두 모듈이 같은 규칙을 한 벌로 쓴다.
- **Commit:** 0c8bf51

**Total deviations:** 자동 수정 3건(Rule 2 두 건 · 구조 한 건). **Impact:** 계약·범위 변화는 없다. 막다른 재시도와 워커 정지를 막는 방어선만 추가했다.

## Issues Encountered

None.

## Notes for Later Plans

- **19-07(관찰자):** 다음 순서로 결선한다.
  - 부팅: `writer.readCursor()` → 로그인 요청 `sinceSeq = cursor.lastSeq`, `epoch = cursor.epoch` → 로그인 응답을 받으면 `writer.beginEpoch(result.epoch, { resync: result.resync })` 와 `access.replace(result.accounts)` → 배치마다 `writer.push(batch.records)`.
  - push 결과 처리: `"gap"` 이나 `"overflow"` 면 `transport.dropTransport(...)` 후 재접속한다. 재접속 때 `sinceSeq` 는 `writer.lastReceivedSeq ?? cursor.lastSeq` 로 준다. 단 overflow 는 큐가 빠질 때까지 기다린 뒤 재접속하는 편이 낫다.
  - 부팅 결선: `writer.on("applied", (rows) => fanout.deliverJournalRows(rows))` 와 `new WsFanout({ …, journalAccess: access })` 는 index.ts 몫이다(이 plan 은 index.ts 를 건드리지 않았다).
  - 종료 순서: `observer.stop()` → `await writer.drain(2000)` → `writer.close()` · `access.close()`.
- `writer.health()` 는 `/healthz` 의 journal 필드 원천으로 쓴다(19-10/11).
- 19-02 가 남긴 메모(`envelope.ts`·`symbols.ts` 주석의 `dma_orders.*` 컬럼명, 미사용 `stocksCodeOf`)는 이 plan 이 건드린 파일 밖이라 두었다.

## Self-Check: PASSED

- 생성 파일 5종 존재 확인: types.ts · writer.ts · access.ts · journal-push.test.ts · journal-writer.test.ts
- 커밋 존재 확인: `aee92e0` · `0c8bf51`
