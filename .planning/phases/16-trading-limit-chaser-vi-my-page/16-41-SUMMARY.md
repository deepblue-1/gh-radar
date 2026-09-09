---
phase: 16-trading-limit-chaser-vi-my-page
plan: 41
subsystem: relay-strategy-cache
tags: [gap-closure, relay, shared-contract, symbol-map, dead-code]
requires:
  - "relay/src/store/symbols.ts SymbolLookup — 부팅 1회 + 08:30 KST 재적재"
  - "packages/shared/src/relay.ts RelayLimitChaser (16-04 계약)"
provides:
  - "RelayLimitChaser.name / .code — relay 가 SymbolMap 으로 붙이는 선택 필드"
  - "RelayLimitChaserInput 이 name·code 를 Omit — 브라우저가 보낼 수 없다"
  - "SubscriptionHub.#enrichLimitChaser — 60/64 수신 시 캐시 삽입 이전 보강"
affects:
  - "16-42 (webapp isin-labels.ts · app-sidebar.tsx 소비)"
  - "relay/src/ws/fanout.ts lc.snap (getLimitChasers 캐시를 그대로 읽는다 — 코드 변경 0줄)"
tech-stack:
  added: []
  patterns:
    - "이름의 원천을 늘리지 않고 기존 wss 프레임에 필드를 얹는다 (T-16-02)"
    - "못 풀면 필드를 비워 둔다 — ISIN 을 이름 자리에 넣지 않는다 (T-16-05)"
    - "표시 문자열의 소유자는 서버다 — Input 에서 Omit (T-16-84, market 과 같은 규율)"
key-files:
  created: []
  modified:
    - packages/shared/src/relay.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/strategy-hub.test.ts
decisions:
  - "상따 보강에는 미해석 건수 로그를 남기지 않는다 — 프레임당 1건이라 #enrichNames 의 「전량 미스 = 맵이 비었다」 비율 판정이 성립하지 않는다"
  - "crud 'D' 프레임에도 이름을 붙인다 — 캐시에서는 지우지만 프레임은 내리므로 UI 가 「무엇이 사라졌는지」를 말할 수 있어야 한다"
  - "detach()·releaseAll() 은 삭제한다 (@internal 유지 아님) — 호출자 0건이고 detach 는 리스너를 떼지 않아 호출 자체가 누수였다"
metrics:
  duration: ~35분
  completed: 2026-09-09
  tasks: 3
  files: 3
  relay_tests: "387 → 390 (+3)"
  repo_tests: "2,026 → 2,029 passed"
---

# Phase 16 Plan 41: 갭 4 relay 측 — 상따 에코에 종목명 보강 + R2-IN-02 Summary

**이름을 아는 유일한 프로세스가 이름을 붙이게 했다** — 사이드바 상따 전략이 `KR7005930003` 원문으로 뜨던 것을, 웹앱에 새 조회 경로를 만들지 않고 relay 가 이미 들고 있는 `SymbolMap` 으로 닫았다. relay 3파일(공유 계약 1 + 소스 1 + 테스트 1).

## 무엇을 했는가

### 1. 계약 — relay 가 붙이고 브라우저는 못 보내는 값 (`packages/shared/src/relay.ts`)

`RelayLimitChaser` 에 선택 필드 두 개를 더했다. 형태는 **기존 선언을 그대로 본떴다**(`RelayViOrderItem.name` · `RelayAccountState.hold[].name`/`.code`) — 같은 개념이 프로젝트 안에서 두 모양을 갖지 않게 했다.

```ts
  /**
   * 종목명 — **게이트웨이가 주는 값이 아니다.** relay 가 `stocks.isin` 역매핑(SymbolMap)으로
   * 채운다. `key` 와 같은 **파생값**이지 와이어 필드가 아니다.
   * ...
   */
  name?: string;
  /** 6자 단축코드 — 표시용. 같은 역매핑 산물이고 없을 수 있다(위 주의 참조). */
  code?: string;
```

`RelayLimitChaserInput` 의 `Omit` 목록에는 **둘 다** 넣었다 (`"key" | "market" | "name" | "code"`). 근거를 `market` 제외 근거(WR-03/D-28) 바로 아래에 이었다 — 「이름의 소유자도 relay 다. 브라우저가 실어 보내면 화면이 **자기가 만든 이름을 자기가 믿는** 순환이 생기고, 임의의 종목명을 서버 캐시(`getLimitChasers` → `lc.snap`)에 밀어 넣어 다른 탭까지 오염시키는 표면이 열린다」(T-16-84).

