---
phase: 19-account-order-journal
plan: 07
subsystem: relay
tags: [relay, journal, observer, healthz, wss, alerting, D-04, D-09, D-10, D-12, D-13, T-19-03]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-05 JournalWriter(readCursor · beginEpoch · push · epoch · lastReceivedSeq · health) · JournalAccess.replace · journal/types.ts(JournalCodec · ObserverFrame · ObserverTransport)"
  - phase: 19-account-order-journal
    provides: "19-04 shared RelayJournalStateMsg({t:'journal.state', s:'live'|'delayed', since?})"
provides:
  - "JournalObserver — start · stop · state · headSeq · 이벤트 state · OBSERVER_CLIENT_NAME='gh-radar-relay' (DmaClient · JournalCodec 주입)"
  - "JournalStatus — frame() · health(nowMs) · close() · 이벤트 frame · JOURNAL_DELAYED_AFTER_MS=10_000 · JOURNAL_ALERT_AFTER_MS=180_000 · journalAlerting(health, now)"
  - "inTradingWindow(now) — 평일 · KRX 휴장일 아님 · 08:00~20:00 KST (알림 판정 전용)"
  - "WsFanout.deliverJournalState(frame) · WsFanoutDeps.journalState(인증 직후 스냅샷)"
  - "OrderApiDeps.journal · OrderApiDeps.now · HealthPayload.journal · 장중 503 규칙"
  - "RelayConfig.dmaObserverSecret(env DMA_OBSERVER_SECRET · production 필수) · pino redact *.secret · *.dmaObserverSecret · *.DMA_OBSERVER_SECRET"
  - "types.ts: JournalHealth · JournalDerivedState · ObserverTransport.off"
affects: [19-09, 19-10, 19-11, 19-12]

actuals:
  tokens: 21100
  tasks: 3
  commits: 3
plan_head_before: 4fdff873376c0a240000623661f5034b88a46b07

tech-stack:
  added: []
  patterns:
    - "관찰자 = 세션 상태기계 축소판 — 연결 수명(백오프 · generation · LivePing)은 DmaClient, 로그인·저널 판단만 관찰자"
    - "와이어는 JournalCodec 주입 지점 뒤 — 테스트는 전송 프레임의 env 슬롯에 ObserverFrame 을 실어 보내고 가짜 decode 가 그대로 돌려준다"
    - "운영 상태 프레임(journal.state)은 #broadcastNxtSnap 선례대로 #users 전원 · 스냅샷은 알 때만"
    - "healthz 판정은 기존 식에 AND 로만 더한다 — 판정식 정본은 status.ts journalAlerting 한 벌"

key-files:
  created:
    - relay/src/journal/observer.ts
    - relay/src/journal/status.ts
    - relay/src/journal/trading-window.ts
    - relay/tests/journal-observer.test.ts
    - relay/tests/journal-status.test.ts
  modified:
    - relay/src/journal/types.ts
    - relay/src/ws/fanout.ts
    - relay/src/order/order-api.ts
    - relay/src/config.ts
    - relay/src/logger.ts
    - relay/tests/order-api.test.ts
    - relay/tests/journal-push.test.ts

key-decisions:
  - "재접속 로그인 since_seq = writer.lastReceivedSeq ?? 0 (plan 의 `?? cursor.lastSeq` 가 아님) — null 은 커서 없음 또는 새 epoch 첫 레코드 전이라, 옛 epoch 의 seq 를 새 epoch 와 짝지으면 게이트웨이가 새 epoch 앞 구간을 건너뛴다(Pitfall 3 변형). readCursor 가 커서를 기록기에 심으므로 커서가 있는 부팅은 첫 로그인부터 그 seq 로 이어받는다(테스트 ⑨)"
  - "파생 상태에서 rejected·disabled 는 기록기 db_error 로 덮지 않는다 — rejected 는 즉시 알림 대상이라 180초 규칙의 db_error 로 가려지면 안 된다"
  - "로그인 거부 시 stopReconnect 뒤 destroy 까지 한다(session #failNoRetry 순서 그대로) — 거부된 연결을 LivePing 으로 붙들고 있을 이유가 없다. 이후 up 이 와도 rejected 가드로 로그인 0"
  - "배치의 headSeq 는 적재 결과(gap/overflow)와 무관하게 갱신한다 — 게이트웨이가 알려 준 사실이라 lagSeq 원천으로 유효하다"
  - "로그인 전(logging_in 등)에 온 배치 · 예상 밖 시점의 로그인 응답은 warn 후 버린다 — 조용한 return 없음(S-5)"
  - "frame 리스너는 start() 안의 인라인 동기 블록으로 등록하고 stop() 뒤에는 #stopped 가드로 무력화한다 — up/down 은 off 로 떼고 전송은 destroy"

