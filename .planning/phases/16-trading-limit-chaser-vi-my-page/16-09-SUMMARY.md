---
phase: 16-trading-limit-chaser-vi-my-page
plan: 09
subsystem: webapp
tags: [relay, wss, context, subscription, refcount, strategy-frames]
requires:
  - "16-03: relay 와이어 계약 (RelayOutbound 전략 프레임 7종 · RelayInbound order.new/cancel)"
  - "16-07: 인증 직후 전략 스냅샷 3프레임 팬아웃 (lc.snap · vi · vi.list)"
  - "16-08: 주문 wss 이관 (order.new/order.cancel → order.result 상관 응답)"
provides:
  - "RelayProvider: 앱 전역 relay wss 1연결 (로그인 조건부)"
  - "useRelayContext(): 구독 없이 연결·전략 상태 읽기 (사이드바·My page 원천)"
  - "useRelaySubscription({isin,exchange,enabled}): 종목 구독 + 키 격리 소비자 훅"
  - "useRelayConnection({enabled}): 종목 축 없는 연결 계층"
  - "relayQuoteKey(isin, exchange): 시세·체결·구독 참조계수 공용 키"
  - "sendOrder(msg): rid 상관 주문 Promise (미연결=rejected / 미응답=timeout)"
affects:
  - "16-10 이후 상따·VI·사이드바·My page 표면 전부 (전역 상태 원천)"
  - "webapp/src/components/stock/stock-orderbook-section.tsx (소비 경계 이동)"
tech-stack:
  added: []
  patterns:
    - "Provider + 컨텍스트 + 훅 + Provider 밖 안전 폴백 (use-watchlist-set.tsx 골격)"
    - "구독 참조계수 Map<key,count> — relay SubscriptionHub#refs 를 브라우저에서 재현"
    - "키별 상태 맵 + 소비자 경계 선택 (전역 상태의 종목 격리)"
key-files:
  created:
    - webapp/src/lib/relay-provider.tsx
    - webapp/src/lib/__tests__/relay-provider.test.tsx
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/app/layout.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/stock/__tests__/orderbook.test.tsx
    - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
decisions:
  - "구독 참조계수를 Provider 가 아니라 useRelayConnection 안에 둔다 — socketRef·authEpoch 와 같은 곳에 있어야 재접속 재구독이 한 경로(flushSubscriptions)로 처리된다"
  - "quoteCacheRef 를 없애고 quotes 맵 자체를 캐시로 쓴다 — 거래소 토글 왕복 깜빡임 0 이 별도 캐시가 아니라 구조로 보장된다"
  - "종목 전환 시 account 를 리셋하지 않는다 — 계좌는 종목 축이 없어서 리셋하면 다음 델타까지 계좌 패널이 빈다"
  - "vi.list 병합 키를 relay viOrderKey/viPendingKey 와 동일하게 재현한다 (mergeAccount ↔ #mergeAccountState 와 같은 쌍 규율)"
  - "sendOrder 를 자리표시가 아니라 동작하는 구현으로 넣는다 — 미연결(rejected)과 미응답(timeout)을 갈라 표면화"
metrics:
  duration: ~40m
  tasks: 3
  commits: 3
  completed: 2026-09-08
---

# Phase 16 Plan 09: relay 전역 컨텍스트 승격 Summary

`useRelaySocket`(631줄, 호가주문 탭 전용)을 **앱 전역 `RelayProvider` + 구독 참조계수**로 승격해, 사이드바·My page 가 종목 구독 없이도 상따·VI 상태를 볼 수 있게 했다(D-22/D-23). 호가주문 탭은 **비주석 2줄**만 바뀌었고 E2E 회귀 게이트 18건이 green 이다.

## 무엇을 만들었나

### 1. `useRelayConnection` — 종목 축 없는 연결 계층

`use-relay-socket.ts` 에서 `isin`/`exchange` 의존을 걷어냈다. 연결·인증·재접속·백오프·`mergeAccount` 는 **그대로** 옮겼다(재작성 금지 — PATTERNS 지시).

