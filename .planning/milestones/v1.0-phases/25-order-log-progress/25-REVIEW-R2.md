---
phase: 25-order-log-progress
round: 2
gap_closure_plan: 25-13
reviewed: 2026-09-30T02:00:00Z
depth: deep
diff_range: 9a3ab0b6..6821181b -- relay/ webapp/
files_reviewed: 4
files_reviewed_list:
  - relay/src/hub/subscription-hub.ts
  - relay/tests/fanout.test.ts
  - relay/tests/hub.test.ts
  - webapp/e2e/specs/trading-workbench.spec.ts
round1_closed:
  - WR-02
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 25: 코드 리뷰 R2 — 갭 클로징 25-13 (WR-02 세션 교체 뒤 진행률 잔존)

**리뷰 시각:** 2026-09-30
**깊이:** deep (hub → WsFanout `#deliver` → 웹 리듀서, SessionManager 재생성 조건, DmaSession 재접속 상태기계까지 추적)
**리뷰 파일 수:** 4
**상태:** issues_found (Critical 0 · Warning 1 · Info 4)

> 이 파일은 2라운드 기록이다. 1라운드 정본 `25-REVIEW.md` 는 수정하지 않았다. 이번 라운드 finding ID 는 `R2-` 네임스페이스를 쓴다.

## 1라운드 WR-02 판정 — **닫힘 (CLOSED)**

WR-02 가 지적한 경로는 이렇다. `attach` 가 세션 객체 교체를 감지하면 `#clearCaches` 가 진행률 캐시를 브라우저에 알리지 않고 비운다. 그 뒤 새 세션의 빈 83 은 `prev === undefined` 억제에 걸린다. 이 경로는 이제 막혔다.

- `#clearCaches` 가 이 사용자 키를 하나 이상 지우면 같은 호출 안에서 `{t:"unf.progress", snap:true, entries:[]}` 를 그 userId 에게 1프레임 보낸다(`subscription-hub.ts:1788-1793`). `entries` 는 빈 리터럴이라 순서가 바뀌어도 옛 값이 다시 나가지 않는다.
- 순서를 추적했다. `#onFirstMessage` 순서는 `hub.attach` → `#clearCaches` → `#fanout` → `WsFanout #deliver` 다(`fanout.ts:649-650`, `:441`, `:1637`). 이 시점의 `#users` 는 아직 옛 entry 라서 이미 연결된 탭만 초기화 스냅을 받는다. 그다음 `#register` 가 새 연결을 합류시키고, 인증 스냅 `getQueueProgressEntries` 가 이미 빈 캐시에서 `[]` 를 내린다. 기존 탭과 새 탭은 둘 다 빈 Map 으로 수렴한다.
- 사용자 격리(T-15-02): `#fanout` 은 userId 하나만 대상으로 하고, `#deliver` 는 그 사용자 entry 의 연결만 돈다. hub 테스트 「그 사용자에게만」 이 user-2 의 캐시와 팬아웃 수가 그대로임을 잠근다.
- 소음: 지운 키가 없으면 보내지 않는다. 소음 0 테스트로 잠겨 있다.
- `closeAll` 은 `#clearCaches` 를 부르지 않고 맵을 직접 `clear()` 한다(`subscription-hub.ts:982-999`). 그래서 종료 중이거나 연결이 끊기는 사용자에게 프레임이 나가지 않는다. 확인했다.
- 유예 만료 뒤 재생성(`session-manager.ts:249-256` → 다음 `acquire` 의 `#create`)에서는 `#onClose` 가 이미 `#users` entry 를 지웠다. 그래서 초기화 스냅은 수신자 없이 버려지고 예외도 없다. 주석 4항의 「오늘 미도달」 설명과 같다.
- 테스트 실행: `vitest tests/fanout.test.ts tests/hub.test.ts -t "P4 세션 교체|WR-02"` 를 3회 연속 돌렸고 매번 5 passed 였다(플레이크 없음).
- e2e 단언 1 → 2 는 맞다. 근거는 아래 「e2e 단언 검증」 에 있다.

