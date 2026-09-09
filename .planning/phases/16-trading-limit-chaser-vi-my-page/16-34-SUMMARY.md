---
phase: 16-trading-limit-chaser-vi-my-page
plan: 34
subsystem: relay
tags: [dma, order-correlation, dup-guard, narrow-pending, vitest]

requires:
  - phase: 16
    provides: "16-27 이 세운 `narrowPending` 하드 필터 + ①~④ 단계적 좁히기 규율 (같은 파일)"
  - phase: 16
    provides: "16-33 이 정리한 `recordUnmatched` 경로 — ㉑ 의 뒷부분 단언이 그 위에 서 있다"
  - phase: 16
    provides: "16-22 의 dup 키 사용자 스코프 규율(WR-02 / truth 25) — 신규 키는 그대로 둔다"
provides:
  - "`PendingOrder.side` — 취소 대기는 `\"\"`(DB CHECK 표기를 방향의 정본으로 쓰지 않는다)"
  - "`narrowPending` ②-1 매매구분 축 — `sideTrusted && noticeType∈{A,E} && fromWireSide!==null` 일 때만 `refine`"
  - "취소 전용 dup 키 `dup:{accountNo}|{isin}|C|{orgOrderNo}` — 신규 키 형태는 불변"
  - "회귀 테스트 5종 신규(㉙·㉚·㉛ + 단위 2) + 기존 2종 교체(㉑ · 「폴백 없음」)"
affects: [relay 주문 상관 경로, 미체결 일괄 취소 동선, 16-35 종결 plan]

tech-stack:
  added: []
  patterns:
    - "축의 강도 순서는 「변하는가」로 정한다 — 체결 통보에서 수량·가격은 변하지만 방향은 변하지 않는다"
    - "「믿을 수 있는가」는 `sideTrusted` 한 축으로 부족하다 — 거부(\"R\")는 파서가 신뢰로 표시하지만 취소 대기에도 온다"
    - "중복 가드의 키는 **그 요청의 정체성**이다. 신규는 (계좌,종목,방향,가격,수량), 취소는 원주문번호"
    - "가드가 너무 넓으면 사고를 막는 것이 아니라 만든다 — 급락 국면의 일괄 취소 차단은 자산 위험"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "②-1 축의 적용 조건을 계획·REVIEW 스니펫(`sideTrusted && side !== \"\"`)보다 **한 겹 좁혔다** — `noticeType` 이 \"A\"/\"E\" 일 때만 쓴다. 거부(\"R\")·빈 값은 취소 대기에도 오는데 취소 요청에는 매매구분이 없어 그 통보의 side 는 브로커 기본값이다. 좁히지 않으면 기존 테스트 ②(「거부는 어느 쪽에도 온다」)가 깨지고, 그 단언은 **참**이다"
  - "정규화에 `startsWith(\"S\")` 대신 `fromWireSide`(envelope.ts) 를 쓴다 — 첫 글자 판정 규율이 이미 문서화돼 있고, 모르는 값을 매수로 **지어내지 않는다**(`null` → 축 건너뜀)"
  - "취소 대기의 `PendingOrder.side` 는 `\"\"` 다. `handle` 의 `const side = isCancel ? \"S\" : msg.side` 는 `dma_orders.side` CHECK 통과용 표기이지 방향의 정본이 아니다"
  - "통합 테스트 ㉑ 의 「좁혀지지 않는 예」를 매수+매도 → **매수 2건(수량 상이) + 부분체결 통보**로 바꿨다. 신규 2건이 모든 축에서 같은 상태는 dup 가드 때문에 이 경로에 **존재할 수 없다**"
  - "신규 dup 키 문자열은 한 글자도 바꾸지 않았다 — 두 탭 동시 발주 차단(16-22 truth 25)이 거기 달려 있다"

patterns-established:
  - "회귀 잠금 실증 5회 (16-27·16-28·16-33 승계) — 새 분기를 무력화해 정확히 어느 케이스가 실패하는지 확인 후 복원"

requirements-completed: []

duration: 9min
completed: 2026-09-09
---

# Phase 16 Plan 34: 매매구분 매칭 축 · 취소 중복 키 Summary

