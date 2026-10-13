# Phase 32: 계좌 축 정리 - Pattern Map

**Mapped:** 2026-10-13
**Files analyzed:** 27 (신규 2 · 수정 25 — 테스트 포함)
**Analogs found:** 26 / 27 (웨이브 ④ `vi.slot` 프레임은 gh-trade 33 fbs 확정 전이라 부분 매칭)

> 모든 경로는 `git ls-files` 로 tracked 확인했다. 대부분의 「수정」 파일은 자기 자신이 1차 정본이고, 아래 analog 는 **같은 일을 이미 하는 이웃 코드**다. 라인 번호는 2026-10-13 master(50ae7eb3) 기준.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `webapp/src/lib/account-label.ts` (수정 — D-12 변형 추가) | utility | transform | 같은 파일 `accountLabelOf` + `workbench-status-bar.tsx` 418행 서버키 꼬리 조립 | exact |
| `webapp/src/components/trading/account-pill.tsx` (신규 — D-13) | component | request-response(선택 이벤트) | `webapp/src/components/trading/workbench/workbench-status-bar.tsx` 385~435 `AccountPill` | exact(이전) |
| `webapp/src/components/trading/workbench/workbench-status-bar.tsx` (수정 — 목업 A) | component | event-driven(relay 상태 표시) | 자기 자신(`quotePillOf`/`orderPillOf` 유지 · 제거 대상 `ToneToggle` 334~383) | exact |
| `webapp/src/components/trading/workbench/trading-workbench.tsx` (수정 — 스코프 · `pickAccount`) | component(page) | event-driven | 자기 자신 620~623 · 680~687 `pickAccount` | exact |
| `webapp/src/components/trading/workbench/card-grid.tsx` (수정 — 숨김 주차) | component | transform | 자기 자신 ⑤ 포털 호스트 | exact |
| `webapp/src/components/trading/workbench/alert-toasts.tsx` · `webapp/src/lib/trading-alerts.ts` (수정 — 계좌 줄) | component · utility | event-driven | `AccountPill` 라벨 + `cardForAlert`(trading-alerts.ts 411~425) | role-match |
| `webapp/src/components/layout/app-sidebar.tsx` (수정 — 계좌 묶음 트리) | component | transform | `orders-api.ts` 114~145 `groupJournalRowsByAccount`(묶음 규칙) + 자기 `SUB_LIST`/`StrategyItem`(379~) | role-match |
| `webapp/src/components/trading/strategy-status-card.tsx` (수정 — 계좌 묶음 · 「이 계좌 끄기」) | component | request-response | 자기 자신 전체 비활성화 425~455 | exact |
| `webapp/src/components/trading/today-orders-card.tsx` · `webapp/src/components/trading/me-client.tsx` (수정 — 주문 탭 필 · 평탄 목록) | component | CRUD(read)/filter | `order-log-window.tsx` 91·117 `?account=` 필터 + `trading-layout.ts` 125~178 저장/자동 선택 | role-match |
| `webapp/src/components/orderbook/account-panel.tsx` (수정 — 머리 서버키) | component | transform | `AccountPill` 서버키 칩(workbench-status-bar.tsx 424~433) | role-match |
| `webapp/src/lib/trading-layout.ts` (수정 — 주문 탭 · 설정 서버 저장 키) | utility | file-I/O(localStorage) | 자기 자신 `readTradingAccount`/`writeTradingAccount`/`pillAccountOf` 125~178 | exact |
| `webapp/src/components/me/limit-chaser-defaults.tsx` (수정 — 서버 세그먼트 · `serverKey` 송신) | component | request-response | 자기 자신 `useUserSettingsSave`(327 · 405) | exact |
| /me 설정 「이 기기」 알림음 카드 (신규 또는 limit-chaser-defaults 곁) | component | file-I/O(localStorage) | `workbench-status-bar.tsx` `ToneToggle` 334~383 + `lib/breakout-list.ts` 130~143 | exact(이전) |
| `webapp/src/components/trading/limit-chaser-form.tsx` (수정 — 시딩 서버 선택) | component | transform | 자기 자신 820~829 · 969 · 985~1000 | exact |
| `webapp/src/lib/use-relay-socket.ts` · `webapp/src/lib/relay-provider.tsx` (수정 — `userSettingsByServer` · in-flight 조건) | hook/provider(store) | event-driven | 자기 리듀서 `case "user.settings"`(1116~1119) · send 가로채기 2144~2160 | exact |
| `webapp/src/lib/queued-window.ts` (수정 — `queuedWindowBadgeOf` 삭제) | utility | transform | — (삭제) | n/a |
| `packages/shared/src/relay.ts` (수정 — `serverKey?` · 계좌 끄기 메시지 · ④ vi 프레임) | model(contract types) | — | 자기 `RelayStrategiesDisableMsg`(807) · `RelayUserSettingsSetMsg`(786~789) | exact |
| `relay/src/ws/protocol.ts` (수정 — zod) | config/validation | request-response | 자기 `RelayUserSettingsSetSchema`(426~446) · `RelayStrategiesDisableSchema`(454~457) · 판별 합집합 551~565 | exact |
| `relay/src/ws/fanout.ts` (수정 — 42 서버 라우팅 · 계좌 끄기 분기 · replay) | controller(ws router) | request-response | 자기 `user.settings.set`(2117~2137) · `strategies.disable`(2180~2204) · `#strategySession`(2371~2384) · `#stopViElsewhere`(2445~2471) | exact |
| `relay/src/hub/subscription-hub.ts` (수정 — 84 소유키 캐시 · 집계기) | service(cache/pub-sub) | pub-sub | 자기 `beginAllStop`(1307~1377) · 소유키 헬퍼(652~683) · 84 갈래(2649~2656) | exact |
| `relay/tests/hub-multi-session.test.ts` · `relay/tests/fanout-multi-session.test.ts` · `relay/tests/protocol.test.ts` | test | — | 자기 자신(hub 262~330 primary 전용 describe · 657~676 43 기대) | exact |
| `webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx` · `__tests__/alert-toasts.test.tsx` · `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx` | test | — | 자기 자신 | exact |
| `webapp/e2e/specs/trading-workbench.spec.ts` · `a11y.spec.ts` · `me.spec.ts` · `webapp/e2e/fixtures/relay.ts` | test(E2E) | — | 자기 자신 | exact |
| 웨이브 ④ `vi.slot`(또는 동등) 브라우저 프레임 · `RelayViTriggers` 재형 | model + store | pub-sub | `RelayViTriggerMsg`(relay.ts 1291~1300) · `RelayViTriggers`(use-relay-socket.ts 325) | partial — fbs 미확정 |