다만 **같은 「캐시 ≠ 브라우저 사본」 균열이 다른 곳에 남아 있고, 그쪽은 오늘도 도달 가능하다**(R2-WR-01). WR-02 문구(세션 교체)의 범위 밖이라 WR-02 판정은 닫힘으로 두고, 별도 finding 으로 올린다.

## Narrative Findings (AI reviewer)

## Warnings

### R2-WR-01: 같은 세션 재접속(Ready 아님) 동안의 83 이 캐시만 바꾸고 브라우저에는 알리지 않는다 — WR-02 와 같은 잔존이 오늘 도달 가능한 경로로 남아 있다

**파일:** `relay/src/hub/subscription-hub.ts:1273-1277` (`#onQueueProgress` Ready 게이트), `relay/src/hub/subscription-hub.ts:1774-1780` (새 주석 1·3항), `relay/src/hub/subscription-hub.ts:1712-1724` (`#onReady`)

**문제:**
새 주석 1항은 「캐시를 브라우저 모르게 비우는 곳은 여기뿐이다」 라고 쓰고, 3항은 「캐시가 빈 사용자는 사본도 비어 있다」 라고 쓴다. 둘 다 사실이 아니다.

- `DmaSession` 은 게이트웨이 TCP 가 끊기면 **같은 객체로** 재접속한다(`session.ts:161-164`, `reconnecting → logging_in → declaring → ready`). 그래서 hub `attach` 는 조기 반환하고 `#clearCaches` 는 불리지 않는다.
- 그동안 `DmaSession#onFrame` 은 상태와 무관하게 프레임을 흘린다(`session.ts:320-322`). 83 은 「계좌를 선언한 세션」 에도 온다(RESEARCH D-19). 따라서 다계좌 사용자는 `declaring` 단계 같은 Ready 이전 구간에도 83 을 받을 수 있다.
- 이 구간에 비어 있지 않던 키로 빈 83 이 오면 `#onQueueProgress` 가 캐시 키를 지운다(`:1275`). 이어서 `if (!session.isReady) return;`(`:1277`)으로 팬아웃 없이 끝난다. 이후 같은 키의 빈 83 은 모두 `prev === undefined` 억제에 걸린다. 결과는 WR-02 와 똑같이 옛 진행률이 무기한 표시되는 것이다.
- 비어 있지 않은 갱신도 같은 문제를 겪는다. Ready 이전에 온 새 값은 캐시에만 들어가고, 이미 연결된 탭은 옛 값을 계속 그린다. 인증 스냅은 새 연결에만 나가기 때문이다.
- 이 경로는 25-13 의 새 게이트와도 겹친다. 캐시가 이미 비어 있으니 나중에 실제 세션 교체가 일어나도 `clearedProgress === 0` 이라 초기화 스냅이 나가지 않는다.

재현(스크래치 tsx 스크립트 · 실제 `SubscriptionHub` 와 `buildQueueProgressFrame` 사용 · 웹 리듀서 규칙으로 사본을 모델링):

```
push 83 [12453] (ready)            → fanout snap:false            copy={KRX}
isReady=false; push 83 []          → (팬아웃 없음, 캐시 삭제)
isReady=true;  push 83 []          → (빈→빈 억제)
hub cache: []   browser copy keys: [ 'KR7005930003KRX' ]      ← 잔존
attach(new session)                → clearedProgress 0 → 스냅 없음
after replacement browser copy keys: [ 'KR7005930003KRX' ]   ← 여전히 잔존
```

WR-02 의 교체 경로는 오늘 운영에서 도달하지 않는다(주석 4항 · 플랜이 스스로 인정). 반면 이 경로는 같은 세션의 게이트웨이 재접속 때마다 열린다. 그래서 실사용 영향은 이쪽이 더 크다. 구간이 좁아(로그인~계좌 대조 완료, 수백 ms) Blocker 로 올리지는 않는다.

