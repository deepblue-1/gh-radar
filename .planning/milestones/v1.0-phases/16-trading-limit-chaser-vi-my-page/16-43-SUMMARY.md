---
phase: 16-trading-limit-chaser-vi-my-page
plan: 43
subsystem: relay
tags: [dma, order-correlation, narrow-pending, order-no-normalization, audit-side, vitest]

requires:
  - phase: 16
    provides: "16-27 의 `narrowPending` 하드 필터(실어 온 축은 0건이면 `null`)"
  - phase: 16
    provides: "16-34 의 ②-1 매매구분 축(`sideTrusted` ∧ `noticeType∈{A,E}` ∧ `fromWireSide!==null`)과 취소 dup 키"
  - phase: 16
    provides: "16-38 이 같은 파일에 넣은 `safePgError` — 로그 페이로드 폭 규율"
provides:
  - "`normalizeOrderNo` — 브로커 주문번호 비교용 정규화 단일 정본(공백 제거 + 선행 0 제거). 하드 필터·① 축 양쪽이 같은 함수를 지난다"
  - "`candidates>0 && hard===0` 전용 warn — 원인 축을 축별 잔존 수로 특정. 주문번호 원문 미포함"
  - "`NEW_ORDER_NOTICE_TYPES` — 「신규 대기의 것」으로 단정 가능한 통보 종류 화이트리스트. ②·②-1 두 축이 **같은 집합**을 본다"
  - "`sideOf` 의 `fromWireSide` 통일 + 미해석 사유 로그 — 감사 행의 매매구분을 지어내지 않는다"
  - "신규 테스트 5종(통합 3 · 단위 2)"
affects: [relay 주문 상관 경로, dma_orders 감사 기록, 16-46 종결 plan]

tech-stack:
  added: []
  patterns:
    - "표기 정규화의 **정본은 소비자가 아니라 생산자**다 — 게이트웨이의 `NormalizeOrderNo` 규칙을 그대로 옮긴다"
    - "축은 **화이트리스트**로 쓴다 — 블랙리스트는 값이 늘어날 때마다 조용히 오분류한다"
    - "같은 필드를 읽는 두 함수가 조건이 달라도 **모르는 값을 지어내지 않는 규율**은 하나로 공유한다 (`fromWireSide`)"
    - "축을 한 번에 `filter` 하지 않고 단계로 세운다 — 0건이 됐을 때 「어느 축이 지웠는가」가 로그에 남는다"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "선행 0 제거를 **채택**했다 — 게이트웨이 자신이 같은 규칙을 쓰고(`AccountManager.cpp:607-621` `NormalizeOrderNo`), 값의 정체성을 숫자로 본다(`CharToUint64`). 충돌(`\"0123\"`↔`\"123\"`) 확률은 현 주문번호 대역(3,406,000,000~)에서 0 이다"
  - "`\"A\"` 를 화이트리스트에 **남겼다** — fbs:204 · KBBroker · MockBroker 가 명시로 채운다. 다만 `IBroker.h:118` 의 **기본값도 'A'** 라는 반대 근거를 함께 찾았고(교보는 취소확인이 'A' 로 온다), 그 경로가 relay 에 닿지 않는다는 근거(`KyoboBroker.cpp:404` — termId 0 → 전달 포기)로 판단을 굳혔다. 주석에 재판정 조건까지 박았다"
  - "「값 없음」을 `\"\"` 하나로 수렴시켰다 — 게이트웨이는 맵 키라 전부 0 일 때 `\"0\"` 을 남기지만, 여기서는 그 값이 「축 없음」이어야 한다. 존재하지 않는 주문번호 0 번을 축으로 쓰면 신규 통보가 통째로 미정산된다"
  - "`sideOf` 미해석 기본값을 `\"B\"` → `\"S\"` 로 뒤집었다 — `\"S\"` 는 이 파일에서 이미 「방향의 정본이 아님」을 뜻하는 표기(취소 행)이고, `\"B\"` 는 평범한 매수라 미지 값을 섞으면 진짜 매수와 구분되지 않는다"
  - "축 전멸 로그에 주문번호 원문 대신 `afterOrgOrderNo`·`orgOrderNoLen`·`orgOrderNoApplied`·`cancelNoticeApplied` 를 실었다 (T-16-45)"

