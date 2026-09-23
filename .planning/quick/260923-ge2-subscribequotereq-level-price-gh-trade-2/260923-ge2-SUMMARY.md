---
phase: quick-260923-ge2
plan: 01
subsystem: relay-hub / relay-ws / webapp-relay-socket
status: complete
tags: [relay, flatbuffers, subscription, refcount, websocket, trading, perf]
requires:
  - gh-trade 회신 tasks/gh-trade-price-only-quote-subscription-reply.md (quick-260923-exo · server-repo-commit 228ea1f5)
  - quick-260923-elb (CPU 1단계 — 남은 과제 2b)
provides:
  - SubscribeQuoteReq(29) level 바이트 송신 (FULL 0 / PRICE 1)
  - relay hub 키당 {full, price} 참조계수 · 실효 level 전이 규칙
  - 브라우저 sub 프레임 lv(full|price) · price 소켓 tape 차단
  - webapp subscribe/unsubscribe(level) 합성 · 돌파 칩 price 구독
affects:
  - relay/src/hub/subscription-hub.ts
  - relay/src/ws/fanout.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/use-breakout-quotes.ts
tech-stack:
  added: []
  patterns:
    - "level 별 참조계수 + 실효 level(full 우선) 합성 — relay hub 와 webapp 이 동형"
    - "같은 소켓 level 갱신은 새 level 을 먼저 올리고 옛 level 을 내린다 (합계가 0 을 지나지 않게)"
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/subscribe-quote-req.ts
    - relay/src/dma/envelope.ts
    - relay/src/hub/subscription-hub.ts
    - relay/src/ws/protocol.ts
    - relay/src/ws/fanout.ts
    - relay/tests/hub.test.ts
    - relay/tests/fanout.test.ts
    - relay/tests/protocol.test.ts
    - relay/tests/helpers/ws-client.ts
    - packages/shared/src/relay.ts
    - packages/shared/src/index.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/use-breakout-quotes.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
decisions:
  - "업스트림 level = full 소비자 ≥1 ? FULL : PRICE. 모르는 level 은 FULL 로 접는다 (서버 규칙과 동형)"
  - "브라우저 표면의 열거 밖 lv 는 close 4400 (관대하게 접지 않는다 — ex 와 같은 규율)"
  - "price 소켓 tape 차단은 relay #deliver 가 자체 보장 — 게이트웨이 가동본이 level 을 몰라도 유지"
  - "69/71 중복 제거는 범위 밖 — 관찰 사항으로 남김"
metrics:
  duration: "약 10분 (03:04Z~03:14Z)"
  completed: 2026-09-23
  tasks: 3
  files: 16
actuals:
  tokens: 18300
  tasks: 3
  commits: 3
plan_head_before: 62d8a774d4a45c846174e0ce1b90748d79034169
---

# Phase quick-260923-ge2 Plan 01: SubscribeQuoteReq level(PRICE) 전 구간 적용 Summary

gh-trade 가 확정한 `SubscribeQuoteReq.level`(0 FULL / 1 PRICE) 을 relay 업스트림·relay 브라우저 표면·webapp 까지 관통시켰다. relay 는 키당 {full, price} 참조계수로 실효 level 을 합성해 29 를 보내고(승격 28→29(0)→32 재송신 · 강등 29(1) 1건), price 로 잡은 소켓에는 tape 를 흘리지 않는다. 돌파 칩(최대 40종목)은 이제 가격 전용 구독이다.

## 커밋

| Task | 커밋 | 내용 | 파일 |
|------|------|------|------|
| 1 | `9c77549` | SubscribeQuoteReq level 동기화(gh-trade 228ea1f5) — hub 참조계수 full/price 분리 · 실효 level 29 송신 · 승격/강등 재송신 | 생성 코드 2 · envelope · hub · shared(relay.ts·index.ts) · hub.test |
| 2 | `baf9b08` | 브라우저 sub 프레임 lv(full\|price) — 소켓별 level 갱신 · price 소켓 tape 차단 | shared relay.ts · protocol · fanout · ws-client · fanout.test · protocol.test |
| 3 | `3718b36` | webapp 참조계수 full/price 합성 · 실효 level sub 재송신 · 돌파 칩 price 전환 | use-relay-socket · use-breakout-quotes · 테스트 2 |

