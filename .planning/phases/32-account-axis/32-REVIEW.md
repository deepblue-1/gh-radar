---
phase: 32-account-axis
reviewed: 2026-10-16T11:15:51Z
depth: standard
files_reviewed: 35
files_reviewed_list:
  - packages/shared/src/index.ts
  - packages/shared/src/relay.ts
  - relay/src/dma/envelope.ts
  - relay/src/dma/strategy-sweeper.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/protocol.ts
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/me/account-chips.tsx
  - webapp/src/components/me/device-settings-card.tsx
  - webapp/src/components/me/limit-chaser-defaults.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/lc/inline-value-editor.tsx
  - webapp/src/components/trading/lc/number-pad-sheet.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/strategy-status-card.tsx
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/src/components/trading/workbench/alert-toasts.tsx
  - webapp/src/components/trading/workbench/card-grid.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/components/trading/workbench/vi-settings-rows.tsx
  - webapp/src/components/trading/workbench/workbench-status-bar.tsx
  - webapp/src/lib/account-label.ts
  - webapp/src/lib/orders-api.ts
  - webapp/src/lib/queued-window.ts
  - webapp/src/lib/quote-state.ts
  - webapp/src/lib/relay-provider.tsx
  - webapp/src/lib/trading-alerts.ts
  - webapp/src/lib/trading-focus.ts
  - webapp/src/lib/trading-layout.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/user-settings-server.ts
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-10-16T11:15:51Z
**Depth:** standard
**Files Reviewed:** 35
**Status:** issues_found

## Summary

Phase 32(계좌 축 정리 — /me 계좌 칩 · 작업대 계좌 스코프 · 사이드바 계좌 묶음 · 「이 계좌 끄기」 · 매매설정 서버 축 · VI 계좌별 슬롯)의 변경분을 `4df49caf..HEAD` 범위에서 `(32-` 커밋 기준으로 읽었다. 같은 범위의 Phase 33(teamflow) · quick-261016-miy 병합 hunk(`packages/shared/src/index.ts` 의 Teamflow 재수출 · 사이드바 「팀 매집 보고서」 줄 등)는 제외했다.

relay 쪽은 다음을 한 줄씩 따라갔다.
- hub `#viSlots` 키 `(소유 키, 계좌, 거래소)` · `#onViTrigger` 의 21 대기열 소비 규칙(b)/(c) · 구 서버 호환 `#fillViSlots("unknown")` · 빈 Envelope 귀속 · 대여 중 판정.
- `beginAccountStop` 집계. `sent`/`failed`/`viFailed` 셈, 65 꼬리표 귀속, 61 run:false 에코 완료, 시한 · 분리 · `closeAll` 종료.
- 84 의 소유 키 캐시, `getUserSettingsAll` 의 primary 마지막 순서, `#clearCaches` 의 소유 키 폐기.
- fanout `user.settings.set` 지정 서버 라우팅(primary 로 떨어뜨리지 않음)과 `#disableAccount` 의 IDOR 판정 순서.
- sweeper `#readActive` 의 21 · 21 · 24 한 벌 · 64 끝 판정(`unseen > bare`).

이 경로들은 의도대로 동작한다. 계좌 끄기 집계의 65 FIFO 귀속도 기존 「전부 정지」 와 섞이지 않는다.

BLOCKER 는 없다. 경고 6건은 대부분 webapp 쪽이다.
- `strategies.disabled` 프레임에 계좌가 없다. 그런데 /me 「이 계좌 끄기」 대기는 FIFO 맨 앞을 푼다. relay 가 0프레임으로 끝나는 경로(거부 · 답 0)가 하나라도 끼면 대기와 오류가 다른 계좌에 붙는다.
- 그 거부 경로에서는 웹 킬 스위치 in-flight 창도 8초 동안 열려 있다.
- relay 는 Ready 중에 추가 선언된 계좌의 21 을 다시 묻지 않는다. 그래서 그 계좌의 VI 슬롯이 영구히 「모름」(행 잠금)이다.
- /me 설정 탭 저장 기계 상태가 서버 전환을 넘어 남는다. 그래서 계좌 칩만 바꿔도 값이 다른 행이 「저장 성공」 초록으로 깜빡인다.
- `?account=` 가 URL 에 남아 새로고침 때 사용자의 나중 선택을 되돌린다.
- /me 기본 칩이 한 렌더 동안 첫 계좌로 섰다가 기억 계좌로 바뀐다.

