---
phase: 19-account-order-journal
plan: 09
subsystem: relay
tags: [relay, journal, observer, flatbuffers, codec, gh-trade, G1, D-02, D-09, D-12, D-13, T-19-04, T-19-33, T-19-34]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-05 journal/types.ts(JournalCodec · ObserverFrame · JournalRecord 23필드 · ObserverLoginResult · JournalBatchFrame) · JournalWriter"
  - phase: 19-account-order-journal
    provides: "19-07 JournalObserver(codec 주입 · 상태기계) · 가짜 코덱/전송 테스트 하네스"
  - phase: gh-trade 23-observer-journal
    provides: "관찰자 와이어 계약 커밋 8285a26585cc58405733752b01d07019effc5ea4 (StockDMA.fbs blob f60a7e37) — G1"
provides:
  - "relay 생성물 재동기화 — ObserverLoginReq · ObserverAccount · ObserverLoginResp · JournalRecord · JournalBatch · Envelope 슬롯 76/78/80 (SYNC MARKER 8285a265)"
  - "MSG.ObserverLoginReq=5 · MSG.ObserverLoginResp=79 · MSG.JournalBatch=80 · INBOUND_MSG_TYPES 25종"
  - "SubscriptionHub #onFrame 79·80 명시 case(warn 후 무시)"
  - "envelope: buildObserverLoginReq · parseObserverLoginResp · parseJournalBatch · MAX_JOURNAL_BATCH_RECORDS=500 · MAX_OBSERVER_ACCOUNT_COUNT=1024 · ObserverLoginReqInput"
  - "relay/src/journal/codec.ts createJournalCodec — JournalCodec 실구현(79→login · 80→batch · 76·54→ignore · 그 밖 unexpected)"
  - "JournalObserver: resync ∧ oldestSeq 0 이면 로그인 직후 live (gh-trade 회신 ⑥)"
  - "테스트 헬퍼: buildObserverLoginRespFrame · buildJournalBatchFrame · fakeJournalRecord · FakeJournalRecordInput · readObserverLoginRequest · respondObserverLogin · pushJournalBatch · observerLoginRequests · waitForObserverConnection"
affects: [19-10, 19-11, 19-12]

actuals:
  tokens: 26800
  tasks: 3
  commits: 5
plan_head_before: c3aed33b10b4fac8c0224b1b59dd157055c48714

tech-stack:
  added: []
  patterns:
    - "코덱 스왑 = journal/codec.ts 한 파일 + envelope.ts 파서 3종 — 관찰자·기록기는 생성 타입을 모른다"
    - "저널 레코드는 형식 이상이어도 버리지 않는다(프레임당 warn 1줄 · 계좌 마스킹) — 구조 파손(슬롯·레코드 null·읽기 예외)만 malformed → 재접속"
    - "상한 절단 시 caughtUp 을 거짓으로 내려 live 전이를 미룬다 — 잘린 뒤 구간은 기록기 갭 판정이 since 로 다시 받는다"
    - "화이트리스트 79·80 과 hub 명시 case 를 같은 커밋(e91d3e8)에 — PC-12"

key-files:
  created:
    - relay/src/journal/codec.ts
    - relay/tests/journal-codec.test.ts
    - relay/tests/journal-gateway.test.ts
    - relay/src/generated/stock-dma/observer-login-req.ts
    - relay/src/generated/stock-dma/observer-account.ts
    - relay/src/generated/stock-dma/observer-login-resp.ts
    - relay/src/generated/stock-dma/journal-record.ts
    - relay/src/generated/stock-dma/journal-batch.ts
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma.ts
    - relay/src/generated/stock-dma/envelope.ts
    - relay/src/generated/stock-dma/msg-type.ts
    - relay/src/dma/msg-type.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/journal/observer.ts
    - relay/src/dma/__tests__/codec.test.ts
    - relay/tests/helpers/frames.ts
    - relay/tests/helpers/fake-gateway.ts
    - relay/tests/hub.test.ts
    - relay/tests/journal-observer.test.ts