requirements-completed: [D-04, D-09, D-10, D-12, D-13]

coverage:
  - id: D1
    description: "tracer — 기동 → readCursor 1회 → connect → up → buildLoginReq(secret, since 0, epoch '', client) 1건 → 로그인 성공(access.replace · beginEpoch · resetReconnectAttempts · replaying) → 배치 push → live → journal.state live 프레임 · healthz journal.state live"
    requirement: D-13
    verification:
      - kind: integration
        ref: "relay/tests/journal-observer.test.ts#①~④"
        status: pass
    human_judgment: false
  - id: D2
    description: "거부 정지(stopReconnect 1회 · rejected 고정 · 이후 up 에도 로그인 0) · 5초 타임아웃 → dropTransport · 옛 세대 프레임 무시 · gap/overflow → dropTransport + since 이어받기 · resync → epoch 교체 · 76 무시 · 51 warn 1회 · malformed → error+drop · 커서 재시도 · 비밀 미설정 disabled · stop"
    requirement: D-13
    verification:
      - kind: unit
        ref: "relay/tests/journal-observer.test.ts#⑤~⑬"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-09 relay 몫 — 전 시나리오에서 송신 페이로드가 전부 buildLoginReq 결과 · T-19-03 로그 직렬화에 비밀 부재 · config production 필수/개발 disabled"
    requirement: D-10
    verification:
      - kind: unit
        ref: "relay/tests/journal-observer.test.ts#expectOnlyLogins · expectNoSecret · ⑭ · ⑮"
        status: pass
    human_judgment: false
  - id: D4
    description: "journal.state — 실제 WsFanout 에서 스냅샷은 알 때만 · deliverJournalState 는 인증 사용자 전원 · 자격증명 미등록 0 · 10초 디바운스(깜빡임 흡수 · delayed since · 복구 live · db_error · disabled 무프레임)"
    requirement: D-04
    verification:
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#⑤"
        status: pass
      - kind: unit
        ref: "relay/tests/journal-status.test.ts (JournalStatus describe)"
        status: pass
    human_judgment: false
  - id: D5
    description: "healthz 장중 503 — live 200 · connecting 179초 200 · 180초 503 · rejected 즉시 503 · db_error 181초 503 · disabled 200 · 장 밖 1시간 200(본문 노출) · vpn/dma 의미 불변 · 식별자 키 없음 · inTradingWindow 경계 9종"
    requirement: D-04
    verification:
      - kind: integration
        ref: "relay/tests/order-api.test.ts#journal 판정 (Phase 19 D-04)"
        status: pass
      - kind: unit
        ref: "relay/tests/journal-status.test.ts (inTradingWindow · journalAlerting)"
        status: pass
    human_judgment: false
  - id: D6
    description: "relay 타입체크 2종 0 error · 전체 relay 스위트 회귀 없음(기존 order-api 케이스 무수정)"
    verification:
      - kind: typecheck
        ref: "pnpm --filter @gh-radar/relay run typecheck && typecheck:tests"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/relay run test → 25 files / 595 passed"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-09-25
---

# Phase 19 Plan 07: relay 관찰자 상태기계 · 기록 상태 요약 · healthz 장중 알림 Summary

**관찰자는 DmaClient 소켓 하나로 게이트웨이에 로그인해 받은 저널 배치를 기록기에 넘긴다. 거부되면 멈춘 채로 드러나고, 끊기거나 밀리면 since 로 이어받는다. 그 상태 하나가 브라우저의 `journal.state`(10초 디바운스)와 `/healthz` 의 `journal` 필드(장중 180초 · 거부 즉시 503)에 같은 원천으로 나간다.**

## Performance

- **Duration:** 약 13분
- **Started:** 2026-09-24T16:23:31Z
- **Completed:** 2026-09-24T16:36Z (KST 2026-09-25 01:36)
- **Tasks:** 3/3
- **Files:** 신규 5 · 수정 7

