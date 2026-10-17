---
phase: quick-261017-daz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/relay.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - relay/tests/hub-multi-session.test.ts
  - relay/tests/order-server-resync.test.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/__tests__/relay-socket.test.ts
  - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx
autonomous: true
requirements: [IN04-wire-contract, IN04-relay-emit, IN04-resync-delivery, IN04-web-reducer, IN04-consumers-lock]

estimate:
  tokens: 140000
  raw_tokens: 140000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "relay 가 세션 분리(retainSessions) · 세션 교체(attach)로 그 세션 몫 VI 슬롯을 hub 캐시에서 지우면, 그 사용자의 연결 중 브라우저마다 지운 (계좌, 거래소) 슬롯마다 {t:\"vi.slot.clear\", a, x} 1건이 간다. 같은 슬롯을 다른 결선 세션이 아직 알면 지움 대신 그 값의 vi.slot 1건이 간다 — 지운 직후 브라우저 슬롯 = hub getViSlot 병합 뷰"
    - "주문 서버 변경 · 쓰던 서버 끄기 재수립(resyncUser)에서도 그 사용자 연결은 1012 close 전에 vi.slot.clear 를 받는다 — 1012 직전까지 받은 vi.slot · vi.slot.clear 를 순서대로 적용하면 남는 슬롯이 0"
    - "웹 리듀서가 vi.slot.clear 를 받으면 그 키를 지운다(null 로 바꾸지 않는다 — 모름 ≠ 미등록, D-17 3상태). 그 결과 사이드바 VI 줄에서 그 계좌 태그가 빠지고, /me 상태줄은 「VI 중지」, 「이 계좌 끄기」 는 그 계좌 켜진 상따가 0 이면 비활성(nothingToDisable)"
    - "작업대 VI 설정 행은 지움 뒤 「미조회」 잠금이다 — 입력값은 보존하고(빈 행으로 바꾸지 않는다) 스위치 · 입력이 잠긴다. 소유 세션이 다시 서면 그 세션 Ready 의 21 → 61 이 잠금을 푼다(WR-03 불변식 유지)"
    - "구 webapp(지금 프로덕션 번들)은 새 t 를 리듀서 default 로 무시해 깨지지 않고, 새 webapp + 구 relay 는 지움 프레임이 오지 않아 지금 동작 그대로다"
    - "closeAll(프로세스 종료)은 지움 프레임을 내지 않는다"
  artifacts:
    - path: "packages/shared/src/relay.ts"
      provides: "RelayViSlotClearMsg {t:\"vi.slot.clear\"; a: string; x: RelayExchange} · RelayOutbound 합집합 편입"
      contains: "vi.slot.clear"
    - path: "relay/src/hub/subscription-hub.ts"
      provides: "#clearViOwner(userId, owner) — 지운 슬롯마다 vi.slot.clear(또는 남은 값 vi.slot) 팬아웃"
      contains: "vi.slot.clear"
    - path: "relay/src/ws/fanout.ts"
      provides: "resyncUser 가 hub.retainSessions 를 #users entry 삭제보다 먼저 불러 지움이 1012 전에 전달됨"
    - path: "webapp/src/lib/use-relay-socket.ts"
      provides: "리듀서 case \"vi.slot.clear\" — 그 키 삭제"
      contains: "case \"vi.slot.clear\""
  key_links:
    - from: "relay/src/hub/subscription-hub.ts #clearViOwner"
      to: "relay/src/ws/fanout.ts #deliver (hub \"fanout\" 리스너 796)"
      via: "#fanout(userId, {t:\"vi.slot.clear\", a, x})"
      pattern: "vi\\.slot\\.clear"
    - from: "relay/src/ws/fanout.ts resyncUser"
      to: "hub.retainSessions → #dropOwner → #clearCaches → #clearViOwner"
      via: "retainSessions 호출이 #users.delete(userId) 앞"
      pattern: "retainSessions\\(userId, new Set\\(\\)\\)"
    - from: "webapp/src/lib/use-relay-socket.ts relayReducer"
      to: "viSlots 소비처(app-sidebar sidebarGroupsOf · strategy-status-card nothingToDisable · me-client viAccountRunning · vi-settings-rows viSlotOf)"
      via: "viSlots Map 에서 키 삭제"
      pattern: "case \"vi\\.slot\\.clear\""
---

<objective>
Phase 32 코드 리뷰 IN-04(`.planning/phases/32-account-axis/32-REVIEW.md` §IN-04)를 고친다. relay hub 가 VI (계좌, 거래소) 슬롯 캐시를 지울 때 브라우저로 「모름으로 되돌림」 프레임 `vi.slot.clear` 를 보내고, 웹 리듀서가 그 키를 지운다. 그러면 사이드바 VI 줄 · /me 상태줄 · 작업대 VI 설정 행 · 「이 계좌 끄기」 활성 판정이 relay 가 아는 사실(D-17 3상태: 키 부재 = 모름)을 따른다.