patterns-established:
  - "회귀 잠금 실증 3라운드 (16-27·16-28·16-33·16-34·16-38 승계)"

requirements-completed: []

duration: 12min
completed: 2026-09-09
---

# Phase 16 Plan 43: 주문번호 표기·미지 통보 종류·감사 매매구분 Summary

**relay 가 이미 손에 쥔 값을 잘못 단정하던 세 자리를 닫았다 — 선행 0 하나로 실제 확인된 취소가 감사 기록에 `timeout` 으로 남던 경로, 모르는 통보 종류가 자동으로 「신규」로 떨어지던 블랙리스트, 그리고 빈 매매구분이 매도 자동주문을 매수로 기록하던 `sideOf` 다.**

## Performance

- **Duration:** 약 12분
- **Tasks:** 3/3
- **Files modified:** 2
- **신규 마이그레이션:** 0건 (DB 미변경)
- **실서버·실계좌 접속:** 0회 (D-27 — FakeGateway·순수 함수만)

## Accomplishments

### Task 1 — 주문번호 비교 정규화 · 축 전멸 로그 · 화이트리스트 · commit `8bcf01c`

#### ① `normalizeOrderNo` — 정규화 단일 정본 (`relay/src/ws/order-handler.ts:1044`)

```ts
export function normalizeOrderNo(raw: string): string {
  const t = raw.trim();
  let z = 0;
  while (z < t.length && t[z] === "0") z += 1;
  return t.slice(z);
}
```

**규칙을 지어내지 않았다 — 게이트웨이 원본에서 같은 함수를 찾아 옮겼다.** `gh-trade/server/src/trade/account/AccountManager.cpp:607-621`:

```cpp
// 주문번호 정규화 — 공백 제거 + 선행 0 제거.
// KB TA1006 은 주문번호를 Float 15 로 실어 보낸다(13-RESEARCH Pitfall 7). 문자열로
// 옮기는 과정에서 표기가 어긋나면 **같은 주문 하나가 "원장에만 있음" + "서버에만
// 있음" 두 건의 어긋남**으로 잡히고 …
std::string NormalizeOrderNo(const std::string& raw)
```

즉 **표기가 갈리는 문제는 이미 게이트웨이가 겪고 같은 방식으로 눌러 둔 것**이고, relay 는 그 규약 밖에서 완전일치를 고집하고 있었다. 근거 3종을 docstring 에 파일·줄과 함께 박았다:

| 근거 | 위치 | 내용 |
|------|------|------|
| 통보 쪽은 **0 좌패딩** | `broker/krx/KRXOrderProtocol.h:256` `IntToChar` · `broker/kb/KBBroker.cpp:1341-1342` `strncpy` | 와이어 10자리 고정폭을 그대로 옮긴다 |
| 요청 쪽은 패딩이 없을 수 있다 | `AccountManager.cpp:830-840` | 「키는 원장 표기를 그대로 쓴다」 — 미체결 목록에 원장 유입분·TOML 복원분이 섞인다 |
| 값의 정체성은 **숫자** | `KRXOrderProtocol.h:243-251` `CharToUint64` | 숫자 아닌 문자를 건너뛰고 자릿값만 누적한다 |