## Accomplishments

- **관찰자(`observer.ts`)**:
  - 흐름은 커서 읽기 → 연결 → up → 로그인 요청 1건 → 로그인 응답 순이다. 커서는 반드시 연결 전에 읽는다.
  - 로그인이 성공하면 매핑을 교체하고(`access.replace`), 기록기 epoch 를 시작하고(`beginEpoch`), 재접속 카운터를 리셋한다. 그 뒤 headSeq 와 수신 seq 를 비교해 replaying 또는 live 로 간다.
  - 배치가 오면 `writer.push` 로 넘긴다. `caughtUp` 이면 live 로 간다.
  - 수신 콜백은 동기다. `awk` 수용 기준으로 await 가 0개임을 확인했다.
  - 실패 경로:
    - 로그인 거부: `stopReconnect("관찰자 로그인 거부")` 후 destroy 하고 rejected 로 고정한다. 게이트웨이 문구를 그대로 error 로그에 남긴다.
    - 로그인 응답이 5초 안에 오지 않으면(`LOGIN_RESP_TIMEOUT_MS` import) 연결을 끊는다.
    - 기록기가 `gap` 이나 `overflow` 를 돌리면 연결을 끊는다.
    - 프레임이 깨졌으면 error 를 남기고 끊는다.
    - 76 방송은 조용히 무시한다. 예상 밖 msgType 은 번호별로 warn 을 한 번만 남긴다.
    - 커서 읽기가 실패하면 `backoffDelayMs` 로 재시도한다. 성공하기 전에는 연결하지 않는다.
    - 비밀이 없으면 disabled 로 두고 warn 을 1회 남긴다.
  - 장 시간 판정은 연결 유지에 전혀 쓰지 않는다(D-13).
- **상태 요약(`status.ts`)**:
  - 파생 상태는 관찰자 상태에 기록기 `db_error` 를 겹친 것이다. rejected 와 disabled 는 덮지 않는다.
  - live 를 벗어난 뒤 10초가 지나면 `delayed(since)` 를 내고, 복귀하면 live 를 낸다. 3초 깜빡임은 흡수한다. 첫 이탈 시각은 기동 시각이다.
  - `health(nowMs)` 는 state · lastSeq · headSeq · lagSeq · disconnectedSec · lastAppliedAgeSec 여섯 필드를 돌려준다.
  - `journalAlerting` 은 순수 함수다.
- **장중 창(`trading-window.ts`)**: `kstDateIso` 로 얻은 KST 날짜로 요일과 휴장일을 본다. 시각은 그 날짜의 `T00:00:00+09:00` 기준으로 잰다. 창은 08:00 이상 20:00 미만이고, 15:31 도 창 안이다(NXT 애프터마켓).
- **fanout**:
  - `deliverJournalState` 는 `#users` 의 전원에게 보낸다. 내용이 사용자 데이터가 아니라 운영 상태라는 근거로, `#broadcastNxtSnap` 선례와 같은 방식이다.
  - `#onFirstMessage` 는 nxt.snap 뒤에 `journalState.frame()` 을 보내되, 값이 null 이 아닐 때만 보낸다.
- **healthz**: `journal` 소스가 있으면 필드를 항상 싣는다. 판정은 `linkUp && sessionsOk && journalOk` 로, 기존 식에 AND 만 더했다. 머리 주석에 「★ 2026-09-24 보강」 문단을 추가했다.
- **비밀**:
  - `DMA_OBSERVER_SECRET` 은 production 에서 비어 있으면 `throw` 한다. 개발과 테스트에서는 undefined 로 두고 관찰자를 disabled 로 둔다.
  - redact 경로 3개를 추가했다.
  - 관찰자 파일 안에 `secret` 과 `logger.` 가 같은 줄에 있는 경우는 0이다.

## Task Commits

1. **Task 1: [tracer] 기동 → 로그인 → 배치 1건 → 기록기 → live → journal.state · healthz journal 필드** — `b47f777` (feat)
2. **Task 2: 관찰자 실패 경로 — 거부 정지 · 타임아웃 · 갭/상한 · resync · 76 무시 · 커서 재시도 · 비밀 설정** — `4272d30` (feat)
3. **Task 3: 장중 창 · 기록 지연 디바운스 · healthz 503 규칙** — `9c5068f` (feat)

