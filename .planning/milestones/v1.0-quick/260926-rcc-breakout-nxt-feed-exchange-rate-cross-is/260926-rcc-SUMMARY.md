---
phase: quick-260926-rcc
plan: 01
subsystem: trading-breakout
status: complete
tags: [relay, webapp, breakout, rate-cross, nxt, gh-trade-sync]
requires:
  - gh-trade quick-260923-cfo (NXT 확장 · 결정 A — 서버 상태 ISIN 당 1개, 2026-09-25 프로덕션)
provides:
  - relay 돌파 캐시 키 = ISIN · 78 팬아웃 = 캐시 getter 동일 원천
  - webapp 리듀서 ISIN upsert · 스트립 행 키 = ISIN
  - 행의 발화 거래소 피드 구독·가격·이탈 판정 · 전환 시 판정 상태만 재시작
  - 카드 구독 예산 제외 = (ISIN, 거래소) 피드 단위
affects:
  - relay/src/hub/subscription-hub.ts
  - webapp/src/lib/use-relay-socket.ts
  - webapp/src/lib/breakout-list.ts
  - webapp/src/lib/use-breakout-quotes.ts
  - webapp/src/components/trading/workbench/breakout-strip.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - packages/shared/src/relay.ts
tech-stack:
  added: []
  patterns:
    - "피드 키(breakoutFeedKey) 단일 정의 — prices/subscribed/overflow/excludeFeeds 공통"
    - "구독 장부 Map<피드키, 실제로 건 (isin, exchange)> — 해제 대칭"
key-files:
  created: []
  modified:
    - relay/src/hub/subscription-hub.ts
    - relay/tests/rate-cross.test.ts
    - relay/tests/fanout.test.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - packages/shared/src/relay.ts
    - webapp/src/lib/breakout-list.ts
    - webapp/src/lib/__tests__/breakout-list.test.ts
    - webapp/src/lib/__tests__/trading-alerts.test.ts
    - webapp/src/lib/use-breakout-quotes.ts
    - webapp/src/lib/__tests__/use-breakout-quotes.test.tsx
    - webapp/src/components/trading/workbench/breakout-strip.tsx
    - webapp/src/components/trading/__tests__/breakout-strip.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
decisions:
  - "돌파 원소 동일성은 relay 캐시 · 78 팬아웃 · 인증 스냅샷 · 브라우저 리듀서 · 스트립 행 키 전 구간에서 ISIN 한 축 (gh-trade cfo 결정 A)"
  - "발화 거래소 전환 시 무장·유예(feedSince)만 재시작하고 자리·첫 돌파시각·강조·무음·알림은 유지 — gh-radar 는 캐시 시세 맵이라 낡은 값 즉시 삭제를 막아야 한다"
  - "돌파 훅은 행의 발화 거래소 피드 하나만 price 구독 — 전환 시 옛 피드 해제 1 + 새 피드 구독 1, 해제는 실제로 건 쌍으로"
  - "카드 구독 예산 제외는 (ISIN, 거래소) 피드 단위, 「거래중」·카드 포커스는 ISIN 단위 유지"
metrics:
  duration: "약 35분"
  completed: 2026-09-26
plan_head_before: 7d2099f
actuals:
  tokens: 16682
  tasks: 3
  commits: 4
---

# Quick 260926-rcc: 돌파감지 NXT 발화 피드 · ISIN 한 축 정렬 Summary