**relay 가 이미 손에 쥔 식별 정보를 쓰지 않아 「가를 수 있는 것을 못 가르고(GC-WR-03), 막지 말아야 할 것을 막던(GC-WR-10)」 두 자리를 닫았다 — 매수/매도 동시 대기는 접수 통보의 방향으로 정산되고, 서로 다른 미체결의 연속 취소는 더 이상 5초 거부되지 않는다.**

## Performance

- **Duration:** 약 9분
- **Started:** 2026-09-09T06:15:24Z
- **Completed:** 2026-09-09T06:25:28Z
- **Tasks:** 2/2
- **Files modified:** 2
- **신규 마이그레이션:** 0건

## Accomplishments

### Task 1 — 매매구분 매칭 축 (GC-WR-03 / T-16-70) · commit `770da64`

**① `PendingOrder.side` 신설** — `relay/src/ws/order-handler.ts:179` `side: OrderSide | "";`.

값의 출처는 `:921` `side: isCancel ? "" : msg.side` 다. `handle` 이 위에서 계산해 둔 `const side = isCancel ? "S" : msg.side`(`:774`)를 **가져오지 않았다** — 그것은 `dma_orders.side` CHECK(B/S 둘뿐)를 통과시키기 위한 표기이지 방향의 정본이 아니고(취소 요청 자체에 매매구분이 실리지 않는다), 그대로 싣으면 **모든** 취소 대기가 「매도」로 보인다. 타입 주석(`:167-179`)에 그 근거와 「그래서 ②-1 축은 `!p.isCancel` 인 후보에만 적용한다」를 못박았다. 매칭 축 주석은 「넷」 → 「다섯」으로 갱신했다(`:162` · `:916`).

**② ②-1 축** — `relay/src/ws/order-handler.ts:1050-1073`. **`refine` 이다**(`:1071` `refine((p) => !p.isCancel && p.side === noticeSide);`) — 남는 후보가 0이면 축을 건너뛴다. 하드 필터가 아니다.

적용 조건이 **세 겹**이다 (`:1068-1070`):

| 조건 | 근거 |
|------|------|
| `n.sideTrusted` | 취소·정정(C/M) 통보에는 매매구분이 없다 — 요청에 담기지 않아 브로커가 채울 값이 없고 MockBroker 는 "B" 를 남긴다 (Pitfall 8 / `envelope.ts:1186-1192`) |
| `n.noticeType === "A" \|\| "E"` | **계획·REVIEW 스니펫보다 한 겹 좁혔다.** 거부("R")와 빈 값(구 서버)은 **취소 대기에도 온다.** 취소거부의 `side` 는 브로커 기본값이므로 그것으로 좁히면 살아 있는 신규 주문이 「거부됨」으로 뜬다 — ② 축이 "R" 을 건너뛰는 것과 같은 근거다 |
| `fromWireSide(n.side) !== null` | 첫 글자로만 판정하고 모르는 값을 매수로 **지어내지 않는다** (`envelope.ts:1322-1333` 의 규율을 재사용) |

**③ 축의 순서**는 원주문번호(하드) → 통보 종류 → **매매구분** → 수량 → 가격이다. 수량·가격보다 앞인 이유를 주석에 적었다: **체결 통보에서 수량·가격은 주문값이 아니라 체결값으로 변하지만 방향은 어떤 통보에서도 변하지 않는다.** 통보 소비 루프의 축 나열 주석(`:341`)도 `side` 를 끼워 갱신했다.

**④ 테스트** — 신규 3 + 교체 2.

