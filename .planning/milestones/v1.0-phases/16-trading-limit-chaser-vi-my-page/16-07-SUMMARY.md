---
phase: 16-trading-limit-chaser-vi-my-page
plan: 07
subsystem: api
tags: [relay, websocket, fanout, limit-chaser, vi-trigger, idor, rate-limit, typescript]

# Dependency graph
requires:
  - phase: 16-02
    provides: FakeGateway 전략 표면 (respondLimitChaserList/respondViTrigger/respondViOrderList · strategyRequests)
  - phase: 16-03
    provides: 인바운드 계약 9종 + `#onAuthedMessage` 좁히기 선행 배치
  - phase: 16-04
    provides: 전략 요청 조립기 4종 (10·11·14·33) + OrderBuildError
  - phase: 16-06
    provides: Hub 전략 캐시 3맵 + getLimitChasers / getViTrigger(3상태) / getViOrders
provides:
  - "인증 직후 전략 스냅샷 3프레임 팬아웃 (lc.snap · vi · vi.list) — 브라우저가 요청하지 않는다 (D-12)"
  - "전략 인바운드 4종 핸들러 (lc.set · vi.set · vi.confirm · strategies.disable) — wss → DMA 세션 (D-01)"
  - "계좌 화이트리스트 대조를 wss 표면으로 확장 — 원천은 session.allowedAccounts 하나 (T-16-01)"
  - "INBOUND_RATE_LIMIT_PER_SEC / INBOUND_RATE_BURST — 연결당 인바운드 토큰 버킷 (T-16-06)"
  - "RELAY_MSG_SOURCE — relay 발 거부 통지를 게이트웨이 ServerMessage(54) 와 구분하는 src 값"
  - "FanoutSessions.get(userId) — 16-08 주문 핸들러가 그대로 쓸 세션 조회 계약"
  - "relay/tests/fanout.test.ts 전략 케이스 10종 (변이 주입 9종으로 실효성 실측)"