gh-trade quick-260923-cfo(NXT 확장 · 결정 A)에 맞춰 돌파 원소 키를 relay→브라우저→스트립 전 구간에서 ISIN 하나로 통일하고, 스트립 행마다 **행의 발화 거래소 피드 하나만** price 구독해 그 피드 가격으로만 표시·이탈 판정하도록 바꿨다. 발화 거래소가 바뀌면 옛 피드를 풀고 새 피드를 걸며, 이탈 판정 상태(무장·3초 유예)만 다시 시작한다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (tracer) | `e9e4c78` | fix(quick-260926-rcc): 돌파 원소 키를 ISIN 한 축으로 — relay 캐시·78 팬아웃·브라우저 upsert (gh-trade cfo 결정 A) |
| 2 | `89f5680` | fix(quick-260926-rcc): 돌파 행 키를 ISIN 으로 — 발화 거래소 전환 시 이탈 판정(무장·유예)만 새 피드 기준으로 재시작 · 공유 계약 주석 NXT 반영 |
| 3 | `4d62ba7` | fix(quick-260926-rcc): 돌파 행은 발화 거래소 피드로 price 구독·가격·이탈 판정 — 전환 시 옛 피드 해제·새 피드 구독 · 카드 제외는 (ISIN, 거래소) |

- 각 커밋은 해당 태스크 files 5개만 담는다(`git show --stat` 확인). 삭제 파일 0. Co-Authored-By 없음.
- `actuals.commits: 4` 는 `git rev-list --count 7d2099f..HEAD` 실측값이다. 이 중 `a2a2aed`(feat(21-30) 종목상세 전체 뉴스)는 **같은 작업 트리의 다른 세션 커밋**이고, 이 plan 의 커밋은 위 3건이다.
- push·배포 없음.

## 무엇을 바꿨나

### Task 1 — ISIN 한 축 (relay → 브라우저 리듀서)
- `relay/src/hub/subscription-hub.ts`: `rateCrossKey(userId, isin)` = `${userId}|${isin}`. 뒤에 온 76 이 거래소째 덮는다. JSDoc 을 결정 A 로 교체.
- `#onRateCrossSnapshot`: 78 팬아웃 페이로드를 원 배열이 아니라 `this.getRateCrossItems(userId)` 로 만든다 — 인증 직후 스냅샷과 같은 원천이라 계약 위반 중복 ISIN 에도 ISIN 당 1원소(T-rcc-01). 캐시에는 서버 원본(보강은 사본에만 · D-30). `logger.info` count 는 원 배열 길이 그대로.
- `RelayExchange` import 는 이 파일 다른 곳에서 계속 쓰이므로 유지.
- `webapp/src/lib/use-relay-socket.ts`: `upsertRateCross` 필터를 `c.isin !== item.isin` 한 조건으로. `rateCrossItems` JSDoc 에 「종목당 1원소」. 78 경로는 무변경(D-14).

### Task 2 — 스트립 행 키 = ISIN · 피드 전환 판정 상태
- `breakout-list.ts`: `BreakoutMeta` 에 `feedExchange` · `feedSince`, `BreakoutRow` 에 `feedSince`. `breakoutKey` = ISIN. `shouldRemoveBreakout` 유예 기준 `feedSince`. `trackBreakoutMeta` 의 `priceOf` 는 항목(isin·exchange)을 받고, 전환 분기(`old.feedExchange !== it.exchange`)에서 `addedAt`·`silent` 유지 · `feedExchange`/`feedSince` 갱신 · `armed=false` · 전환 스텝 관측 미산입. 값 불변 시 기록 객체 신원 유지.
- `breakoutRowsFrom` 기본값에 `feedSince: 0` · `feedExchange: it.exchange`.
- `packages/shared/src/relay.ts`: 주석만(타입 불변) — `exchange` = 발화/구간 연 거래소(NXT 가능) · Msg upsert 키 = isin · SnapMsg ISIN 당 1원소.
- `breakout-strip.tsx`: 호출 모양만(`priceOf(it)` · `priceOf(row)`).

