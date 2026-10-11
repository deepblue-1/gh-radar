---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 03
subsystem: api
tags: [tcp, connection-lifecycle, state-machine, reconnect, backoff, session, refcount, vitest]

# Dependency graph
requires:
  - phase: 15-01
    provides: "relay/ 워크스페이스 · config(DMA_HOST/DMA_PORT/SESSION_GRACE_MS) · logger(redact) · packages/shared/src/relay.ts"
  - phase: 15-02
    provides: "codec.ts(frame/FrameReader/desync) · envelope.ts(빌더 5종·tryParseEnvelope·parseLoginResp) · msg-type.ts · tests/helpers/fake-gateway.ts"
  - phase: external/gh-trade
    provides: "client/Services/DMA/Client.cs(상수·NoDelay·generation·백오프) · Session.cs(부트 시퀀스·Fail/FailNoRetry·bootPhase)"
provides:
  - "relay/src/dma/dma-client.ts — net.Socket 수명 + generation 4지점 + 30초 LivePing + 지수 백오프(상한 10회) + desync 재수립 + 송신 정체 감지"
  - "relay/src/dma/session.ts — 상태기계 10상태(idle + RelaySessionState 9종) + LoginResp 5초 타임아웃 + failNoRetry + ready 재구독 트리거 + 비밀번호 미노출"
  - "relay/src/dma/session-manager.ts — userId 키 참조계수 + 5분 유예 소멸 + closeAll + stats(식별자 무포함)"
  - "relay/tests/helpers/fake-gateway.ts — silenceLogin() 추가(붙었지만 응답 없는 게이트웨이 재현)"