key-decisions:
  - "G1 계약은 인계서 §2 와 의미상 1:1 — 필드 23종 이름·타입·순서 일치, seq 류는 ulong(bigint)이라 파서 경계에서 toNum. 도메인 타입(types.ts) 무변경, 에스컬레이션 불필요"
  - "54 ServerMessage 도 관찰자 코덱에서 ignore — 게이트웨이가 로그인 전 연결에도 54·76 을 브로드캐스트하고, 로그인 실패는 반드시 79(success=false)로 온다는 gh-trade 합의에 기댄다"
  - "resync ∧ oldestSeq 0 → 곧바로 live (게이트웨이 DecideResync: 원천 없으면 startSeq=head+1, 빈 배치 금지). 기록기 갭 규칙은 무변경"
  - "저널 배치 상한 500(게이트웨이 kBatchMaxRecords 100 의 5배) · 계좌 매핑 상한 1024"

patterns-established:
  - "관찰자 모드 가짜 게이트웨이: 자동 응답은 기본 꺼짐, respondObserverLogin 으로만 켠다 — 일반 로그인 자동 응답과 분리"
  - "실 TCP 통합 테스트는 게이트웨이 수신 msg_type ⊆ {5, 4} 를 afterEach 공통 단언으로 둔다(T-19-04 relay 몫)"

requirements-completed: [D-02, D-09, D-12, D-13]

coverage:
  - id: D1
    description: "생성물이 gh-trade 8285a265 계약에서 sync 스크립트로만 만들어지고 --check 차이 0"
    requirement: "D-12"
    verification:
      - kind: other
        ref: "RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check (gh-trade worktree phase-23-observer-journal/server)"
        status: pass
  - id: D2
    description: "79·80 이 화이트리스트와 hub 명시 case 에 같은 커밋으로 들어가고 사용자 세션에 와도 unhandledFrameCount 0"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "relay/tests/hub.test.ts#명시 case 가 warn 후 무시한다 — unhandledFrameCount 0 · 팬아웃 0"
        status: pass
      - kind: unit
        ref: "relay/src/dma/__tests__/codec.test.ts#79/80 관찰자 응답은 화이트리스트에 있고 5 요청은 없다"
        status: pass
  - id: D3
    description: "실 코덱이 로그인 요청을 만들고 로그인 응답·저널 배치를 도메인 타입으로 푼다 — 형식 이상 레코드도 버리지 않는다"
    requirement: "D-12"
    verification:
      - kind: unit
        ref: "relay/tests/journal-codec.test.ts"
        status: pass
  - id: D4
    description: "로컬 거부 레코드(local_reject · 빈 주문번호)가 코덱을 지나 기록기로 간다"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "relay/tests/journal-codec.test.ts#② 저널 배치(80) → batch · 23필드 입력과 같다 · 로컬 거부 레코드가 빠지지 않는다(D-02)"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-gateway.test.ts#⑥ 로컬 거부 레코드(빈 주문번호) · resync+oldest 0 로그인 → 곧바로 live · 다음 append 레코드 수용"
        status: pass
  - id: D5
    description: "실 TCP 에서 끊김 뒤 since_seq 이어받기 · 거부 뒤 재로그인 0 · 76 조용히 무시 · 79 전 54/76 선행 무해 · 게이트웨이 수신 ⊆ {5,4}"
    requirement: "D-13"
    verification:
      - kind: integration
        ref: "relay/tests/journal-gateway.test.ts"
        status: pass
  - id: D6
    description: "resync ∧ oldestSeq 0 로그인 → 곧바로 live (replaying 고착 · healthz 503 거짓 알림 방지)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "relay/tests/journal-observer.test.ts#⑨b resync · oldestSeq 0(재생 원천 없음 — 다음 append 부터만 온다) · head>0 → 곧바로 live · 다음 레코드 수용 (19-09 ⑥)"
        status: pass

metrics:
  duration: 16min
  completed: 2026-09-25
---

# Phase 19 Plan 09: 관찰자 실 코덱 교체 (G1) Summary

gh-trade Phase 23 관찰자 계약(8285a265, MsgType 5/79/80)으로 relay 생성물을 동기화하고, `createJournalCodec` 실구현을 19-05 `JournalCodec` 주입 지점에 꽂았다. 실 TCP 가짜 게이트웨이 위에서 로그인 · 배치 · 끊김 이어받기 · 거부 정지 · 54/76 무시를 통합 검증했다.

## Performance

- **Duration:** 16분
- **Started:** 2026-09-25T05:49Z (KST 14:49)
- **Completed:** 2026-09-25T06:05Z
- **Tasks:** 3 (Task 1 은 게이트 — 사람이 해결) + 추가 범위 2건
- **Files modified:** 21 (생성물 9 포함)