모든 커밋은 명시 경로로만 stage 했고 push 는 하지 않았다. 다른 세션 미추적 파일(`.planning/quick/260923-{cqj,dmb,elb,ge2}-*`, `tasks/gh-trade-price-only-quote-subscription-{prompt,reply}.md`)은 그대로 미추적이다.

## 전이 규칙 (hub 헤더 D-33 아래 level 블록이 정본)

| 전이 | 게이트웨이로 나가는 프레임 |
|------|------------------------|
| 0→1 PRICE | 28 → 29(level=1) (32 없음) |
| 0→1 FULL | 28 → 29(level=0) → 32 |
| PRICE→FULL 승격 | 28 → 29(level=0) → 32 재송신 |
| FULL→PRICE 강등 | 29(level=1) 1건 |
| 마지막 이탈 | 29(subscribe=false) 1건 |
| ready 재구독 | 키마다 실효 level |
| Ready 이전 승격·강등 | 프레임 없음 — ready 가 실효 level 로 복원 |

## 테스트 수치

| 게이트 | 결과 |
|--------|------|
| `pnpm --filter @gh-radar/shared build` | 성공 |
| relay `typecheck` / `typecheck:tests` | exit 0 (TS2554 해소) |
| webapp `typecheck` (src + e2e) | exit 0 |
| relay vitest 전량 | **604 passed** (22 files) — Task 1 이후 594, Task 2 로 +10 (F1~F7 7 + protocol 3). hub.test L1~L8 8건 신규 |
| webapp vitest 전량 | **1516 passed · 1 skipped** (92 files) — 기준선 1510 + W1~W6 6 |
| Playwright `trading-workbench orderbook` | **49 passed (1.9m)** — 실행 전·후 3100/8090 비어 있음 확인 |

TDD RED 관측: Task 1 hub.test L1~L8 8 failed(typecheck:tests 는 TS2554·TS2339) → GREEN. Task 2 F1~F4·F7 + protocol 2건 failed(F5·F6 는 기존 동작 잠금이라 처음부터 통과) → GREEN. Task 3 W1~W6 6 failed → GREEN.

## 갱신한 기존 테스트와 이유

- `webapp/src/lib/__tests__/use-breakout-quotes.test.tsx` — `toHaveBeenCalledWith(X, "KRX")` 8곳을 `(X, "KRX", "price")` 로 바꿨다. vitest 는 인자 개수까지 대조하므로 **계약 변경(3번째 인자 level)** 에 따른 갱신이지 회귀가 아니다. 상한 케이스에 `every((c) => c[2] === "price")` 를 더했다.
- 같은 파일 카드 제외 케이스의 부정 단언 `not.toHaveBeenCalledWith(A, "KRX")` 는 3번째 인자가 생기면 인자 개수 차이만으로 늘 통과해 무력해진다. 그래서 `subscribe.mock.calls.map((c) => c[0])).not.toContain(A)` 로 바꿨다(A 를 한 번도 잡지 않았다는 원래 뜻을 인자 개수와 무관하게 지킨다).
- 소스 규율 테스트(`.send(` · `t: "sub"` 금지)는 손대지 않았고 통과한다 — 새 헤더 ⑥ 은 산문으로만 적었다.
- relay 기존 hub ①~⑭ · fanout ①~㉔ · protocol · webapp relay-socket ⑥·⑥-a·⑥-b·재접속·cleanup 은 **수정 없이** 통과한다(full 프레임 모양 불변 · `refCount` 는 합계).

## 관찰 사항