Purpose: 세션 분리 · 교체 · 재수립 뒤에도 브라우저가 「VI 가동」 을 말하고 「이 계좌 끄기」 가 눌리지만 relay 는 `getViSlot` undefined 로 거부하는 어긋남(IN-04)을 없앤다.
Output: shared 와이어 계약 1종 추가, relay hub 송신 + fanout 재수립 순서 1곳, webapp 리듀서 갈래 1개, 단위 테스트(relay hub · 재수립 통합 · webapp 리듀서 · 소비처 잠금).

범위 상한: IN-04 만이다. IN-01 · IN-03 · 다른 리뷰 항목, 리팩터, gh-trade 와이어(StockDMA.fbs) 변경, 배포는 하지 않는다(배포는 이 문서 끝 체크리스트대로 오케스트레이터가 한다).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/phases/32-account-axis/32-REVIEW.md

## 설계 결정 (플래너가 코드를 읽고 정함 — 실행자는 다시 판단하지 않는다)

파일 약칭(이 문서 전체): `subscription-hub.ts` = `relay/src/hub/subscription-hub.ts` · `fanout.ts` = `relay/src/ws/fanout.ts` · `session.ts` = `relay/src/dma/session.ts` · `fake-gateway.ts` = `relay/tests/helpers/fake-gateway.ts` · `use-relay-socket.ts` = `webapp/src/lib/use-relay-socket.ts` · `app-sidebar.tsx` = `webapp/src/components/layout/app-sidebar.tsx` · `strategy-status-card.tsx` · `me-client.tsx` = `webapp/src/components/trading/` 아래 · `vi-settings-rows.tsx` = `webapp/src/components/trading/workbench/vi-settings-rows.tsx`. 라인은 계획 시점(HEAD fd860370) 실측이다.

### 1. 프레임 모양 — 새 `t` 「vi.slot.clear」 (cfg 를 뺀 `vi.slot` 갈래는 쓰지 않는다)
- 와이어: `{ t: "vi.slot.clear"; a: string; x: RelayExchange }` — `vi.slot` 과 같은 슬롯 키(`${a}|${x}`), 슬롯 1건당 1프레임. 기존 `#fillViSlots` 도 슬롯마다 1프레임을 내므로 같은 결이다.
- **구 webapp(지금 프로덕션 번들) + 새 relay 가 안전한 근거:** `webapp/src/lib/use-relay-socket.ts:2332-2343` `parseFrame` 은 `t` 가 문자열인지만 보고, 리듀서 `default`(1205-1209 — 「알 수 없는 `t` 는 무시한다 … T-15-41」)가 모르는 `t` 를 버린다. 비시장 프레임은 인증 ACK 전에도 그대로 리듀서로 간다(1913-1977). 그래서 구 클라는 새 프레임을 조용히 무시하고 IN-04 이전 동작 그대로다.
- **cfg 를 뺀 `vi.slot` 을 쓰지 않는 근거(구 번들이 깨진다):** JSON 에서 `cfg: undefined` 는 키가 빠진다 → 구 리듀서 `case "vi.slot"`(1136-1145)이 `viSlots.set(key, undefined)` 를 넣는다 → 사이드바 `sidebarGroupsOf`(`webapp/src/components/layout/app-sidebar.tsx:156-160`)가 `cfg !== null` 을 통과한 `undefined` 의 `.exchange` 를 읽어 TypeError — 앱 셸이 깨진다. `viSlotsOfAccount(viSlots, undefined)`(use-relay-socket.ts:365-368)도 같은 이유로 던진다.
- **새 webapp + 구 relay(배포 사이 창)가 안전한 근거:** 구 relay 는 이 프레임을 내지 않는다 → 새 갈래가 잠자고 지금 동작(IN-04 그대로)이다. 다른 새 동작은 없다.
- relay 아웃바운드는 zod 가 아니라 타입(`RelayOutbound` 합집합 · `packages/shared/src/relay.ts:1851`)이고 `encode`(`relay/src/ws/protocol.ts:713`)는 `JSON.stringify` 다 — 공유 계약 = 타입 추가다. 웹 · relay 어디에도 `RelayOutbound` 의 exhaustive `never` 검사는 없다(확인함).

### 2. 「지움」 송신 시점 — hub VI 슬롯 캐시 삭제 경로 전수 (라인 근거)
`#viSlots` 를 지우는 곳은 `#clearViOwner`(subscription-hub.ts:3531-3543 · 3533 의 delete)와 `closeAll`(2606 `#viSlots.clear()`) 둘뿐이다(`grep -n "#viSlots"` 전수). `#clearViOwner` 의 호출자는 `#clearCaches`(3849 · 3876) 하나이고, `#clearCaches` 의 호출 경로는 아래 1~3 이다.

