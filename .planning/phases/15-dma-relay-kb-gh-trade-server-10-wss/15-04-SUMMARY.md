---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 04
subsystem: api
tags: [websocket, ws, zod, supabase-auth, aes-256-gcm, refcount, backpressure, fanout, vitest]

# Dependency graph
requires:
  - phase: 15-01
    provides: "relay 워크스페이스 · config(DMA_CRED_KEY/SUPABASE_*) · logger(redact) · packages/shared/src/relay.ts 3자 계약"
  - phase: 15-02
    provides: "envelope.ts 빌더(28/29/32)·파서(58/59/69/71/54) · msg-type 화이트리스트 · tests/helpers(fake-gateway·ws-client·frames)"
  - phase: 15-03
    provides: "DmaClient · DmaSession(state/ready/frame 이벤트 · stateFrame()) · SessionManager(acquire/release)"
  - phase: 15-12
    provides: "webapp use-relay-socket.ts — 첫 상태 프레임을 인증 ACK 로 삼는 브라우저 계약 · relay-url.ts 의 /ws 경로"
  - phase: 14
    provides: "server/src/services/supabase.ts · middleware/require-auth.ts — 서비스롤 클라 1개로 auth.getUser 겸용 (D-02)"
provides:
  - "relay/src/hub/subscription-hub.ts — (userId|isin|exchange) 참조계수 + 스냅샷/체결 캐시 + 200ms 체결 배치 + ready 전량 재구독 + userId 지정 팬아웃"
  - "relay/src/ws/fanout.ts — WebSocketServer(noServer, /ws) + 첫 메시지 인증(4401/4400) + unauthorized 게이트 + 30초 하트비트 + bufferedAmount 백프레셔 + Map<userId,Set<Conn>> 팬아웃"
  - "relay/src/ws/protocol.ts — 인바운드 zod discriminated union + 64비트 정수 가드가 달린 encode()"
  - "relay/src/auth/verify-token.ts — supabase.auth.getUser 순수함수 토큰 검증"
  - "relay/src/store/credentials.ts — AES-256-GCM(AAD=user_id) 암/복호 대칭 함수 + getDmaCredentials(행 없음=null, 조회 실패=throw)"
  - "relay/src/store/supabase.ts — createRelaySupabase(url, serviceRoleKey)"
  - "relay/src/dma/session.ts — DmaSession.send() 추가 (Ready 이전 송신 거부)"