### Task 3 — 행 피드 구독·가격 · 카드 피드 제외
- `use-breakout-quotes.ts`: `BREAKOUT_EXCHANGE` 제거, `breakoutFeedKey` 추가, `breakoutQuotePrice(quotes, isin, exchange)`, 후보에 `exchange`, 예산 선정·가격 스로틀을 피드 단위로, `excludeIsins` → `excludeFeeds`. 시그니처 구분자는 `,`(피드 키 안에 `|`). held 장부는 `Map<피드키, {isin, exchange}>` — 해제는 언제나 실제로 건 쌍(T-rcc-03). want 쌍은 같은 렌더의 선정 결과를 `pickedRef`(선언 순서상 먼저 도는 effect 가 갱신)에서 읽는다 — 시그니처 문자열을 다시 분해하지 않는다. price level·상한 40·스로틀 규칙 그대로.
- `breakout-strip.tsx`: `cardFeeds` prop, 후보에 `exchange: it.exchange`, `priceOf = (it) => prices.get(breakoutFeedKey(it))`. 머리 주석 ②·⑧ 갱신. 코드 줄의 거래소 리터럴 0.
- `trading-workbench.tsx`: `cardFeeds = useMemo(() => new Set(cards.map((c) => breakoutFeedKey(c))), [cards])` → `<BreakoutStrip cardFeeds>`. `holdingQuotePrice` JSDoc 을 「KRX 는 기본 거래소다」로 정정. 카드 추가 기본 거래소는 무변경.

## 전환 규칙 결정

발화 거래소 전환(같은 ISIN, 거래소만 바뀜) 때 **무장·유예만 새 피드 기준으로 다시 시작**하고, 자리 · 첫 돌파시각 · 강조 · 무음 · 「오늘 울린 종목」 · 토스트는 그대로 둔다.

- gh-trade 는 자리유지 갱신에서 Armed 를 건드리지 않는다. 대신 이탈 판정이 새 피드의 **실시간 이벤트**에만 반응하므로, 무장을 유지해도 낡은 값으로 판정하는 일이 없다.
- gh-radar 는 전역 시세 맵(구독을 풀어도 값을 지우지 않는다)의 캐시값을 읽는다. 전환 직후 새 피드 키에 이전 구독이 남긴 낡은 값이 있으면, 무장 유지 상태에서는 그 값으로 행이 바로 지워진다. 지운 행은 서버가 새 프레임을 보낼 때까지 되살아나지 않는다.
- 그래서 판정 상태만 재시작한다(무장 해제 + `feedSince` 로 3초 유예 재시작, 전환 스텝 관측은 무장에 세지 않음). 표시는 gh-trade 의 자리유지 갱신과 같게 유지한다. 알림 쪽에서는 `newRateCrossAlerts` 가 ISIN 키라 전환만으로는 새 알림이 나가지 않는다(B7).

## 갱신한 기존 테스트와 이유

계약이 바뀌어서(ISIN 키 · feedSince · 피드 키 prices · excludeFeeds) 기존 단언을 고친 목록이다.

- `relay/tests/rate-cross.test.ts` ③: 「같은 종목이 양쪽 거래소에서 돌파하면 원소 둘」 단언을 결정 A(1원소 · 뒤 거래소)로 다시 썼다. 반대 방향(NXT→KRX)과 다른 ISIN 누적 단언도 넣었다.
- `relay/tests/rate-cross.test.ts` ⑤-2: 픽스처의 SAMPLE_ISIN 중복 원소를 `KR7035420009` 로 바꿨다. 서버 계약이 「ISIN 당 1원소」이기 때문이다. 기대 순서와 길이는 그대로다.
- `webapp/src/lib/__tests__/relay-socket.test.ts` ②: 제목만 「같은 isin …」으로 고쳤다. `crossItem` 헬퍼에 거래소 선택 인자를 추가했다(기본 KRX).
- `webapp/src/lib/__tests__/breakout-list.test.ts`: `row()` 픽스처를 `key: ISIN` 으로 바꾸고 `feedSince: 0` 을 더했다. 유예 케이스 2건은 `feedSince` 로 표현을 옮겼다. 메타 단언의 키를 ISIN 으로 바꿨다. `toEqual` 메타 단언에는 `feedSince`·`feedExchange` 를 포함했다.
- `webapp/src/lib/__tests__/trading-alerts.test.ts` newRateCrossAlerts: `prevKeys` 를 ISIN 집합으로 바꿨다. 같은 ISIN 인데 거래소만 NXT 인 항목은 더 이상 새 알림이 아니다(B7 분리 케이스).
- `webapp/src/lib/__tests__/use-breakout-quotes.test.tsx`: 헤더 명제 ③을 「행의 발화 거래소로 구독」으로 바꿨다. 상한 케이스의 후보에 `exchange`, `excludeIsins`→`excludeFeeds`, overflow 기대값을 피드 키로 바꿨다. 스로틀 케이스의 `prices.get(A)` 는 `prices.get(fk(A))` 로 바꿨다. 「NXT 시세는 KRX 후보의 현재가가 아니다」는 피드 키 조회로 표현만 바꿔 유지했다. 소스 규율 테스트는 고치지 않았다.
- `webapp/src/components/trading/__tests__/breakout-strip.test.tsx`: `quote`/`setPrice` 에 거래소 선택 인자(기본 KRX)를, setup 기본 props 에 `cardFeeds: new Set()` 을 더했다. 기존 케이스는 고치지 않았다.