## Pattern Assignments

### `webapp/src/lib/account-label.ts` (utility, transform)
**Analog:** 같은 파일 전체(11행). 기존 함수는 수동주문 「주문계좌」 와 글자 대조 계약(h76)이 있으니 **그대로 두고 옆에 변형을 추가**한다.
```ts
export function accountLabelOf(accountNo: string, name?: string): string {
  return typeof name === 'string' && name !== '' ? `${accountNo} · ${name}` : accountNo;
}
```
서버키 꼬리 조립 선례(workbench-status-bar.tsx 418행) — 새 함수가 이 인라인 조립을 흡수한다:
```tsx
{accountLabelOf(a.accountNo, a.name) + (a.serverKey !== undefined ? ` · ${a.serverKey}` : "")}
```
규칙: 빈 칸은 「 · 」 꼬리 없이 생략, 마스킹 없음(D2·S-5). 파일 머리 JSDoc 에 「D-12 다섯 소비처」 를 적는다. 사이드바(⑤)는 이름 · 서버키만 쓰므로 인자 옵션 또는 별도 소함수.

### `webapp/src/components/trading/account-pill.tsx` (신규, component)
**Analog:** `workbench-status-bar.tsx` 385~435 `AccountPill` / `AccountPillProps` 를 그대로 옮긴다.
- props 확장: `{accounts, accountNo, onChange, title?, slot?}` — `data-slot` 은 호출부별(작업대 `workbench-account` 유지 · /me 주문은 새 슬롯, 예 `me-orders-account`). E2E 가 `workbench-account` · `workbench-account-server` 를 찾는다.
- 네이티브 `<select>` · `appearance-none` 금지 · `disabled={accounts.length === 0}` · 빈 목록 옵션 「계좌 확인 중…」 유지.
- 옵션 글자는 D-12 새 함수로 교체.
- `workbench-status-bar.tsx` 는 새 파일에서 import(재export 는 테스트 import 경로 유지용으로만).
- Pitfall 10: /me 주문 호출부는 `accounts[] ∪ 행에만 있는 계좌(name "")` 를 넘긴다.