1. **69/71 중복 제거 — 없음(확인만 하고 고치지 않았다).** `SubscriptionHub#onTape` 는 69 스냅샷이면 링을 통째로 바꾸고 71 증분이면 **그대로 뒤에 붙인다**. 시각·순번 기준 중복 제거가 없다. gh-trade 회신 「부수 발견」: 서버의 테이프 미전송 카운터가 구독 전에도 늘어서, 신규 구독이나 PRICE→FULL 승격 직후 **첫 71 에 구독 전 최대 100건이 실려** 앞서 온 69 스냅샷과 겹칠 수 있다. 이번 변경으로 승격 경로(28→29→32 재송신)가 새로 생겨 겹칠 기회가 늘었다. 후속 과제 제안: hub 에서 링·pending 을 합칠 때 webapp `tapeRowKeys` 의 entryKey(`t|p|q|cv`)와 같은 식별로 중복을 거른다(서버 쪽 수정은 gh-trade 별도 과제).
2. **수기 사본 3곳 중 msg-type 은 무변경이다.** `relay/src/dma/msg-type.ts:93` `SubscribeQuoteReq: 29` 그대로다. MsgType 추가가 없어 손대지 않았다. envelope(빌더 level 인자)와 hub(전이 규칙)는 이번 plan 에서 고쳤다.
3. **생성 fbs 에는 level 말고도 주석 변경이 같이 들어 있다.** `RateCrossAlert`(76) / `RateCrossSnapshot`(78) 주석이 gh-trade quick-260923-cfo(판정 대상 = KRX G1/G4 + KRX 세션이 닫힌 시간의 NXT 접속매매, exchange = 발화 거래소) 기준으로 바뀌었다. 필드 변경은 없는 주석 전용이라 생성 코드 커밋에 그대로 실었다. 다만 **76/78 의 `exchange` 가 이제 "NXT" 일 수 있다**는 뜻이라, 돌파가 KRX 전용이라는 webapp `use-breakout-quotes` 헤더 ② 의 전제(`BREAKOUT_EXCHANGE = "KRX"`)는 따로 점검해야 한다(이번 범위 밖).
4. **호가창 카드가 연 종목은 돌파 훅이 애초에 구독하지 않는다.** `breakout-strip.tsx` 가 `excludeIsins: cards` 를 넘기므로 같은 소켓에서 full·price 가 한 키에 겹치는 경우는 카드 종목 말고 다른 FULL 소비자(예: 호가 탭) 쪽이다. 카드를 닫으면 카드 해제(full 0→unsub)와 돌파 훅 구독(price) 순서에 따라 와이어가 `unsub → sub(lv:price)` 두 프레임이 되거나 `sub(lv:price)` 강등 1프레임이 된다. 둘 다 올바른 최종 상태로 수렴한다.
5. **relay 테스트 기준선이 플랜의 534 가 아니라 586 이었다**(플랜 작성 뒤 다른 커밋들이 테스트를 더한 것으로 보인다). 이번 plan 의 증가분은 +18(hub 8 · fanout 7 · protocol 3)이다.

## 배포 후 확인 절차

지금은 실서버에서 PRICE 동작을 볼 수 없다. 게이트웨이 가동본(bd1c541d)이 level 을 모르는 구버전이라 level=1 을 보내도 FULL 로 오기 때문이다. 다만 구버전은 모르는 필드를 무시하므로 relay 를 먼저 배포해도 깨지지 않는다.

**배포 순서:** relay 먼저 → 검증 → webapp push(push = Vercel 프로덕션 배포).
- 옛 webapp 은 `lv` 를 보내지 않아 전부 full 로 동작한다(무해).
- 반대 순서(webapp 먼저)도 안전하다. 옛 relay 가 zod strip 으로 `lv` 를 버려 full 로 동작한다. 그래도 관례상 relay 를 먼저 배포한다.