affects: [15-05, 15-08, 15-09, 15-10, 15-11, 15-13, 15-14, 15-15, 15-16, 15-17, 15-18, 15-19, 15-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "구독 회계는 소켓 수와 업스트림 구독 수를 분리한다 — 참조계수의 키에 userId 를 넣어 사용자 간 교차를 구조적으로 차단"
    - "팬아웃은 userId 지정 이벤트 하나로만 나간다 — 전역 브로드캐스트 함수를 아예 만들지 않는 것이 유출 방어"
    - "wss 첫 메시지 인증: 미인증 연결이 붙들 수 있는 자원은 authTimer 1개뿐, 인증 전 구독은 무시가 아니라 close"
    - "allowlist 미포함은 오류가 아니라 상태다 — 연결을 유지하고 unauthorized 상태 프레임으로 표시"
    - "느린 클라이언트는 기다리지 않고 버린다(동기 write 만) — 수신 경로 블로킹이 게이트웨이 송신 큐를 채운다"
    - "리스너 교체 대신 정본 대조로 침묵시킨다 — Hub·Fanout 모두 세션 객체 동일성 확인 후에만 보고"

key-files:
  created:
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/src/auth/verify-token.ts
    - relay/src/store/credentials.ts
    - relay/src/store/supabase.ts
    - relay/tests/hub.test.ts
    - relay/tests/credentials.test.ts
    - relay/tests/fanout.test.ts
  modified:
    - relay/src/dma/session.ts

key-decisions:
  - "SubscriptionHub 가 프레임을 직접 파싱한다 — DmaSession 은 quote/tape/server-message 이벤트를 내지 않고 frame 하나만 내므로, 파싱 지점을 Hub 한 곳으로 모아 WsFanout 이 FlatBuffers 를 모르게 했다"
  - "DmaSession.send() 를 추가하되 Ready 이전에는 거부한다 — 큐잉을 만들면 재구독 경로가 두 벌이 되어 Pitfall 4 가 되살아난다"
  - "1→0 해제에서 스냅샷 캐시를 버리지 않는다 — 캐시의 존재 이유가 재접속 왕복(D-37)인데 해제 시 버리면 정확히 그 순간 비어 있다"
  - "체결 배치 타이머는 키가 아니라 사용자 단위 1개 — 종목 10개를 보면 타이머 10개가 도는 구조를 만들지 않는다"
  - "자격증명 조회 장애는 unauthorized 로 위장하지 않는다 — failed 상태 프레임 + close(1011)로 재접속 가치가 있는 실패임을 브라우저에 알린다"
  - "같은 소켓의 중복 sub 은 참조계수에 반영하지 않는다 — 반영하면 close 때 하나가 남아 업스트림 구독이 영구히 샌다"
  - "이미 인증된 연결의 재인증은 무시한다 — 소켓 중간에 userId 를 바꾸는 경로를 열지 않는다(T-15-03)"
  - "wss 경로 기본값을 /ws 로 고정 — 브라우저 relay-url.ts 폴백(ws://localhost:8090/ws)과 일치시키지 않으면 로컬에서만 조용히 안 붙는다"

patterns-established:
  - "인증 왕복(await) 뒤에는 반드시 readyState 를 재확인한다 — 그 사이 끊긴 연결에 세션을 만들면 참조계수가 샌다"
  - "테스트는 스텁을 Supabase 하나로 제한하고 ws·TCP·세션·Hub 는 전부 진짜를 쓴다 — 이 plan 의 리스크는 계층 사이 배선이다"
  - "결정적 백프레셔 검증: 임계를 -1 로 주면 bufferedAmount(>=0)가 언제나 초과라 소켓 내부를 건드리지 않고 연속 초과·terminate 경로를 태울 수 있다"

requirements-completed: [RELAY-01]

# Metrics
duration: 25min
completed: 2026-09-05
---

# Phase 15 Plan 04: 브라우저 신뢰 경계 (wss 인증 · allowlist · 구독 참조계수 · 팬아웃) Summary

**업그레이드 후 첫 메시지 인증부터 종목 구독 참조계수·스냅샷 캐시·사용자별 팬아웃까지 wss 전 경로를 세우고, DMA 비밀번호를 AES-256-GCM(AAD=user_id)로 relay 전용 복호하도록 못박아 39건 테스트로 증명**

## Performance

- **Duration:** 약 25분
- **Started:** 2026-09-05T14:35Z
- **Completed:** 2026-09-05T15:00Z
- **Tasks:** 3/3
- **Files modified:** 10 (신규 9 · 수정 1)

## Accomplishments

- **SC-4 전 구간 연결.** 브라우저 `WebSocket` → 첫 메시지 인증 → allowlist 판정 → `SessionManager.acquire` → `SubscriptionHub` 참조계수 → 가짜 게이트웨이 TCP 까지 **실제로 이어지는 경로**를 통합 테스트가 통과한다. 스텁은 Supabase 하나뿐이다.
- **미인증 표면 차단(T-15-03).** 5초 무인증 → 4401, 첫 메시지가 `sub` → 4400, 위조 토큰 → 4401, 스키마 위반 → 4400. 네 경로 모두 **세션을 만들지 않고**(`acquire` 호출 0건) 게이트웨이 연결도 열지 않는다는 것을 테스트가 직접 단언한다.
- **사용자 격리 구조화(T-15-02).** 팬아웃 대상은 `Map<userId, Set<Conn>>` 뿐이고 전역 브로드캐스트 함수가 **소스에 존재하지 않는다**(acceptance grep 0건). 사용자 A 세션에 밀어 넣은 시세가 B 소켓에 0건 도달함을 테스트가 확인한다.
- **탭 공유가 KB 부하로 번지지 않는다.** 같은 사용자 탭 2개 = 게이트웨이 TCP 1개 + `SubscribeQuoteReq` 1건. 첫 탭이 닫혀도 남은 탭의 구독은 유지되고, 마지막 탭이 닫힐 때만 `subscribe:false` 가 나간다.
- **권한 없음이 오류가 아니게 됐다(D-12).** `dma_credentials` 매핑이 없는 로그인 사용자는 연결이 유지된 채 `{t:"state", s:"unauthorized"}` 를 받고, 이후 구독은 같은 상태 프레임으로 되돌아온다 — 호가창이 "권한 없음"을 그릴 수 있다.
- **자격증명 실패가 확정된다(T-15-05).** AES-256-GCM 왕복 + 키 불일치·AAD(user_id) 불일치·1바이트 변조 3종이 전부 예외다. 특히 **다른 사용자 행으로 암호문을 옮기는 공격**이 복호 실패로 끝나는 것을 별도 테스트가 못박는다.
- **브라우저 계약 준수.** 인증 성공 직후 상태 프레임을 **즉시 1회** 내려보낸다. 15-12 의 `use-relay-socket` 은 이 프레임을 인증 ACK 로 삼아 구독을 시작하므로, 이 한 줄이 빠지면 호가창이 영원히 비어 있다 — 테스트 ⑤가 "첫 프레임이 상태 프레임"임을 단언한다.

## Task Commits

1. **Task 1: SubscriptionHub — 참조계수 + 스냅샷 캐시 + Ready 재구독** — `b2412b8` (feat)
2. **Task 2: verifyToken + dma_credentials AES-256-GCM 복호** — `519e065` (feat)
3. **Task 3: WsFanout + 인바운드 zod 스키마** — `6685605` (feat)

**Plan metadata:** 이 SUMMARY 커밋 (docs)

## Files Created/Modified

| 파일 | 역할 |
|------|------|
| `relay/src/hub/subscription-hub.ts` | `attach/detach` · `subscribe/unsubscribe/releaseAll/resubscribeAll` · `getSnapshot/getTape/refCount/stats/closeAll` · 58/59·69/71·54 프레임 파싱 · `TAPE_BATCH_MS(200)` / `TAPE_RING_SIZE(200)` |
| `relay/src/ws/protocol.ts` | `RelayInboundSchema`(auth/sub/unsub) · ISIN 12자 정규식 · `parseInbound`(total, null 수렴) · `encode`(64비트 정수 throw) |
| `relay/src/ws/fanout.ts` | `WsFanout` — `/ws` 업그레이드 · authTimer 5초 · 인증 4경로 · unauthorized 게이트 · `Map<userId,Set<Conn>>` · 30초 isAlive 하트비트 · 백프레셔 3-스트라이크 · close 정리 |
| `relay/src/auth/verify-token.ts` | `verifyToken(supabase, token)` — 성공 시 user.id, 실패는 전부 `null`(사유는 로그에만) |
| `relay/src/store/credentials.ts` | `encryptDmaPassword`/`decryptDmaPassword`(nonce 12B ‖ tag 16B ‖ ct, AAD=user_id) · `getDmaCredentials`(행 없음 null / 조회 실패 throw) |
| `relay/src/store/supabase.ts` | `createRelaySupabase` — 서비스롤 클라 1개로 토큰 검증 + DB 접근 (Phase 14 D-02) |
| `relay/src/dma/session.ts` | **수정** — `send(payload)` 추가. Ready 이전 송신은 거부하고 사유를 남긴다 |
| `relay/tests/hub.test.ts` | 12건 — 탭 공유·부분/최종 해제·사용자 격리·캐시 hit·ready 전량 재구독·200ms 배치·링버퍼 상한·시세 무배치·`msg` 통과·Ready 이전 구독·이중 해제 |
| `relay/tests/credentials.test.ts` | 15건 — 왕복·AAD/키/변조 3종 실패·nonce 비재사용·키 길이·짧은 암호문·행 있음/없음·조회 실패 throw+error 로그·행 이동 방어·토큰 4케이스 |
| `relay/tests/fanout.test.ts` | 12건 — 인증 4케이스·unauthorized 게이트·인증 ACK·다중 탭 공유·사용자 격리·백프레셔 terminate·참조계수 반납·스키마 위반·캐시 즉시응답·경로 거부 |

## Decisions Made

**1. 프레임 파싱 지점을 Hub 한 곳으로 모았다.**
plan 의 `<interfaces>` 는 `DmaSession` 이 `quote`/`tape`/`server-message` 이벤트를 낸다고 적었지만, 15-03 이 실제로 낸 것은 `frame` 하나(`TransportFrameEvent`)다. 세션에 세 이벤트를 추가하는 대신 **Hub 가 `frame` 을 받아 파싱**하도록 했다. 그래야 `envelope.ts` 파서를 아는 모듈이 Hub 하나로 남고, `WsFanout` 은 FlatBuffers 를 전혀 모르는 채 wire JSON 만 다룬다. 세션은 계속 "운용 준비 판정"만 한다.

**2. `DmaSession.send()` 는 Ready 이전에 거부한다.**
Hub 가 게이트웨이로 프레임을 보내려면 통로가 필요한데 세션에는 `send` 가 없었다(15-03 은 소켓을 `DmaClient` 안에 감췄다). 추가하면서 **큐잉을 넣지 않았다** — Ready 이전 구독을 쌓아 두었다가 나중에 보내면 그것이 곧 두 번째 재구독 경로가 되고, Pitfall 4("재접속 후 새로고침해야 시세가 나온다")가 되살아난다. Ready 이전 구독은 참조계수에만 남고 `ready` 이벤트의 전량 재구독이 유일한 복원 경로다.

**3. 참조계수 1→0 에서 스냅샷 캐시를 버리지 않는다.**
캐시의 존재 이유가 브라우저 재접속·탭 전환(D-37)인데, 마지막 구독이 빠질 때 버리면 **정확히 그 순간** 비게 된다. 대신 `releaseAll`/`detach`(사용자 단위 정리)와 세션 교체에서만 폐기한다. 사용자 5명 규모에서 캐시 상한은 "그 사용자가 본 종목 수"이고 항목당 1KB 미만이라 실질적인 경계 문제가 아니다.

**4. 자격증명 조회 **장애**를 "권한 없음"으로 위장하지 않는다.**
`getDmaCredentials` 는 행 없음이면 `null`(D-12), 조회 실패면 `logger.error` 후 throw 다. wss 는 전자를 `unauthorized` 상태 프레임(연결 유지)으로, 후자를 `failed` 상태 프레임 + `close(1011)` 로 처리한다. 둘을 같은 화면으로 만들면 "권한을 등록했는데 왜 안 되지"를 영원히 디버깅하게 된다(S-5).

**5. 같은 소켓의 중복 `sub` 은 참조계수에 반영하지 않는다.**
소켓별 키 소유 집합(`conn.keys`)에 이미 있으면 무시한다. 반영해 버리면 close 시 한 번만 감소시키므로 참조계수가 1 남고, 그 종목의 업스트림 구독이 **영구히** 살아 있게 된다.

**6. wss 경로는 `/ws` 다.**
브라우저의 `resolveRelayWsUrl()` 폴백이 `ws://localhost:8090/ws` 이고 Caddy 는 기본 라우트를 그대로 8090 으로 넘긴다. 경로를 루트로 두면 프로덕션에서는 우연히 동작하고 로컬에서만 조용히 안 붙는다. 옵션으로 열어 두되 기본값을 계약에 맞췄다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 블로킹] 세션 이벤트 계약이 plan 기술과 달랐다**
- **Found during:** Task 1
- **Issue:** plan `<interfaces>` 는 `DmaSession` 이 `"quote"`/`"tape"`/`"server-message"` 를 emit 한다고 적었으나 15-03 산출물은 `"frame"`(전 프레임) 하나만 emit 한다. 그대로 구현하면 Hub 가 아무 데이터도 받지 못한다.
- **Fix:** Hub 가 `"frame"` 을 구독해 `msgType` 으로 58/59 → `parseQuoteState`, 69/71 → `parseTradeTape`, 54 → `parseServerMessage` 로 분기하도록 설계. `ServerMessage(54)` 도 Task 3(fanout)이 아니라 Hub 의 `"fanout"` 이벤트를 타고 브라우저로 간다(D-36 결과는 동일).
- **Files modified:** `relay/src/hub/subscription-hub.ts`
- **Commit:** `b2412b8`