**수정:** `#onReady` 에서 **현재 캐시 그대로** 재동기화 스냅을 한 번 보낸다. 플랜이 (b) 안을 기각한 이유는 `entries: []`(비움)가 D-13 을 깬다는 것이었다. 캐시 값을 다시 보내는 것은 한 세션 안의 「마지막 값 유지」 를 깨지 않는다. 같은 세션 재접속에서는 캐시가 유지되고, 비어 있지 않은 값은 그대로 다시 나가기 때문이다. 이 스냅은 Ready 이전 구간에 캐시에서 일어난 삭제와 갱신만 사본에 반영한다.

```ts
#onReady(userId: string, session: HubSession): void {
  if (this.#sessions.get(userId) !== session) return;
  this.resubscribeAll(userId);
  this.requestAccountState(userId);
  this.requestStrategySnapshot(userId);
  // Ready 이전 구간(같은 세션 재접속 · 계좌 선언 중)의 83 은 캐시만 바꾸고 팬아웃하지 않았다.
  // 이미 연결된 탭의 사본을 캐시에 다시 맞춘다 — 값은 캐시 그대로라 D-13 유지.
  this.#fanout(userId, { t: "unf.progress", snap: true, entries: this.getQueueProgressEntries(userId) });
  this.#symbolMaster?.onSessionReady(session);
}
```

대안은 `#onQueueProgress` 에서 **삭제(빈 items)만** Ready 게이트를 건너뛰게 하는 것이다(`if (!session.isReady && items.length > 0) return;`). 이 방법은 비어 있지 않은 갱신의 불일치를 남긴다. 어느 쪽을 택하든 주석 1·3항의 「여기뿐이다」·「사본도 비어 있다」 문장은 고쳐야 한다. 회귀 테스트도 하나 붙인다: `isReady=false` 에서 빈 83 → `emitReady()` → 사본 모델에 키가 없어야 한다.

## Info

### R2-IN-01: 초기화 스냅 팬아웃이 `#clearCaches` 한가운데(타이머·`#pending` 정리 전, `attach` 의 `#sessions.set` 전)에 있다

**파일:** `relay/src/hub/subscription-hub.ts:1793-1799`, `relay/src/hub/subscription-hub.ts:518-521`

**문제:** 이 커밋 전의 `#clearCaches` 는 외부 코드를 부르지 않는 순수 정리 함수였다. 이제는 중간에서 `EventEmitter.emit("fanout")` 을 동기로 호출한다. 오늘 유일한 리스너인 `WsFanout #deliver` → `#send` 는 `ws.send` 를 try/catch 로 감싸서 던지지 않는다. 그래도 리스너가 하나라도 던지면 영향이 크다. 배치 플러시 타이머 해제와 `#pending.delete` 가 건너뛰어지고, `attach` 의 `#sessions.set(userId, session)` 도 실행되지 않는다. 그러면 hub 는 옛 세션에 묶인 채 새 세션의 프레임을 전부 침묵시킨다.
**수정:** 지운 수만 세어 두고, 팬아웃은 `#clearCaches` 의 마지막 줄로 옮긴다. 더 낫게는 `attach` 에서 `#sessions.set` 과 리스너 결선이 끝난 뒤에 보낸다(예: `#clearCaches` 가 `clearedProgress` 를 반환하고 `attach` 가 마지막에 `#fanout`).

### R2-IN-02: P4 는 「hub 는 교체 세션 · WsFanout 은 옛 세션」 인 분리 상태에서만 증명한다 — 새 탭 수렴 조합은 테스트되지 않았다

**파일:** `relay/tests/fanout.test.ts:969-1008`

**문제:** P4 는 `h.hub.attach(replacement)` 를 직접 불러 교체를 만든다. 그래서 `WsFanout #users` entry 는 계속 실제 `DmaSession` 을 가리키고, `#register` 의 세션 교체 갈래(기존 연결 합류)는 돌지 않는다. 이 테스트가 증명하는 것은 hub → `#deliver` → 실 ws 전달이다. 이 경로라면 그것으로 충분하고, 이 finding 을 지우면 테스트가 실패하므로 회귀 잠금은 유효하다. 하지만 주석 2항이 주장하는 「기존 탭과 지금 새로 붙는 탭이 같은 상태로 수렴」 은 검증되지 않았다. 그러려면 attach → clear 스냅(기존 연결) → `#register` 합류 → 인증 스냅(새 연결) 순서가 한 인증 흐름 안에서 일어나야 하는데, P4 에는 새 연결이 없다.
**수정:** (선택) P4 끝에 두 번째 `authed("token-a")` 연결을 붙이고, 그 연결의 첫 `unf.progress` 가 `snap:true` 이며 교체 뒤 캐시만 담는지(NXT 777) 단언한다. 운영에서 미도달이므로 필수는 아니다.