`webapp/src/lib/limit-chaser.ts` 는 **diff 0줄**이다 — `LimitChaserFormValues` 가 `Omit<RelayLimitChaserInput, ...>` 이라 Input 에서 뺀 필드는 애초에 도달하지 않는다. `git diff -- webapp/src/lib/limit-chaser.ts` 출력 없음으로 실측 확인했다.

### 2. Hub 보강 (`relay/src/hub/subscription-hub.ts`)

`#enrichLimitChaser` 는 `#enrichViOrder` 와 **같은 모양**이다:

```ts
  #enrichLimitChaser(item: RelayLimitChaser): RelayLimitChaser {
    const info = this.#symbols?.lookup(item.isin);
    return info === undefined ? item : { ...item, name: info.name, code: info.code };
  }
```

`#onLimitChaserEcho`(60) · `#onLimitChaserList`(64) 둘 다 **캐시에 넣기 전**에 보강한다. 그것이 이 수정의 핵심이다 — 캐시가 곧 `getLimitChasers` → `lc.snap`(재접속 복원, `fanout.ts:554`)의 원천이라, 팬아웃만 보강하면 「지금 화면」은 이름이 있고 「새로 연 탭」은 ISIN 이 된다. **`fanout.ts` 는 한 줄도 고치지 않았다.**

전량 교체 규율(사용자 엔트리 전부 삭제 후 재삽입)은 바꾸지 않았다. 캐시와 팬아웃이 **같은 배열**을 쓰므로 두 경로의 이름이 갈릴 수 없다.

### 3. 처분 판단 두 건 (근거를 코드 주석과 여기에 남긴다)

**① `crud === "D"` 프레임에도 이름을 붙인다.** 캐시에서는 지우지만 프레임은 그대로 내리는 것이 기존 규율이므로, 이름이 있어야 UI 가 「무엇이 사라졌는지」를 말할 수 있다. 비용은 맵 조회 1회이고 분기를 하나 줄인다 — `#enrichNames` 가 0수량 톰스톤 행에도 굳이 이름을 붙이는 것과 같은 판단이다.

**② 미해석 건수 로그는 남기지 않는다.** `#enrichNames` 가 `{resolved, total}` 을 세는 이유는 잔고·미체결이 계좌당 수십 행이라 「전량 미스 = 맵이 비었다」를 그 비율로만 알 수 있기 때문인데, 상따는 한 프레임에 1건(60)이거나 소수(64)라 같은 판정이 성립하지 않는다. 맵 적재 실패는 이미 잔고 경로의 `[SYM]` 로그가 말하므로, 여기서 종목당 한 줄씩 더 쌓는 것은 신호가 아니라 소음이다.

### 4. R2-IN-02 — `detach()` · `releaseAll()` 삭제

**호출자 0건을 리뷰 주장이 아니라 실측으로 확인했다:**

```
$ grep -rn "detach(\|releaseAll(" relay/src relay/tests webapp/src server/src packages
relay/src/hub/subscription-hub.ts:316:  detach(userId: string): void {
relay/src/hub/subscription-hub.ts:383:  releaseAll(userId: string): void {
```

선언 2건이 전부다. **삭제**를 골랐다 — `@internal` + 리스너 정리로 남기는 쪽은 「쓰이지 않는 것을 고쳐서 계속 두는」 선택이고, 이 두 메서드는 남아 있는 것 자체가 「정리하려면 이것을 부르면 된다」는 오해를 만든다. 특히 `detach` 는 `#sessions` 에서 지우기만 하고 `attach` 가 건 `session.on("frame"/"ready")` 를 **떼지 않아**, 그 세션이 살아 있는 한 리스너가 계속 쌓인다 — 부르는 순간이 곧 누수다. `releaseAll` 은 다른 탭이 여전히 보고 있어도 그 사용자의 구독을 통째로 끊는다.

**전/후 카운트 (인용):**

| 대상 | 메서드 선언 (`grep -c '^  detach('`) | 문자열 등장 (`grep -c 'detach('`) |
|---|---|---|
| `detach` | **1 → 0** | 1 → 1 (**삭제 사유 묘비 주석**) |
| `releaseAll` | **1 → 0** | 1 → 1 (**삭제 사유 묘비 주석**) |