| # | 경로 (라인) | 트리거 | 지금 지움 수신자 | 곧 다시 채워지나 | 판정 |
|---|---|---|---|---|---|
| 1 | `attach` 교체 subscription-hub.ts:1173-1177 → `#clearCaches` | 같은 소유 키의 새 세션 객체(부트 실패 재생성 · 탭 0 뒤 재획득) | 보통 0 — 인증 경로는 `hub.attach`(fanout.ts:1837)가 `#register`(1838)보다 먼저라 새 연결이 아직 entry 에 없고, `SessionManager.acquire` 는 refCount 0 · 부트 실패일 때만 새로 세운다(subscription-hub.ts:3898 주석) | 새 세션 Ready → 21 → 61 (수 초) | 허용. 수신자가 거의 없고, 있더라도 그 사이 relay `getViSlot` 이 undefined 라 「이 계좌 끄기」 의 VI 몫은 실제로 거부된다 — 「가동」 을 남기는 쪽이 거짓 |
| 2 | `retainSessions` 1201-1211 → `#dropOwner` 1620-1624 → `#clearCaches` · 호출자 fanout.ts:3022 `#register` → `#bindSessions` → 3062, fanout.ts:1632 `refreshUserSessions` → `#bindSessions` → 3062 | 살아 있는 연결 누구도 쥐지 않은 세션 분리(IN-04 본 경로) | 그 사용자 연결 전부(`#register` 가 entry 에 넣은 뒤라 새 연결도 포함) | 아니오 — 떼어 낸 세션은 돌아오지 않는다. G-1 로 계좌는 소유 세션 하나에만 보이므로 다른 세션 61 은 자기 슬롯으로 따로 온다 | 깜빡임 없음 |
| 3 | `resyncUser` fanout.ts:1294-1312 → `retainSessions(userId, new Set())` 1305 · 호출자 `#sweepThenResync` 1418-1453(주문 서버 변경 · 쓰던 서버 끄기 — 레지스트리 서명 변경) | 재수립 → 연결마다 close(1012) | **0 — 결함**: `#users.delete(userId)`(1300)가 retain(1305)보다 먼저라 `#deliver`(3372-3376)가 entry 를 못 찾아 버린다. Task 2 가 순서를 바꾼다 | 1012 → 재접속 → 새 세션 Ready → 61 (수 초) | 허용. 그 사이 소켓이 끊겨 상태 알약이 재연결을 말하고, 옛 서버 VI 는 sweep 이 방금 껐다 — 「가동」 유지는 거짓. 새 서버 61 이 다시 채운다. 소유자 없는 계좌(order-server-resync ③)는 지움이 없으면 새로고침 전까지 「가동」 이 영영 남는다 |
| 4 | `closeAll` 2606 | 프로세스 종료 | — | — | 프레임 없음(소켓 전량 종료) — 의도. 테스트로 잠근다 |

삭제 경로가 **아닌** 것(지움 없음 — 범위 밖 관찰, 손대지 않는다):
- 87 계좌 제외: `DmaSession.removeAllowedAccounts`(relay/src/dma/session.ts:427-440) → `accounts` 이벤트 → hub `#onAccounts`(subscription-hub.ts:3789-3803)는 21 재요청만 판단하고 슬롯을 지우지 않는다(3784-3785 주석 「계좌가 빠지기만 했으면(87) … 무동작」). 그래서 제외된 계좌 슬롯은 hub 캐시에도 남는다 — IN-04 와 다른 결함(hub 쪽 잔존)이라 여기서 고치지 않는다. 오케스트레이터 보고에 후속 후보로 적는다.
- 회선 끊김 · gh-trade 서버 프로세스 다운: 세션이 결선된 채 재접속 루프라 캐시를 지우지 않는다(삭제 아님). 재접속 Ready 의 21 이 덮는다.

깜빡임 완화책: 두지 않는다. 웹에 지움 지연(디바운스)을 두면 IN-04 의 거짓 「가동」 창을 되살리고 3상태 즉시성을 깬다. 위 표대로 지움 → 61 재수신 사이 구간은 relay 가 실제로 그 슬롯을 다룰 수 없는 구간이다.

### 3. 지움 뒤 브라우저 값 = hub 병합 뷰 (re-assert 규칙)
브라우저 키는 소유 키가 없는 `${a}|${x}` 이고 hub 키는 `${owner}|${a}|${x}` 다(viSlotKey subscription-hub.ts:847). 한 소유 키의 슬롯을 지운 뒤 같은 (a, x) 를 다른 결선 세션이 여전히 알면(`getViSlot` 2288-2296 이 undefined 가 아님) 지움을 보내면 거짓이다. 그래서 지운 (a, x) 마다 `getViSlot(userId, a, x)` 를 다시 보고 undefined 면 `vi.slot.clear`, 아니면 그 값의 `vi.slot` 을 보낸다. G-1 소유 필터(머리 주석 120-123 · `#onViTrigger` 의 소유 뷰 밖 61 버림)로 운영에서는 거의 닿지 않지만, 「지운 직후 브라우저 = getViSlot」 불변식을 한 줄로 지킨다.