**선행 0 제거를 채택한 저울질 (계획이 요구한 판단).** 부작용은 `"0000012345"` 와 `"12345"` 가 같아지는 것이다. 이 축은 언제나 `p.isCancel` 과 함께 걸리므로 오귀속이 성립하려면 **같은 종목의 취소 대기 2건이 동시에 살아 있고 그 둘의 주문번호가 선행 0 만 다른** 값이어야 한다. KB 주문번호 대역은 3,406,000,000 부터라 10자리를 꽉 채워 선행 0 이 없고(`KRXOrderProtocol.h:240-242`), 게이트웨이도 같은 사실을 「현 주문번호 대역(3404~)은 선행 0 이 없어 지금은 무동작이다」(`AccountManager.cpp:614`)로 적어 뒀다. **충돌 확률 0 vs 표기 갈림 3경로** — 그래서 이 방향이다. 이 계산 전부를 함수 docstring 에 남겼다.

**「값 없음」을 `""` 하나로 수렴시켰다 (계획이 열어 둔 두 번째 판단).** 축 건너뛰기 조건은 **정규화 후** 기준이다. 공백만 담긴 필드(`FillSpaces`)도, 0 으로 채워진 고정폭 필드도 여기서 `""` 가 된다. 게이트웨이의 `NormalizeOrderNo` 는 맵 키라 전부 0 일 때 마지막 한 자리(`"0"`)를 남기지만 **이 한 줄만 일부러 다르다** — 반환값 `""` 가 「원주문번호 축 없음」을 뜻하는데 `"0"` 을 축으로 쓰면 존재하지 않는 주문번호 0 번을 실어 온 것으로 읽혀 **신규 통보가 취소 대기만 남기고 0건 → 통째로 미정산**이 된다. 같은 규칙, 다른 용도라는 사실을 주석에 명시했다.

#### ② 양쪽에 같은 함수를 건다 (호출 지점 2곳)

하드 필터 (`:1119`, `:1127`):
```ts
const noticeOrgNo = normalizeOrderNo(n.orgOrderNo);
const byOrgOrderNo =
  noticeOrgNo === ""
    ? candidates
    : candidates.filter((p) => p.isCancel && normalizeOrderNo(p.orgOrderNo) === noticeOrgNo);
```

① 축 (`:1167-1168`):
```ts
if (noticeOrgNo !== "") {
  refine((p) => p.isCancel && normalizeOrderNo(p.orgOrderNo) === noticeOrgNo);
}
```

**전:** `(n.orgOrderNo === "" || (p.isCancel && p.orgOrderNo === n.orgOrderNo))` / `refine((p) => p.isCancel && p.orgOrderNo === n.orgOrderNo)` — 양쪽 원문 비교였다.

#### ③ 축 전멸 로그 (`:1132-1157`)

하드 필터를 **한 번의 `filter` 에서 두 단계로 쪼갰다** — 0건이 됐을 때 「어느 축이 지웠는가」를 로그가 말할 수 있어야 한다.

```ts
const hard = isCancelNotice ? byOrgOrderNo.filter((p) => p.isCancel) : byOrgOrderNo;
if (hard.length === 0) {
  logger.warn(
    {
      isin: n.isin,
      noticeType: n.noticeType,
      candidates: candidates.length,
      afterOrgOrderNo: byOrgOrderNo.length,
      orgOrderNoApplied: noticeOrgNo !== "",
      orgOrderNoLen: noticeOrgNo.length,
      cancelNoticeApplied: isCancelNotice,
    },
    "[WS-order] 강한 축이 후보를 전부 지웠다 — 아무것도 정산하지 않는다",
  );
  return null;
}
```

**고른 필드와 그 이유.** `afterOrgOrderNo === 0` 이면 원주문번호 축이, 그 이상인데 최종 0건이면 취소성 통보 축이 지운 것이다 — 원인이 둘 중 하나로 **특정**된다. `orgOrderNoLen` 은 정규화 **후** 길이라 패딩 문제와 값 불일치를 가른다(정규화 전 10 → 후 5 처럼). **주문번호 원문은 싣지 않는다** (T-16-45) — ㉑ 이 이미 잠그고 있는 규율이고, 새 케이스 ㉝ 이 같은 단언을 한다. 실측 출력:

```json
{"isin":"KR7005930003","noticeType":"C","candidates":1,"afterOrgOrderNo":0,
 "orgOrderNoApplied":true,"orgOrderNoLen":5,"cancelNoticeApplied":true,
 "message":"[WS-order] 강한 축이 후보를 전부 지웠다 — 아무것도 정산하지 않는다"}
```

바깥 통보 루프의 warn(「좁히지 못했다」, `:387`)은 **그대로 뒀다** — 그 줄은 「좁히기 실패 전체」를 세는 자리이고 여기는 그중 한 갈래의 원인을 말하는 자리다. 두 줄이 함께 나가는 것이 의도다.

#### ④ ② 축을 화이트리스트로 (R2-IN-03 / R2-WR-03③)

**전 (`:1063`):**
```ts
if (n.noticeType !== "" && n.noticeType !== "R") {
  refine((p) => p.isCancel === isCancelNotice);
}
```

**후 (`:1176-1178`):**
```ts
if (NEW_ORDER_NOTICE_TYPES.has(n.noticeType)) {
  refine((p) => !p.isCancel);
}
```

`grep -c 'noticeType !== "R"'` = **0** — 부정 조건이 사라졌다.

**②-1 축도 같은 집합을 본다 (`:1200`):** `if (n.sideTrusted && NEW_ORDER_NOTICE_TYPES.has(n.noticeType))`. 16-34 가 넣은 세 겹 가드는 **그대로**이고 리터럴 `"A"`/`"E"` 만 상수로 바뀌었다 — 두 축이 각자 리터럴을 들고 있으면 통보 종류가 늘어나는 날 한쪽만 갱신된다.

#### ⑤ **`"A"` 채택 여부와 근거 (계획이 SUMMARY 에 반드시 적으라고 한 항목)**

**결론: `"A"` 를 화이트리스트에 남겼다. 다만 반대 근거를 함께 찾았고 그것을 주석에 박았다.**

찬성 근거 (전부 gh-trade 원본에서 확인):

| 근거 | 위치 |
|------|------|
| 프로토콜 계약 「"A"=접수 "E"=체결 "C"=취소확인 "M"=정정확인 "R"=거부」 | `server/src/protocol/StockDMA.fbs:204` |
| 실브로커가 **명시로** 채운다 (접수 → 'A' / 체결 → 'E') | `server/src/broker/kb/KBBroker.cpp:1367` · `:1420` |
| Mock 도 명시로 채운다 | `server/src/broker/mock/MockBroker.h:104` · `:125` |
| 취소성은 하드 필터가 이미 거르고, "R" 은 신규·취소 어느 쪽에도 온다 | 이 파일 기존 규율 (16-34) |

**반대 근거 — 이번에 새로 찾은 것.** `ExecutionReport.noticeType` 의 **선언 기본값이 `'A'`** 다:

```cpp
// server/src/broker/IBroker.h:114-118
// 통보 종류 — 'A'=접수 'E'=체결 'C'=취소확인 'M'=정정확인 'R'=거부
// 기본값 'A': noticeType 을 채우지 않는 브로커(Mock/교보)는 기존 resultCode/executedQty
// 분기로 처리되므로 동작이 바뀌지 않는다.
char noticeType = 'A';
```

그리고 교보 브로커가 정확히 그 상태다 — `server/src/broker/kyobo/KyoboBroker.cpp:406` 이 미완성 목록에 「`noticeType` → 기본 'A'(접수) 라 **취소확인/정정확인이 접수로 처리된다**」고 적어 뒀다. 즉 `"A"` 는 **명시 값이자 기본값**이다.