## Accomplishments

- **Task 1 [BLOCKING G1] — 해결됨.** 사용자 + 오케스트레이터가 resume signal 「G1 8285a265」로 해소했다. gh-trade 커밋 `8285a26585cc58405733752b01d07019effc5ea4`("feat(23-01): 관찰자 로그인·주문 저널 프로토콜")는 gh-trade master 에 아직 병합되지 않았고 worktree `phase-23-observer-journal`(브랜치 `worktree-phase-23-observer-journal`)에만 있다. 그래서 plan 의 확인 명령(메인 체크아웃 경로)이 아니라 worktree 경로로 대조했고, 비교는 커밋 해시가 아니라 **blob** 으로 했다: 생성물 `.fbs` 사본에서 마커 7줄을 뺀 본문의 `git hash-object` = `f60a7e37e6f362f04cc722e89def543a0a273fa2` 로 일치.
- **필드 대조 (에스컬레이션 판정):** `.fbs` 5테이블이 인계서 §2 · `relay/src/journal/types.ts` 와 **의미상 1:1** 이다. JournalRecord 23필드 이름·순서가 같고, ObserverAccount 4필드(dma_user_id · account_no · name · priority) = `ObserverAccountRow`, ObserverLoginResp(success · message · broker · journal_epoch · head_seq · oldest_seq · resync · accounts) = `ObserverLoginResult`, JournalBatch(records · head_seq · caught_up) = `JournalBatchFrame`. 차이는 seq 류가 ulong(bigint)인 것뿐이고, 파서 경계의 `toNum` 이 흡수한다. `since_seq` 의미(이 seq **초과**부터)는 관찰자의 `lastReceivedSeq` 의미와 같다. 도메인 타입 변경과 에스컬레이션은 필요 없었다.
- **Task 2 (tracer):** 생성물을 별도 커밋(d58e16f)하고, MSG 3종 · INBOUND 2종 · hub 명시 case · envelope 파서 · 코덱 · 프레임 빌더 · 테스트를 한 커밋(e91d3e8)으로 넣었다. 게이트웨이 프레임 바이트 → `tryParseEnvelope` → `createJournalCodec().decode` → 도메인 레코드 왕복이 성립한다.
- **Task 3:** 가짜 게이트웨이 관찰자 모드와 실 DmaClient 통합 6건, hub 불변식 테스트를 넣었다(5f51130).
- **추가 ⑥:** resync ∧ oldestSeq 0 이면 로그인 직후 곧바로 live 로 간다. RED(b302798) → GREEN(59f1aef).

### 최종 `sync-relay-schema.sh --check` 출력

```
=== StockDMA 스키마 동기화 → gh-radar relay (정본: src/protocol/StockDMA.fbs) ===
    모드: --check (검증·대조만, gh-radar 무변경)
[1/5] 가드 0: gh-radar relay 워크스페이스 확인 (/Users/alex/repos/gh-radar/relay)
[2/5] 가드 1: Envelope deprecated 슬롯 보존 확인
[3/5] 가드 2: flatc 버전 확인
      flatc version 25.12.19
[4/5] 생성: flatc --ts (임시 디렉토리)
      생성 49 개 (.ts, stock-dma/ 포함)
[5/5] 대조: 반영하면 무엇이 바뀌는지만 보고 (gh-radar 파일 무변경)
      생성 .ts        : 49 개
      신규/변경 예정  : 0 개
      삭제 예정       : 없음
      .fbs 사본       : 최신 (마커 7줄 제외 본문 동일)

sync-relay-schema.sh OK: 가드 3종 통과 — gh-radar 파일은 건드리지 않았다 (--check)
EXIT=0
```

(반영 전 `--check` 는 `신규/변경 예정 : 8 개` · `.fbs 사본 : 갱신 예정` 이었다. gh-trade 가 예고한 8개와 같다.)

## Task Commits

1. **Task 1: [BLOCKING G1] 계약 커밋 확인** — 사람이 해결(「G1 8285a265」). 커밋 없음
2. **Task 2: 생성물 동기화** — `d58e16f` (chore) — **GEN_SHA**. `git show --stat` 에는 `relay/src/generated/` 아래 9파일만 있다
3. **Task 2: MSG·화이트리스트·hub case·실 코덱 (tracer)** — `e91d3e8` (feat) — `msg-type.ts` 와 `subscription-hub.ts` 의 마지막 커밋이 같다(e91d3e84)
4. **추가 ⑥ RED** — `b302798` (test)
5. **추가 ⑥ GREEN** — `59f1aef` (fix)
6. **Task 3: 실 TCP 통합 · hub 불변식** — `5f51130` (test)