### 4. 작업대 VI 설정 행 — 지움 뒤 「미조회」 잠금 (빈 행 아님)
- D-17 3상태(CR-01): 지움 = 「모름」(키 부재)이지 「미등록」(`null`)이 아니다. D-26 의 61 `unregistered` 는 서버가 「없다」 고 말한 사실이라 빈 행(UI-SPEC S12 「미등록 빈 행」)이고, 지움은 서버가 아무것도 말하지 않은 상태라 잠금이다.
- 빈 행으로 보이면 사용자가 입력 · 저장을 시도하게 되는데 그 계좌 소유 세션이 없어 `vi.set` 은 거부된다(UI-SPEC S12 error 행 「소유 세션 없음」).
- WR-03 의 「미조회 잠금이 남지 않음」 은 답할 수 있는 Ready 세션이 묻지 않아 잠금이 영영 남던 결함이다. 여기 잠금은 소유 세션이 없는 동안만이고, 소유 세션이 서면 그 Ready 의 21(또는 WR-03 의 `#onAccounts` 재요청)이 61 로 풀어 준다 — 불변식 유지.
- 웹 코드 변경은 필요 없다: `webapp/src/components/trading/workbench/vi-settings-rows.tsx:446-466` 은 `server === undefined` 를 사건으로 보지 않아(450 「미조회는 사건이 아니다」) 입력값을 지우지 않고, 492 `locked` 가 `server === undefined` 로 잠근다. 다시 61 이 오면 새 객체라 기존 에코 규칙(D-27 「더티 중 에코가 오면 값을 덮는다」)대로 덮는다 — 세션 교체 61 재충전이 지금도 하는 일과 같아 새 손실이 없다. Task 3 이 이 동작을 테스트로 잠근다.

### 5. 소비처는 코드 변경 없음
사이드바(`app-sidebar.tsx:156-160` — `viSlots.values()` 에서 run 인 것만), 현황 카드(`strategy-status-card.tsx:404-412` — `viAccountRunning` · `nothingToDisable = shownCount === 0 && !viShownRunning`), /me 상태줄(`me-client.tsx:219` · 284 「가동/중지」), VI 행(`vi-settings-rows.tsx:318` `viSlotOf`)은 모두 `viSlots` Map 에서 파생한다. 키가 지워지면 저절로 따른다. /me 상태줄은 모름 · 미등록을 「중지」 로 그리는 기존 규칙(`viAccountRunning` 문서 371-378)을 그대로 쓴다.

## 실행 규칙
- 커밋: 한글 메시지, Co-Authored-By 넣지 않음, `git add <경로>` 로 경로 지정, 매 커밋 직전 `git status -sb` 로 남의 변경이 섞이지 않았는지 확인. push · 배포 금지.
- TDD: 태스크마다 RED(실패 테스트) 커밋 → GREEN(구현) 커밋. 커밋 접두사 `test(quick-261017-daz):` / `fix(quick-261017-daz):`.
- 테스트는 바뀐 파일 관련 vitest 만, 항상 `--maxWorkers=2`(동시 세션 메모리 고갈 사례). 전체 E2E 금지.
- shared 는 `dist` 로 소비된다(relay · webapp 모두 `workspace:*` · `packages/shared/package.json` exports → dist, dist 는 gitignore). 타입을 바꾼 뒤 `pnpm --filter @gh-radar/shared build` 를 먼저 돌려야 relay · webapp typecheck 가 새 타입을 본다.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: 트레이서 — 세션 분리 한 경로를 shared 계약 → relay hub 송신 → webapp 리듀서 삭제까지 끝에서 끝으로</name>
  <files>packages/shared/src/relay.ts, relay/src/hub/subscription-hub.ts, relay/tests/hub-multi-session.test.ts, webapp/src/lib/use-relay-socket.ts, webapp/src/lib/__tests__/relay-socket.test.ts</files>
  <behavior>
    - relay hub(hub-multi-session `VI 계좌 소유 세션 원천` describe, 1066-1273 의 기존 「KB121 분리(retainSessions)」 케이스 1242 를 넓힌다): KB120(B) · KB121(A) Ready · KB121 이 A|KRX run:true 61 을 냈고 A|NXT 는 받은 적 없음 → `retainSessions(U, {KB120})` 뒤 사용자 U 로 나간 `vi.slot.clear` 가 정확히 [{a:A, x:"KRX"}] 1건(A|NXT 는 몰랐으니 없음 · B 슬롯 지움 없음). 기존 단언(`vi.slot` 재팬아웃 수 불변 · vi.list 스냅 · 84 보존)은 그대로 통과. 그 케이스의 주석(1254-1255)을 새 동작으로 고친다
    - webapp 리듀서(relay-socket.test.ts 의 `P32 viSlots 리듀서` describe 1956-2047 에 추가): A|KRX run:true · B|KRX run:true 수신 뒤 `{t:"vi.slot.clear", a:A, x:"KRX"}` → `viSlotOf(…, A, "KRX")` undefined(키 없음 — `viSlots.has` false, null 아님) · B|KRX 그대로 · `viAccountRunning(viSlots, A)` false · `viAccountRunning(viSlots, undefined)` true(B 가동이 남음)
    - webapp 리듀서: 모르는 키의 지움 · VI 거래소 밖 x(예 "SOR")의 지움은 상태 참조 그대로(`toBe(before)` — 재렌더 없음)
    - webapp 리듀서: 미등록(null) 슬롯도 지움이 오면 키가 사라진다(모름으로 되돌림)
  </behavior>
  <action>
RED 먼저: 위 behavior 의 relay · webapp 테스트를 쓰고 실패를 확인한 뒤 커밋한다(relay 는 `vi.slot.clear` 0건, webapp 은 default 무시로 키가 남아 실패). 테스트 파일의 프레임 리터럴은 타입이 아직 없어 typecheck:tests 가 실패할 수 있다 — vitest 실행이 RED 판정이다.