단위 테스트는 실행하지 않았다(정적 검토 · 동시 세션 메모리 규율).

## Warnings

### WR-01: 「이 계좌 끄기」 대기 해제가 계좌가 아니라 FIFO 맨 앞을 푼다 — relay 가 0프레임으로 끝나는 끄기가 끼면 다른 계좌가 풀린다

**File:** `webapp/src/components/trading/strategy-status-card.tsx:431-438` (관련: `relay/src/hub/subscription-hub.ts:1487-1497`, `relay/src/ws/fanout.ts:2481-2486`)

**Issue:**
- 카드는 `strategies.disabled` 새 참조마다 `pendingRef.current[0]` 을 푼다. 이 설계는 「보낸 끄기 1건 = relay 완료 프레임 1건」 을 전제로 한다.
- 그런데 relay 는 여러 경로에서 **프레임을 하나도 내지 않는다.**
  - `#finishAccountStop` 은 `received` 가 0 이면 팬아웃하지 않는다. 시한(5초) 안에 65 · 61 이 하나도 오지 않았거나, 소유 세션이 교체 · 분리됐거나, 모든 14 · 11 송신이 실패한 경우다.
  - fanout 은 「끌 것 없음」(`ACCOUNT_DISABLE_NOTHING_TEXT`) · `#strategySession`/`#accountAllowed` 거부를 `msg` 거부 프레임으로만 답한다.
- 예: A 를 끄고(relay 가 0프레임으로 끝남) 이어서 B 를 끈다. B 의 `strategies.disabled` 가 A 를 「완료」 로 풀고, B 는 8초 백스톱 뒤 「반영을 확인하지 못했어요」 로 끝난다. 실제 결과와 정반대다.
- 같은 사용자의 다른 탭이 보낸 계좌 끄기의 완료 프레임도 이 탭의 맨 앞 대기를 푼다. hub 는 `strategies.disabled` 를 사용자 전 탭으로 팬아웃한다.
- 목록 자체는 60 에코가 고치므로 데이터 손실은 아니다. 다만 킬 스위치의 성공 · 미확인 표시가 다른 계좌로 귀속된다.

**Fix:** 완료 프레임에 계좌를 실어 계좌로 짝짓는다. 계좌 끄기는 relay 가 계좌를 알고 있다(`coll.accountNo`).

```ts
// shared relay.ts
export type RelayStrategiesDisabledMsg = { t: "strategies.disabled"; count: number; viDisabled?: boolean; accountNo?: string };

// hub #finishAccountStop
this.#fanout(coll.userId, { t: "strategies.disabled", count: coll.count, viDisabled: coll.viDisabled, accountNo: coll.accountNo });

// strategy-status-card — 맨 앞이 아니라 그 계좌를 푼다(계좌 없는 프레임만 종전 FIFO)
const target = strategiesDisabled?.accountNo ?? pendingRef.current[0];
if (target !== undefined && pendingRef.current.includes(target)) release(target, "");
```

### WR-02: 계좌 끄기 거부 · 0답 종료가 웹 킬 스위치 in-flight 창을 8초 동안 열어 둔다 — 그동안 무관한 60 에코가 「킬 스위치」 원인으로 읽힌다

**File:** `webapp/src/lib/use-relay-socket.ts:934-935,1164-1169,2183-2197` (관련: `webapp/src/components/trading/strategy-status-card.tsx:449-469`)

**Issue:**
- `send` 는 `strategies.disable.account` 가 소켓에 실리기만 하면 `killSwitchInFlight` 를 +1 한다. 카운터를 내리는 것은 `strategies.disabled` 프레임과 8초 백스톱뿐이다.
- WR-01 의 0프레임 경로(relay 거부 프레임 · 시한 0답 · 분리)에서는 카운터가 8초 동안 0 보다 크다.
- 그 사이 들어오는 **모든** 꺼짐 60 에코가 `attributeDisableEcho` 에서 `cause = "killSwitch"` 로 귀속된다. 다른 계좌의 발주 게이트 소진, 15:40 정리 대기 키가 여기에 해당한다. 사용자가 끄지 않은 전략이 「킬 스위치로 꺼짐」 으로 표시된다.
- 카드도 relay 의 거부 원문(「이 계좌에 끌 전략이 없어요」, 「사용할 수 없는 계좌」 등)을 읽지 않는다. 그래서 확정된 거부를 8초 뒤 「반영을 확인하지 못했어요」 로 말한다.