**그럼에도 남긴 이유:** 같은 목록의 두 줄 위(`:404`)가 「`termId/origin (0)` → Server 콜백의 `GetSession(0)` 실패 → **모든 통보가 전달 포기**」라고 적고 있어 **교보 통보는 relay 에 닿지 않는다.** 같은 목록에서 `orgOrderNo` 도 채우지 않는다고 밝히므로 그 브로커에서는 취소 정산 자체가 서지 않는다. 반대로 `"A"` 를 빼면 16-34 가 잠근 「접수 통보가 신규 대기를 정산한다」(기존 단위 ② · ㉙)가 통째로 무너진다 — 그 단언들은 **참**이다. **교보 경로가 살아나는 날 이 집합을 다시 판정해야 한다**는 재판정 조건을 `NEW_ORDER_NOTICE_TYPES` 주석에 박았다.

### Task 2 — 감사 행의 매매구분 (R2-WR-06) · commit `6ca650d`

**전 (`:673-676`):**
```ts
/** 통보의 매매구분. 믿을 수 없으면(취소·정정) 위 주석의 규율대로 "S" 다. */
function sideOf(notice: ParsedOrderResp): OrderSide {
  if (!notice.sideTrusted) return "S";
  return notice.side.startsWith("S") ? "S" : "B";
}
```

**후:**
```ts
function sideOf(notice: ParsedOrderResp): OrderSide {
  if (!notice.sideTrusted) return "S";
  const side = fromWireSide(notice.side);
  if (side !== null) return side;
  // 계좌번호는 싣지 않는다 (T-16-45). 어느 통보인지와 그 종류면 추적에 충분하다.
  logger.warn(
    { orderNo: notice.orderNo, noticeType: notice.noticeType },
    '[WS-order] 통보의 매매구분을 해석하지 못했다 — 감사 행에 "S"(방향 미상) 로 남긴다',
  );
  return "S";
}
```

`grep 'startsWith("S")' relay/src/ws/order-handler.ts` = **0건**. 호출부는 `:659` `side: sideOf(notice),` **한 곳뿐이고 diff 0줄**이다(반환 타입 `OrderSide` 불변).

**docstring 에 「같은 필드를 다르게 쓴다」를 명시했다.** 매칭 축 ②-1 은 「이 값으로 **좁혀도** 되는가」를 묻고 `sideOf` 는 「이 값을 **표시해도** 되는가」를 묻는다 — 16-34 가 판정한 그대로다(`sideTrusted` 는 후자에는 맞고 전자에는 한 겹 모자라다). **조건이 다른 것이 정상**이고, 공통분모는 「모르는 값을 지어내지 않는다」 하나이며 그것이 `fromWireSide` 다.

**미해석 기본값 `"S"` 선택의 근거 (계획이 SUMMARY 에 반드시 적으라고 한 항목).** 지금 동작이 `"B"` 이므로 이것은 **감사 기록 기본값을 뒤집는 변경**이다. 그럼에도 `"S"` 인 이유:

- 이 파일에서 `"S"` 는 이미 **「이 행의 `side` 는 방향의 정본이 아니다」를 뜻하는 표기**로 쓰인다(취소 행 — `:653-656` 주석이 「취소 행의 side 를 표시에 쓰지 말 것」이라고 적어 뒀고, `handle` 의 `const side = isCancel ? "S" : msg.side` 가 같은 규율이다). 모르는 값을 그 표기로 수렴시키면 「믿을 수 없는 side」가 **한 값으로 모인다.**
- 반대로 `"B"` 는 이 파일 어디에서도 「모른다」를 뜻하지 않는 **평범한 매수**다. 미지 값을 거기 섞으면 진짜 매수 기록과 구분할 수단이 사라진다.
- 방향을 뒤집는 실질 위험이 없다: `dma_orders.side` 를 읽어 **주문을 내는 경로는 없다.** 취소 주문의 방향은 미체결 행에서 오고 그쪽은 `fromWireSide` 가 이미 지킨다(`envelope.ts` docstring). 영향은 표시와 감사뿐이고, 그마저 사유 로그가 함께 남는다.
- `dma_orders.side` CHECK 가 `B`/`S` 둘뿐이라 **행을 남기려면 하나를 골라야 한다** — 계좌 미상 분기(`:645-647` 「감사 우선」)와 같은 판단이다.