GREEN:
1. `packages/shared/src/relay.ts` — `RelayViSlotMsg`(1324-1343) 바로 뒤에 `RelayViSlotClearMsg = { t: "vi.slot.clear"; a: string; x: RelayExchange }` 를 export 하고 `RelayOutbound` 합집합(1851-1877)의 `RelayViSlotMsg` 다음 줄에 넣는다(설계 결정 1). 문서 주석에 적을 것: 슬롯을 「모름」(키 부재)으로 되돌린다 · relay 가 그 슬롯을 아는 세션을 잃었을 때(세션 분리 · 교체 · 재수립) 지운 슬롯마다 1건 · 브라우저는 키를 지운다(`null` 로 바꾸지 않는다 — D-17 3상태) · 새 `t` 를 고른 이유(구 webapp 은 default 무시, cfg 를 뺀 vi.slot 은 구 번들 사이드바 TypeError) · 구 relay 는 내지 않는다. `RelayViSlotMsg` 문서의 「키 부재」 줄(1329)에 「또는 `vi.slot.clear` 로 모름으로 되돌아왔다」 를 더하고, 파일 머리 「변경 이력(최근)」(28-30)에 quick-261017-daz 한 줄을 더한다. 그 뒤 `pnpm --filter @gh-radar/shared build`.
2. `relay/src/hub/subscription-hub.ts` `#clearViOwner`(3531-3543)를 `#clearViOwner(userId: string, owner: string)` 로 바꾸고 호출부 `#clearCaches`(3876)에 userId 를 넘긴다. 슬롯 삭제 루프에서 지운 키를 (계좌, 거래소)로 풀어 모은다 — 풀이는 `getViSlotsAll`(2268-2283)과 같은 방식(소유 접두 길이만큼 잘라 `lastIndexOf("|")` 로 계좌 · 거래소). 삭제 루프가 다 끝난 뒤(그 소유 키 슬롯이 전부 사라진 상태에서) 모은 (a, x) 마다 `this.getViSlot(userId, a, x)` 를 보고 undefined 면 `#fanout(userId, { t: "vi.slot.clear", a, x })`, 아니면 `#fanout(userId, { t: "vi.slot", a, x, cfg: <그 값> })` 을 낸다(설계 결정 3). VI 주문 추적 · 21 대기열 · `#settleDrains` 처리와 반환값(orders)은 그대로 둔다. `closeAll`(2606)은 건드리지 않는다. 이 태스크에서 고칠 주석: `#clearViOwner` 문서(3526-3530 — 지움 프레임이 없다는 문장을 새 동작으로).
3. `webapp/src/lib/use-relay-socket.ts` 리듀서 `case "vi.slot"`(1136-1145) 바로 뒤에 `case "vi.slot.clear"` 를 둔다: `VI_EXCHANGES` 밖 x 면 `state` 그대로, 그 키(`viSlotKey(frame.a, frame.x)`)가 없으면 `state` 그대로, 있으면 Map 을 복사해 그 키를 delete 하고 새 상태를 돌려준다. 주석: relay 가 그 슬롯을 아는 세션을 잃었다 → 모름으로 되돌림, `null` 로 바꾸지 않는 이유(3상태 — 미등록이면 VI 행이 빈 행이 되어 소유 세션 없는 계좌에 저장을 부른다). `RelayData.viSlots` 문서(569-575)에 「키 부재 = 모름(받은 적 없음 또는 `vi.slot.clear`)」 을 반영한다.
GREEN 커밋 메시지 예: `fix(quick-261017-daz): VI 슬롯 지움 프레임 vi.slot.clear — relay 세션 분리 시 송신 · 웹 리듀서가 키 삭제 (IN-04)`.
  </action>
  <verify>
    <automated>grep -q 't: "vi.slot.clear"' packages/shared/src/relay.ts && grep -q '"vi.slot.clear"' relay/src/hub/subscription-hub.ts && grep -q 'case "vi.slot.clear"' webapp/src/lib/use-relay-socket.ts && pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/relay-socket.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>retainSessions 분리 한 경로에서 relay 가 지운 슬롯마다 vi.slot.clear 1건을 내고, 웹 리듀서가 그 키를 지워 viAccountRunning 이 false 가 된다. RED · GREEN 두 커밋이 있고 위 명령이 전부 통과한다.</done>
  <reversibility rating="reversible">새 아웃바운드 t 추가 — 구 클라는 무시하고, 되돌리려면 송신만 멈추면 된다.</reversibility>
</task>