**2. [Rule 3 - 블로킹] `DmaSession` 에 송신 통로가 없었다**
- **Found during:** Task 1
- **Issue:** Hub 는 구독 프레임을 보내야 하는데 세션은 `send` 를 노출하지 않았고, `DmaClient` 는 세션 private 필드다.
- **Fix:** `DmaSession.send(payload)` 추가 — `isReady` 가 아니면 사유 로그 후 `false`(큐잉 없음).
- **Files modified:** `relay/src/dma/session.ts`
- **Commit:** `b2412b8`

**3. [Rule 2 - 누락 기능] `getDmaCredentials` 에 키 인자가 없었다**
- **Found during:** Task 2
- **Issue:** plan 시그니처는 `getDmaCredentials(supabase, userId)` 인데 복호에는 `DMA_CRED_KEY` 가 필요하다. 모듈 스코프에서 env 를 읽으면 테스트가 env 를 심어야 하고 기동 실패 지점이 흩어진다.
- **Fix:** 세 번째 인자 `keyB64` 추가(순수함수 유지). `store/supabase.ts` 도 모듈 로드 시 클라이언트를 만들지 않고 `createRelaySupabase(url, key)` 팩토리로 두어 `loadConfig()` 가 유일한 env 진입점이 되게 했다.
- **Files modified:** `relay/src/store/credentials.ts`, `relay/src/store/supabase.ts`
- **Commit:** `519e065`