반대 판단의 근거를 코드에서 찾지 못했다(`fromWireSide` docstring 의 「매수로 지어내면 반대 방향 주문이 나간다」는 **미체결 행**에 대한 경고이고 감사 행에는 해당하지 않는다).

### Task 3 — 네 가지를 각각 잠근다 · commit `31c0fd4`

**신규 5케이스** (통합 3 · 단위 2):

| 케이스 | 제목 | 잠그는 것 |
|--------|------|-----------|
| ㉜ (통합) | `원주문번호의 표기가 달라도 취소는 정산된다 — 선행 0 하나로 timeout 이 되지 않는다 (R2-WR-03①)` | 요청 `"0000012345"` ↔ 통보 `"12345"` → `status:"cancelled"` · 5초 뒤에도 `timeout` **0건** |
| ㉝ (통합) | `정규화 후에도 어긋나는 원주문번호는 축 전멸 로그를 남긴다 — 원문은 싣지 않는다 (R2-WR-03②)` | (a) 정산 0건 (b) 축 전멸 warn + `afterOrgOrderNo:0`·`orgOrderNoApplied:true`·`orgOrderNoLen:5` (c) **주문번호 원문 부재** |
| ㉞ (통합) | `구 게이트웨이의 빈 매매구분은 감사 행에 매수로 기록되지 않는다 (R2-WR-06)` | `sideTrusted && side===""` 자동주문 행의 `side` 가 `"B"` 가 **아니고** `"S"` 이며 사유 warn 이 남는다 |
| 단위 | `원주문번호는 표기가 달라도 같은 값으로 읽는다 — 선행 0·공백 (R2-WR-03①)` | 양방향 패딩 · 공백 패딩 · **값이 다르면 여전히 `null`** · `"0000000000"` 은 「값 없음」 |
| 단위 | `모르는 통보 종류는 축으로 쓰이지 않는다 — 신규 쪽으로 단정하지 않는다 (R2-IN-03)` | `"P"`·`"X"` → `null`(신규로 단정 안 함) · `"A"`·`"E"` 는 그대로 축 |

**㉝ 의 원문 부재 단언** (계획이 소스 인용을 요구한 항목):
```ts
// (c) 주문번호 **원문**은 어느 쪽도 로그에 없다 (T-16-45 — ㉑ 과 같은 규율).
expect(warned).not.toContain("0000099999");
expect(warned).not.toContain("0000012345");
expect(warned).not.toContain(SAMPLE_ACCOUNT_NO);
```

**16-34 의 4케이스는 전부 무수정 통과했다** — 고칠 필요가 없었다(16-34 의 ㉑ 사례와 달리 이번에는 옛 구현을 베낀 단언이 없었다):

```
✓ ㉙ 매수/매도 동시 대기는 접수 통보의 매매구분으로 갈린다 …
✓ ㉚ 같은 가격·같은 잔량의 미체결 2건을 연달아 취소할 수 있다 …
✓ ㉛ 같은 원주문번호 취소를 연타하면 두 번째는 거부다 …
✓ ②-1 매매구분 축 — 매수/매도 동시 대기는 접수 통보의 방향으로 갈린다
✓ ②-1 매매구분 축은 취소·정정·거부 통보에 적용되지 않는다 (Pitfall 8)
✓ 같은 방향 2건은 좁혀지지 않는다 — 「가장 오래된 것」 폴백은 없다
```

기존 45 케이스 중 **한 건도 고치지 않았다** — `ws-order.test.ts` diff 는 **147줄 전부 추가**다(`+147 / -0`).

**회귀 잠금 실증 3라운드** (항목별 실패 수):