바뀐 것:

| 항목 | 승격 전 | 승격 후 |
|---|---|---|
| 시세 | `quote: RelayQuote \| null` + 별도 `quoteCacheRef` | `quotes: Map<"isin\|ex", RelayQuote>` (맵이 곧 캐시) |
| 체결 | `tape: RelayTapeEntry[]` | `tapes: Map<"isin\|ex", RelayTapeEntry[]>` |
| 구독 | 단일 키 `subscribedRef` | 참조계수 `Map<key,{isin,ex,count}>` + 와이어 상태 `wireSubs` |
| 지연 프레임 필터 | 훅 안 `wantedKeyRef` | **소비자 경계**(`useRelaySubscription` 의 키 조회) |
| 전략 | 없음 | `limitChasers` · `viTrigger` · `viOrders` · `viNotices` · `strategiesDisabled` |
| 주문 | REST(D-08) | `sendOrder` rid 상관 Promise(D-02) |

`applyFrame` 에 전략 프레임 6종(`lc`·`lc.snap`·`vi`·`vi.list`·`vi.notice`·`strategies.disabled`)을 추가했고, 미지 `t` 를 무시하는 `default:` 는 유지했다(T-15-41).

### 2. `RelayProvider` — 로그인 조건부 전역 1연결

`useAuth().user` 가 연결 게이트다. 비로그인은 소켓을 열지 않고, 로그아웃하면 cleanup 이 `unsub` → `close(1000)` 을 밟은 뒤 상태를 초기화한다. `useRelayContext()` 는 Provider 밖에서 `?? EMPTY_RELAY_VALUE` 로 폴백해 **throw 0건**이다.

### 3. `useRelaySubscription` — 반환 계약 동일

`RelaySocketState` 모양을 그대로 유지해 소비자 교체가 한 줄이 됐다. `quote`/`tape` 는 자기 키만 조회하므로 종목 A 의 호가가 종목 B 화면에 뜰 여지가 **구조적으로** 없다(T-16-02).

## 계획에서 벗어난 것

### Rule 2 — 누락된 필수 기능 보강

**1. `sendOrder` 를 「자리만」이 아니라 동작하는 구현으로 넣었다**
- 발견: Task 1
- 이유: 자리표시(no-op)로 두면 주문이 **조용히 사라진다**. PC-7(무로그 fail-safe 금지) 위반이다. D-02 가 규정한 「rid 상관 + 5초 응답」은 계약이 이미 확정된 부분이라 추측이 아니다.
- 구현: rid 상관 Promise + 소켓 단절/정리 시 전량 정산 + 10초 백스톱 타이머(relay 상한 5초의 두 배). **reject 하지 않고** 결과 프레임으로 표면화하며, `미연결 → rejected`(보내지 않은 것이 확실)와 `미응답 → timeout`(결과 모름)을 **가른다** — 뭉개면 UI 가 재주문 안전성을 판단할 수 없다(Pitfall 9).
- 파일: `webapp/src/lib/use-relay-socket.ts` / 커밋 `eb56bf1`

**2. 로그아웃 시 세션 데이터 전량 폐기 (`reset` 액션)**
- 발견: Task 1
- 이유: `enabled` 가 false 로 떨어질 때 상태를 그대로 두면 **다음 로그인 사용자가 이전 사용자의 잔고·전략 목록**을 잠깐 본다(T-16-04 인접).
- 파일: `webapp/src/lib/use-relay-socket.ts` / 커밋 `eb56bf1`

**3. `vi.list` 병합 키를 relay 와 동일하게 재현**
- 발견: Task 1 (relay `subscription-hub.ts` 대조 중)
- 이슈: 계약 문서는 "`orderNo` 키 upsert" 라고만 적혀 있는데, **접수 전 행은 `orderNo` 가 `""`** 다. 그대로 키로 쓰면 서로 다른 종목의 접수 전 항목이 한 줄로 겹쳐 사라진다.
- 수정: relay 의 `viPendingKey`(`@ISIN:계좌:발동가`) 규칙을 그대로 옮기고, 주문번호가 붙는 순간 자리표시 행을 걷어낸다. `mergeAccount` ↔ `#mergeAccountState` 와 같은 「한 글자도 다르면 안 되는 쌍」이므로 주석으로 명시했다.
- 파일: `webapp/src/lib/use-relay-socket.ts` / 커밋 `eb56bf1`