**Fix:**
- 소켓 훅에서 `src === "Relay" && kind === "strategies.disable.account"` 인 `msg` 를 받으면 카운터를 1 내린다.
- 카드도 같은 판정으로 그 계좌(`msg.a`) 대기를 풀고 원문을 오류 줄에 보인다(`isSetUserSettingsRejection` 과 같은 결).
- relay 의 0답 종료(`ended !== "complete"` ∧ `received === false`)는 지어낸 완료가 아니라 계좌를 실은 별도 거부 프레임 1건으로 알리면 웹이 백스톱을 기다리지 않는다.

### WR-03: Ready 중 추가 선언된 계좌의 VI 슬롯을 relay 가 영영 묻지 않는다 — 작업대 VI 행이 「미조회」 잠금으로 남는다

**File:** `relay/src/hub/subscription-hub.ts:1178-1179,3436-3477` (관련: `relay/src/dma/session.ts:642-686`, `webapp/src/components/trading/workbench/vi-settings-rows.tsx:492`)

**Issue:**
- Phase 32 D-17 로 VI 는 `(소유 키, 계좌, 거래소)` 슬롯이고, 슬롯은 21 답 · 에코로만 채워진다.
- hub 는 세션의 `"frame"` · `"ready"` 만 듣는다. `DmaSession` 이 Ready 중 계좌를 더 선언해 허용 목록이 늘 때(29-21 `#onDeclareResp` → `"accounts"` 이벤트)는 21 을 다시 보내지 않는다.
- `#fillViSlots("unknown")` 도 21 답의 첫 프레임에서만 돈다. 그래서 새 계좌의 두 슬롯은 키 부재(모름)로 남는다.
- 웹 `ViSettingsRow` 는 `server === undefined` 면 `locked` 다. 그 계좌를 고르면 VI 행 두 줄이 다음 재접속까지 편집 · 시작 불가다.
- 예전 거래소 칸 모델에서는 같은 세션의 거래소 값이 그대로 보였다. 이 동작은 슬롯 모델로 바꾸면서 생긴 퇴행이다.

**Fix:** hub 가 결선 세션의 `"accounts"` 이벤트를 듣는다. 허용 목록에 새로 들어온 계좌가 있으면 그 세션으로 21(KRX → NXT)을 다시 요청한다. 대여 중이면 `refetchVi` 로 미룬다.

```ts
session.on("accounts", () => {
  if (this.#sessions.get(owner) !== session || !session.isReady) return;
  this.#requestViTriggers(userId, owner, session); // 대여 중이면 refetchVi 로 미뤄진다
});
```

### WR-04: /me 설정 탭 저장 기계가 서버 전환을 넘어 상태를 들고 간다 — 계좌 칩만 바꿔도 값이 다른 행이 「저장 성공」 플래시를 낸다

**File:** `webapp/src/components/me/limit-chaser-defaults.tsx:486-523` (관련: `webapp/src/components/trading/me-client.tsx:544-548`)

**Issue:**
- `LimitChaserDefaultsSection` 은 `serverKey` prop 만 바뀌고 다시 마운트되지 않는다(`key` 없음).
- 84 효과는 `prev !== userSettings` 면 14값을 비교해 다른 행을 `flash` 한다. 여기서 `prev` 와 `now` 는 서로 다른 서버의 84 다.
  - KB120 → KYOBO119 처럼 계좌 칩을 바꾸면, 두 서버의 값이 다른 행이 전부 성공 토큰(`--led-armed`) 초록으로 깜빡인다. 사용자는 방금 저장된 것으로 읽는다.
  - 같은 효과의 「늦은 성공」 판정은 이전 서버에서 실패한 행의 시도 값이 새 서버 값과 우연히 같으면 그 실패를 거둔다.
- `rejectText` · `failures` 도 서버를 바꿔도 남는다. A 서버의 거부 원문이 B 서버 화면에 선다.
- 저장 비행 중에는 칩이 잠기지만, 비행이 끝난 뒤의 이 잔상들은 막지 못한다.

**Fix:** 서버마다 저장 기계를 새로 시작한다. 가장 단순한 방법은 호출부 `key` 다.

```tsx
<LimitChaserDefaultsSection
  key={settingsServerKey ?? ""}
  serverKey={settingsServerKey}
  …
/>
```

`useBusyReport` 의 언마운트 정리가 잠금을 false 로 돌리므로 그대로 안전하다. 훅 안에서 처리하려면 `serverKey` 변경 때 `prevSettingsRef` · `failures` · `rejectText` · 대기열을 초기화한다.