문자열 카운트가 1 로 남은 것은 그 자리에 **왜 지웠는지를 적은 주석**을 남겼기 때문이다 — 다음 사람이 같은 메서드를 다시 만들지 않게 하기 위해서다. 삭제 후 `#clearCaches`(302 에서 여전히 사용) · `#splitKey`(`resubscribeAll` 에서 사용) · `buildSubscribeQuoteReq`(2곳에서 사용) 중 미사용이 되는 것은 없다.

### 5. 테스트 3케이스 (`relay/tests/strategy-hub.test.ts`)

- **⑬ 「60 에코와 64 스냅샷에 종목명·단축코드가 붙는다 (갭 4)」** — ⑫ 와 같은 방식(`symbols: new FakeSymbols({...})`)으로 Hub 를 세우고, 팬아웃 `{t:"lc"}` · `{t:"lc.snap"}` **그리고 `getLimitChasers` 캐시 복사본**에 대해 각각 단언한다. 세 번째가 재접속 복원 경로의 잠금이다.
- **⑭ 「모르는 ISIN 은 필드를 비워 둔다」** — `expect(name).toBeUndefined()` 와 `expect(name).not.toBe(OTHER_ISIN)` 을 **둘 다** 건다. 「이름이 없다」와 「이름이 ISIN 이다」는 다른 사실이고, 후자를 만들면 UI 가 둘을 구분하지 못한다. 이것이 「모르면 ISIN 을 그대로」 폴백의 **서버측 계약**이고, 폴백 자체는 16-42 의 몫이다.
- **⑮ 「`symbols` 미주입 Hub 도 무해하다」** — `beforeEach` 기본 구성(`#symbols === undefined`)에서 60/64 가 예외 없이 흐르고 이름만 없으며 캐시 키(`KEY_A`) 규율이 그대로임을 단언한다.

기존 ③(에코 upsert) · ④(crud "D" 삭제) · ⑤(64 전량 교체) **전부 통과** — 보강이 캐시 규율을 건드리지 않았다는 증거다.

## 회귀 잠금 실증 — 되돌린 지점마다 정확히 그 케이스만 빨개졌다

| 라운드 | 무엇을 되돌렸나 | 빨개진 케이스 | 관측 문구 |
|---|---|---|---|
| **A** | `#enrichLimitChaser` 를 무력화(항상 원본 반환) | **⑬ 1건** (⑭·⑮ 초록 유지) | `expected undefined to be '삼성전자'` |
| **B** | 캐시에는 원본을 넣고 팬아웃만 보강 | **⑬ 1건** — 실패 지점이 `tests/strategy-hub.test.ts:398` 즉 **`getLimitChasers` 단언 줄** | `expected undefined to be '삼성전자'` |
| **C** | 못 풀면 `name: item.isin` 로 지어내기 | **⑭·⑮ 2건** | `expected 'KR7000660001' to be undefined` · `expected 'KR7005930003' to be undefined` |

라운드 B 가 「캐시에 넣기 전 보강」이 장식이 아니라는 관측 증거다 — 팬아웃만 고치면 통과하는 테스트였다면 그 케이스는 잠그는 것이 없다. 라운드 A 에서 ⑭·⑮ 가 초록으로 남는 것도 옳다: 그 둘이 잠그는 명제(「지어내지 않는다」)는 보강 유무와 무관하다.

복원 후 `grep -c MUTATION relay/src/hub/subscription-hub.ts` = **0**, `git diff -- relay/src/hub/subscription-hub.ts` **0줄**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 1 의 `pnpm -r typecheck` exit 0 은 「낡은 `dist` 를 본 것」이었다**

- **Found during:** Task 2 (relay typecheck)
- **Issue:** relay·webapp 은 `@gh-radar/shared` 를 **소스가 아니라 빌드 산출물(`packages/shared/dist`, gitignored)** 로 해석한다. Task 1 직후 `pnpm -r typecheck` 가 exit 0 이었지만, 그것은 relay 가 **name·code 가 없는 옛 `.d.ts`** 를 보고 통과한 것이다. Task 2 에서 `#enrichLimitChaser` 를 넣자 곧바로 드러났다: `src/hub/subscription-hub.ts(767,51): error TS2353: Object literal may only specify known properties, and 'name' does not exist in type 'RelayLimitChaser'.`
- **Fix:** `pnpm --filter @gh-radar/shared run build` 로 `dist` 를 재생성한 뒤 `pnpm -r typecheck`(exit 0) · `pnpm --filter @gh-radar/relay run typecheck`(exit 0) · `typecheck:tests`(exit 0) 를 **다시** 돌렸다. 저장소 파일 변경은 없다(`dist` 는 gitignored).
- **함정으로 기록한다:** **공유 계약(`packages/shared`)을 바꾼 뒤의 `pnpm -r typecheck` 단독 통과는 검증이 아니다.** 소비처가 `dist` 를 보므로 `shared` 를 먼저 빌드하지 않으면 계약 변경이 **소비처 타입 체크에 보이지 않는다** — 「초록인데 아무것도 검증하지 않은」 상태가 만들어진다. 16-42 가 같은 계약을 webapp 에서 소비하므로 그 plan 에 직접 해당한다.
- **Commit:** 소스 변경 없음(빌드 산출물 재생성). 판정은 9c30c99 의 검증 단계에서 이뤄졌다.