### `webapp/src/components/trading/workbench/workbench-status-bar.tsx` (component, event-driven)
**Analog:** 자기 자신.
- 유지: 루트 `data-slot="workbench-status-bar" data-status={status}`(다른 spec 5개 준비 신호 — RESEARCH Pitfall 4), `workbench-dma`(`aria-live="polite"`), `workbench-quote`, `workbench-cols-segment`, `quotePillOf`/`orderPillOf`(`lib/quote-state.ts` 106·130).
- 제거: `ToneToggle`(334~383 → /me 이전), `queuedWindowBadgeOf` 소비, `stat-applied`, 「다시 연결」 `Button`(→ 주문 알약 안 링크, 끊김일 때만), `workbench-stale-strategies`/`workbench-moved-from` 보조 줄(새 자리로, 문구 `WORKBENCH_STATUS_TEXT` 유지).
- 폰 밴드 세그먼트: wb<680 은 DOM 제외 유지 권고(Pitfall 7). 밴드 표는 `globals.css` §2.2b 만 참조 — 복사 금지.

### `webapp/src/components/trading/workbench/trading-workbench.tsx` (page component, event-driven)
**Analog:** 자기 `pickAccount`(680~687) · 계좌 결정 효과(620~623) + `trading-layout.ts` `pillAccountOf`:
```ts
if (accounts.length === 0) return current;
if (saved !== null && accounts.some((a) => a.accountNo === saved)) return saved;  // 저장값이 이긴다
if (current === "") return accounts[0].accountNo;
return current;
```
→ 토스트 · 사이드바 포커스 · `?focus=` 전환은 **반드시 `pickAccount`**(= setAccountNo + setSavedAccount + writeTradingAccount). `setAccountNo` 단독 금지.
RESEARCH 권고 형(Pattern 1):
```tsx
const hit = limitChasersRef.current.find((c) => c.key === strategyKey(f.isin, f.accountNo, f.exchange));
if (hit !== undefined && hit.accountNo !== accountNoRef.current) pickAccount(hit.accountNo);
const target = hit?.accountNo || a.accountNo || accountNo;
if (target !== accountNo) pickAccount(target);
```
- `visibleCards = cards.filter(c => c.accountNo === accountNo || c.accountNo === "")`.
- ISIN 경로 4곳(`isinFocusCardOf` 339~341 · `focusCard` · `ensureIsinCard` · `cardIsins`)은 `visibleCards` 로 한정(Pitfall 6). 카드 키 충돌만 전수.
- VI 스트립 호출부: `activeViOrders.filter(o => o.accountNo === accountNo)`.
- 계좌 전환 시 시트 · 인라인 편집 닫기, `useAppliedAt` 제거.

### `webapp/src/components/trading/workbench/card-grid.tsx` (component)
**Analog:** 자기 ⑤ 포털(`createPortal(renderCard(c), host, c.id)`). 변경 3곳(RESEARCH Pattern 2): ① 호스트 정리 `useLayoutEffect` 의 `present` = **모든** 카드 id ② 빈 상태 = 보이는 카드 0 ③ ✕ 뒤 포커스는 보이는 순서만. 숨김 호스트는 `<div hidden data-slot="card-parking">` 에 주차.

### `webapp/src/components/trading/workbench/alert-toasts.tsx` · `webapp/src/lib/trading-alerts.ts`
**Analog:** `cardForAlert`(trading-alerts.ts 411~425) 매칭 그대로 + `AccountPill` 라벨 조립. `TradingAlert.accountNo` 주석(75~100 「표시하지 않는다」)을 D-03 으로 갱신. 계좌 줄 `data-part="account"`, `accounts` 로 이름 · 서버키 해석, 돌파(계좌 없음)는 줄 생략. 탭 → 작업대 `pickAccount`.

### `webapp/src/components/layout/app-sidebar.tsx` (component, transform)
**Analog:** 묶음 규칙은 `webapp/src/lib/orders-api.ts` 114~145 `groupJournalRowsByAccount` — 「`accounts[]` 순, 목록 밖 계좌는 버리지 않고 뒤에 붙인다」. 소제목 = D-12 (이름 · 서버키 칩), 전략 · VI 없는 계좌는 소제목 생략(D-02). VI 줄은 `viTriggers[ex].accountNo` 묶음에. 전략 클릭은 기존 `requestTradingFocus` 경로 → 작업대에서 `pickAccount`.

