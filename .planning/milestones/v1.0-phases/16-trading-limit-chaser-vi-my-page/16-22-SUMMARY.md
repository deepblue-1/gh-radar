---
phase: 16-trading-limit-chaser-vi-my-page
plan: 22
subsystem: relay
tags: [order-correlation, dma, websocket, deduplication, tenancy, vitest, mutation-testing]

requires:
  - phase: 16-18
    provides: "`findIdByOrderNo(userId, orderNo)` · `${userId}|${orderNo}` in-flight 가드 · `EnsureResult` 3분기 — 이 plan 은 그 위에 매칭 축만 얹었고 어느 것도 되돌리지 않았다"
provides:
  - "`narrowPending(candidates, notice)` — 순수 export. `orgOrderNo`→`noticeType`→`quantity`→`price` 단계적 좁히기, 유일하지 않으면 `null`"
  - "`PendingOrder` 공개 타입 — `price`·`isCancel`·`orgOrderNo` 3필드 추가(기존 `qty` 포함 매칭 축 4종)"
  - "통보 후보를 그 사용자의 **전 연결에서 모아** 좁히는 상관 루프 — 탭 간 오귀속이 구조적으로 불가능"
  - "`userDupKeys: Map<userId, Set<dupKey>>` — 중복 주문 판정의 사용자 스코프 축"
  - "`ridKey()`/`dupKey()` 분리 — 재전송 가드(연결)와 중복 가드(사용자)가 서로 다른 자료구조를 쓴다"
  - "`ConnState.dupKeys` 역인덱스 + `closeConn` 회수 — 가드 leak 0"
affects: [16-26 배포·TRADE-03 재판정, webapp OrderPanel 주문 결과 표시, dma_orders 감사 기록 정합]

tech-stack:
  added: []
  patterns:
    - "상관 축은 **하드 필터가 아니라 단계적 좁히기**로 쓴다 — 축이 후보를 전부 지우면 그 축을 버린다(구 서버가 비워 보내는 축이 정상 통보를 죽이지 않게)"
    - "확신할 수 없으면 **아무것도 정산하지 않는다** — 잘못 귀속된 기록은 없는 기록보다 나쁘다. 「가장 오래된 것」 폴백을 만들지 않는다"
    - "서로 다른 요구(라우팅 스코프 vs 중복 판정 스코프)가 한 자료구조를 겸하고 있으면 **자료구조를 가른다** — 스코프를 통째로 올리면 반대쪽 요구가 깨진다"
    - "가드를 사용자 축으로 올릴 때는 **회수 경로를 같은 커밋에서** 만든다(역인덱스 + 종료 훅). 회수 없는 전역 가드는 영구 차단이다"
    - "매칭·가드 변경은 **변이 주입으로 실측**한다 — 새 테스트가 옛 동작을 실제로 잡는지 확인하지 않으면 잠갔다고 말할 수 없다"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "통보 매칭을 다축 **단계적 좁히기**로 바꿨다 — `orgOrderNo`(가장 강함) → `noticeType`(단, `\"R\"` 거부는 제외) → `quantity`·`price`(단, `\"E\"` 체결은 제외). 각 단계는 남는 후보가 0이면 적용하지 않는다"
  - "하나로 좁히지 못하면 `null` 이고 `recordUnmatched` 로 간다. **대기 항목은 그대로 두어** 5초 타임아웃이 「결과 모름」으로 끝내게 한다 — 그것이 그 상황의 진실이다 (T-16-29)"
  - "후보 1개는 축을 전혀 보지 않고 그대로 돌려준다. 구 서버가 비워 보내는 축이 있어 여기서 필터를 걸면 **대부분의 실사용**이 매칭 실패로 떨어진다"
  - "후보를 그 사용자의 **전 연결에서** 모은다(T-16-30). `order.result` 는 여전히 요청 연결로만 간다 — T-16-03 은 그대로다"
  - "중복 판정만 사용자 스코프로 올리고 `rid` 재전송 가드는 연결 스코프로 남겼다 (WR-02). `rid` 는 브라우저가 탭에서 만드는 값이라 사용자 축으로 올리면 우연한 충돌이 정상 주문을 거부한다"
  - "`release` 는 **이 연결이 아직 쥔 키만** 회수한다 — 닫힌 연결의 늦은 해제가 다른 탭이 새로 잡은 같은 키를 풀어 주면 중복 가드가 조용히 뚫린다 (플랜에 없던 경주, Rule 2)"
  - "좁히기 실패 로그에는 `isin`·`noticeType`·후보 수만 싣는다 — 계좌번호·주문번호 원문 미포함 (T-16-32)"