### WR-05: `?account=` 가 URL 에 남는다 — 새로고침 · 앱 새로고침이 사용자가 나중에 고른 작업대 계좌를 되돌린다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:700-704,760-765` (관련: `webapp/src/components/layout/app-sidebar.tsx:417`)

**Issue:**
- 사이드바 VI 줄은 `/trading?account=X` 로 이동한다. 작업대는 마운트 때 그 값을 한 번 소비하고 `pickAccount(X)` 한다.
- 그러나 `?code=` 와 달리 `account` 파라미터를 `replaceState` 로 지우지 않는다.
- 이미 `/trading` 위에서 VI 줄을 누르면 이벤트가 계좌를 바꾸고, Link 이동이 URL 에 `?account=X` 를 남긴다.
- 그 뒤 사용자가 칩으로 Y 를 골라(저장값 Y) 새로고침하거나 네이티브 새로고침(`useNativeRefresh`)을 하면, 마운트가 `?account=X` 를 다시 소비해 Y 를 덮고 저장값도 X 로 바꾼다.

**Fix:** 소비 직후(`pendingAccount.current = null` 자리 · 계좌가 목록에 없어 보류를 버릴 때 포함) `?code=` 의 `clearCodeParam` 과 같은 방식으로 `account` 만 지운다.

```ts
const params = new URLSearchParams(window.location.search);
if (params.has("account")) {
  params.delete("account");
  const qs = params.toString();
  window.history.replaceState(null, "", qs === "" ? "/trading" : `/trading?${qs}`);
}
```

### WR-06: /me 기본 계좌 칩이 한 렌더 동안 첫 계좌로 섰다가 기억 계좌로 바뀐다 — 네 탭이 엉뚱한 계좌를 한 번 그린다

**File:** `webapp/src/components/trading/me-client.tsx:348-371`

**Issue:**
- 기억값을 읽는 효과(`setSavedMe` · `setSavedWorkbench`)와 기본 선택 효과(`meAccountOf`)가 같은 커밋에서 차례로 돈다.
- 두 번째 효과는 아직 `savedMe === null` · `savedWorkbench === null` 인 값으로 계산해 `choices[0]` 을 고른다. 다음 렌더에서야 기억 계좌로 바뀐다.
- `useAuth().user` 가 늦게 오면(`userId === ""` → `readMeAccount` null) 창이 더 길어진다.
- 그 사이 다음이 첫 계좌 기준으로 한 번 렌더된다: 현황 카드(상태줄 「상따 N · VI」), 잔고 패널, 오늘 주문 「N건」 · `onCountChange`, 설정 탭 서버키. 설정 탭이 URL 로 열려 있고 두 서버 84 를 이미 받았다면 WR-04 의 거짓 플래시까지 낸다.
- 작업대는 같은 문제를 `layoutRestored` 게이트로 막고 있다.

**Fix:** 기억값을 읽었는지 플래그를 두고, 읽기 전에는 기본 선택을 하지 않는다. 그동안 `shownAccountNo` 는 undefined → 기존 로딩 모양이다.

```ts
const [savedRead, setSavedRead] = useState(false);
useEffect(() => {
  setSavedMe(readMeAccount(userId));
  setSavedWorkbench(readTradingAccount(userId));
  setSavedRead(userId !== "");
}, [userId]);
useEffect(() => {
  if (!savedRead) return;
  const next = meAccountOf(choices, savedMe, savedWorkbench, meAccountNo);
  if (next !== meAccountNo) setMeAccountNo(next);
}, [savedRead, choices, savedMe, savedWorkbench, meAccountNo]);
```

## Info

### IN-01: `RelayViTriggerMsg`(`vi`)가 더 나가지 않는데 `RelayOutbound` 합집합에 남아 있다

**File:** `packages/shared/src/relay.ts:1301-1323,1854`
**Issue:** 주석대로 relay 는 이 프레임을 내지 않고 웹 리듀서에도 갈래가 없다. 타입이 송신 합집합에 남아 있으면 이후 코드가 `{t:"vi"}` 를 다시 보내도 타입이 막지 않는다. 계약상 죽은 갈래다.
**Fix:** `RelayOutbound` 에서 빼고, 「나가지 않는다」 를 단언하는 relay 테스트는 문자열 리터럴 `"vi"` 로 검사한다. 또는 `@deprecated` 를 달고 lint 로 송신 지점을 막는다.