### `webapp/src/components/trading/strategy-status-card.tsx` (component, request-response)
**Analog:** 자기 전체 비활성화(425~455):
```ts
if (!send({ t: "strategies.disable" })) {
  setSendError("연결이 끊겨 비활성화 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.");
  return;
}
ackBaseline.current = strategiesDisabled;
setAwaitingAck(true);
```
+ 백스톱 타이머(`STRATEGIES_DISABLE_ACK_TIMEOUT_MS` 8초, 실패라 말하지 않는 문구). 「이 계좌 끄기」 는 같은 `awaitingAck`/`ackBaseline`/백스톱 · 같은 다이얼로그(계좌 1개 나열, 604) 재사용, `send({ t: "strategies.disable.account", accountNo })`(D-09 보정 ① — 새 `t`). 두 버튼 상호 잠금. 계좌 묶음 = `accounts[]` 순, 모든 계좌 소제목, 빈 상태 「등록된 전략 없음」, `StrategyRow` 2줄째(220~232) 계좌번호 제거.

### `webapp/src/components/trading/today-orders-card.tsx` · `webapp/src/components/trading/me-client.tsx`
**Analog:** `order-log-window.tsx` 91·117 `?account=` 단일 계좌 필터, 저장은 `trading-layout.ts` 패턴 복제(새 접두사 예 `gh-radar:me-orders-account:`, 기본 = `readTradingAccount(userId)`, 선택값 결정 = `pillAccountOf`). `groupJournalRowsByAccount`(today-orders-card 410 · 소제목 529~551) 대신 평탄 필터, `onCountChange` 는 필터 뒤 건수. `groupJournalRowsByAccount` 는 다른 소비처 확인 후 정리.

### `webapp/src/components/orderbook/account-panel.tsx`
**Analog:** 서버키 칩 마크업(workbench-status-bar.tsx 424~433):
```tsx
<span data-slot="workbench-account-server" title="이 계좌의 주문 서버"
  className="mono inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--muted)] px-1.5 text-[10px] font-bold whitespace-nowrap text-[var(--fg-2)]">
  {serverKey}
</span>
```
계좌 전용 모드 머리(671~714)에 선택 prop `serverKey?`(4표면 공용이므로 optional). `me-client.tsx` 가 `acct.serverKey` 전달.

### `webapp/src/lib/trading-layout.ts` (utility, localStorage)
**Analog:** 자기 125~178. 새 키 함수는 같은 형태 — `typeof window` 가드 · `userId === ""` 가드 · `{ v: 1, … }` 버전 JSON · 길이 상한 · try/catch 무음(저장 실패 = 기억 없음). 설정 서버 키(예 `gh-radar:me-settings-server:{userId}`)도 같은 틀, 값 `{ v: 1, serverKey }`.

### `webapp/src/components/me/limit-chaser-defaults.tsx` (component, request-response)
**Analog:** 자기 `useUserSettingsSave`(327~503 · 405 `send({t:"user.settings.set", s})`), `usableUserSettingsOf`(269), `loading` 잠금 상태.
- 서버 목록 = `unique(accounts.map(a => a.serverKey).filter(Boolean))`(primary 먼저 — RESEARCH Pattern 5). 점 = `userSettingsByServer.has(k)`. 키 `""`(구 relay) = 첫 서버로 간주.
- 송신 `send({ t: "user.settings.set", serverKey, s })`.
- 비행/대기 중 세그먼트 잠금(Pitfall 12).
- 「이 기기」 카드: `ToneToggle`(workbench-status-bar.tsx 334~383) 이전, 저장은 `lib/breakout-list.ts` `BREAKOUT_TONE_KEY`(35) · `readTonePref`(130) · 쓰기(143) 그대로.

### `webapp/src/components/trading/limit-chaser-form.tsx`
**Analog:** 자기 820~829 · 951~952 · 969 · 985~1000 · 1281. `relay.userSettings` → `userSettingsByServer.get(accounts.find(a => a.accountNo === accountNo)?.serverKey ?? …)`. 못 찾으면 시딩 생략(Phase 31 D-12 결). `seedFromUserSettings`(limit-chaser.ts 471) · `preBuyWatchFixedOf`(488) 시그니처 무변경.

### `webapp/src/lib/use-relay-socket.ts` · `webapp/src/lib/relay-provider.tsx` (store, event-driven)
**Analog:** 리듀서 `case "user.settings": return { ...state, userSettings: frame };`(1116~1119) → `userSettingsByServer: ReadonlyMap<string, RelayUserSettingsMsg>`(키 `frame.serverKey ?? ""`, 새 Map 복사 후 set · `reset` 이 비움). 기본값 relay-provider.tsx 388. send 가로채기(2144~2160 `msg.t === "strategies.disable"`)를 새 계좌 끄기 `t` 까지 넓혀 `killSwitchInFlight` 창을 연다(Pitfall 3).