patterns-established:
  - "새 매칭 규칙은 **순수 함수로 떼어** export 하고 단위 케이스로 축마다 잠근다 — 통합 하네스만으로는 축별 회귀가 드러나지 않는다"
  - "가드 완화/강화 변경은 변이 4종을 주입해 「새 테스트가 옛 동작을 잡는다」를 실측으로 남긴다"

requirements-completed: []  # TRADE-03 은 16-26 소관 — 아래 「요구사항 판정」 참조

duration: 11min
completed: 2026-09-09
---

# Phase 16 Plan 22: 주문 통보 다축 매칭 + 사용자 스코프 중복 가드 Summary

**주문 통보가 ISIN 하나로 「먼저 등록된 대기」를 무조건 집어 가던 상관이 `orgOrderNo`→`noticeType`→`quantity`→`price` 단계적 좁히기로 바뀌었고, 하나로 좁혀지지 않으면 아무것도 정산하지 않는다 — 동시에 두 탭에서 완전히 동일한 주문이 모두 통과하던 연결 스코프 중복 가드가 사용자 스코프로 올라가고 연결 종료 시 정확히 회수된다.**

## Performance

- **Duration:** 약 11분
- **Started:** 2026-09-09T01:36Z (10:36 KST)
- **Completed:** 2026-09-09T01:47Z (10:47 KST)
- **Tasks:** 2 / 2
- **Files modified:** 2

## Accomplishments

- **결과·기록 교차가 닫혔다 (gap 2 / T-16-29).** 「취소하고 다시 걸기」 — 이 phase 가 만든 호가주문 탭에서 가장 흔한 조작 — 에서 5초 창이 겹쳐도 취소확인 통보는 **취소 대기**를, 접수 통보는 **신규 대기**를 각각 정산한다. 살아 있는 매수 주문이 「취소됨」으로 표시되고 사용자가 그걸 믿고 재주문해 중복 체결이 나는 경로가 사라졌다.
- **확신할 수 없으면 아무것도 정산하지 않는다.** 축을 전부 적용해도 후보가 2건 이상이면 `null` 이다. 「가장 오래된 것」 폴백을 만들지 않았고, 남은 대기는 그대로 두어 5초 뒤 각자 `timeout`(「결과 모름」)으로 끝난다.
- **탭 간 오귀속이 구조적으로 불가능하다 (T-16-30).** 후보를 그 사용자의 **전 연결에서** 모아 좁히고 유일할 때만 정산한다. 「ISIN 이 맞는 첫 연결」을 고르던 시절에는 탭 A 의 통보가 탭 B 의 대기를 가져가고 `order.result` 도 탭 B 로 갔다.
- **중복 주문 판정이 사용자 축으로 올라갔다 (WR-02 / T-16-31).** `RelayProvider` 는 탭당 소켓 1개를 열므로 연결 스코프 가드는 두 번째 탭에서 무력했다 — 완전히 동일한 `(계좌, ISIN, side, 가격, 수량)` 주문 2건이 모두 게이트웨이로 나갔다. 이제 두 번째가 거부된다.
- **가드가 leak 되지 않는다 (T-16-33).** `ConnState.dupKeys` 역인덱스를 `closeConn` 이 회수하고, Set 이 비면 `userDupKeys.delete(userId)` 로 맵 자체를 줄인다. 탭을 닫으면 같은 주문을 다시 낼 수 있다.
- **`PendingOrder.qty` 가 실제로 읽힌다 (IN-01 해소).** 저장만 되고 어디서도 참조되지 않던 필드가 `narrowPending` 의 수량 축이 됐다. `price`·`isCancel`·`orgOrderNo` 도 같은 자격으로 실린다.
- **새 테스트가 옛 동작을 실제로 잡는다는 것을 변이 4종으로 실측했다** (아래 「Verification」).

## Task Commits

1. **Task 1: 통보 매칭을 다축으로 좁히고, 좁히지 못하면 매칭 실패로 둔다 (gap 2)** — `51a17be` (fix)
2. **Task 2: 중복 주문 판정을 사용자 스코프로 올린다 (WR-02)** — `c833c18` (fix)

## Files Created/Modified