<task type="auto" tdd="true">
  <name>Task 2: relay 확장 — 세션 교체 · 남은 세션 re-assert · closeAll 무프레임 잠금 · 재수립(1012) 전달 순서</name>
  <files>relay/src/hub/subscription-hub.ts, relay/src/ws/fanout.ts, relay/tests/hub-multi-session.test.ts, relay/tests/order-server-resync.test.ts</files>
  <behavior>
    - 세션 교체(hub-multi-session): KB121 이 A|KRX · A|NXT 를 알고 있을 때 같은 소유 키의 새 FakeBrokerSession(U, "KB121", …)을 `attach` → `vi.slot.clear` 가 A|KRX · A|NXT 각 1건(경로 1)
    - re-assert(hub-multi-session): 두 세션(KB120 · KB121) 모두 소유 뷰에 A 를 가진 가짜로 만들고 KB120 이 A|KRX run:false, KB121 이 A|KRX run:true 를 냄 → `retainSessions(U, {KB120})` 로 KB121 을 떼면 A|KRX 는 지움이 아니라 `{t:"vi.slot", a:A, x:"KRX", cfg:{run:false …}}`(KB120 값) 1건 · `vi.slot.clear` 0건
    - closeAll(hub-multi-session): 슬롯이 있는 상태에서 `hub.closeAll()` → `vi.slot.clear` 0건(경로 4)
    - 재수립(order-server-resync, 트레이서 ① 1처럼 A 를 KB120 → KB121 로 옮기는 기존 비계를 쓰거나 형제 케이스를 둔다): 가짜 게이트웨이가 21 에 61 로 답하도록 두어(fake-gateway.ts:248 의 21 자동 응답 내용 지정 · 1238-1259) 탭이 이동 전 A · B 의 vi.slot 을 받게 한 뒤 → 1012 로 닫히기까지 그 탭이 받은 `vi.slot` · `vi.slot.clear` 를 받은 순서대로 Map 에 적용(set / delete)하면 남는 키가 0 이다. 순서를 바꾸기 전에는 지움이 entry 삭제 뒤라 0건이라 RED
  </behavior>
  <action>
RED 먼저: 위 네 케이스를 쓰고 실패를 확인해 커밋한다. 세션 교체 · re-assert 는 Task 1 구현으로 이미 통과할 수 있다 — 그러면 RED 는 재수립 케이스 하나로 충분하다(통과하는 케이스는 동작 잠금으로 남기고 SUMMARY 에 「구현 전부터 통과(Task 1 덕)」 로 적는다).

GREEN:
1. `relay/src/ws/fanout.ts` `resyncUser`(1294-1312): `this.#hub.retainSessions(userId, new Set())`(1305)를 `conn.acquiredServers = []` 루프(1296) 바로 뒤, `#users` entry 를 지우는 블록(1297-1301) **앞**으로 옮긴다. 이유 주석: hub 정리가 내는 사용자 프레임(VI 슬롯 지움 등)이 아직 등록된 연결로 1012 close 전에 가야 한다 — ws 는 send 를 close 프레임보다 먼저 흘린다. 옮긴 결과 같은 정리가 내는 다른 프레임(vi.list 스냅 · unf.progress 스냅 · 전부 정지 집계 strategies.disabled)도 이제 close 전에 전달된다 — 모두 브라우저가 재접속 replay 로 같은 값을 다시 받는 프레임이라 무해하다. 세션 리스너 해제 · `#syncedSig` · `dropUser` · close 순서는 그대로 둔다.
2. `relay/src/hub/subscription-hub.ts` 주석만 맞춘다(동작 변경 없음): 머리 주석 VI 행(100-103)과 Phase 32 D-17 절(111-118)에 「지운 슬롯은 `vi.slot.clear`(다른 세션이 알면 그 값 `vi.slot`)」, `#syncViList` 문서(1645-1650 — 설정 슬롯은 `#clearViOwner` 가 이미 지움 · re-assert 로 맞췄다는 뜻으로), `#clearCaches` 의 VI 줄(3873-3875). 84 사용자 설정 쪽 주석(3877-3879 · 「지움」 프레임 없음은 84 이야기)은 건드리지 않는다.
3. `relay/src/ws/fanout.ts` 인증 replay 주석(1875-1876)에 「지운 슬롯은 hub 가 연결 중 브라우저에 `vi.slot.clear` 로 이미 알렸다 · replay 는 아는 슬롯만」 한 줄을 더한다(동작 변경 없음).
4. 87 계좌 제외 경로(`#onAccounts` 3789-3803)와 `closeAll` 은 건드리지 않는다(설계 결정 2 「삭제 경로가 아닌 것」).
5. 순서 변경이 다른 기대를 깨는지 관련 스위트를 돌려 확인한다(아래 verify). 깨지면 그 단언이 새 프레임(close 전 전달) 때문인지 확인해 그 경우에만 단언을 새 사실로 고치고, 고친 단언과 이유를 SUMMARY 에 적는다. 그 밖의 실패는 멈추고 보고한다.
GREEN 커밋 메시지 예: `fix(quick-261017-daz): 재수립(1012) 전 hub 정리를 먼저 — VI 슬롯 지움이 닫히기 전 브라우저에 닿게 (IN-04)`.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/relay exec vitest run tests/hub-multi-session.test.ts tests/hub.test.ts tests/strategy-hub.test.ts tests/strategy-sweeper.test.ts tests/fanout.test.ts tests/fanout-multi-session.test.ts tests/order-server-resync.test.ts tests/ws-latch.test.ts tests/ws-autosell.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/relay run typecheck:tests</automated>
  </verify>
  <done>세션 교체 · 분리 · 재수립 세 경로 모두 지운 슬롯이 1012 · 다음 프레임 전에 브라우저에 vi.slot.clear(또는 남은 값 vi.slot)로 도달하고 closeAll 은 프레임 0 이다. 위 9개 relay 스위트와 두 typecheck 가 통과한다.</done>