### `packages/shared/src/relay.ts` (contract types)
**Analog:** 자기 `RelayStrategiesDisableMsg`(807 `{ t: "strategies.disable"; key?: string }`) — 같은 모양으로 `RelayStrategiesDisableAccountMsg { t: "strategies.disable.account"; accountNo: string }` 추가 후 인바운드 합집합에 등록. `RelayUserSettingsMsg`(1499~1502) · `RelayUserSettingsSetMsg`(786~789)에 `serverKey?: string`, 784 주석 「계좌 축이 없다」 를 「서버 축(Phase 32)」 으로 갱신.

### `relay/src/ws/protocol.ts` (validation)
**Analog:** 자기 454~457:
```ts
export const RelayStrategiesDisableSchema = z.object({
  t: z.literal("strategies.disable"),
  key: z.string().max(64).optional(),
});
```
→ 새 스키마 `t: z.literal("strategies.disable.account"), accountNo: z.string().min(1).max(32)` 를 `RelayInboundSchema` discriminatedUnion(551~565)에 추가(구 relay 에선 판별 실패 → 4400, fail-safe). `RelayUserSettingsSetSchema`(426~446) 최상위에 `serverKey: z.string().min(1).max(N).optional()` — 같은 파일의 「optional 은 구 탭 관용」 주석 문체를 따른다. 엄격 모드 금지(420 주석 T-18-07).

### `relay/src/ws/fanout.ts` (ws controller)
**Analog 1 — 42 분기(2117~2137):**
```ts
const session = this.#strategySession(conn, userId, msg.t);
if (session === null) return;
const amount = msg.s.postBuyFloorAmount ?? this.#hub.getUserSettings(userId)?.postBuyFloorAmount;
if (amount === undefined) { logger.warn(...); this.#send(conn, rejectFrame(USER_SETTINGS_FLOOR_UNKNOWN_TEXT, "", "", msg.t)); return; }
const payload = this.#buildStrategyPayload(conn, userId, msg.t, () => buildSetUserSettingsReq(settings));
if (payload === null) return;
if (!session.send(payload)) this.#onStrategySendFailed(conn, userId, msg.t);
```
→ `serverKey` 있으면 `this.#users.get(userId)?.sessions.get(serverKey)?.session` → `#readySession`; 없으면 거부 프레임(새 상수, primary 로 떨어뜨리지 않음 · 소켓 유지). 되싣기는 `getUserSettings(userId, session.serverKey)`.
**Analog 2 — 계좌 끄기:** `strategies.disable` 분기(2180~2204)의 `#buildStrategyPayload` → `send` → `#hub.noteUserDisable(session)` 흐름 + 다세션 `#allStop` 집계 호출. 세션은 `#sessions.forAccount(userId, accountNo)`(`#strategySession` 2371~2384 의 accountNo 갈래), 먼저 `#accountAllowed` 대조(IDOR). 키마다 `buildDisableStrategiesReq(key)`(14, **`lc.set` 금지** — Pitfall 1). VI `run:false` 11 조립은 `#stopViElsewhere`(2449~2471) 모양 재사용.
**Analog 3 — replay(1882~1885):** `getUserSettings` 단건 send → `getUserSettingsAll(userId)` 루프로 서버마다 1프레임.

### `relay/src/hub/subscription-hub.ts` (service, pub-sub cache)
**Analog:** 자기 코드. 84 축 9곳은 RESEARCH Pattern 4 표가 정본(1050 선언 · 103~104 머리표 · 2649~2656 `#fromPrimary` **84 갈래만** 해제(76/78/77 유지 — Pitfall 11) · 2850 `#onUserSettings` · 2042~2044 43 세션마다 · 1515 · 3828 · 3747~ · 2245 getter). 현재 형:
```ts
#onUserSettings(userId: string, session: HubSession, settings: RelayUserSettingsMsg): void {
  this.#userSettings.set(userId, settings);
  if (!session.isReady) return;
  this.#fanout(userId, settings);
}
```
→ 키 `ownerKey`(`${userId}|${serverKey}` — 652~683 헬퍼 사용), 값/팬아웃에 `serverKey` 실음.
계좌 끄기 집계: `beginAllStop(userId, sessions)`(1307~1377, 머리 주석 132 · 393)을 「(owner, 순번) k 대상」 으로 넓히거나 형제 집계기를 둔다 — 꼬리표 FIFO · 시한 `HUB_ALL_STOP_COLLECT_MS` · 분리 정리 재사용, 출력은 `strategies.disabled` 1건.