- `relay/src/ws/order-handler.ts`
  - `PendingOrder` 를 **export** 로 열고 `price`·`isCancel`·`orgOrderNo` 추가. 타입 주석에 「이 값들은 통보 매칭 축이다 — 저장만 하고 읽지 않으면 gap 2 가 재발한다」 명시
  - `narrowPending()` 신설 (L863) — 축 ① `orgOrderNo` (L875) ② `noticeType` (L880) ③④ `quantity`·`price` (L887~888). `refine()` 이 「남는 후보가 0이면 그 축은 없던 것으로 한다」를 담당
  - 통보 소비 루프 (L335~) — `findIndex((p) => p.isin === notice.isin)` 단일 축 제거. 후보를 `{state, entry}` 로 전 연결에서 수집 → `narrowPending` → 유일하면 splice+settle, 아니면 `logger.warn`(후보 2건 이상일 때) + `recordUnmatched`
  - `entry` 생성부에 매칭 축 4종 적재
  - `ridKey()` (L204) / `dupKey()` (L215) 분리 + `ClaimKeys` 타입. `claimKeys()` 는 둘을 한 쌍으로 만든다
  - `userDupKeys` (L267) 신설 · `ConnState.dupKeys` 역인덱스 · `dropUserDupKeys()` 회수 헬퍼 · 게이트 ⓪ 이 `state.claims`(rid) 와 `userDupKeys`(dup) 를 각각 본다 · `closeConn` 회수 (L826)
  - 파일 헤더 T-16-10 문단을 「`rid`(연결 스코프) / 파라미터 조합(**사용자 스코프** — WR-02)」로 갱신
- `relay/tests/ws-order.test.ts` — 12케이스 추가 (19 → 31)
  - 통합 ⑳ 신규+취소 5초 겹침 · ㉑ 좁히기 실패(정산 0 + 대기 생존 + 로그 위생) · ㉒ 두 연결 같은 ISIN 좁히기
  - 통합 ㉓ 두 탭 중복 거부 · ㉔ `closeConn` 후 재주문 가능
  - `narrowPending` 순수 단위 7종 (후보 0/1 · 취소 축 · 통보 종류 축 · 수량/가격 축 · `"E"` 제외 · 축 무효화 폴백 · 좁히기 실패 `null`)

## Decisions Made

위 frontmatter `key-decisions` 참조. 셋을 기록에 남긴다.

**① 왜 하드 필터가 아니라 단계적 좁히기인가.** 통보가 실어 오는 축은 **믿을 수 있는 구간이 서로 다르다** — 구 게이트웨이는 `noticeType` 을 아예 비워 보내고(`envelope.ts` fbs 주석), 체결(`"E"`) 통보의 `quantity`·`price` 는 주문값이 아니라 **체결값**이라 부분체결이면 다르다. 축을 하드 필터로 걸면 이런 정상 통보가 후보를 전부 지워 매칭이 통째로 실패하고, 그 결과는 「모든 수동 주문이 timeout 으로 끝난다」다. 그래서 각 단계는 남는 후보가 0이 되면 스스로를 무효화한다. 이 규칙이 실제로 동작한다는 것은 단위 케이스 「축이 후보를 전부 지우면 그 축은 적용하지 않는다」가 잠근다.

**② 왜 후보 1개는 축을 보지 않는가.** 대부분의 실사용은 「그 종목에 대기 1건」이다. 여기에 축 검사를 걸면 ①의 이유로 정상 경로가 깨지는데, 그 대가로 얻는 것은 없다 — 후보가 하나뿐이면 좁힐 것도 없기 때문이다. 회귀 위험이 가장 큰 자리라 단위 케이스에서 **축이 완전히 어긋난 통보**로도 그 하나가 나온다는 것을 명시적으로 잠갔다.

**③ 왜 중복 가드만 사용자 축으로 올리는가.** T-16-03(대기 맵은 연결 스코프)과 T-16-10(중복 거부)은 서로 다른 요구인데 `ConnState.claims` 하나가 둘을 겸하고 있었다. 스코프를 통째로 올리면 `rid` 충돌이 정상 주문을 거부하고, 통째로 두면 두 번째 탭이 중복 발주한다. 그래서 **자료구조를 갈랐다** — `rid` 는 `state.claims`(연결), dup 은 `userDupKeys`(사용자).

## 요구사항 판정