- **㉙ (통합, `relay/tests/ws-order.test.ts:1171`)** 「매수/매도 동시 대기는 접수 통보의 매매구분으로 갈린다 — 둘 다 「결과 모름」이 아니다」. 같은 종목·수량·가격의 매수/매도를 띄우고 `side:"S"` 접수 통보를 넣는다. 잠그는 것: `order.result` **1건만** · 그것이 `rid-sell`/`accepted` · 기록 경로로 새지 않았음(조회 0건, 갱신 1건이 `row-2`) · 반대쪽 매수 대기는 **살아서** 5초 뒤 `timeout`(Pitfall 9 — 자기 통보가 오지 않은 주문의 진실은 「모름」이다).
- **②-1 축 (단위, `:1343`)** 매수↔매도 양방향 · 체결("E") 부분체결에서도 방향으로 갈림 · `"SELL"` 접두 판정 · `"?"` 는 축을 건너뛰어 `null`.
- **②-1 미적용 (단위, `:1361`)** 취소확인("C", `sideTrusted:false`)·정정확인("M")은 취소 대기를 그대로 정산하고, 거부("R")와 빈 `noticeType` 은 축을 쓰지 않아 `null` 이다.
- **㉑ 교체 (`:865`)** — 아래 「Deviations」 참조.
- **「폴백 없음」 단위 케이스 개명 (`:1408`)** → 「같은 방향 2건은 좁혀지지 않는다」. 매수 2건에 매도 접수 통보가 와도 `refine` 이 축을 건너뛰고 결국 `null` 임을 함께 잠갔다.

### Task 2 — 취소 중복 키를 원주문번호로 가른다 (GC-WR-10 / T-16-71) · commit `e86dfa1`

**① `dupKey` 가 요청 종류로 갈렸다** — `relay/src/ws/order-handler.ts:243-248`.

```
:244  if (msg.t === "order.cancel") {
:245    return `dup:${msg.accountNo}|${msg.isin}|C|${msg.orgOrderNo}`;
:246  }
:247  return `dup:${msg.accountNo}|${msg.isin}|${msg.side}|${msg.price}|${msg.qty}`;
```

**`:247` 신규 키는 한 글자도 바뀌지 않았다** — 두 탭 동시 발주 차단(16-22 truth 25 / T-16-31)이 거기 달려 있다.

**② docstring**(`:226-241`)에 분기의 근거를 이었다: 취소 수량은 언제나 미체결 잔량 전부이므로(UI D-21, `webapp/src/components/orderbook/account-panel.tsx:259-262` 의 `orgOrderNo: row.orderNo` · `qty: row.unfilledQty` · `price: row.price`) 가격·수량은 취소의 식별자가 아니다. 같은 종목·가격·잔량의 미체결 2건은 흔하고(다른 단말·전일 잔여·자동주문), 그 상황에서 두 번째 취소가 최대 5초 거부되면 **급락 국면의 일괄 취소가 막힌다 — 그 가드는 사고를 막는 것이 아니라 만든다.** 파일 머리말의 T-16-10 항목(`:30-34`)에도 취소 튜플을 명시했다.

**③ 연타는 여전히 막힌다.** 같은 `orgOrderNo` 면 키가 같으므로 두 번째는 그대로 거부다 — 좁아진 것은 「무엇이 같은 취소인가」의 정의뿐이라는 문장을 docstring 마지막 줄에 남겼다. ㉛ 이 이것을 잠근다.

**④ 키 회수 경로는 변경 0건임을 확인했다.** `release`(`:323-331`) · `closeConn`(`:957`) · `dropUserDupKeys` 는 전부 `claimKeys` 가 만든 `{rid, dup}` 쌍을 그대로 되돌려주는 구조라, 키 **문자열의 모양**이 바뀌어도 도는 경로가 같다. 「한 쌍으로 만들고 한 쌍으로 놓는다」는 관례가 이 변경을 국소적으로 만들었다. 16-22 의 ㉓(두 연결 중복 거부)·㉔(closeConn 후 재주문 가능)이 손대지 않고 그대로 통과한다.

**⑤ 테스트 2케이스 신규** (+ 취소 인바운드 헬퍼 `orderCancel`, `relay/tests/ws-order.test.ts:202`).