### relay 테스트
**Analog:** `relay/tests/hub-multi-session.test.ts`(262~330 primary 전용 describe 에서 84 만 「서버별」 describe 로 분리 · 657~676 `kb121.sentTypes` 기대 갱신), `relay/tests/fanout-multi-session.test.ts`(다세션 `#allStop` 단언 · `framesOf("strategies.disabled")` 길이 1), `relay/tests/protocol.test.ts`(스키마 수용/거부), `relay/tests/fanout-access.test.ts`(계좌 대조 IDOR).

### webapp 테스트 · E2E
- `workbench-status-bar.test.tsx`: 92~106 반영 시각 · 116 77 배지 · 153 다시 연결 삭제, 187~232 `tone` describe → `webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx`(또는 새 카드 테스트)로 이전, 310·382 AccountPill → 새 `account-pill` 테스트로.
- `webapp/src/lib/__tests__/queued-window.test.ts` 배지 케이스 삭제(Pitfall 8).
- E2E: `trading-workbench.spec.ts`(1730~1731 `stat-applied` · 5080~5091 window-badge 삭제, 130 statusBar 유지), `a11y.spec.ts` 463 aria-live, `me.spec.ts` 603 · 929~948 그룹 → 평탄, 픽스처 `webapp/e2e/fixtures/relay.ts` 84 에 `serverKey`. 실행은 vitest `--maxWorkers=2` · playwright `--workers=1`, dev 포트 3100.

## Shared Patterns

### 계좌 라벨 · 서버키 칩
**Source:** `webapp/src/lib/account-label.ts` + `workbench-status-bar.tsx` 424~433 칩 마크업
**Apply to:** 상단 줄 셀렉트, /me 현황 · 잔고 소제목, 주문 탭 필, 토스트 계좌 줄, 사이드바 소제목 — 화면별 문자열 조립 금지.

### 프로그램 계좌 전환
**Source:** `trading-workbench.tsx` 680~687 `pickAccount` + `trading-layout.ts` `pillAccountOf`
**Apply to:** 토스트 탭 · 사이드바 전략 클릭 · `?focus=` · (④) VI 설정 행.

### localStorage 기기별 기억
**Source:** `trading-layout.ts` 125~159(`{v:1}` JSON · 가드 · 무음 catch), `breakout-list.ts` 130~143
**Apply to:** 주문 탭 계좌 키, 설정 탭 서버 키, 알림음(기존 키 유지).

### relay 명령 송신 · 실패 처리
**Source:** `fanout.ts` `#strategySession` → `#buildStrategyPayload` → `session.send` → `#onStrategySendFailed`; 거부는 `rejectFrame(TEXT, "", "", msg.t)` + 소켓 유지, `logger.warn({userId, t}, "[WS] …")`(값 · 계좌 비로깅).
**Apply to:** 42 서버 라우팅, 계좌 끄기.

### 「보냈음/못 보냄」 + ack 백스톱 (webapp)
**Source:** `strategy-status-card.tsx` 425~455 — `send()` false 면 in-flight 를 세우지 않고 문구, true 면 `ackBaseline` + 8초 백스톱(「실패」 라 말하지 않음).
**Apply to:** 「이 계좌 끄기」, 서버별 설정 저장.

### 구버전 관용 = optional 필드 / fail-safe = 새 `t`
**Source:** `protocol.ts` 440~441 주석(D-14 보정 optional), RESEARCH Pitfall 2.
**Apply to:** `serverKey`(optional — 부재 = primary), 계좌 끄기(새 `t` — 구 relay 4400), ④ `vi.slot`(구 `vi` 와 병행 호환 창).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| 웨이브 ④ `vi.slot`(가칭) 프레임 · `(accountNo, exchange)` VI 맵 · relay `#viTriggers` 3원 키 | contract + store + cache | pub-sub | gh-trade Phase 33 fbs(61 `unregistered` · n 프레임) 확정 전. 모양은 `RelayViTriggerMsg`(relay.ts 1291~1300) · hub 소유키 단위 60/64 캐시를 따르되, 상세는 gh-trade 인박스 노트 수신 뒤 재매핑 |

## Metadata

**Analog search scope:** `webapp/src/{lib,components/trading,components/me,components/layout,components/orderbook}`, `webapp/e2e`, `relay/src/{ws,hub}`, `relay/tests`, `packages/shared/src`
**Files scanned:** ~25
**Pattern extraction date:** 2026-10-13