## TDD 증거

- 테스트와 구현은 task 마다 한 커밋에 들어 있다. RED 증거는 변이 실행으로 대신한다.
- Task 1: fanout `#onFirstMessage` 의 스냅샷 송신을 지우면 journal-push **⑤ 실패**(1/5), 되돌리면 통과한다.
- Task 3: 변이 3개를 넣으면 **3건 실패**한다. 3초 깜빡임 흡수 · 180초 경계(journalAlerting) · 180초 503(order-api) 이다. 넣은 변이는 다음과 같다.
  - `>= 180_000` → `>`
  - live 재발행 가드 제거
  - delayed 재무장 가드 제거
- Tracer feedback gate: auto 모드가 꺼져 있고 end-of-phase 에 `<verify>` 는 자동뿐이라 Task 1 `<verify>` 를 다시 돌렸다(4 files / 77 passed · 타입체크 2종 0). 그 뒤 확장을 진행했다.

## Verification

- `pnpm --filter @gh-radar/shared build` — 성공(shared 변경 없음 · webapp 타입체크 불요)
- `pnpm --filter @gh-radar/relay run typecheck` · `typecheck:tests` — 0 error
- `pnpm --filter @gh-radar/relay run test` — **25 files / 595 passed**(기준선 23 / 541 → 신규 2 파일 + 기존 파일 추가 케이스 54건)
- 수용 기준 grep(전부 PASS):
  - Task 1:
    - `LOGIN_RESP_TIMEOUT_MS` ∈ observer
    - `deliverJournalState` · `journalState` ∈ fanout(`#onFirstMessage` 698행)
    - frame 콜백의 await 0
    - order-api 식별자 키 0
  - Task 2:
    - `stopReconnect` 2줄
    - `dropTransport` 8줄
    - `DMA_OBSERVER_SECRET` ∈ config
    - `dmaObserverSecret` ∈ logger
    - `secret`+`logger.` 같은 줄 0
  - Task 3:
    - `isKrxHoliday` ∈ trading-window
    - `isKoreanMarketOpen` ∈ relay/src/journal 0
    - 두 상수 정본 줄 존재
    - `2026-09-24 보강` 존재
    - 기존 order-api 케이스 무수정 green

## Decisions Made

frontmatter `key-decisions` 6건 참조.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 버그] 재접속 로그인 since_seq 기본값 `?? cursor.lastSeq` → `?? 0`**
- **Found during:** Task 1
- **Issue:** 기록기 `lastReceivedSeq` 가 null 인 경우는 두 가지다. 커서가 없거나(이때 cursor.lastSeq 도 0이다), `beginEpoch` 로 epoch 가 바뀐 직후다. 뒤의 경우 plan 식대로 하면 새 epoch 와 옛 epoch 의 seq 가 짝지어진다. 그러면 게이트웨이가 새 epoch 의 앞 구간을 건너뛴다(조용한 누락).
- **Fix:** `writer.lastReceivedSeq ?? 0`. 커서가 있는 부팅은 `readCursor` 가 기록기에 lastSeq 를 심으므로 동작이 같다(테스트 ⑨ — 첫 로그인 since 5000 · epoch ep-old).
- **Files modified:** relay/src/journal/observer.ts
- **Commit:** b47f777

**2. [Rule 2 - 정확성] 로그인 거부 시 destroy · 예상 밖 시점의 로그인 응답과 로그인 전 배치 버림 · 로그인 송신 실패 시 끊기**
- **Found during:** Task 2
- **Issue:** plan 은 `stopReconnect` 만 명시했다. 거부 뒤에도 소켓이 LivePing 으로 살아 있을 수 있었다. 또 logging_in 이 아닐 때 온 로그인 응답이나 로그인 전에 온 배치를 처리하면 epoch 가 비어 있는 push(overflow 와 같은 의미)나 중복 매핑 교체가 생긴다.
- **Fix:** session `#failNoRetry` 순서대로 `stopReconnect` → `destroy` 를 한다. 상태가 맞지 않는 프레임은 warn 후 버린다. `send` 가 false 를 돌리면 `dropTransport("관찰자 로그인 송신 실패")` 를 부른다.
- **Files modified:** relay/src/journal/observer.ts
- **Commit:** 4272d30