affects: [16-08, 16-09, 16-10, 16-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "전략 인바운드는 order-api.ts 의 ①②③(세션 확인 → 계좌 대조 → 조립·송신)을 HTTP 껍데기만 벗겨 그대로 이식한다 — 순서가 곧 방어선이다"
    - "거부는 반드시 로그 + 프레임 양쪽에 남긴다. 전략은 서버가 거부를 응답 코드로 주지 않으므로 relay 가 침묵하면 사용자에게는 「눌렀는데 아무 일도 없음」이 전부다"
    - "relay 가 만드는 통지는 src 로 발신자를 가른다 — 게이트웨이 값을 흉내 내면 브라우저의 주인 판정이 오독한다"
    - "인바운드 상한은 토큰 버킷 + 구간당 경고 1회. 건마다 로그하면 로그가 두 번째 DoS 다"
    - "새 인바운드를 추가할 때는 좁히기(keyOf) 앞에 분기를 놓는다 — 필드 유무가 갈리는 지점이 곧 분기 순서의 제약이다"

key-files:
  created: []
  modified:
    - relay/src/ws/fanout.ts
    - relay/tests/fanout.test.ts

key-decisions:
  - "거부 프레임은 `{t:\"msg\", lv:\"ERROR\", src:\"Relay\"}` 다 — 상태 프레임(`{t:\"state\"}`)은 세션 상태의 정본이라 「이 계좌는 못 쓴다」 같은 요청 단위 사유를 실으면 배지 의미가 오염된다. `src` 를 게이트웨이 값(\"Account\")으로 두지 않은 것이 핵심이다: 브라우저의 VI 주인 판정이 `src===\"Account\" ∧ i===\"\"` 라 그대로 흉내 내면 relay 거부가 VI 통지로 읽힌다 (Pitfall 9)"
  - "세션 부재는 `{t:\"state\", s:\"failed\", msg}`, 세션 미준비는 `session.stateFrame(msg)` 로 **현재 상태 그대로** 되돌린다 — 배지와 거부 사유가 한 프레임에서 맞는다"
  - "rate-limit 은 `#onAuthedMessage` 의 **첫 문장**이다. 재인증 시도·unauthorized 요청·sub/unsub 까지 같은 버킷을 쓴다 — 경로마다 버킷이 갈리면 합계 상한이 없는 것과 같다"
  - "조립·송신은 공통 헬퍼로 묶되 `session.send(` 호출은 **4개 분기에 각각** 남겼다 — 「무엇이 게이트웨이로 나가는가」가 분기를 읽는 것만으로 보여야 하고, 그 한 줄까지 헬퍼로 감추면 전송 지점이 코드에서 사라진다"
  - "keyOf 이동은 별도 refactor 커밋으로 갈랐다 — 동작 변화 0 인 이동과 새 분기 추가를 한 커밋에 섞으면 회귀 시 이분 탐색이 두 벌을 함께 되돌린다"

patterns-established:
  - "전략/주문 인바운드 분기의 골격: 상한 → 재인증 가드 → unauthorized 가드 → (필드 없는) 명령 분기 → 좁히기 → 시세 구독. 16-08 주문 2종은 명령 분기 자리에 그대로 붙는다"
  - "변이 주입으로 테스트 실효성을 실측한다 — 9종 전부가 의도한 케이스에서 red 임을 확인한 뒤에야 green 을 신뢰한다"

requirements-completed: [TRADE-03]

# Metrics
duration: 19min
completed: 2026-09-08
---

# Phase 16 Plan 07: wss 전략 인바운드 · 스냅샷 팬아웃 Summary

**인증만 하면 전략 3프레임이 구독 없이 내려가고(D-12), 전략 4종이 `session.allowedAccounts` 대조를 통과한 뒤에만 DMA 세션으로 나가며(T-16-01), 그 경로에 relay 자체 인바운드 상한(T-16-06)을 건다 — 그리고 그 전부를 변이 주입 9종으로 실효성 검증한 10 케이스가 고정한다**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-08T11:24:00Z
- **Completed:** 2026-09-08T11:43:00Z
- **Tasks:** 3 (커밋 4건 — Task 2 의 `keyOf` 이동을 별도 커밋으로 분리)
- **Files modified:** 2 (created 0, modified 2)

## Accomplishments

- **「페이지가 요청하지 않는 데이터」의 마지막 구간이 이어졌다.** 16-06 이 Ready 프리페치로 채워 둔 전략 캐시 3맵을 아무도 읽지 않고 있었다. 이제 `#onFirstMessage` 가 계좌 스냅샷 루프 **바로 뒤**에서 `lc.snap` · `vi` · `vi.list` 를 그 연결로 내린다 — 종목 구독 0건, 브라우저 요청 0건이다(테스트 ⑬ 이 `refCount === 0` 으로 못박는다).
- **「0건」과 「아직 모른다」가 와이어까지 갈렸다.** `lc.snap`·`vi.list` 는 비어 있어도 1프레임을 보낸다(빈 배열은 「전략 없음」의 확정 정보다 — 안 보내면 브라우저가 영원히 스켈레톤). 반대로 `getViTrigger()` 가 `undefined` 면 `vi` 를 **보내지 않는다**. 16-06 이 캐시 반환 타입에서 만든 3상태가 여기서 뭉개졌다면 사용자가 입력 중인 금액이 지워졌을 것이다.
- **IDOR 방어선이 wss 표면까지 왔다.** `lc.set`/`vi.set` 의 `accountNo` 는 `session.allowedAccounts.some(...)` 를 통과해야만 조립기에 닿는다. 게이트웨이의 `CheckSessionAccount` 는 2중 차단이지만 **조용하므로**, relay 가 먼저 막고 사유를 돌려준다 — 막힌 줄 모르는 사용자가 같은 요청을 반복하는 것이 더 나쁜 결과다. 테스트 ⑯ 이 「거부 시 게이트웨이로 msg_type 10 이 0건」과 「로그에 계좌 원문 미포함」을 함께 단언한다.
- **`apiRateLimiter` 를 우회하는 새 경로에 상한이 생겼다.** 연결당 초당 10건 토큰 버킷(`INBOUND_RATE_LIMIT_PER_SEC` 로 export)이고 `sub`/`unsub` 도 같은 버킷을 쓴다. 초과분은 **드롭**이지 close 가 아니다 — 과속은 프로토콜 위반이 아니고, 끊으면 브라우저가 재접속해 같은 부하를 다시 만든다.
- **조용한 실패가 0이다.** 세션 부재·미준비·계좌 거부·조립 예외(`OrderBuildError`)·송신 실패 5경로 전부가 **로그 + 프레임** 양쪽으로 드러난다. 전략은 서버가 거부를 응답 코드로 주지 않으므로(Pitfall 8) relay 가 침묵하면 사용자에게 남는 정보가 하나도 없다.
- **전송 경로 추가 0.** `grep -c "new WebSocket\|conn.ws.send("` 가 이 plan 전후로 **똑같이 2** 다 — 스냅샷도 거부 통지도 기존 `#send`/`#deliver` 만 탄다 (T-16-02).
- **주기 타이머 추가 0.** rate-limit 은 `Date.now()` 기반 토큰 버킷이라 타이머가 없다. `fanout.ts` 의 `setTimeout(`/`setInterval(` 는 3건으로 base 와 동일하고 hub 는 여전히 1건이다 (D-13 유지).
- **변이 주입 9종 전부가 red 였다** — 테스트가 무엇을 잡는지 실측했다(아래 Verification).

## Task Commits

1. **Task 1: auth 직후 전략 스냅샷 3프레임 팬아웃** — `38225cf` (feat)
2. **Task 2-①: `keyOf` 를 sub/unsub 분기 안으로 이동 (동작 변화 0)** — `92e8118` (refactor)
3. **Task 2-②③④: 전략 인바운드 4종 + 계좌 대조 + 인바운드 상한** — `e4b9ea5` (feat)
4. **Task 3: fanout 전략 테스트 10종** — `c5fdc53` (test)

## Files Created/Modified

- `relay/src/ws/fanout.ts`
  - 파일 상단 결정 근거에 **D-01 · T-16-01 · T-16-06** 추가 + 「하지 않는 것」 갱신(주문은 D-08 이 아니라 **16-08 이 붙인다**로 정정)
  - 연결 수명 주석에 6단계(계좌·전략 스냅샷) 삽입 — 번호 재정렬
  - 상수 3개 export: `INBOUND_RATE_LIMIT_PER_SEC` · `INBOUND_RATE_BURST` · `RELAY_MSG_SOURCE`
  - 모듈 스코프 `rejectFrame(reason, accountNo?, isin?)` — relay 발 거부 통지 조립
  - `FanoutSessions` 에 `get(userId): DmaSession | undefined` 추가
  - `Conn` 에 토큰 버킷 3필드(`rateTokens` · `rateRefilledAtMs` · `rateWarned`)
  - `#onFirstMessage`: 계좌 스냅샷 루프 뒤 전략 3프레임 (`getLimitChasers` / `getViTrigger` / `getViOrders` 각 1회)
  - `#onAuthedMessage`: 초입 `#allowInbound` → 전략 4종 분기(각각 `session.send(` 로 끝난다) → 주문 catch-all → `keyOf` 를 품은 sub/unsub
  - 헬퍼 5개: `#strategySession`(①) · `#accountAllowed`(②) · `#buildStrategyPayload`(③-a) · `#onStrategySendFailed`(③-b) · `#allowInbound`(④)
- `relay/tests/fanout.test.ts`
  - 헤더에 Phase 16 검증 대상 5줄 추가
  - 픽스처: `lcInput()`(33필드) · `rootEnvelope()` · `framesOf()` · `OTHER_ISIN` · `FOREIGN_ACCOUNT_NO`
  - 신규 케이스 ⑬~㉒ 10종

## Decisions Made

**1. 거부 프레임은 `{t:"msg", src:"Relay"}` — 상태 프레임을 재사용하지 않는다.**
플랜이 「`{t:"state", s:<현재상태>}` 또는 서버메시지 성격의 거부 프레임」으로 재량을 남긴 지점이다. 둘을 갈랐다: **세션의 상태**(없음/미준비)는 상태 프레임이 정확한 표현이고, **요청 단위 사유**(이 계좌는 못 쓴다 / 형식이 틀렸다 / 못 보냈다)는 `{t:"msg"}` 다. 상태 프레임에 요청 사유를 실으면 배지가 「권한 없음」과 「이 요청만 거부」를 구분하지 못한다.

`src` 값을 `"Relay"` 로 못박은 것이 이 결정의 핵심이다. 브라우저는 VI 통지의 주인을 `src === "Account" ∧ i === ""` 로 판정하는데(Pitfall 9), relay 거부가 게이트웨이 값을 흉내 내면 **계좌 거부 메시지가 VI 발동 통지 자리에 뜬다**. 계약(`RelayServerMsg.src`)이 이미 "Account"/"System" 등 자유 문자열이라 새 필드를 만들지 않고 값만 갈랐다.

**2. `session.send(` 를 4개 분기에 각각 남겼다.**
try/catch 와 실패 통지는 헬퍼로 묶었지만 **송신 한 줄은 묶지 않았다**. 이 파일에서 「무엇이 실계좌로 나가는가」는 분기를 읽는 것만으로 보여야 한다. 송신까지 헬퍼 안으로 넣으면 `fanout.ts` 를 grep 해도 게이트웨이로 나가는 지점이 1곳으로만 보이고, 새 명령을 추가하는 사람이 대조 단계를 건너뛴 채 헬퍼만 부르기 쉬워진다.

**3. rate-limit 은 `#onAuthedMessage` 의 첫 문장이다.**
플랜의 「초입」을 문자 그대로 잡았다 — 재인증 시도(`auth`)와 `unauthorized` 연결의 요청까지 같은 버킷을 지난다. 그 둘을 상한 밖에 두면 「거부당하는 요청」만으로 로그와 CPU 를 태우는 경로가 남는다. 버킷 잔량 검사가 `Date.now()` 기반이라 **타이머를 만들지 않는다**(D-13 규율과 같은 방향).

**4. 경고 억제는 「구간당 1회」다 — 성공 프레임이 오면 다시 열린다.**
`rateWarned` 를 성공 시 `false` 로 되돌린다. 영구 억제면 재발을 놓치고, 억제가 없으면 초당 수백 건 상황에서 로그가 두 번째 DoS 가 된다. 테스트 ㉑ 이 「상한+5 를 던지면 warn 이 정확히 1회」로 이 동작을 고정한다.

**5. `vi.confirm`/`strategies.disable` 은 계좌 대조를 건너뛴다 — 지어내지 않는다.**
플랜 지시이기도 하지만 근거를 코드 주석에 남겼다: 확인 체크의 대조 정본은 **서버의 주문번호 소유권**이고, 비활성화의 대상은 **그 세션 안**이다. 여기서 계좌를 추측해 대조를 만들면 근거가 두 벌이 되고, 둘이 갈리는 순간 어느 쪽이 정본인지 알 수 없어진다.

**6. `keyOf` 이동을 별도 커밋으로 갈랐다.**
플랜이 「이동만 하는 커밋 단위로 다루라」고 명시했다. `92e8118` 은 동작 변화 0(테스트 292건 그대로 green)이고, 새 분기는 `e4b9ea5` 다. 회귀가 나면 이분 탐색이 두 변경을 함께 되돌리지 않는다.

## Deviations from Plan

None — 플랜에 쓰인 대로 실행했다. 플랜이 재량으로 남긴 두 지점(거부 프레임의 형태 · rate-limit 상수의 값)은 위 「Decisions Made」 1·3 에 근거와 함께 기록했다.

## Verification

**게이트 (전부 exit 0)**
- `pnpm --filter @gh-radar/relay run typecheck` — src
- `pnpm --filter @gh-radar/relay run typecheck:tests` — **tests 를 별도로 돌렸다**(root `pnpm typecheck` 는 relay `tests/` 를 exclude 한다)
- `pnpm typecheck` — 13 패키지 전량
- `pnpm --filter @gh-radar/relay test` — **16 파일 302 케이스** (base 292 + 신규 10)

**acceptance 게이트 실측**
| 항목 | 기대 | 실측 |
|---|---|---|
| `grep -c "new WebSocket\|conn.ws.send("` | base 와 동일 | 2 (base 2) |
| `grep -c "allowedAccounts"` | ≥ 2 | 3 |
| `grep -c "maskAccountNo"` | ≥ 1 | 2 |
| `grep -c "session.send("` | 4 (분기당 1) | 4 |
| `keyOf(` 호출 위치 | sub/unsub 분기 **안**에만 | 586(sub) · 605(unsub) — 가드 직후 0건 |
| `hub.getLimitChasers` / `getViOrders` / `getViTrigger` | 각 1회 | 1 / 1 / 1 |
| `fanout.ts` 의 `setTimeout(`·`setInterval(` | base 와 동일 | 3 (base 3) |
| `subscription-hub.ts` 타이머 | 1 유지 (D-13) | 1 |

**변이 주입 9종 — 9/9 red (테스트 실효성 실측)**

| # | 주입한 결함 | red 가 된 케이스 |
|---|---|---|
| M1 | 인증 직후 `lc.snap` 전송 삭제 | ⑬ · ⑭ |
| M2 | `getViTrigger` 3상태 뭉개기(`undefined` → `null` 로 전송) | ⑭ |
| M3 | 계좌 화이트리스트 대조 무력화 | ⑯ |
| M4 | 인증 직후 `vi.list` 전송 삭제 | ⑬ · ⑭ |
| M5 | 인바운드 상한 무력화 | ㉑ |
| M6 | `#deliver` 를 전 사용자 순회로 확대 | ⑦ · ㉒ |
| M7 | `unauthorized` 연결에도 전략 스냅샷 전송 | ④ · ⑮ |
| M8 | `strategies.disable` 을 조용히 드롭 | ⑲ |
| M9 | 전략 분기를 sub/unsub 좁히기 **뒤로** 이동 (Pitfall 14 회귀) | ⑯ · ⑰ · ⑱ · ⑲ · ⑳ · ㉑ |

M9 가 신규 6 케이스를 한 번에 red 로 만든 것이 이 plan 의 핵심 리스크(분기 순서)를 테스트가 실제로 지키고 있다는 증거다.

## Issues Encountered

**1. `getViTrigger` 가 `undefined` 인 상태를 테스트에서 만들 수단이 없었다.**
`FakeGateway` 는 `GetVITriggerReq(21)` 에 **반드시** 자동 응답한다(실서버의 「무응답 금지」 규약 재현). 그래서 `respondViTrigger(null)` 로는 `null`(미등록 확정)까지만 만들어지고 `undefined`(아직 조회 못 함)에 도달할 수 없다. 스텁에 「전략 조회 침묵」 옵션을 새로 만들지 않고, **로그인을 끝내지 않은 세션**(`gateway.silenceLogin()` + 새 사용자)으로 재현했다 — Ready 프리페치가 아예 돌지 않으므로 61 을 한 번도 받지 못한 상태가 자연스럽게 만들어진다. 스텁의 계약(조회에는 반드시 답한다)을 훼손하지 않는 쪽을 택했다.

**2. 테스트가 첫 실행에 전부 green 이었다.**
그래서 변이 주입 9종으로 실효성을 실측했다(위 표). M1~M9 전부가 의도한 케이스에서 red 였고, ⑰·⑱·⑳ 처럼 앞선 8종이 건드리지 못한 케이스는 M9(분기 순서 회귀)가 덮었다.

## User Setup Required

None — 외부 서비스 설정이 필요하지 않다.

## Next Phase Readiness

- **16-08(주문 wss 이관)이 붙을 자리가 준비됐다.** `#onAuthedMessage` 의 「주문 catch-all」(`msg.t !== "sub" && msg.t !== "unsub"`)이 지금 `order.new`/`order.cancel` 만 남긴 채 warn 을 남기고 있다. 16-08 은 전략 4종과 **같은 자리·같은 ①②③ 순서**로 2분기를 추가하고 catch-all 을 지우면 된다. 세션 조회(`FanoutSessions.get`)·계좌 대조(`#accountAllowed`)·조립 예외 처리(`#buildStrategyPayload`)·상한(`#allowInbound`)이 전부 재사용 가능하다.
- **브라우저(16-09 이후)가 기대할 수 있는 계약이 확정됐다:** 인증 → 상태 프레임 → 계좌 스냅샷 → `lc.snap` → (`vi`) → `vi.list` 순으로 온다. `vi` 프레임의 부재는 「아직 모른다」이지 「미등록」이 아니다 — UI 는 그 경우 폼을 건드리지 않아야 한다.
- **거부 통지의 소비자가 아직 없다.** `{t:"msg", src:"Relay", lv:"ERROR"}` 는 계약상 `RelayServerMsg` 라 15-12 의 상태 영역 누적 로직이 그대로 받지만, 「relay 발」과 「게이트웨이 발」을 UI 가 구분해 보여줄지는 16-09/16-10 의 결정이다.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*

## Self-Check: PASSED

- 파일 3종 존재 확인: `relay/src/ws/fanout.ts` · `relay/tests/fanout.test.ts` · `16-07-SUMMARY.md`
- 커밋 4건 존재 확인: `38225cf` · `92e8118` · `e4b9ea5` · `c5fdc53`
- 삭제된 추적 파일 0건 (`git diff --diff-filter=D HEAD~4 HEAD` 빈 출력)