## 신규 테스트

- relay: ③(R1) 재작성 · ⑤-5(R3 계약 위반 중복 ISIN → getter·팬아웃 동일 1원소) · fanout ⑭-2b(R4 소켓 왕복 — 76 KRX→NXT 뒤 새 탭 스냅샷 1원소 · NXT).
- webapp 리듀서: ⑤(W1) · ⑥(W2).
- breakout-list: B1(breakoutKey ISIN) · B4(전환) · B5(feedSince 유예) · B6(행 key/feedSince · 기본값) · priceOf 항목 인자 · 신원 유지.
- trading-alerts: B7.
- 훅: Q1(행 거래소 구독) · Q2(전환 해제1+구독1 · 언마운트는 실제로 건 피드) · Q3(카드 피드 제외) · Q4(NXT 피드 가격만).
- 스트립: S1(NXT 행 가격·잔존) · S2(전환 — 행 1개 · NXT 구독 · KRX 해제 · 유예 재시작 · 첫 돌파시각 유지) · S3(KRX 카드 + NXT 행 → NXT 구독 · 거래중).

RED 는 구현 전에 확인했다. Task 1 에서 R1·R3·R4(relay 3 실패)와 W1·W2(webapp 2 실패), Task 2 에서 10 실패, Task 3 에서 훅 10 실패(`breakoutFeedKey is not a function` 포함)와 스트립 3 실패가 났다.

## 검증 결과