**3. [Rule 2 - 정확성] 파생 상태에서 rejected·disabled 우선**
- **Found during:** Task 1
- **Issue:** plan 식(`dbError ? "db_error" : observer.state`)대로면 rejected 와 db_error 가 동시에 일어났을 때 db_error 로 보인다. 그러면 즉시 알림 대신 180초 규칙이 적용된다.
- **Fix:** 관찰자 확정 상태(rejected·disabled)를 먼저 본다. 테스트 「rejected 는 기록기 오류로 덮이지 않는다」 가 이를 잠근다.
- **Files modified:** relay/src/journal/status.ts
- **Commit:** b47f777

**4. [구조] `ObserverTransport.off` 추가 · 커버리지 파일 1개 추가 · 헬퍼 이름**
- `types.ts` 의 `ObserverTransport` 에 `off` 오버로드 3종을 더했다. `stop()` 이 up/down 리스너를 떼기 위해서다. `DmaClient` 는 EventEmitter 라 구조적으로 그대로 만족한다.
- behavior 4 의 「새로 인증한 연결은 스냅샷 1프레임」 을 **실제 WsFanout** 으로 검증하려고 `relay/tests/journal-push.test.ts` 에 ⑤ 를 추가했다. 이 파일은 files_modified 밖이지만, 실 ws 하네스가 이미 있는 파일이다.
- 관찰자 내부 끊기 헬퍼 이름은 `#dropTransport(reason)` 다(DmaClient 와 같은 이름). 호출하면 타이머를 해제하고 connecting 으로 전이한다.

**Total deviations:** 자동 수정 3건(Rule 1 한 건 · Rule 2 두 건)과 구조 한 건. **Impact:** 계약과 범위는 바뀌지 않았다. 조용한 누락 한 건과 알림 가림 한 건을 막았다.

## Issues Encountered

None.

## Notes for Later Plans

- **19-09(실 코덱):** `JournalCodec` 만 구현하면 된다. `decode` 는 76 을 `ignore`, 관찰자에 오면 안 되는 종류를 `unexpected`, 파싱 실패를 `malformed` 로 돌려준다. 이 plan 의 코드는 수정하지 않는다.
- **19-10(index.ts 결선):**
  - 부팅: `new JournalObserver({ secret: cfg.dmaObserverSecret, gateway, codec, writer, access, host: cfg.dmaHost, port: cfg.dmaPort })` → `new JournalStatus({ observer, writer })` → `status.on("frame", f => fanout.deliverJournalState(f))`. 이어서 `new WsFanout({ …, journalState: status })`, `createOrderApi({ …, journal: status })` 를 결선하고 `observer.start()` 를 부른다.
  - 종료: `observer.stop()` → `await writer.drain(2000)` → `writer.close()` · `access.close()` · `status.close()`.
  - `index.ts:34` 의 「부팅 시 DMA 게이트웨이에 미리 접속하지 않는다」 주석은 관찰자를 예외로 고친다(D-13).
- **19-11/19-12(배포):** 이 커밋 이후의 relay 이미지는 **production 에서 `DMA_OBSERVER_SECRET` 이 없으면 기동하지 않는다.** 시크릿 셸, 배포 스크립트 env 주입, VM 배치를 끝낸 뒤에만 relay 를 배포한다. `ops/alert-relay-down.yaml` 문서 표에 「503 `{"journal":{"state":…}}` → 관찰자 기록 연결」 행을 추가하는 일(RESEARCH Pattern G)은 이 plan 의 파일 밖이라 남겨 두었다.
- **overflow 재접속 주기:** 로그인이 성공할 때마다 재접속 카운터를 리셋하므로, DB 가 오래 느리면 약 1초 간격으로 「재접속 → 재생 → overflow → 끊기」 가 되풀이될 수 있다. 유실은 없다(since 가 적재한 seq 에 머문다). 운영에서 관측되면 live 도달 시에만 리셋하는 방안을 검토한다.

## Self-Check: PASSED

- 생성 파일 5종 존재 확인: observer.ts · status.ts · trading-window.ts · journal-observer.test.ts · journal-status.test.ts
- 커밋 존재 확인: `b47f777` · `4272d30` · `9c5068f`