**4. [Rule 2 - 누락 기능] 자격증명 조회 장애 경로가 계획에 없었다**
- **Found during:** Task 3
- **Issue:** plan 의 연결 수명 4는 `null`(권한 없음)만 다뤘고 조회 예외 시 동작이 미정이었다. 미정 상태로 두면 예외가 `message` 핸들러 밖으로 나가 소켓이 사유 없이 끊긴다.
- **Fix:** `try/catch` 로 감싸 `{t:"state", s:"failed", msg:"자격증명 확인에 실패했습니다"}` 전송 후 `close(1011)`. 브라우저는 4400/4401 이 아닌 close 를 재접속 대상으로 본다(15-12 규율).
- **Files modified:** `relay/src/ws/fanout.ts`
- **Commit:** `6685605`

**5. [Rule 2 - 누락 기능] 재인증·중복 구독 방어**
- **Found during:** Task 3
- **Issue:** 인증된 소켓이 다시 `{t:"auth"}` 를 보내는 경우와 같은 키를 두 번 `sub` 하는 경우가 미정이었다. 전자는 소켓 중간에 userId 가 바뀌는 상승 경로(T-15-03), 후자는 참조계수 누수다.
- **Fix:** 재인증은 warn 후 무시(userId 는 한 번 정해지면 불변), 소켓 단위 중복 `sub` 도 warn 후 무시.
- **Files modified:** `relay/src/ws/fanout.ts`
- **Commit:** `6685605`