| 라운드 | 무력화한 것 | 실제 실패 |
|--------|------------|-----------|
| A | 정규화 제거 (`noticeOrgNo = n.orgOrderNo`, `p.orgOrderNo === noticeOrgNo`) | **3건** — ㉜ · ㉝ · 단위「표기가 달라도 같은 값」 |
| B | ② 축을 블랙리스트로 되돌림 (`!== "" && !== "R"` + `p.isCancel === isCancelNotice`) | **1건** — 단위「모르는 통보 종류」 |
| C | `sideOf` 를 `startsWith("S") ? "S" : "B"` 로 되돌림 | **1건** — ㉞ |

라운드 A 에서 ㉝ 이 함께 빨개지는 것도 **옳다** — 그 케이스는 `orgOrderNoLen:5`(정규화 **후** 길이)를 단언하므로 정규화가 없으면 10 이 된다. 3라운드 전부 `git checkout` 으로 복원했고 임시 마커 부재를 grep 으로 확인했다: `grep -c MUTATION relay/src/ws/order-handler.ts` = **0**.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | **45 passed** (전 40 → +5) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 395 tests passed** (기준선 390 → +5) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `pnpm --filter @gh-radar/shared run build` (16-41 함정 회피 — 게이트 전 선행) | 성공 |
| `pnpm -r typecheck` | exit 0 |
| `pnpm -r test` | exit 0 · **2,034 passed** (기준선 2,029 → +5, relay 외 변동 0) |
| 정규화 함수 **하나**이고 호출 지점 2곳 | `:1044` 정의 · `:1119`(하드 필터) · `:1127`·`:1168`(양 축) ✅ |
| `grep -c 'noticeType !== "R"' relay/src/ws/order-handler.ts` | **0** — 부정 조건 소멸 ✅ |
| `grep -c 'startsWith("S")' relay/src/ws/order-handler.ts` | **0** ✅ |
| `grep -c "fromWireSide" relay/src/ws/order-handler.ts` | **7** (≥1) ✅ |
| `grep -c "orgOrderNo" relay/tests/ws-order.test.ts` | **37** (≥1) ✅ |
| `test -f relay/tests/ws-order.test.ts` | 참 ✅ |
| `sideOf` 호출부 diff | **0줄** (`:659` 하나) ✅ |
| `grep -c MUTATION relay/src/ws/order-handler.ts` (복원 확인) | **0** ✅ |
| `git status --short supabase/migrations/` | 0건 — DB 미변경 ✅ |
| 포매터 | 미실행 ✅ |

## Deviations from Plan

### 계획대로 하지 않은 것 (의도적)

**1. 하드 필터를 한 번의 `filter` 에서 두 단계로 쪼갰다.**
계획 ③은 「`candidates.length > 0 && hard.length === 0` 일 때 어느 축이 원인인지 알 수 있는 필드와 함께 로그」를 요구했다. 기존 구조(한 번의 `filter` 안에서 두 조건을 `&&`)로는 **그 정보가 계산되지 않는다** — 축별 잔존 수를 만들려면 단계를 나눠야 한다. 동작은 동일하다(`&&` 를 순차 `filter` 로 편 것뿐).

**2. `"A"` 를 축에 남겼다 — 계획이 「근거 없으면 제외」로 열어 둔 항목.**
근거는 찾았고(fbs:204 · KBBroker · MockBroker), **반대 근거도 함께 찾았다**(`IBroker.h:118` 기본값 'A' / 교보). 제외하면 16-34 의 참인 단언 2건이 무너지고, 반대 근거의 경로(교보)는 relay 에 닿지 않는다. 판단과 재판정 조건을 주석·SUMMARY 양쪽에 남겼다. 상세는 Task 1 ⑤.

**3. `requirements.mark-complete` 미실행.**
frontmatter 에 `requirements: [TRADE-03]` 이 있으나 돌리지 않았다. TRADE-03 의 Pending 근거는 프로덕션 `/healthz` 의 `everReadyCount` 실측(16-26)이고 이 plan 은 그것을 건드리지 않는다. 16-27·16-28·16-34·16-38·16-41 과 같은 기준이다.