</task>

<task type="auto">
  <name>Task 3: webapp 소비처 잠금 — 지움 뒤 상태로 사이드바 VI 줄 · 「이 계좌 끄기」 · 작업대 VI 행이 사실을 따르는지</name>
  <files>webapp/src/components/trading/__tests__/strategy-status-card.test.tsx, webapp/src/components/layout/__tests__/app-sidebar.test.tsx, webapp/src/components/trading/__tests__/vi-settings-rows.test.tsx</files>
  <action>
소비처 코드는 바꾸지 않는다(설계 결정 5). 리듀서가 만든 「지움 뒤」 Map(그 키가 없는 Map)을 소비처가 어떻게 그리는지 테스트로 잠근다. 소비처가 이미 viSlots 에서 파생하므로 이 테스트는 작성 즉시 통과하는 것이 정상이다 — 리듀서 RED/GREEN 은 Task 1 이 맡았다. SUMMARY 에 「동작 잠금(구현 전부터 통과)」 으로 적는다.
1. `strategy-status-card.test.tsx` — 기존 「이 계좌 끄기」 describe(686 부근 `killButton` · 737 이하 `toBeDisabled` 패턴)에 한 케이스: 켜진 상따 0 인 계좌(ACC_C 류)에 VI 가동 슬롯이 있으면 「이 계좌 끄기 — {번호}」 활성 → 같은 테스트 안에서 mockRelay 를 그 키가 없는 Map(지움 뒤)으로 바꾸고 다시 그리면 비활성 · 요약 「VI 중지」(IN-04 의 「눌리지만 relay 는 거부」 가 사라짐). 같은 계좌에 켜진 상따가 있으면 지움 뒤에도 활성으로 남는지 한 줄 더 단언한다(nothingToDisable = 상따 0 ∧ VI 미가동).
2. `app-sidebar.test.tsx` — ⑤ VI 줄 케이스들(486-515) 옆에 한 케이스: KRX 가동 슬롯으로 「VI — KRX 가동」 링크가 있다가 그 키가 없는 Map 으로 다시 그리면 VI 링크가 없다(`queryByRole("link", { name: /VI/ })` null — 420 패턴). 두 거래소 가동 중 KRX 만 지우면 「VI — NXT 가동」 만 남는다.
3. `vi-settings-rows.test.tsx` — 「이관 — ⑤ 미조회 · ⑦ 세션 가드」 describe(495-) 에 한 케이스(설계 결정 4): KRX 등록 슬롯(trigger)으로 그린 뒤 같은 계좌의 KRX 키가 없는 슬롯(지움 뒤)으로 rerender → KRX 줄 스위치 · 상승률 입력이 잠기고(`toBeDisabled`), 입력칸 값은 직전 서버 값 그대로 남는다(빈 행으로 바뀌지 않음). 이어서 같은 값의 trigger 가 다시 오면 잠금이 풀린다. `slotsOf`(70-77) · `renderRows` 비계를 그대로 쓴다.
커밋 메시지 예: `test(quick-261017-daz): VI 슬롯 지움 뒤 사이드바 VI 줄 · 이 계좌 끄기 · 작업대 VI 행 잠금 단언 (IN-04)`.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/__tests__/strategy-status-card.test.tsx src/components/layout/__tests__/app-sidebar.test.tsx src/components/trading/__tests__/vi-settings-rows.test.tsx src/components/trading/__tests__/me-client.test.tsx src/lib/__tests__/relay-socket.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>세 소비처 테스트가 지움 뒤 상태(사이드바 VI 태그 빠짐 · 상따 0 계좌의 「이 계좌 끄기」 비활성 · VI 행 「미조회」 잠금 + 입력값 보존 → 재수신 시 해제)를 단언하고, 위 명령이 통과한다.</done>
</task>

</tasks>

<verification>
- Task 1~3 의 automated 명령 전부 통과.
- `git log --oneline -8` 에 quick-261017-daz 커밋이 RED → GREEN 순으로 있고, 각 커밋의 파일이 그 태스크 files 안이다(`git show --stat`).
- 와이어 하위 호환 재확인(코드 읽기): webapp `parseFrame`(use-relay-socket.ts:2332-2343)과 리듀서 default(1205-1209)는 이 작업으로 바뀌지 않았다 — 구 번들의 무시 경로가 그대로임을 SUMMARY 에 라인으로 적는다.
- gh-trade 생성물(`relay/src/generated/`)과 StockDMA.fbs 사본은 변경 0(`git diff --stat HEAD~N -- relay/src/generated` 비어 있음).
</verification>

<success_criteria>
- 세션 분리 · 교체 · 재수립 뒤 브라우저의 그 계좌 VI 슬롯이 「모름」 으로 돌아가 사이드바 · /me 상태줄 · 「이 계좌 끄기」 · 작업대 VI 행이 relay 사실과 같다(IN-04 해소).
- 구 webapp + 새 relay, 새 webapp + 구 relay 모두 깨지지 않는다(설계 결정 1 근거).
- 87 계좌 제외의 hub 잔존은 범위 밖 관찰로 SUMMARY 「후속 후보」 에 남는다.