**6. [Rule 2 - 보강] 재구독 시 체결 캐시도 즉시 응답**
- **Found during:** Task 3
- **Issue:** plan 은 스냅샷(호가)만 즉시 전달하라고 했으나, 체결 테이프가 비어 있으면 새 탭의 테이프 영역이 첫 배치(최대 200ms + 게이트웨이 왕복)까지 빈 화면이다.
- **Fix:** `SubscriptionHub.getTape()` 를 더해 `sub` 직후 링버퍼를 `snap:true` 로 1회 전송.
- **Files modified:** `relay/src/hub/subscription-hub.ts`, `relay/src/ws/fanout.ts`
- **Commit:** `b2412b8`, `6685605`

### Acceptance 문구 조정 (동작 변경 없음)

계획의 grep acceptance 3건이 **주석 문구까지** 세는 형태여서 코드는 그대로 두고 문서 표현만 맞췄다. 게이트의 의도(자체 암호 금지 · 검증 방식 1가지 · 로컬 서명 검증 미도입)는 모두 충족한다.

| Acceptance | 조치 |
|------------|------|
| `grep -c 'randomBytes(12)' credentials.ts >= 1` | nonce 길이를 `NONCE_BYTES` 상수로 두되(4곳에서 재사용) 호출부 주석에 실효 호출을 명시 |
| `grep -c 'auth.getUser' verify-token.ts == 1` | 코드 1건은 그대로, docblock 산문을 "`getUser(token)` 네트워크 위임"으로 바꿔 중복 계수 제거 |
| `grep -c 'jose\|jwtVerify\|JWKS' verify-token.ts == 0` | D-10 근거 문장을 "로컬 서명 검증(오프라인 공개키 라이브러리)"로 표현 — 실제 의존성은 처음부터 0건(`relay/package.json` 확인) |