**4. `lc` upsert 자리 보존 / `lc.snap` 의 `D` 행 제외**
- 발견: Task 1
- 이유: filter+append 로 upsert 하면 에코가 올 때마다 사이드바 목록 순서가 튄다. 또 `lc` 는 `D` 를 지우는데 `lc.snap` 은 담으면 두 경로의 뜻이 갈린다 — `limitChasers` 는 언제나 「등록된 전략」으로 통일했다.
- 파일: `webapp/src/lib/use-relay-socket.ts` / 커밋 `eb56bf1`

### Rule 3 — 리팩터가 깨뜨린 것 복구

**5. `stock-detail-client.test.tsx` 의 `unauthorized` 경로 재확보**
- 발견: Task 2
- 이슈: 이 테스트는 Provider 없이 `StockDetailClient` 를 렌더한다. 승격 전에는 세션 없음 mock 이 섹션 훅을 `unauthorized` 로 몰았지만, 이제 소켓은 Provider 소유라 폴백이 `idle` 이다 → C13 게이트(Test 2e)가 스켈레톤으로 바뀐다.
- 수정: `useRelaySubscription` 을 직접 스텁해 `unauthorized` 를 주입. 세션 mock 경유보다 오히려 결정론적이고, 단언은 그대로 살렸다.
- 파일: `webapp/src/components/stock/__tests__/stock-detail-client.test.tsx` / 커밋 `ff213ff`

**6. `orderbook.test.tsx` 스텁 경계 이동** — 소비 경계가 `@/lib/relay-provider` 로 옮겨졌으므로 mock 대상도 옮겼다. 반환 계약이 같아 스텁 **모양은 그대로**다. 커밋 `ff213ff`

### 계획과 다르게 판단한 것

**7. 종목 전환 시 `account` 리셋을 제거했다 (의도된 설계 변경)**
- 승격 전 `switch` 액션은 종목이 바뀌면 `account`/`orders` 를 null/[] 로 되돌렸다. 전역 연결에서는 계좌 상태에 **종목 축이 없으므로** 이 리셋이 오히려 해롭다 — 델타는 변경이 있을 때만 오므로 종목을 옮길 때마다 계좌 패널이 오래 빈 채로 남는다.
- plan 도 같은 방향을 명시했다("`account` 는 전역 값을 그대로 통과시킨다"). 승격 전 테스트 ⑦ 의 `account === null` 단언만 폐기했고, **같은 테스트의 quote/tape 격리 단언은 더 강한 형태로 살렸다**(provider ⑤·⑤-a).

**8. Task 1 커밋은 단독으로 typecheck 가 통과하지 않는다**
- plan 의 task 경계상 Task 1(추출)과 Task 2(소비자 교체)가 나뉘어 있어, 중간 커밋에서 `stock-orderbook-section.tsx` 가 사라진 export 를 참조한다. 커밋 본문에 그 사실을 적었고 `ff213ff` 에서 즉시 green 으로 복귀한다. HEAD 는 항상 green 이다.

## 테스트 실효성 실측 (변이 주입 9종)

plan 의 blindspot 지시("첫 실행에 전부 green 이면 변이 주입으로 실효성 실측")를 따랐다. **첫 판에서 실제로 구멍이 나왔다.**