**TRADE-03 은 Pending 유지.** 이 plan 은 gap 2 와 WR-02 를 코드·테스트 수준에서 닫았지만, TRADE-03 의 종결 판정은 남은 갭 클로징(16-23~16-25)과 **배포·프로덕션 재검증(16-26)** 소관이다. `REQUIREMENTS.md` 를 건드리지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 닫힌 연결의 늦은 `release` 가 다른 탭이 새로 잡은 dup 키를 풀 수 있었다**
- **Found during:** Task 2
- **Issue:** dup 키를 사용자 맵으로 올리자 플랜에 없던 경주가 생겼다. 연결 A 의 `handle` 이 `insertRequest` 를 `await` 하는 동안 A 가 닫히면 `closeConn` 이 키 K 를 회수한다. 그 사이 연결 B(같은 사용자)가 K 를 새로 잡고, 그 뒤 A 의 `handle` 이 실패 경로로 `release` 를 부르면 **B 의 가드가 풀린다** — 그 순간 B 와 동일한 주문이 한 건 더 통과한다. 중복 체결이 이 파일 최악의 결과라 방치할 수 없다.
- **Fix:** `release` 가 `state.dupKeys.delete(keys.dup)` 의 **반환값**으로 「이 연결이 아직 그 키를 쥐고 있는가」를 판정하고, false 면 사용자 맵을 건드리지 않고 반환한다. 사유를 코드 주석에 남겼다.
- **Files modified:** relay/src/ws/order-handler.ts
- **Verification:** `pnpm --filter @gh-radar/relay test` 338 passed · typecheck/typecheck:tests exit 0
- **Committed in:** `c833c18`

**2. [Rule 1 - Bug] 플랜이 지시한 「`findIdByOrderNo` 스텁 호출 1회」 단언이 성립하지 않는 경로였다**
- **Found during:** Task 1 (테스트 ㉑)
- **Issue:** 플랜 action ⑤ 는 「좁히기 실패 케이스에서 `findIdByOrderNo` 호출 1회를 단언」하라고 했다. 그러나 이 시나리오의 통보는 **수동 주문 통보**(`originKind: "manual"`)이고, `recordUnmatched` 의 수동 분기는 `ensureRow` 에 닿기 전에 `enqueueUpdate({...patch, userId})` 로 반환한다 — 조회는 **애초에 일어나지 않는다**. 지시대로 쓰면 항상 실패하는 단언이고, 억지로 통과시키려면 시나리오를 자동주문 통보로 비틀어야 하는데 그러면 gap 2 가 실제로 나는 상황(수동 주문 2건)을 재현하지 못한다.
- **Fix:** 같은 사실을 **더 직접적인 두 축**으로 단언했다. ① 정산됐다면 `orderRowId` 셀렉터 갱신이었을 것이므로, `userId` 셀렉터 갱신이 나갔다는 것이 「정산하지 않고 기록 경로로 갔다」의 증거다. ② 「`pending` 이 2건 그대로」는 카운트를 들여다보는 대신 **5초를 진행시켜 timeout `order.result` 가 정확히 2건 나오는지**로 관측했다 — 내부 배열이 아니라 관측 가능한 계약으로 같은 사실을 잠근다.
- **Files modified:** relay/tests/ws-order.test.ts
- **Verification:** 변이 주입(폴백 부활)에서 이 케이스가 **실패**함을 실측 — 단언이 옛 동작을 실제로 잡는다
- **Committed in:** `51a17be`

**3. [Rule 3 - Blocking] 플랜 `<interfaces>`·`<read_first>` 의 줄번호가 16-18 이후 상태와 어긋났다**
- **Found during:** Task 1
- **Issue:** 플랜은 `order-handler.ts:238` 의 단일 축 매칭, L140~160 의 타입 선언 등 **줄번호로** 위치를 지목했으나, 16-18 이 `EnsureResult`·`inflight`·`ensureRow` 를 넣으면서 전부 밀렸다(실제 단일 축 매칭은 L264).
- **Fix:** 번호가 아니라 **코드로** 매핑해 수정했다. 16-18 이 만든 부분(`findIdByOrderNo(userId, …)` 2인자, `${userId}|${orderNo}` in-flight 맵, `closeConn` 이 `inflight` 을 건드리지 않는 규율, `EnsureResult` 3분기)은 **하나도 되돌리지 않았다**.
- **Files modified:** relay/src/ws/order-handler.ts
- **Verification:** `grep -c "findIndex((p) => p.isin === notice.isin)"` = 0 · `grep -c "inflight"` 유지 · 16-18 테스트(⑱ 경주 · ⑲ 소유자 경계) 그대로 통과
- **Committed in:** `51a17be`

---

**Total deviations:** 3 auto-fixed (Rule 1 ×1, Rule 2 ×1, Rule 3 ×1)
**Impact on plan:** 목표(gap 2 + WR-02)와 must_haves 6항목은 전부 달성됐다. 스코프 확장 없음 — 손댄 파일은 플랜이 지정한 2개 그대로다.

## Issues Encountered

**없음(차단 요소 기준).** 두 task 모두 checkpoint 없이 끝났고 인증 게이트도 없었다.