**PLAN_BASE:** `c3aed33b10b4fac8c0224b1b59dd157055c48714`

## Verification

- `pnpm --filter @gh-radar/shared build` → OK
- `pnpm --filter @gh-radar/relay run typecheck` → OK (error TS 0)
- `pnpm --filter @gh-radar/relay run typecheck:tests` → OK
- `pnpm --filter @gh-radar/relay run test` → **27 files / 616 tests 전부 통과**. 기준선 25 / 595 에서 +2 파일 · +21 테스트: journal-codec 11 · journal-gateway 6 · journal-observer 2 · codec.test 1 · hub 1
- 트레이서 피드백 게이트: `human_verify_mode=end-of-phase` 이고 `<verify>` 가 전부 자동 명령이라, 다시 돌려 통과를 확인한 뒤 Task 3 으로 넘어갔다
- gh-trade 무수정: 메인 체크아웃 `git status --porcelain` 이 작업 전후로 같다. worktree 에는 작업 중 `M server/src/net/Gateway.cpp` 와 새 커밋 `5bf1fce8`(15:04, "fix(23): CR-01 …")이 생겼다. 이것은 **동시에 돌던 gh-trade 세션의 작업**이다. 이 plan 은 sync 스크립트만 실행했고, 그 스크립트는 gh-radar 쪽에만 쓴다. 이후 `--check` 가 여전히 0 이므로 `.fbs` 는 바뀌지 않았다

## Decisions Made

- 54 ServerMessage 를 관찰자 코덱에서 `ignore` 로 분류했다. 게이트웨이는 로그인 전 연결에도 54·76 을 보내고, 로그인 실패는 반드시 79(success=false)로 온다(gh-trade 합의). 그래서 54 를 조용히 버려도 거부 신호를 놓치지 않는다
- 저널 배치 파서는 레코드를 **절대 버리지 않는다**. 구조 파손(슬롯 null · 레코드 테이블 null · 읽기 예외)만 `null` → malformed → 재접속으로 보낸다. 상한 절단 시에는 `caughtUp` 을 거짓으로 내린다
- `buildObserverLoginReq` 는 `Number.isSafeInteger(sinceSeq) && sinceSeq >= 0` 이 아니면 `RangeError` 를 던진다. 오류 문구에 비밀을 싣지 않는다
- master 브랜치 직접 커밋: `gsd-tools git.base-branch --is-protected master` 가 true 를 돌려주지만, 오케스트레이터가 「SEQUENTIAL executor on the main working tree (branch master)」로 명시 지시했고 Phase 19 앞선 plan 도 모두 master 에 커밋했다. 그 지시를 따랐다. push 는 하지 않았다

## Deviations from Plan

### 오케스트레이터가 정한 추가 범위

**1. [추가 ⑥] observer.ts — resync ∧ oldestSeq 0 이면 곧바로 live**
- **근거:** gh-trade 23-G1 회신 ⑥, 사용자·오케스트레이터 결정. plan 은 「observer.ts 무수정」이었지만 이 동작 하나를 더하기로 했다
- **문제:** `#onLogin` 이 `headSeq > received ? "replaying" : "live"` 였다. resync 이면 기록기 `lastReceivedSeq` 가 null → received 0 → head>0 이라 replaying 에 머문다. 게이트웨이 `DecideResync` 는 원천이 없으면(oldest 0) startSeq = head+1 이고 빈 배치를 보내지 않는다. 그래서 첫 주문 전까지 브라우저에 「기록 지연」이 뜨고, 장중 180초 뒤 `/healthz` 가 503 거짓 알림을 낸다
- **수정:** `const nothingToReplay = result.resync && result.oldestSeq === 0;` → `!nothingToReplay && headSeq > received ? "replaying" : "live"`. 기록기 갭 규칙은 그대로다(새 epoch 첫 레코드는 이미 seq 확인 없이 받는다)
- **테스트:** `journal-observer.test.ts` ⑨b(RED: `expected 'replaying' to be 'live'` → GREEN) · ⑨c(resync 가 아니면 종전대로 replaying — 회귀 방지) · `journal-gateway.test.ts` ⑥(실 TCP)
- **영향:** plan 의 acceptance `git diff --stat PLAN_BASE..HEAD -- observer.ts writer.ts` 출력 없음은 **의도적으로 어긋난다**. 결과는 `observer.ts | 9 +++++++--` 이고 writer.ts 는 무변경이다. 코덱 교체 자체로는 observer.ts 를 고칠 필요가 없었다(스왑은 깨끗했다)
- **Commits:** b302798 (RED) · 59f1aef (GREEN)