## Source Audit (GOAL · REQ · RESEARCH · CONTEXT)
| 출처 | 항목 | 커버 |
|---|---|---|
| GOAL | IN-04 — 세션 분리 뒤 VI 슬롯 · 사이드바 · /me · 이 계좌 끄기가 사실을 따르게 | Task 1 · 2 · 3 |
| REQ | 와이어 계약 packages/shared/src/relay.ts · 구/신 조합 안전 근거 | Task 1 + 설계 결정 1 |
| REQ | 「지움」 송신 시점 전수 목록(라인 근거) · 깜빡임 판단 | 설계 결정 2 · Task 1(경로 2) · Task 2(경로 1 · 3 · 4) |
| REQ | 작업대 VI 행 지움 뒤 표시 규칙(WR-03 · D-26) | 설계 결정 4 · Task 3 |
| REQ | gh-trade 와이어 무변경 | verification 마지막 줄 |
| REQ | 테스트 relay 단위(hub · fanout) · webapp 리듀서/소비처 · shared — TDD | Task 1 · 2 · 3 (shared 는 타입 계약이라 relay · webapp typecheck + 리듀서 테스트가 검증 — 런타임 스키마 없음) |
| REQ | 배포 체크리스트(relay 먼저 → push) | 아래 「배포 체크리스트」 |
| RESEARCH | 없음(quick) | — |
| CONTEXT | D-17 3상태(키 부재 = 모름 · null = 미등록) | Task 1 리듀서(null 로 바꾸지 않음) · 설계 결정 4 |
| CONTEXT | D-26 61 unregistered = 빈 행 | 설계 결정 4 (지움은 빈 행이 아니라 잠금) |
| CONTEXT | WR-03 미조회 잠금이 남지 않음 | 설계 결정 4 |
| CONTEXT | D-16 배포 순서 relay 먼저 | 배포 체크리스트 |
</success_criteria>

<output>
`.planning/quick/261017-daz-in-04-relay-vi-vislots/261017-daz-SUMMARY.md` 를 만든다. 포함: 태스크별 커밋 해시(RED/GREEN), 구현 전부터 통과한 케이스 목록, Task 2 에서 고친 기존 단언(있으면)과 이유, 와이어 하위 호환 라인 근거, 「후속 후보」(87 계좌 제외 시 hub VI 슬롯 잔존 — subscription-hub.ts `#onAccounts` 3784-3803), 아래 배포 체크리스트 사본(오케스트레이터가 집행).
</output>

## 배포 체크리스트 (실행자 범위 밖 — 오케스트레이터가 메인 세션에서 집행)

순서는 **relay 먼저 → webapp push** 다(D-16 · 메모리 「배포는 relay 먼저 · push 나중」 — push 자체가 webapp 프로덕션 배포). 이 변경은 두 조합 모두 안전하지만(설계 결정 1) 순서 규칙은 지킨다.

1. **시점:** 장 시간(08:00~20:00 KST) 밖 권장 — relay 재시작은 모든 wss 를 끊는다.
2. **트리 확인:** `git status -sb` 로 master 가 executor 마지막 커밋이고 남의 로컬 커밋 · 미커밋 변경이 없는지 본다. `scripts/deploy-relay.sh` 는 `SHA=$(git rev-parse --short HEAD)`(485)로 태그하고 저장소를 빌드 컨텍스트로 쓰므로, 다른 세션 커밋이 섞였으면 이 작업 커밋에서 만든 detached worktree 에서 배포한다(32-14 선례).
3. **인증 env:** Deployer SA — `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json` · `CLOUDSDK_CORE_PROJECT=gh-radar`.
4. **relay 배포:** `GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://<ref>.supabase.co NOTIFICATION_CHANNEL_ID=<채널 ID> bash scripts/deploy-relay.sh` (infra/relay/README.md:129-131). `SUPABASE_URL` 은 필수(deploy-relay.sh:491 `:?`), `NOTIFICATION_CHANNEL_ID` 는 선택(319-323 — 없으면 알림 정책 단계만 건너뜀). 레지스트리 모드 운영이라 플래그 없이 정상 배포가 열린다(전환 잠금 509-). 명령은 허용 규칙 접두사 그대로 — `yes |` · 출력 파이프를 붙이지 않는다.
5. **스모크:** `bash scripts/smoke-relay.sh` — INV 전부 PASS(INV-9 · 10 은 비밀 필요로 SKIP 정상). 버전 확인 `curl -s https://dma.jx1.io/healthz` 의 `version` 이 새 SHA. Cloud Logging `relay_docker` 에 오류 · 스키마 위반 0 확인(infra/relay/README.md 조회 예시).
6. **webapp:** relay 스모크 통과 뒤에만 `git push`(master → Vercel 프로덕션). relay 가 막히면 push 하지 않는다.
7. **STATE.md:** Quick Tasks Completed 표에 261017-daz 행 추가(오케스트레이터 몫 · main tree 직접 편집).