| 게이트 | 결과 |
|--------|------|
| `pnpm --filter @gh-radar/shared build` | 통과 |
| relay `typecheck` · `typecheck:tests` | exit 0 · exit 0 |
| webapp `typecheck` (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | exit 0 — plan 밖 파일 오류 없음 |
| relay vitest 전량 | 28 files · **630 passed** |
| webapp vitest 전량 | 123 files · **2376 passed · 1 skipped**. skipped 1건은 이 plan 이 추가한 것이 아니다 |
| Task 3 대상 (훅 · 스트립 · 작업대) | 3 files · 173 passed |
| 리터럴 grep | 훅 코드 줄의 `"KRX"` 0건(계획 시점 1건) · 스트립 코드 줄의 거래소 리터럴 0건 |
| eslint (변경 파일) | 0 errors. 경고 2건(`trading-workbench.tsx:812` `dirtyCardCount` 미사용, `use-relay-socket.ts:1762` ref cleanup)은 원래 있던 것이고 이번 변경 줄이 아니다 |
| **Playwright trading-workbench** | **미실행 — 포트 점유**. `lsof -iTCP:3100` 에 다른 프로세스(node PID 97752)가 LISTEN 중이었다. 8090 은 비어 있었다. 규칙대로 죽이지 않았다 |

webapp vitest 전량은 다른 세션이 작업 트리에서 고치고 있던 `webapp/src/components/stock/**` 변경분이 섞인 상태로 돌았고, 그래도 전량 통과했다.

## 배포 순서

1. **relay 먼저 배포**한다(ISIN 키 캐시 · 78 팬아웃 getter 원천).
2. `/healthz` 등으로 relay 가 떴는지 확인한다.
3. 그 다음 `git push` 한다. 이 저장소에서는 push 가 곧 webapp 프로덕션 배포다.

- 구 relay 와 새 webapp 조합은 금지다. 구 relay 캐시는 거래소 키라서 인증 직후 스냅샷에 같은 ISIN 이 두 원소로 올 수 있다. 그러면 스트립 행 키(ISIN)가 겹쳐 React key 가 중복된다. 그래서 반대 순서로 배포하면 안 된다(T-rcc-04).
- 새 relay 와 구 webapp 조합은 무해하다. 구 webapp 은 isin+exchange 로 upsert 하므로 원소가 줄기만 한다.
- **이번 실행에서는 push 도 relay/server/webapp 배포도 하지 않았다.**

수동 확인은 배포 뒤 사용자가 한다. 평일 08:00~08:50 또는 15:40 이후에 NXT 로 발화한 돌파 행이 NXT 가격으로 움직이고 3초 뒤 사라지지 않는지 본다. 09:00 이후에는 같은 종목이 두 줄로 보이지 않는지 본다.

## 후속 후보

1. **돌파 행에서 카드를 추가할 때 발화 거래소로 열기.** gh-trade 는 발화 거래소의 상따창을 연다. 이번에는 `ensureIsinCard` 기본 KRX 를 그대로 뒀다.
2. **이탈로 지운 행이 새 구간 76 으로 되살아날 때 강조·무장을 새 행처럼 다시 시작할지.** 지금은 ISIN 기록(`addedAt`·`silent`·첫 돌파시각)을 유지한다. gh-trade 는 빠졌다가 다시 오면 새 행으로 다룬다.

## Deviations from Plan

### 계획과 다르게 한 점

**1. [Rule 3 - 차단 해소] fanout 신규 테스트 ID 를 ⑭-4 대신 ⑭-2b 로**
- **발견:** Task 1
- **문제:** plan 은 「⑭-2 뒤에 ⑭-4」 를 지시했지만 `relay/tests/fanout.test.ts` 에는 이미 `⑭-4`(콜드 세션 lc.snap)와 `⑭-5`(nxt.snap)가 있었다. 같은 ID 를 쓰면 둘이 섞인다.
- **조치:** ⑭-2 바로 뒤에 `⑭-2b` 로 넣었다. 동작과 단언은 R4 그대로다.
- **커밋:** e9e4c78

**2. [동시성 보호] Task 3 커밋은 `git commit --only -- <5경로>`**
- **발견:** Task 3 커밋 직전 `git diff --cached` 확인
- **문제:** 다른 세션이 `webapp/src/components/stock/__tests__/discussion-page-client.test.tsx → discussion-full-list.test.tsx` rename 을 인덱스에 올려 둔 상태였다. 평소대로 `git commit` 하면 그 rename 이 내 커밋에 딸려 들어간다.
- **조치:** 남의 인덱스는 건드리지 않고 `--only` 로 내 5경로만 커밋했다. 커밋 뒤에도 그 rename 은 그대로 staged 상태다.
- **커밋:** 4d62ba7

**3. [실행 환경] 기본 브랜치(master) 직접 커밋**
- `gsd-tools git.base-branch --is-protected master` 는 true 를 돌려준다. 그래도 `branching_strategy: none` 이고 최근 이력이 전부 master 직접 커밋이며, 오케스트레이터가 이 트리에서 태스크별 커밋을 지시했다. worktree drift 가 아니라 의도된 실행 위치라고 보고 진행했다.

그 밖의 동작은 plan 대로다.

## Threat Flags

없음. 새 네트워크 엔드포인트·인증 경로·스키마 변경이 없다. T-rcc-01~06 의 mitigate 항목은 모두 반영했다(R3·R4 / B4·B5·Q4·S1·S2 / Q2 / 배포 순서 기록 / 명시 경로 커밋).

## Known Stubs

없음.

## Self-Check: PASSED

- 변경 파일 14개 존재 확인.
- 커밋 `e9e4c78` · `89f5680` · `4d62ba7` 이 `git log` 에 있다.