**2. [추가] 코덱 분류 — 54 도 ignore (79 전 선행 브로드캐스트)**
- **근거:** gh-trade 회신. 게이트웨이는 로그인 전 연결에도 54 WARN 과 76 을 브로드캐스트한다
- **수정:** `createJournalCodec().decode` 에서 76 과 54 → `{k:"ignore"}`. 그 밖 미지 번호는 `unexpected` 그대로다
- **테스트:** `journal-codec.test.ts` ④(54·76 → ignore, 51 → unexpected) · `journal-gateway.test.ts` ⑤(로그인 요청 → 54 → 76 → 79 순으로 보내도 로그인 성공, warn/error 0, 두 번째 로그인 0 — 로그인 타이머·상태에 영향 없음)
- **Commit:** e91d3e8 · 5f51130

### 자동 수정

**3. [Rule 3 - Blocking] `src/dma/__tests__/codec.test.ts` 화이트리스트 개수 고정값 갱신**
- **Found during:** Task 2
- **Issue:** 기존 테스트가 `INBOUND_MSG_TYPES.size === 23` 과 대역 50~78 을 못박아 두었다. 이것은 의도된 PC-12 게이트이고, 확장 순간 예정대로 깨졌다
- **Fix:** 25종 · 50~80 으로 갱신하고 79/80 ↔ 5 대조 테스트 1건을 더했다(plan `files_modified` 밖 파일)
- **Commit:** e91d3e8

**4. [Rule 2] `parseJournalBatch` 상한 절단 시 `caughtUp` 거짓 · 읽기 예외 try/catch**
- plan 문구에는 없지만 정확성에 필요하다. 절단된 배치가 `caughtUp=true` 를 그대로 올리면 live 로 잘못 전이한다. 잘린 버퍼 예외는 total 파서 규약(`parseSymbolMasterFrame` 선례)대로 `dropField("parse-throw")` 로 모은다
- **Commit:** e91d3e8

---

**Total deviations:** 추가 범위 2 (오케스트레이터 결정) + 자동 수정 2 (Rule 3 · Rule 2)
**Impact on plan:** 계약·코덱 교체 범위 안이다. 관찰자 변경은 한 조건식이고 기록기는 무변경이다.

## Issues Encountered

- plan 의 Task 1 확인 명령이 gh-trade 메인 체크아웃 경로를 가리킨다. 계약 커밋이 아직 worktree 에만 있어서 worktree 경로 + blob 대조로 대신했다(오케스트레이터 지시)

## gh-trade 에 확인할 것 (정보용 — 이 plan 의 정확성을 막지 않는다)

- 없음. 필드·의미 차이를 찾지 못했다. ⑤(epoch 파일만 사라졌을 때 새 epoch 를 만들지 말 것) 요청은 gh-trade 가 Phase 23 안에서 반영하기로 했고 아직 대기 중이다(`tasks/gh-trade-observer-journal-g1-reply.md`). 이 plan 과 무관하다

## Known Stubs

없음.

## Next Phase Readiness

- 19-10 부팅 결선에서 `createJournalCodec()` 을 `JournalObserver` deps 의 codec 으로 넣으면 된다(가짜 코덱 교체)
- G2(gh-trade 게이트웨이 구현·배포) 뒤 실 게이트웨이 대조는 19-11 에서 한다. 서버측 「관찰자 연결은 로그인·핑만」 강제(T-19-04 gh-trade 몫)도 그때 확인한다

## Self-Check: PASSED

- FOUND: relay/src/journal/codec.ts · relay/tests/journal-codec.test.ts · relay/tests/journal-gateway.test.ts · relay/src/generated/stock-dma/journal-batch.ts · relay/src/generated/stock-dma/observer-login-resp.ts
- FOUND commits: d58e16f · e91d3e8 · b302798 · 59f1aef · 5f51130
- `git rev-list --count c3aed33..HEAD` = 5 (SUMMARY 작성 시점)