**스코프 밖으로 남긴 것:** `16-REVIEW.md` 의 IN-02(`CreateOrderResponse` 잔존)·IN-03(인증 중 warn 증폭)·IN-04(`relayOrderSecret`)·IN-06 은 이 plan 의 표면이 아니다. IN-01 은 `qty` 가 매칭 축이 되면서 **자연 해소**됐다.

## Verification

| 검사 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | **31 passed** (19 → 31, 신규 12) |
| `pnpm --filter @gh-radar/relay test` | **17 files / 338 tests passed** (326 → 338) |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `pnpm typecheck` (13 워크스페이스) | **전부 Done** |
| `grep -c "narrowPending" relay/src/ws/order-handler.ts` | 4 (≥2 — 정의 + 호출 + 주석 참조) |
| `grep -c "findIndex((p) => p.isin === notice.isin)"` | **0** (단일 축 매칭 잔존 없음) |
| `narrowPending` 본문이 두 축을 읽는가 | `orgOrderNo` L875·L876 · `noticeType` L880·L881 (소스 확인) |
| `grep -c "p.qty\|entry.qty\|\.qty ===" relay/src/ws/order-handler.ts` | 1 (≥1 — L887 `p.qty === n.quantity`, IN-01 해소) |
| `grep -c "userDupKeys" relay/src/ws/order-handler.ts` | 8 (≥5) |
| `grep -c "dupKeys" relay/src/ws/order-handler.ts` | 7 (≥2) |
| `grep -c "두 번째\|closeConn" relay/tests/ws-order.test.ts` | 15 (≥2) |

### 변이 주입 실측 — 새 테스트가 옛 동작을 실제로 잡는가

테스트를 「추가했다」와 「잠갔다」는 다르다. 네 가지 회귀를 실제로 코드에 넣고 돌렸다(전부 되돌림).

| 변이 | 되돌린 동작 | 결과 |
|---|---|---|
| 게이트 ⓪ 를 `state.dupKeys.has(...)` 로 (연결 스코프 복원) | WR-02 | **㉓ 실패** (1 failed / 30 passed) |
| `closeConn` 의 `dropUserDupKeys` 제거 | 가드 leak | **㉔ 실패** (1 failed / 30 passed) |
| `return pool[0] ?? null` (「가장 오래된 것」 폴백 부활) | gap 2 핵심 | **㉑ + 단위 3건 실패** (4 failed / 27 passed) |
| 후보 수집을 첫 매칭 연결에서 `break` | T-16-30 | **㉒ 실패** (1 failed / 30 passed) |

### D-27 grep 게이트에 대한 정직한 기록

`grep -rn "10\.41\.1\.120" relay/` 는 **2건**이다 — `relay/README.md:17`(실서버 접속 금지 경고문)과 `relay/src/dma/link-health.ts:20`(회선 판정 근거 주석). 둘 다 이 plan **이전부터** 있던 것이고(16-21 SUMMARY 가 같은 사실을 기록했다), 이 plan 이 만든 코드에는 0건이다. 스코프 밖이라 손대지 않았다.

## Known Stubs

없음. 이 plan 이 만든 경로는 전부 실제 자료구조와 실제 통보에 결선돼 있고, 테스트는 진짜 ws 서버·진짜 TCP 가짜 게이트웨이를 지난다.

## User Setup Required

None — 외부 서비스 설정 변경 없음. **배포는 필요하다**: 이 상관·가드 변경은 relay 컨테이너를 재배포해야 프로덕션에 반영된다 (16-26).

## Next Phase Readiness

- **16-23~16-25 진행 가능.** 이 plan 은 `order-handler.ts` 의 매칭 루프와 가드 자료구조를 바꿨으므로, 같은 파일을 만지는 후속 plan 은 ① 후보 수집이 **전 연결**을 훑는다는 것 ② dup 키가 `userDupKeys` 에 있고 `closeConn` 이 회수한다는 것 두 가지를 전제로 읽어야 한다.
- **16-26(배포·재검증)에서 확인할 것:** 실계좌 왕복에서 ① 「취소하고 다시 걸기」 시 두 주문의 `order.result` 와 `dma_orders` 행이 각자 맞게 갱신되는가 ② 좁히기 실패 warn 이 프로덕션 로그에 **얼마나 자주** 뜨는가 — 잦다면 실서버 통보가 축을 비워 보내고 있다는 신호이므로 축 우선순위를 재검토한다(지금은 그런 통보가 timeout 으로 끝난다).

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*

## Self-Check: PASSED

- `relay/src/ws/order-handler.ts` FOUND · `relay/tests/ws-order.test.ts` FOUND · `16-22-SUMMARY.md` FOUND
- 커밋 `51a17be` FOUND · `c833c18` FOUND