### Auto-fixed Issues

없음 — Rule 1~3 자동 수정 0건.

### 검증 기준 중 충족하지 못한 1건 (스코프 밖 — 3라운드에서도 동일)

`grep -rn "10\.41\.1\.120" relay/` 0건 기준은 실측 **2건**(`relay/README.md:17` 경고문 · `relay/src/dma/link-health.ts:20` 주석)으로 충족 불가다. 둘 다 접속 리터럴이 아니라 **「실서버에 붙지 말라」는 경고 자체**이므로 지우지 않았다. 알려진 계약 결함(known_context 가 33건으로 집계)이고 문서 plan 의 몫이다.

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-87 (Repudiation / 허위 timeout) | mitigate ✅ | `normalizeOrderNo` 를 하드 필터·① 축 양쪽에 건다. ㉜ + 단위 케이스로 잠금, 라운드 A 로 실증(3건 실패) |
| T-16-88 (Repudiation / 원인 불명) | mitigate ✅ | `candidates>0 && hard===0` 전용 warn `:1133-1157`. 원인 축이 `afterOrgOrderNo` 로 특정된다. ㉝ 이 잠금 |
| T-16-89 (Tampering / 오귀속) | mitigate ✅ | ② 축 화이트리스트 `:1176`. 부정 조건 0건. 단위 케이스 + 라운드 B 실증 |
| T-16-90 (Repudiation / 감사 왜곡) | mitigate ✅ | `sideOf` 가 `fromWireSide` 를 지난다. 미해석 사유 warn. ㉞ + 라운드 C 실증 |
| T-16-45 (Information Disclosure) | mitigate ✅ | 새 로그 2종 모두 주문번호 원문·계좌번호 미포함. ㉝ 이 문자 단위로 단언 |
| T-16-13 (실서버·실계좌) | accept ✅ | FakeGateway·순수 함수만. 실 게이트웨이 접속 0회 (D-27) |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 손댄 표면은 기존 상관 함수의 비교 방식·축 조건과 감사 행 한 필드뿐이고, 신뢰 경계를 **좁히는** 방향이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **교보 브로커가 살아나면 `NEW_ORDER_NOTICE_TYPES` 를 재판정해야 한다.** `"A"` 는 명시 값이자 **기본값**이라, `noticeType` 을 채우지 않는 브로커에서는 취소확인도 'A' 로 온다. 지금은 그 통보가 relay 에 닿지 않아 성립하지 않을 뿐이다(근거·재판정 조건은 코드 주석에 있다). relay 쪽에서 미리 닫을 수 있는 갭이 아니다 — 게이트웨이가 그 필드를 채워야 한다.
- **거부("R") 통보는 여전히 방향으로도 종류로도 좁히지 못한다** (16-34 가 남긴 것 그대로). 좁힐 근거가 와이어에 없다.
- **`orderNo` 원문은 여전히 통보 경로 로그에 남는다** (16-38 이 남긴 관찰 그대로). 이번에 추가한 `sideOf` 의 warn 도 같은 관례를 따랐다(계획이 `{ orderNo, noticeType }` 수준으로 지정). 판단이 필요하면 별도 항목이다.
- **⚠️ 배포 미실시 — 프로덕션에는 R2-WR-03·R2-WR-06·R2-IN-03 이 여전히 살아 있다.** 재배포는 3라운드 종결 plan **16-46** 의 몫이다.
- **TRADE-03 은 계속 Pending.**

## Self-Check: PASSED

- `relay/src/ws/order-handler.ts` FOUND (수정)
- `relay/tests/ws-order.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-43-SUMMARY.md` FOUND
- commit `8bcf01c` FOUND
- commit `6ca650d` FOUND
- commit `31c0fd4` FOUND