- **㉚ (`:1210`)** 「같은 가격·같은 잔량의 미체결 2건을 연달아 취소할 수 있다」. 서로 다른 `orgOrderNo` 2건 → `DirectOrderReq` **2건**이 나가고 두 요청의 `orgOrderNo` 가 각각 실린다 · `orderType` 둘 다 "C" · 거부 프레임 **0건** · insert 2건.
- **㉛ (`:1228`)** 「같은 원주문번호 취소를 연타하면 두 번째는 거부다」. `rid` 가 달라도(다른 탭·다른 클릭) 거부 문구가 그대로 나가고, 게이트웨이로 나간 것은 1건뿐이다.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | **40 passed** (16-33 시점 35 → +5) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 373 tests passed** (368 → +5) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -c "sideTrusted" relay/src/ws/order-handler.ts` | **3** (≥1) ✅ |
| `grep -c "p.side" relay/src/ws/order-handler.ts` | **1** (≥1 — `:1071` 에서 실제로 읽힌다) ✅ |
| `PendingOrder` 에 `side` 필드 | `relay/src/ws/order-handler.ts:179` ✅ |
| 매매구분 축이 `refine` (하드 필터 아님) | `:1071` `refine((p) => !p.isCancel && p.side === noticeSide);` ✅ |
| 「매수/매도 동시 대기」·「같은 방향 2건은 좁혀지지 않는다」 둘 다 존재 | ㉙ `:1171` · 단위 `:1343` / ㉑ `:865` · 단위 `:1408` ✅ |
| `dupKey` 본문의 `msg.t === "order.cancel"` 분기 | `:244` ✅ |
| `grep -c "orgOrderNo" relay/src/ws/order-handler.ts` | **13 → 18** (증가) ✅ |
| 신규 주문 키 문자열 불변 | `:247` `` `dup:${msg.accountNo}|${msg.isin}|${msg.side}|${msg.price}|${msg.qty}` `` ✅ |
| 「원주문번호 상이 연속 취소 통과」·「동일 원주문번호 연타 거부」 | ㉚ `:1210` · ㉛ `:1228` ✅ |
| 16-22 의 ㉓·㉔ 통과 | 무수정 통과 ✅ |
| `git status --short supabase/migrations/` | **0건** ✅ |

**회귀 잠금 실증 5회** (16-27·16-28·16-33 승계). 통과만 보고 넘어가면 그 테스트가 무엇을 지키는지 모른 채 초록불만 얻는다.

| 무력화한 것 | 실제 실패 |
|---|---|
| ②-1 축 전체를 `if (false)` 로 차단 | **2건** — ㉙ · 단위 「②-1 매매구분 축」 |
| ②-1 의 가드를 REVIEW 스니펫대로 되돌림(`sideTrusted`·`noticeType` 제거, `n.side !== ""` 만) | **2건** — 기존 ② 「거부는 어느 쪽에도 온다」 · 신규 「②-1 은 취소·정정·거부에 적용되지 않는다」 |
| 취소 대기의 `side` 에 DB 표기("S")를 그대로 실음 | **0건** (아래 「관측된 사실」 참조) |
| 취소 dup 키를 옛 형태(`C\|price\|qty`)로 되돌림 | **1건** — ㉚ (두 번째 취소가 거부돼 `DirectOrderReq` 1건) |
| 취소 dup 키의 정체성을 `orgOrderNo` → `rid` 로 바꿈 | **1건** — ㉛ (같은 원주문번호 연타가 통과) |

확인 후 전부 복원했다 (`grep -c MUTATION relay/src/ws/order-handler.ts` = **0**).

**관측된 사실 — 취소 대기의 `side: ""` 는 현재 테스트로 관측되지 않는다.** ②-1 축의 `refine` 이 `!p.isCancel` 을 먼저 걸기 때문에, 취소 대기의 `side` 가 `""` 든 `"S"` 든 결과가 같다. 두 방어는 **의도적으로 중복**이다(둘 중 하나만 남아도 오귀속이 없다). 잠기지 않는 방어를 「잠겼다」고 적지 않기 위해 여기에 사실대로 남긴다 — 미래에 `!p.isCancel` 을 걷어내는 변경이 오면 `""` 가 마지막 방어선이 되고, 그때는 관측 가능해진다.

## Deviations from Plan

### 계획과 다르게 한 것 (의도적)

**1. ②-1 축의 적용 조건을 계획·REVIEW 스니펫보다 한 겹 좁혔다 — `noticeType ∈ {A, E}` 를 추가했다.**

계획 Task 1 ②는 「`n.sideTrusted && n.side !== ""` 일 때만 적용」이라고 적었다. 그대로 구현하고 실행하니 **기존 테스트 ②의 마지막 단언**(「거부("R")는 신규·취소 어느 쪽에도 오므로 이 축을 쓰지 않는다 — 좁히지 못한다」)이 깨졌다.

16-33 이 남긴 주의대로 「내 변경이 틀렸나 / 그 단언이 애초에 거짓이었나」를 갈라 판단했고, **이번에는 단언이 참이었다.** 근거: 파서는 `sideTrusted = noticeType !== "C" && noticeType !== "M"`(`envelope.ts:1274`)이라 **거부("R")에는 `sideTrusted: true` 를 준다.** 그런데 "R" 은 **취소 요청에 대해서도** 온다. 취소 요청에는 매매구분이 실리지 않으므로 그 통보의 `side` 는 브로커가 채운 기본값("B")이고, 그것으로 좁히면 `!p.isCancel` 이 걸려 **취소거부가 살아 있는 신규 매수 주문을 정산한다** — 사용자는 접수된 매수가 「거부됨」으로 뜨는 것을 보고 재주문한다. 이 파일이 스스로 「최악의 결과」라 적어 둔 중복 체결 경로 그대로다.

즉 `sideTrusted` 는 「매매구분을 **표시**해도 되는가」의 축이지 「매매구분으로 **좁혀도** 되는가」의 축으로는 한 겹 모자란다. 구 서버의 빈 `noticeType` 도 같은 이유로 제외했다(취소확인인지 알 수 없다). 실증: 가드를 스니펫대로 되돌리자 기존 ②와 신규 단위 케이스가 **함께** 깨진다(위 표 2행).

**2. 정규화에 `startsWith("S")` 대신 `fromWireSide`(envelope.ts) 를 썼다.**
계획은 「`startsWith` 판정」을 지시했다. 같은 판정을 하는 함수가 이미 `envelope.ts:1329-1332` 에 있고 — 첫 글자만 보고 `"B"`/`"S"` 가 아니면 `null` — 그 docstring 이 「임의 기본값("B")으로 메우지 않는다. 미체결 행의 매매구분은 그대로 취소 주문의 `side` 가 되므로 모르는 값을 매수로 지어내면 **반대 방향 주문**이 나간다」는 근거까지 들고 있다. `sideOf`(`:664`)의 `startsWith("S") ? "S" : "B"` 를 베끼면 **모르는 값이 매수로 확정**돼 축이 잘못 걸린다. 판정을 두 벌 만들지 않는 편이 이 파일의 규율(「`statusOf` 를 재구현하지 않는다」)과도 맞는다.

**3. 통합 테스트 ㉑ 의 「좁혀지지 않는 예」를 「매수 10@70000 두 건」이 아니라 「매수 10 + 매수 5 @70000 + 부분체결 통보」로 만들었다.**

계획 Task 1 ④는 「같은 방향 2건(매수 10@70000 두 건)으로 바꾸라」고 적었지만, **그 상태는 이 경로에 존재할 수 없다** — 완전히 동일한 신규 2건은 dup 키가 같아 두 번째가 게이트 ⓪에서 거부된다(16-22 truth 25, 이 plan 의 must_have 이기도 하다). 신규 주문의 dup 키 축 `(accountNo, isin, side, price, qty)` 는 매칭 축 `(isin, side, price, qty, isCancel)` 을 **덮으므로**, 통합 경로에서 살아남은 신규 2건은 반드시 방향·가격·수량 중 하나가 다르다.

그래서 축을 죽이는 다른 실물 상황을 썼다: **부분체결**이다. 체결("E") 통보의 수량·가격은 주문값이 아니라 체결값이라 ③④ 가 건너뛰어지고, 방향이 같으면 ②-1 도 갈라 주지 못한다 → `null`. 16-33 이 확장해 둔 뒷부분 단언(조회 1회 · `orderRowId` 없는 갱신 0건 · 「붙지 않는 수동 통보」 error · 좁히기 warn)은 **그대로 유지**했고 전부 통과한다. 「모든 축이 같은 신규 2건」은 그 상태를 직접 만들 수 있는 단위 케이스(`:1408`)가 계속 잠근다.

**4. `requirements.mark-complete` 미실행.**
plan frontmatter 에 `requirements: [TRADE-03]` 이 있으나 **돌리지 않았다.** TRADE-03 의 Pending 근거는 프로덕션 `/healthz` 의 `everReadyCount: 0`(16-26 실측)이고 이 plan 은 그것을 건드리지 않는다. 16-27·16-28·16-30·16-33 과 같은 기준이다.

### Auto-fixed Issues

없음 — Rule 1~3 자동 수정 0건. 위 4건은 전부 계획 문언과의 **의도적 차이**이고 근거를 각각 남겼다.

### 검증 기준 중 충족하지 못한 1건 (스코프 밖 — 2라운드 5번째 동일 관측)

`<verification>` 의 `grep -rn "10\.41\.1\.120" relay/` **0건** 기준은 실측 **2건**으로 충족하지 못했다. 둘 다 이번 plan 이 손대지 않은 선행 커밋의 **산문**이다:

- `relay/README.md:17` — 「기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 실계좌 접속은 …」 = **경고문**
- `relay/src/dma/link-health.ts:20` — 터널 판정 조건을 설명하는 주석

둘 다 접속에 쓰이는 리터럴이 아니라 **「실서버에 붙지 말라」는 경고 자체**다. 지우면 D-27 의 안전장치가 사라지므로 제거하지 않았다. D-27 의 실질(실서버·실계좌로 **접속하는 코드** 0건, FakeGateway·스텁만 사용)은 지켜졌다 — 이번 plan 의 신규 5케이스도 전부 FakeGateway·순수 함수다. 기준 문구를 「접속 리터럴 0건」으로 좁히는 것은 문서 plan 의 몫이다(16-29·16-30·16-32·16-33 이 같은 사실을 남겼다).

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-70 (Repudiation / 결과 미상) | mitigate ✅ | ②-1 축 `:1050-1073`. `refine` 이라 0건이면 건너뛴다. ㉙ + 단위 2케이스로 잠금, 변이 2종으로 실증 |
| T-16-71 (DoS / 자산 위험) | mitigate ✅ | 취소 dup 키 `:245`. ㉚ 이 「연속 취소 2건 통과」로 잠금(변이 시 실제로 1건만 나간다) |
| T-16-31 (Tampering / 중복 발주) | mitigate ✅ | 신규 키 `:247` **문자열 불변**. ⑦·㉓·㉔ 무수정 통과. ㉛ 이 취소 쪽 연타 차단도 잠금 |
| T-16-29 (Tampering / 기록 교차) | mitigate ✅ | 새 축도 `refine`(0이면 건너뜀). 「같은 방향 2건은 좁혀지지 않는다」(`:1408`)와 ㉑(`:865`)이 폴백 부재를 계속 잠금 |
| T-16-13 (실서버 접속) | accept ✅ | FakeGateway·스텁만. 실계좌·실서버 접속 0건 (D-27) |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 손댄 표면은 기존 상관 함수의 축 하나와 중복 키 문자열뿐이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **거부("R") 통보는 여전히 방향으로 좁히지 못한다** — 좁힐 근거가 와이어에 없다. 취소거부의 `side` 는 브로커 기본값이므로, 신규 대기와 취소 대기가 동시에 있을 때 오는 "R" 은 정산하지 않고 5초 타임아웃으로 넘긴다(Pitfall 9). 이것을 고치려면 게이트웨이가 "R" 에 `orgOrderNo` 를 실어 줘야 한다 — relay 쪽에서 닫을 수 있는 갭이 아니다.
- **취소 대기의 `side: ""` 는 아직 관측되지 않는 방어다** (위 「관측된 사실」). `!p.isCancel` 과 의도적으로 중복이다.
- **`envelope.ts` 의 `sideTrusted` 정의는 손대지 않았다** — 「표시해도 되는가」의 축으로는 정확하고, UI 가 그 계약에 붙어 있다. 「좁혀도 되는가」의 한 겹은 소비처인 `narrowPending` 에서 걸었다.
- **TRADE-03 은 계속 Pending.** 프로덕션 `everReadyCount: 0` 판정(16-26)이 그대로다.
- **배포 미실시.** relay 재배포는 갭 클로징 2라운드 종결 plan(16-35)에서 일괄 처리한다.

## Self-Check: PASSED

- `relay/src/ws/order-handler.ts` FOUND (수정)
- `relay/tests/ws-order.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-34-SUMMARY.md` FOUND
- commit `770da64` FOUND
- commit `e86dfa1` FOUND