### R2-IN-03: 교체 순간 아직 대기 중인 주문의 진행률도 지워진다 — 복원은 새 세션의 83 재전송에 달려 있고 그 전제가 검증되지 않았다

**파일:** `relay/src/hub/subscription-hub.ts:1788-1793`

**문제:** 초기화 스냅은 사라진 주문만이 아니라 **여전히 대기 중인 주문**의 진행률도 지운다. 주석은 「새 세션의 83 이 다시 채운다」 고 가정한다(`:1771`). 하지만 83 은 변화가 있을 때 1초 스로틀로 오는 푸시다. 계좌 선언 직후 게이트웨이가 현재 진행률 전량을 한 번 밀어 주는지는 relay 테스트나 RESEARCH 어디에서도 확인되지 않는다. 밀어 주지 않는다면 교체 뒤 다음 체결이나 변화가 올 때까지 진행률 칸이 빈 상태가 된다. 플랜이 선택한 트레이드오프(옛 값보다는 빈 값)이고 새 탭과 일관되므로 결함은 아니다. 다만 교체 경로가 실제로 도달하게 되면 드러날 동작이다.
**수정:** gh-trade 쪽에서 「계좌 선언 · 시세 구독 직후 83 초기 전량 푸시」 여부를 확인하고, 그 결과를 주석에 한 줄로 박아 둔다.

### R2-IN-04: e2e P24-1 머리 주석이 여전히 `buy3_schema=1` 이라고 쓴다

**파일:** `webapp/e2e/specs/trading-workbench.spec.ts:2368`

**문제:** 테스트 이름과 단언은 2로 바뀌었는데, 바로 위 블록 주석은 「스텁 게이트웨이 10(바이트 디코드: buy3_schema=1 · …)」 그대로다. 다음 독자가 단언과 주석 중 어느 쪽이 맞는지 헷갈린다.
**수정:** `buy3_schema=2(postBuyAuto 동반 · quick-260929-vzy)` 로 고친다.

## e2e 단언 검증 (buy3_schema 1 → 2)

변경은 **맞다**. 근거:

- relay 조립기는 `cfg.postBuyAuto === undefined ? LC_FIXED_BUY3_SCHEMA(1) : LC_POST_BUY_AUTO_BUY3_SCHEMA(2)` 로 존재 여부만 보고 값을 파생한다(`relay/src/dma/envelope.ts:1376-1379`, `:1399`). 브라우저가 고를 수 없다.
- ws 스키마는 `postBuyAuto: z.boolean().optional()`(`relay/src/ws/protocol.ts:215`)이고, 채우지도 지우지도 않는다(`:493`).
- 웹은 항상 boolean 을 싣는다. 새 전략 기본값은 `postBuyAuto: false`(`webapp/src/lib/limit-chaser.ts:245`)이고, 에코에서 온 cfg 는 `server.postBuyAuto`(`:587`)를 쓴다. 에코 디코드는 `t.postBuyAuto()` 로 flatbuffer 기본값 false 를 포함해 항상 boolean 이다(`envelope.ts:2234`). shared `RelayLimitChaserInput.postBuyAuto` 도 필수다(`packages/shared/src/relay.ts:297`, `:368`).
- 따라서 새 웹이 보내는 모든 `lc.set` 은 `buy3_schema` 2 다. 세 곳(P24-1 · :2616 · :3581)의 단언 변경은 테스트를 동작에 맞춘 것이고 회귀를 가리지 않는다. 남은 `buy3Schema: 0/1` 은 전부 에코 픽스처 시드라 이번 변경과 무관하다.

---

_Reviewed: 2026-09-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