| # | 주입한 변이 | 결과 |
|---|---|---|
| 1 | 참조계수 중복 송신 방어 제거(`wireSubs.has` 가드) | ❌ **놓침** → 테스트 보강 후 잡음 |
| 2 | 키 없으면 아무 시세나 반환(격리 파괴) | ✓ 2건 실패 |
| 3 | VI 자리표시 키 → 평범한 `orderNo` | ✓ 1건 실패 |
| 4 | `viTrigger` 초기값 `undefined` → `null`(3상태 뭉갬) | ✓ 1건 실패 |
| 5 | `lc` 의 `crud:"D"` 제거 분기 삭제 | ✓ 1건 실패 |
| 6 | 로그인 게이트 제거(`enabled: true` 고정) | ✓ 2건 실패 |
| 7 | Provider 밖 폴백 → throw | ✓ 1건 실패 |
| 8 | `onclose` 의 `wireSubs.clear()` 삭제 | — 등가 변이(`open()` 이 이미 clear) |
| 9 | authEpoch 구독 플러시 effect 무력화 | ✓ 5건 실패 |

**변이 1 이 드러낸 것:** 최초 작성한 케이스 ③ 은 소비자 둘을 **인증 전에** 붙였다. 그러면 플러시가 참조계수 맵을 한 번 훑을 뿐이라 「이미 와이어에 걸린 키는 다시 보내지 않는다」 방어가 **한 번도 실행되지 않는다** — 규율을 통째로 지워도 통과하는 공허한 단언이었다. 두 번째 소비자를 **연결이 살아 있는 상태에서** 붙이도록 고쳐 잡았고, 그 이유를 테스트 주석에 박아 뒀다.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `pnpm typecheck` (모노레포 전체) | exit 0 |
| `pnpm --filter @gh-radar/webapp test` | 46 파일 / 414 passed, 1 skipped |
| `playwright test orderbook` (**회귀 게이트**) | 8/8 passed |
| `playwright test stock-detail-tabs` | 10/10 passed |
| `relay-provider.test.tsx` | 15건 (요구 8건 이상) |
| `relay-socket.test.ts` | 21건 (승격 전 단언 전량 유지 + 신규 6건) |

acceptance criteria 대조:

- `useContext(RelayContext) ?? EMPTY_RELAY_VALUE` 폴백 존재 ✓ (throw 0건)
- 전략 프레임 case 6종 ✓ / `applyFrame` 의 `default:` 유지 ✓
- ref-count `sub` 0→1 · `unsub` 1→0 단위 테스트 단언 ✓ (실제 송신 프레임 배열 길이로)
- `mergeAccount` 본문 변경 0 (이동만) ✓
- `layout.tsx` 의 `RelayProvider` 4회 등장, `AuthProvider` 안쪽 ✓
- `useRelaySocket(` 호출부 0건 ✓ (주석 언급 3건만 남음 — 별칭 정의 없음)
- `stock-orderbook-section.tsx` 의 `useRelaySubscription` **호출 1곳** ✓
  - ※ plan 의 `grep -c == 1` 은 문자열 3건(주석 1 + import 1 + 호출 1)으로 나온다. 의도(단일 훅 호출)는 충족.

## 알려진 고려사항 (스텁 아님)

- **리렌더 범위:** 전역 상태라 시세 틱마다 컨텍스트 소비자가 리렌더된다. 다만 시세는 **구독 중일 때만** 흐르므로(= 호가주문 탭) 현재 표면에서는 승격 전과 부하가 같다. 사이드바가 상시 구독을 걸게 되면 그때 상태 분할(별도 컨텍스트 또는 selector)을 검토해야 한다.
- **`sendOrder` 는 아직 소비자가 없다.** 16-10 의 주문 패널이 첫 소비자다. 동작·테스트는 갖춰져 있다.

## Threat Flags

없음 — 새 네트워크 표면·인증 경로·스키마 변경이 없다. plan 의 `<threat_model>` 이 `mitigate` 로 지정한 T-16-02(키 격리)·T-16-04(비로그인 미연결·로그아웃 폐기)·T-16-05(미지 프레임 무시)는 전부 구현 + 테스트로 고정했다.

## Self-Check: PASSED

- `webapp/src/lib/relay-provider.tsx` FOUND
- `webapp/src/lib/__tests__/relay-provider.test.tsx` FOUND
- `webapp/src/lib/use-relay-socket.ts` FOUND
- commit `eb56bf1` FOUND / `ff213ff` FOUND / `75e8664` FOUND