affects: [15-04, 15-05, 15-07, 15-08, 15-09, 15-10, 15-11, 15-13, 15-14, 15-15, 15-16, 15-17, 15-18, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "연결 수명 관리는 3층 분리 — DmaClient(TCP가 붙었는가) / DmaSession(운용 준비가 됐는가) / SessionManager(누구의 세션인가)"
    - "generation 대조를 모든 비동기 콜백 진입부에 둔다 — 구세대는 아무것도 보고하지 않는다"
    - "TCP 가 올라오는 모든 경로가 부트 워커 1곳을 탄다 — 재구독 트리거는 ready 이벤트 하나뿐 (Pitfall 4)"
    - "재시도해도 결과가 같은 실패(로그인 거부)는 백오프에 넘기지 않고 루프를 끊는다 (failNoRetry)"
    - "소켓 I/O 를 기다리는 테스트는 고정 flush 횟수로 단정하지 않고 조건이 설 때까지 폴링한다"

key-files:
  created:
    - relay/src/dma/dma-client.ts
    - relay/src/dma/session.ts
    - relay/src/dma/session-manager.ts
    - relay/tests/dma-client.test.ts
    - relay/tests/session.test.ts
    - relay/tests/session-manager.test.ts
  modified:
    - relay/tests/helpers/fake-gateway.ts

key-decisions:
  - "generation 증가 지점을 DmaClient 4곳으로 고정(수립·단절 확정·수동 재접속·종료) — Session 이 자기 세대를 따로 들지 않고 client.generation 을 정본으로 본다"
  - "운용 중 재수립 실패는 dropTransport(백오프 카운터 유지)로 넘긴다 — manualReconnect 를 쓰면 카운터가 0 으로 돌아가 상한 10회가 무력화된다"
  - "RECV_CHUNK_SIZE 는 소켓에 주입하지 않는다 — net.Socket 생성자에 공개 highWaterMark 옵션이 없고, onread 고정 버퍼는 재사용이라 매 청크 복사가 필요해 이득이 없다"
  - "상태 게터 이름을 accounts 가 아니라 allowedAccounts 로 둔다 — `get accounts()` 는 D-25 게이트 grep(`accounts()` 0건)을 스스로 깨뜨린다"
  - "로그인 거부(session_rejected) 세션은 재접속이 와도 재생성하지 않는다 — 브라우저 자동 재접속이 KB 계정 잠금 경로가 되는 것을 구조적으로 막는다"
  - "회선 실패(failed/manual_required)는 참조계수 0→1 새 접속에서만 재생성 — 영원히 '회선 단절'만 보는 막다른 길을 막되 초당 재시도는 열지 않는다"
  - "소켓 I/O 대기를 waitFor 조건 폴링으로 통일 — 고정 flush 로는 3회 중 2회 실패하는 간헐 실패가 실제로 재현됐다"

patterns-established:
  - "실패의 갈림길은 bootPhase 다 — 부트 실패는 failed(즉시 확정), 운용 중 실패는 전송만 끊어 백오프에 넘긴다"
  - "비밀 보관 객체는 toJSON/toString/util.inspect.custom 셋을 모두 덮는다 — pino redact 는 2차 방어일 뿐이다"
  - "세션 매니저의 5경로(신규·재사용·유예 예약·유예 취소·유예 만료)는 전부 사유 로깅"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-09-05
---

# Phase 15 Plan 03: DMA 연결 수명 관리 3층 (DmaClient · DmaSession · SessionManager) Summary

**gh-trade C# 클라이언트의 연결 수명 규율(generation·30초 핑·지수 백오프 상한 10회·FailNoRetry·bootPhase 분기)을 TypeScript 3층으로 이식하고, 가짜 게이트웨이로 "단절 → 백오프 → 재로그인 → Ready 복귀"와 "로그인 거부 시 루프 즉시 중단"을 28건 통합 테스트로 못박음**

## Performance

- **Duration:** 약 25분
- **Started:** 2026-09-05T22:05Z (worktree base 541aaaa 로 정정 후)
- **Completed:** 2026-09-05T22:30Z
- **Tasks:** 3/3
- **Files modified:** 7 (신규 6 · 수정 1)

## Accomplishments

- **SC-3 본체 완성.** 상태기계가 `connecting → logging_in → declaring → ready` 를 밟고, 단절 시 백오프 재접속 → 재로그인 → Ready 복귀까지 가짜 게이트웨이로 증명했다(테스트 ④가 상태 시퀀스 8단계를 배열째 단언한다).
- **자기유발 DoS 차단(T-15-10).** 재접속은 1→2→4→8→16→30초로 벌어지고 **10회에서 멈춘다**(`exhausted` → `manual_required`). 서버가 로그인을 거부하면 백오프를 한 번도 돌리지 않고 `session_rejected` 로 확정한다 — 테스트가 "거부 후 10분이 흘러도 재접속 시도 0건"을 단언한다.
- **구세대 침묵 보장.** `generation` 증가를 4지점으로 고정하고 모든 비동기 콜백 진입부에서 대조한다. `destroy()` 후 도착한 프레임이 아무 이벤트도 만들지 않음을 테스트가 직접 확인한다.
- **수신 경로 무대기(D-32).** `dma-client.ts` 에 `await` 가 **0줄**이다(acceptance grep). 게이트웨이 송신 큐를 채워 연결이 끊기는 경로를 구조적으로 막았다. `desync` 는 드롭이 아니라 연결 재수립으로 이어지고, 재수립까지 테스트가 확인한다.
- **비밀번호 미노출(T-15-19).** `#password` private 필드 + `toJSON`/`toString`/`util.inspect.custom` 3중 차단. 테스트가 상태 프레임 전량·객체 직렬화·`inspect(depth:5)` 어디에도 비밀번호와 **DMA user_id** 가 없음을 단언한다.
- **SC-4 세션 수명.** 같은 사용자의 탭 여러 개 = TCP 1개, 사용자 2명 = 세션 2개(독립), 마지막 wss 종료 후 4분 59초에는 살아 있고 5분에 종료, 유예 중 재연결이면 같은 인스턴스 재사용 — 전부 테스트로 고정.
- **테스트 간헐 실패를 처음부터 제거.** 소켓 I/O 대기를 조건 폴링(`waitFor`)으로 통일했다. 5회 연속 전체 실행에서 85/85 통과.

## Task Commits

1. **Task 1: DmaClient — 소켓 수명 + generation + LivePing + 백오프 재접속** — `140cf60` (feat)
2. **Task 2: DmaSession — 8+상태 상태기계 + 5초 타임아웃 + FailNoRetry** — `ac256e3` (feat)
3. **Task 3: SessionManager — userId 참조계수 + 5분 유예** — `80bcf60` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

| 파일 | 역할 |
|------|------|
| `relay/src/dma/dma-client.ts` | 상수 정본 6종 · `connect/manualReconnect/stopReconnect/resetReconnectAttempts/dropTransport/destroy/send` · `backoffDelayMs` · 이벤트 5종(up/down/frame/reconnecting/exhausted) · 30초 핑 · 송신 정체(drain 2초) 감지 |
| `relay/src/dma/session.ts` | `DmaSessionState` 10종 · 부트 워커 1곳 · `LOGIN_RESP_TIMEOUT_MS`/`ACCOUNT_RESP_TIMEOUT_MS`/`MAX_ACCOUNT_NO_LEN` · `fail`/`failNoRetry` 분기 · `stateFrame()` · `allowedAccounts` · `ready` 이벤트 |
| `relay/src/dma/session-manager.ts` | `SESSION_GRACE_MS` · `acquire/release/get/closeAll/stats` · 5경로 로깅 · 거부 세션 비재생성 정책 |
| `relay/tests/dma-client.test.ts` | 11건 — up/핑 2회/hardClose 재접속/10회 소진/쓰레기 프레임 2종/desync 재수립/NoDelay spy/세대 교체 침묵/무연결 send/stopReconnect/백오프 수열 |
| `relay/tests/session.test.ts` | 9건 — 부트 시퀀스/4.9초·5.0초 경계/거부→session_rejected+재시도 0/재접속 후 ready 복귀(시퀀스 8단계)/상한 소진→manual_required/비밀 미노출/계좌 0건 ready/운용 중 실패의 카운터 유지/거부 상태에서 수동 재접속 차단 |
| `relay/tests/session-manager.test.ts` | 8건 — 탭 공유/사용자 독립/유예 경계(4분59초 vs 5분)/유예 취소 재사용/closeAll 타이머 정리/stats 무식별자/거부 세션 비재생성/없는 세션 release |
| `relay/tests/helpers/fake-gateway.ts` | `silenceLogin()` 1개 추가 (수정) |

## Decisions Made

**1. `generation` 의 정본은 `DmaClient` 하나다.**
C# 은 `Client` 와 `Session` 이 각자 세대를 들지만, TS 이식에서는 `Session` 이 `client.generation` 을 그대로 본다. 두 벌로 두면 "어느 세대와 대조해야 하는가"가 코드마다 갈리고, 실제로 C# 의 세대 버그 이력(CR-01/WR-02)이 그 지점에서 나왔다. 증가 지점은 **연결 수립·단절 확정·수동 재접속·종료** 4곳뿐이고 각 지점에 `[generation 증가 ①~④]` 주석을 달았다.

**2. 운용 중 재수립 실패에는 `dropTransport` 를 쓴다 — `manualReconnect` 가 아니다.**
Ready 이후 재접속에서 로그인이 5초 안에 안 오면 전송을 끊어 백오프에 넘겨야 하는데, `manualReconnect()` 는 **재접속 카운터를 0 으로 되돌린다**. 그것을 쓰면 "로그인은 계속 실패하는데 재접속은 영원히 도는" 상태가 되어 상한 10회(T-15-10)가 무력화된다. 그래서 카운터를 건드리지 않는 `dropTransport(reason)` 를 따로 열었다(아래 Deviations 1).

**3. `RECV_CHUNK_SIZE` 를 소켓에 주입하지 않는다.**
`net.Socket` 생성자에는 공개 `highWaterMark` 옵션이 없다(`SocketConstructorOpts` = fd/allowHalfOpen/onread/readable/writable/signal). 타입 캐스트로 밀어 넣는 것은 문서화되지 않은 런타임 동작에 기대는 일이고, `onread` 고정 버퍼는 **버퍼를 재사용**하므로 `FrameReader` 로 넘기기 전에 매 청크 복사가 필요해 이득이 사라진다. 상수는 C# 대응표를 코드 한 곳에서 읽기 위해 남기고, 그 사실을 주석에 명시했다. 수신 **누적** 상한 정본은 `codec.ts` 의 `MAX_RECV_BUFFER_SIZE` 다.

**4. 계좌 게터 이름은 `allowedAccounts` 다.**
`get accounts(): RelayAccount[]` 로 쓰면 소스에 문자열 `accounts()` 가 생겨 이 plan 의 D-25 게이트 검사(`grep -c 'accounts()' session.ts` == 0)를 **자기 코드로 깨뜨린다**. 게이트의 의도는 "생성 코드의 계좌 접근자를 참조하지 마라"이므로, 의미가 더 정확한 이름(D-14 의 "허용 계좌")으로 바꿔 게이트를 살렸다.

**5. 로그인 거부 세션은 재접속이 와도 재생성하지 않는다.**
브라우저 훅(15-12)은 wss 가 끊기면 자동 재접속한다. `session_rejected` 세션을 acquire 때마다 새로 만들면 **초 단위로 거부 로그인을 반복**하게 되어 `failNoRetry` 로 막은 계정 잠금 경로가 매니저 층에서 되살아난다. 그래서 죽은 세션을 그대로 돌려주고 상태 프레임이 이유를 설명한다. 반대로 회선 실패(`failed`/`manual_required`)는 참조계수 0→1 인 **새 접속에서만** 재생성한다 — 그러지 않으면 "새로고침해도 영원히 회선 단절"인 막다른 길이 된다.

**6. 소켓 I/O 대기는 고정 flush 가 아니라 조건 폴링이다.**
처음에는 `flushIo(6)` 같은 고정 횟수로 단언했는데, **같은 파일 안에서 3회 중 2회 실패**하는 간헐 실패가 재현됐다(앞선 테스트가 남긴 부하에 따라 accept/재접속이 몇 바퀴 만에 서는지가 달라진다). `waitFor(predicate, label)` 로 통일하고, "일어나지 않음"을 단언할 때만 고정 flush 를 남겼다. 실패 시 조건 이름이 그대로 에러 메시지에 찍힌다.

**7. 가짜 타이머는 `setTimeout/setInterval` 만 바꾼다.**
`setImmediate` 까지 가짜로 두면 실제 이벤트 루프로 넘어가는 통로가 막혀 소켓 I/O 가 영원히 오지 않는다. `toFake` 를 명시해 `setImmediate`·`Date` 를 진짜로 남겼고, 그 이유를 테스트 파일 상단 docblock 에 박았다.

## Deviations from Plan

### 구조 추가 (계획된 파일 외 2건)

**1. [Rule 3 - Blocking] `DmaClient.dropTransport(reason)` 공개 메서드 추가**
- **Found during:** Task 2 (Session 의 운용 중 실패 경로 구현)
- **Issue:** C# `Fail` 의 운용 중 분기는 `DropForReconnect`(전송만 끊고 자동 재접속 유지)로 간다. Task 1 의 `DmaClient` 에는 그 동작을 부를 공개 API 가 없었다. `manualReconnect()` 로 대신하면 재접속 카운터가 0 으로 리셋되어 상한 10회가 무력화된다(T-15-10 회귀).
- **Fix:** 카운터를 건드리지 않고 현재 소켓만 끊는 `dropTransport(reason)` 를 공개했다. 내부 `#dropTransport` 를 그대로 위임하고, "`manualReconnect` 를 이 자리에 쓰면 안 되는 이유"를 doc 주석에 남겼다.
- **Files modified:** `relay/src/dma/dma-client.ts`
- **Committed in:** `ac256e3`
- **Test:** `session.test.ts` ⑧ 이 "운용 중 로그인 타임아웃 후에도 `reconnectAttempts` 가 1 을 유지"함을 단언한다.

**2. [Rule 3 - Blocking] `fake-gateway.silenceLogin()` 추가**
- **Found during:** Task 2 (운용 중 5초 타임아웃 경로 테스트)
- **Issue:** 헬퍼에는 자동 로그인 응답을 **켜는** `respondLogin()` 만 있고 **끄는** 길이 없었다(생성 시 `autoLogin:false` 로만 가능). "처음엔 응답했는데 재접속 후에는 응답하지 않는 게이트웨이"를 재현할 수 없어 운용 중 실패 경로를 시험할 수 없었다.
- **Fix:** `silenceLogin()` 1개 추가(1줄 구현 + 타입/주석). 기존 동작에 영향 없음.
- **Files modified:** `relay/tests/helpers/fake-gateway.ts`
- **Committed in:** `ac256e3`

### Auto-fixed Issues

**3. [Rule 1 - Bug] `readableHighWaterMark` 옵션이 타입에 없어 typecheck 실패**
- **Found during:** Task 1 (`pnpm --filter @gh-radar/relay run typecheck`)
- **Issue:** `new net.Socket({ readableHighWaterMark: RECV_CHUNK_SIZE })` 가 TS2353 으로 막혔다. `SocketConstructorOpts` 에 그 옵션이 없다.
- **Fix:** 옵션 주입을 제거하고 `new net.Socket()` 으로 되돌린 뒤, 상수의 성격(대응표용 정본, Node 는 스트림 계층이 청크를 관리)과 `onread` 를 쓰지 않는 이유를 주석에 명시했다. 위 Decisions 3 참조.
- **Files modified:** `relay/src/dma/dma-client.ts`
- **Committed in:** `140cf60`

**4. [Rule 1 - Bug] 테스트 간헐 실패 — 고정 flush 횟수 의존**
- **Found during:** Task 1 (dma-client 테스트 3회 반복 실행)
- **Issue:** `flushIo(6)` 뒤에 `gateway.sockets[0]` 를 단정하는 방식이 앞선 테스트의 부하에 따라 실패했다(3회 중 2회 실패 재현, 실패 지점은 실행마다 달랐다). 원인은 클라이언트의 `connect` 이벤트와 서버의 `connection`(accept) 이벤트가 서로 다른 루프 턴에 온다는 점이다.
- **Fix:** `waitFor(predicate, label)` 조건 폴링으로 전량 교체. 전체 스위트 5회 연속 실행에서 85/85 통과를 확인했다.
- **Files modified:** `relay/tests/dma-client.test.ts`
- **Committed in:** `140cf60`

**5. [Rule 1 - Bug] `let x: T | null = null` 에 콜백이 대입하면 TS 가 `never` 로 좁힌다**
- **Found during:** Task 1 (`typecheck:tests`)
- **Issue:** `let exhausted: {attempts:number} | null = null;` 에 이벤트 콜백이 대입하는 패턴을 TS 가 추적하지 못해 `exhausted?.attempts` 가 TS2339 로 막혔다. 15-02 가 `typecheck:tests` 를 만들지 않았다면 이 파일은 아무 tsc 도 보지 않았을 자리다.
- **Fix:** 이벤트 수집을 배열로 통일했다(다른 이벤트들과도 형태가 같아진다).
- **Files modified:** `relay/tests/dma-client.test.ts`
- **Committed in:** `140cf60`

### 계획 전제와 실측이 어긋난 항목 (수정 아님 — 사실 보고)

**6. [사실 정정] plan 의 `<interfaces>` 블록 시그니처 2건이 15-02 실제 산출과 다르다**
- plan 은 `buildLoginReq(...): Buffer` 와 `parseLoginResp(env: ParsedEnvelope)` 로 적었으나, 실제는 `buildLoginReq(...): Uint8Array` 와 `parseLoginResp(env: Envelope): ParsedLoginResp | null` 이다. 실제 시그니처를 따랐다(`parseLoginResp` 가 `null` 을 낼 수 있으므로 세션에 "LoginResp 파싱 실패" 분기를 추가했다 — plan 에 없던 실패 경로지만 파서 계약상 필수다).
- `client.send()` 는 `Uint8Array` 를 받아 **여기서 프레이밍**한다(plan 의 `send(buf: Buffer)` 와 호환. Buffer 는 Uint8Array 의 하위형이다).

**7. [사실 정정] 상태 enum 은 8종이 아니라 10종이다**
- plan 본문은 "8상태", `<action>` 은 "`idle` + shared 의 `RelaySessionState` 9종"이라 적혀 서로 다르다. 후자를 따라 **10종**(`idle` + 9)을 전부 선언했다. `unauthorized` 는 세션이 스스로 들어가는 상태가 아니지만(자격증명 미등록은 세션 생성 **전에** wss 계층이 판정) "상태를 나중에 추가하지 않는다"는 규율 때문에 함께 선언하고 그 사실을 주석에 남겼다.

**8. [사실 정정] `ACCOUNT_RESP_TIMEOUT_MS` 는 선언만 되고 아직 발화하지 않는다**
- plan 의 must_haves 는 "계좌 응답 5초 타임아웃이 실패로 확정"과 "계좌 0건 → 즉시 Ready 축약"을 함께 요구한다. 선언할 계좌가 0건이면 **대조를 기다릴 응답 자체가 없으므로** 타이머를 걸 자리가 없다. 값은 정본으로 박아 두고(게이트 뒤 plan 이 수치를 다시 고르지 않게), 삽입 지점에 `TODO(D-25)` 로 5단계 체크리스트를 남겼다. 도달 불가 분기를 미리 써 두지는 않았다(죽은 코드).

---

**Total deviations:** 2 구조 추가(Rule 3) + 3 auto-fix(Rule 1) + 3 사실 정정
**Impact on plan:** 추가한 공개 API 2개는 모두 plan 이 요구한 동작(운용 중 실패의 백오프 유지, 운용 중 타임아웃 재현)을 **실제로 구현/검증하기 위해** 필요한 것이며 기능 범위 확대가 없다. plan 이 명시한 6개 산출 파일은 전부 계획대로 만들어졌다.

## Issues Encountered

- **worktree base 정정.** 스폰 시 HEAD 가 `18fa976` 였고 지정 base `541aaaa` 의 조상이었다(= base 가 앞서 있었다). 규정대로 `git reset --hard 541aaaa` 로 전진시킨 뒤 작업했다.
- **범위 밖 선재 실패 1건 (신규 아님).** `packages/shared/src/__tests__/theme.test.ts` 실패는 15-01 이 이미 `deferred-items.md` 에 기록했다. 이 plan 이 건드린 파일이 아니라 손대지 않았다. relay 검증은 `pnpm --filter @gh-radar/relay test` 로 볼 것.

## Known Stubs

**의도된 미구현 1건 (D-25 게이트 뒤 plan 소관, plan 이 명시적으로 지시한 축약 경로):**

| 위치 | 내용 | 해소 시점 |
|------|------|-----------|
| `relay/src/dma/session.ts` `#onLoginAccepted` — `TODO(D-25)` | 계좌 선언 루프(허용 계좌 변환 → `UpdateAccountNoReq(3)` 연속 송신 → `UpdateAccountNoResp(55)` 5초 대조 → 미대조/허용 밖 실패 처리 → 계좌 0건 실패). 현재는 `accounts = []` 로 두고 즉시 Ready. | gh-trade 17 완료 + `sync-relay-schema.sh` 재실행 후 (15-15) |

이 축약은 **UI 로 흐르는 거짓 값이 아니다** — `accounts` 가 빈 `ready` 는 shared 계약이 "정상 상태"로 명시한 경우이고(mock 무인증 로그인), UI 는 주문 패널만 비활성화한다. `ACCOUNT_RESP_TIMEOUT_MS`/`MAX_ACCOUNT_NO_LEN` 두 상수는 정본으로 선박제만 해 두었다(현재 미사용).

그 밖에 하드코딩 빈 값·placeholder 문자열은 없다.

## Verification

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay test` | **exit 0 · 6 files · 85 tests passed** (15-02 의 57건 + 이 plan 28건) |
| 전체 스위트 5회 연속 반복 | 85/85 × 5 — 간헐 실패 0 |
| `pnpm --filter @gh-radar/relay test dma-client` | exit 0 · 11건 (요구 7건 이상) |
| `pnpm --filter @gh-radar/relay test session.test` | exit 0 · 9건 (요구 7건 이상) |
| `pnpm --filter @gh-radar/relay test session-manager` | exit 0 · 8건 (요구 6건 이상) |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -c 'await' dma-client.ts` (D-32) | **0** |
| `grep -c 'accounts()' session.ts` (D-25 게이트) | **0** |
| `grep -c 'MAX_RECONNECT_ATTEMPTS = 10' dma-client.ts` | 1 |
| `grep -c 'PING_INTERVAL_MS = 30_000' dma-client.ts` | 1 |
| `grep -c 'setNoDelay(true)' dma-client.ts` | 1 |
| `grep -c 'this.#generation' dma-client.ts` | 13 (증가 4 + 대조 다수) |
| `grep -c 'LOGIN_RESP_TIMEOUT_MS = 5000' session.ts` | 1 |
| `grep -c 'session_rejected' / 'manual_required' session.ts` | 4 / 5 |
| `grep -c 'TODO(D-25)' session.ts` | 1 |
| `grep -c '#password' session.ts` | 4 (필드 선언 + 사용, 로그 인자에는 0건) |
| `grep -c 'SESSION_GRACE_MS' / 'closeAll' session-manager.ts` | 4 / 1 |
| 비주석 `logger.info` 수 (session-manager.ts) | 9 (요구 5 이상 — 5경로 전부 포함) |
| `git status --porcelain relay/src/generated` | 0 (D-26 생성물 무수정) |

## Threat Model 대응

| Threat ID | 대응 | 증거 |
|-----------|------|------|
| T-15-10 (자기유발 DoS — KB 계정 잠금) | 백오프 1→2→4→8→16→30초 · 시도 상한 10회 → `exhausted`/`manual_required` · 로그인 거부 시 `failNoRetry`(즉시 루프 중단) · **매니저 층에서도** 거부 세션을 재생성하지 않음 | dma-client ④(10회 후 무시도) · session ③(거부 후 10분간 시도 0) · session-manager ⑦(재접속해도 재로그인 없음) |
| T-15-09 (게이트웨이 강제 종료) | 수신 콜백에 비동기 대기 0건 · 무거운 처리는 소비자 위임(주석 명시) · 송신 정체(drain 2초 초과) 감지 시 재수립 | acceptance `grep -c 'await'` == 0 · dma-client ⑤(드롭 후에도 연결·정상 프레임 유지) |
| T-15-19 (비밀번호 노출) | `#password` private + `toJSON`/`toString`/`inspect.custom` 3중 차단 · 로그 인자에 password·dmaUserId 미포함 · 매니저 로그도 userId 만 | session ⑥(상태 프레임 전량·직렬화·inspect 에 비밀번호·DMA user_id 부재) |
| T-15-20 (세션 키 권한 상승) | 매니저 키가 gh-radar `userId` — 사용자 간 공유 경로 없음 | session-manager ②(사용자 2명 세션 독립, 한쪽 종료가 다른 쪽에 무영향) |
| T-15-07 (desync 프레임) | `FrameReader.desync` → 드롭이 아니라 연결 재수립 + 재수립 확인 | dma-client ⑥(2MB 헤더 → down(사유 desync) → 백오프 후 재수립) |

**신규 위협 표면 없음.** 이 plan 은 네트워크 엔드포인트·인증 경로·파일 접근·DB 스키마를 추가하지 않는다. 추가한 것은 아웃바운드 TCP 연결 1개의 수명 관리이며, 접속 대상(`DMA_HOST`/`DMA_PORT`)은 15-01 이 이미 정의한 값이다.

## User Setup Required

없음. 외부 서비스·시크릿·계정 설정을 요구하지 않는다(테스트는 전부 `127.0.0.1` 가짜 게이트웨이).

## Next Phase Readiness

**준비된 것**
- **15-04(SubscriptionHub / WsFanout)**: `session.on("ready")` 가 **재구독의 유일한 트리거**다. Hub 는 이 이벤트만 구독하고 자기 키 집합을 순회하면 된다(Pitfall 4). 시세·체결 프레임은 `session.on("frame")` 으로 그대로 흘러온다. 상태 프레임은 `session.on("state")` 페이로드를 **변환 없이** wss 로 보내면 된다(`RelayStateMsg` 그대로).
- **15-05(index.ts)**: `SessionManager` 를 `loadConfig()` 값으로 만들고(`dmaHost`/`dmaPort`/`dmaBroker`/`sessionGraceMs`), 종료 훅에서 `closeAll()` 을 부르면 된다. `/healthz` 는 `stats()` 를 그대로 실으면 식별자 노출이 없다.
- **주문 라우트(15-16 계열)**: `manager.get(userId)?.isReady` 가 409 `SESSION_NOT_READY` 판정의 단일 질문이다.

**후속 plan 이 알아야 할 것**
1. **`session.on("frame")` 은 LoginResp 를 포함한 전 프레임을 흘린다.** 소비자가 `msgType` 으로 걸러야 한다.
2. **재접속 카운터를 리셋하는 API 는 2개뿐이다** — `resetReconnectAttempts()`(Ready 진입 시 세션이 부름)와 `manualReconnect()`. 운용 중 실패 처리에 `manualReconnect()` 를 쓰면 상한 10회가 무력화된다. 그 자리는 `dropTransport()` 다.
3. **`session_rejected` 는 매니저가 재생성하지 않는다.** 자격증명을 고친 뒤에는 매니저에서 세션을 명시적으로 제거하는 경로가 필요하다(현재 없음 — 자격증명 갱신 plan 이 추가할 것).
4. **상태 게터는 `allowedAccounts` 다** (`accounts` 아님 — D-25 게이트 grep 때문). 계좌 wave 가 이름을 바꾸려면 게이트 검사도 함께 손볼 것.
5. **소켓 테스트는 `waitFor` 조건 폴링을 쓸 것.** 고정 flush 횟수는 이 파일에서 실제로 간헐 실패했다. 가짜 타이머는 `toFake: ["setTimeout","clearTimeout","setInterval","clearInterval"]` 로 제한해 `setImmediate` 를 살려 둘 것.
6. **`ACCOUNT_RESP_TIMEOUT_MS`·`MAX_ACCOUNT_NO_LEN` 은 이미 `session.ts` 에 있다.** D-25 게이트 뒤 plan 은 값을 새로 고르지 말 것(`envelope.ts` 의 계좌 상한 상수 4종과 같은 규율).

## Self-Check

- 생성 주장 파일 존재 확인: `relay/src/dma/dma-client.ts` · `relay/src/dma/session.ts` · `relay/src/dma/session-manager.ts` · `relay/tests/dma-client.test.ts` · `relay/tests/session.test.ts` · `relay/tests/session-manager.test.ts` — 전부 FOUND
- 커밋 존재 확인: `140cf60` · `ac256e3` · `80bcf60` — 전부 FOUND

## Self-Check: PASSED

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-05*