### 계획과 다르게 한 것

**계획 acceptance criteria 의 「`grep -c "detach(" ...` 전/후 값 인용」을 그대로 쓰면 오독이 된다.** 그 숫자는 삭제 후에도 1 이다 — 삭제 사유 주석이 같은 문자열을 담기 때문이다. 「메서드 선언 수」(`grep -c '^  detach('` = **1 → 0**)를 함께 인용해야 판정이 성립하며, 위 표에 두 값을 나란히 적었다.

### Rule 4 (아키텍처 결정) 해당: 0건 · 인증 게이트: 0건

## 무엇을 못 닫았는가 (정직 기록)

- **사용자가 보는 증상은 아직 그대로다.** 이 plan 은 **계약 + relay** 까지다. `webapp/src/lib/isin-labels.ts` 는 여전히 `hold`·`unf`·`viOrders` 에서만 이름을 모으고 `app-sidebar.tsx:310` 은 `labels.get(item.isin)?.name ?? null` 이다 — **웹앱이 새 필드를 읽지 않으므로 사이드바는 계속 ISIN 을 보여준다.** 소비는 **16-42(wave 27)** 몫이고, 그때 필요한 계약은 이 커밋으로 준비됐다.
- **⚠️ 배포 미실시.** 프로덕션 relay 에는 이 보강이 없다. 재배포는 **16-46** 몫이다.
- **TRADE-01 · TRADE-03 상태를 바꾸지 않았다.** `requirements.mark-complete` 미실행 — TRADE-03 은 계속 **Pending**(재판정 16-46).
- **실서버·실계좌 접속 0회 (D-27).** `FakeSession`·`FakeSymbols` 만 사용했다. 게이트웨이 주소를 쓰는 코드는 건드리지 않았다.
- **자동 포매터 미실행.** 이 저장소에는 prettier 설정이 없다(16-30 사고).

## Known Stubs

없다. 이 plan 이 만든 필드는 relay 가 실제 `SymbolMap` 조회 결과로 채우며, 채우지 못하는 경우는 **의도적으로 비어 있는 것**이고 그 사실을 ⑭ 가 명시 단언한다.

## Threat Flags

없다. 새로 생긴 표면은 **아웃바운드 필드 2개**뿐이고, 인바운드 표면은 `Omit` 추가로 **좁아졌다**(T-16-84). `z.object` 가 미지 키를 떨어뜨리는 기존 방어와 이중이다.

## 검증 결과 (전량 실측)

| 게이트 | 결과 |
|---|---|
| `pnpm -r typecheck` | **exit 0** (13 워크스페이스, shared 재빌드 후) |
| `pnpm --filter @gh-radar/relay run typecheck` | **exit 0** |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | **exit 0** |
| `pnpm --filter @gh-radar/relay test` | **exit 0** — Test Files 17 passed / **Tests 390 passed** (기준선 387 → **+3**) |
| `pnpm -r test` | **exit 0** — **2,029 passed**(기준선 2,026 → +3, relay 외 변동 없음: shared 99 · server 252 · webapp 672 · workers 그대로) |
| `git diff -- webapp/src/lib/limit-chaser.ts` | **출력 없음** |
| 신규 마이그레이션 | 0건 |

## Commits

| Task | Commit | 내용 |
|---|---|---|
| 1 | `03d0ee8` | `feat(16-41)` 계약에 `name`·`code` 추가 + Input Omit |
| 2 | `9c30c99` | `feat(16-41)` Hub 보강기 + `detach`/`releaseAll` 삭제 |
| 3 | `feedf2f` | `test(16-41)` 보강·폴백·미주입 3케이스 |

## Self-Check: PASSED