### IN-02: 계좌 칩 radiogroup 의 화살표 키가 포커스만 옮긴다 — WAI-ARIA radio 패턴(화살표 = 이동 + 선택)과 다르다

**File:** `webapp/src/components/me/account-chips.tsx:105-118`
**Issue:** `role="radiogroup"`/`role="radio"` 를 쓰면서 화살표가 선택을 바꾸지 않는다. 스크린리더 사용자는 radio 문법을 기대하므로 「화살표로 골랐는데 계좌가 안 바뀐다」 가 된다. 파일 머리 주석에 `ChoiceRow` 와 같은 의도적 선택이라고 적혀 있어 정보로만 둔다.
**Fix:** 의도를 유지한다면 칩마다 `aria-describedby` 로 「Enter 로 선택」 을 안내한다. 아니면 APG 대로 화살표에서 `pick(next)` 를 함께 부른다. 저장 비행 중(`locked`)에는 이동만 한다.

### IN-03: 배포 창(relay 먼저 ~ webapp push) 동안 구 /me 가 non-primary 서버의 실시간 84 로 덮인다

**File:** `relay/src/hub/subscription-hub.ts:2775-2783,2967-2973`
**Issue:**
- `#fromPrimary` 게이트를 풀어 모든 세션의 84 가 실시간 팬아웃된다.
- RESEARCH A3 의 「primary 마지막」 순서는 인증 직후 replay(`getUserSettingsAll`)에만 적용된다. 실시간 84(예: 사용자가 WinForms 로 KYOBO119 설정 저장 → 그 서버 브로드캐스트)는 구 webapp 의 단일 `userSettings` 를 KYOBO 값으로 덮는다.
- 그 상태에서 구 /me 가 저장하면 42 는 primary(KB)로 가고 기준 값은 KYOBO 것이다. 전체 교체라 KB 의 다른 칸이 KYOBO 값으로 바뀐다.
- 창이 짧아 정보로 둔다.
**Fix:** 배포 순서 문서(D-16 · D-19)에 「relay 배포 ~ push 사이 /me 저장 자제」 를 적거나, push 를 relay 직후로 붙인다.

### IN-04: 세션 분리 뒤 브라우저의 VI 슬롯 · 사이드바 「VI 가동」 이 남는다 — 「이 계좌 끄기」 가 눌리지만 relay 는 「끌 것 없음」 으로 거부한다

**File:** `relay/src/hub/subscription-hub.ts:1600-1612` (관련: `webapp/src/components/trading/strategy-status-card.tsx:407`)
**Issue:**
- `#clearViOwner` 는 hub 캐시만 지운다. 「지움」 프레임이 없어 브라우저 `viSlots` 의 그 계좌 슬롯(run:true)은 남는다.
- 그 결과 다음 셋이 계속 「가동」 을 말한다: 사이드바 VI 줄, /me 상태줄, 「이 계좌 끄기」 활성(`nothingToDisable` false).
- 누르면 relay 의 `getViSlot` 이 undefined 라 거부 프레임만 온다. WR-02 와 겹쳐 8초 뒤 「반영을 확인하지 못했어요」 가 된다.
- 종전 거래소 병합 모델에도 같은 한계가 있었다(주석에 명시). 그래서 정보로 둔다.
**Fix:** 장기적으로 `vi.slot` 에 「모름으로 되돌림」(예 `cfg: undefined` 갈래 또는 `vi.slot.clear {a}`) 프레임을 추가한다. 단기로는 WR-02 의 거부 원문 표시가 사용자에게 사실을 말해 준다.

### IN-05: VI 스트립 계좌 필터와 카드 격자 스코프의 게이트가 다르다

**File:** `webapp/src/components/trading/workbench/trading-workbench.tsx:1390,1412-1415`
**Issue:**
- 카드 격자는 `scopeAccount`(계좌 ∧ `accounts.length > 0`)로 거른다.
- VI 스트립(`scopedViOrders`)은 `accountNo === ""` 만 보고 거른다.
- 지금은 `pillAccountOf` 가 `accounts[]` 가 빈 동안 `accountNo` 를 비워 두므로 실제 차이는 없다. 다만 「같은 스코프」 라는 D-01 의 계약이 두 식으로 갈라져 있다.
**Fix:** `scopedViOrders` 도 `scopeAccount` 를 쓴다(`scopeAccount === "" ? activeViOrders : activeViOrders.filter((o) => o.accountNo === scopeAccount)`).

---

_Reviewed: 2026-10-16T11:15:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