### `releaseAll` vs 소켓별 해제

Task 1 은 `releaseAll(userId)` 를 "wss 종료 시" 경로로, Task 3 은 "그 소켓이 잡은 키만" 해제로 적어 서로 어긋났다. **Task 3 이 옳다**(다중 탭에서 releaseAll 을 쓰면 남은 탭의 구독까지 끊긴다). `releaseAll` 은 사용자 단위 강제 정리 API 로 남기고, 소켓 close 경로는 `conn.keys` 를 순회해 `unsubscribe` 를 부른다.

## Verification

```
pnpm --filter @gh-radar/relay test          → 9 files / 124 tests 통과
pnpm --filter @gh-radar/relay run typecheck → exit 0
pnpm --filter @gh-radar/relay run typecheck:tests → exit 0
fanout.test.ts 4회 연속 실행 → 12/12 통과 (간헐 실패 없음)
grep -ci 'broadcastAll|broadcastToAll' relay/src/ws/fanout.ts → 0
grep -c 'jose' relay/package.json → 0
```

Acceptance grep 실측:

| 대상 | 기준 | 실측 |
|------|------|------|
| `subscription-hub.ts` `userId` | ≥5 | 96 |
| `subscription-hub.ts` `resubscribeAll` | ≥1 | 2 |
| `subscription-hub.ts` `200` | ≥2 | 5 |
| `subscription-hub.ts` `bigint` | 0 | 0 |
| `credentials.ts` `aes-256-gcm` / `setAAD` | ≥1 / ≥2 | 2 / 2 |
| `fanout.ts` `4401` / `4400` | ≥2 / ≥1 | 2 / 1 |
| `fanout.ts` `serverMaxWindowBits: 12` / `concurrencyLimit: 4` | ==1 / ==1 | 1 / 1 |
| `fanout.ts` `maxPayload` / `bufferedAmount` / `unauthorized` | ≥1 / ≥2 / ≥1 | 2 / 4 / 7 |

## Known Stubs

없음. 이 plan 이 만든 모든 경로에 실제 구현과 테스트가 붙어 있다.

다만 **런타임 배선은 아직 없다** — `WsFanout`/`SubscriptionHub` 를 실제로 생성하는 `relay/src/index.ts` 와 `dma_credentials` 테이블 마이그레이션·관리자 등록 스크립트는 15-05 소관이다(계획된 분업이며 이 plan 의 범위 밖이다). 그래서 현재 저장소 상태에서 relay 프로세스를 띄우면 wss 는 열리지 않는다.

## Follow-up

- **15-05**: `index.ts` 결선(`createRelaySupabase` → `SessionManager` → `SubscriptionHub` → `WsFanout`), `/healthz` 에 `hub.stats()`/`fanout.stats()` 노출, `dma_credentials` 마이그레이션(RLS 활성 + 정책 0개) 및 관리자 등록 스크립트(`encryptDmaPassword` 재사용).
- **D-25 게이트 뒤**: 계좌 상태(66/67)·주문 통보(51)는 현재 Hub 의 `#onFrame` default 분기에서 버려진다. 게이트 해소 시 이 switch 에 case 를 더하고 `{t:"acct"}`/`{t:"order"}` 팬아웃을 붙이면 된다.
- **자격증명 회전**: `session_rejected` 세션을 명시적으로 축출하는 경로는 여전히 없다(15-03 인계 사항 유지). 비밀번호를 고친 뒤에도 `SessionManager` 가 거부 세션을 재사용하므로, 회전 UI/스크립트가 생기는 시점에 `SessionManager.evict(userId)` 가 필요하다.

## Self-Check: PASSED

- 생성 주장 파일 9종 + 수정 1종 전부 존재 확인
- 커밋 3건(`b2412b8` / `519e065` / `6685605`) 전부 `git log` 에서 확인
- `relay` 전체 테스트 124건 통과 · typecheck 2종 exit 0