**확인 항목:**
1. **relay 로그**(Cloud Run / VM journal)에서 `level` 필드가 붙은 전이 라인을 grep 한다.
   - `[HUB] 신규 구독 — 스냅샷+구독(PRICE) 요청 송신` — 돌파 ISIN 이 PRICE 로 걸린다.
   - `[HUB] 신규 구독 — 스냅샷+구독(FULL)+체결 요청 송신` — 카드 종목.
   - `[HUB] PRICE→FULL 승격` · `[HUB] FULL→PRICE 강등 — 29(level=1) 1건` — 칩 종목의 카드를 열고 닫을 때.
   - `[WS] 같은 소켓 재구독 — level 갱신` (`prev`·`lv` 필드).
2. **브라우저 devtools → Network → WS → Messages**
   - 필터 `"lv":"price"` 로 보면 돌파 ISIN 의 송신 sub 프레임이 나온다.
   - 같은 ISIN 으로 필터하면 수신 `"t":"tape"` 가 없어야 한다. 게이트웨이가 구버전이어도 relay 가 막는다.
3. **게이트웨이 재기동 뒤**(gh-trade 가동본이 ffd31ef5 이상)
   - 돌파 ISIN 의 수신 `q` 는 체결 때만 와야 한다. 종목당 ≤5Hz(키당 ≥200ms)이고, 호가만 바뀐 틱에는 오지 않는다.
   - 호가창 카드가 열린 종목은 `tape` 와 10호가 `q` 가 계속 와야 한다(FULL 유지).
4. **게이트웨이→relay 구간**은 gh-trade 세션 로그로 본다(회신 §할 일 6). 돌파 종목의 71·75 송신이 0 인지, 59 가 가격 섹션 갱신 때만 나가는지 확인한다.

**범위 밖:** relay 배포와 webapp push 는 사용자 결정 사항이라 이번 plan 에서 하지 않았다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `packages/shared/src/index.ts` 에 `RelaySubLevel` re-export 추가**
- **Found during:** Task 1
- **Issue:** shared 는 `index.ts` 의 명시 export 목록으로만 타입을 내보낸다. `relay.ts` 에 타입을 추가해도 relay/webapp 이 import 할 수 없었다.
- **Fix:** `RelaySubMsg` 옆에 `RelaySubLevel` 을 추가했다(플랜 files 목록 밖 1줄).
- **Commit:** `9c77549`

**2. [Rule 1 - 약화 방지] use-breakout-quotes 카드 제외 부정 단언을 인자 개수 무관 형태로 교체**
- **Found during:** Task 3
- **Issue:** 3-인자 계약에서 `not.toHaveBeenCalledWith(A, "KRX")` 는 늘 통과해 무력해진다.
- **Fix:** `subscribe.mock.calls.map((c) => c[0])).not.toContain(A)`.
- **Commit:** `3718b36`

**3. [구조] fanout 에 `#sendTapeSnapshot` 헬퍼 추출**
- 신규 sub(full) 과 같은 소켓 price→full 승격, 두 곳에서 같은 링버퍼 tape 스냅샷 전송이 필요했다. 중복을 막으려고 private 메서드 하나로 묶었다. unsub 도 그 소켓이 잡은 level 로 hub 를 해제하게 했다(`held?.lv ?? "full"`). 플랜이 명시하지 않았지만 없으면 price 소켓의 명시적 unsub 가 hub 의 full 칸을 잘못 깎는다.

## Known Stubs

없음.

## Threat Flags

없음 — 새 표면은 plan `<threat_model>` T-ge2-01~04 범위 안이다(`lv` enum 검증 · 사용자 소켓 집합 내부 필터 · 전이 로그에 `level`).

## Self-Check: PASSED

- FOUND: 16개 수정 파일 전부 존재
- FOUND: 9c77549 · baf9b08 · 3718b36 (`git log`)
- `git diff HEAD -- relay/src/generated/` 비어 있음 · `git status --short` 에 M 없음(미추적은 다른 세션 파일 6건만)
