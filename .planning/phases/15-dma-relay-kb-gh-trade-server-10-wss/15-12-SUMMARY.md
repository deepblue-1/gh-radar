---
phase: 15-dma-relay-kb-gh-trade-server-10-wss
plan: 12
subsystem: webapp-realtime
tags: [websocket, react-hooks, supabase-auth, reconnect-backoff, ui, accessibility]
requires:
  - phase: 15-01
    provides: "packages/shared/src/relay.ts — RelayInbound/RelayOutbound 계약 + RELAY_STATE_LABELS + RELAY_WS_CLOSE"
  - phase: 15-11
    provides: "종목상세 4탭 셸 — 호가주문 탭 패널 자리(Radix Tabs 는 비활성 패널을 언마운트한다)"
provides:
  - "useRelaySocket — wss 인증·구독·reducer·유한 재접속·스냅샷 캐시·정리를 담은 브라우저 실시간 계층 단일 진입점"
  - "resolveRelayWsUrl — .trim() + 스킴 검증 + 1회 경고 후 로컬 폴백 (Vercel 개행 함정 방어)"
  - "RelayStatusBar — 연결 상태 배지 9종 + UI-SPEC verbatim 안내 문구 + ServerMessage 최근 3건 누적"
  - "OrderbookSkeleton — 3컬럼 골격, aria-busy + data-density=compact"
  - "RELAY_MAX_RECONNECT_ATTEMPTS / relayBackoffDelayMs — 재접속 상한·백오프의 단일 정본(상태 바가 같은 값을 쓴다)"
  - "RelayServerMessageEntry — ServerMessage + 브라우저 수신 시각(receivedAt)"
affects:
  - "15-13 호가 사다리·체결 테이프·섹션 셸 — quote/tape/isStale 을 이 훅에서 받는다"
  - "15-18 주문 패널·계좌 패널 — accounts/account/orders/status 를 이 훅에서 받는다"
  - "15-04 relay wss fanout — 브라우저가 인증 ACK(첫 state 프레임) 이후에만 sub 을 보낸다는 전제"
tech-stack:
  added: []
  patterns:
    - "인증 ACK 게이트 — 첫 state 프레임을 받기 전에는 sub 을 보내지 않는다(인증 전 구독은 relay 가 close 4400)"
    - "구독 키 전환은 재연결이 아니라 재구독 — 연결 effect 는 isin/exchange 에 의존하지 않는다"
    - "지연 도착 프레임 필터 — wantedKeyRef 와 다른 isin|ex 프레임은 화면에 올리지 않는다"
    - "유한 재접속 — 백오프 상한 30s · 시도 상한 10회 · 4401/4400 은 재시도 없이 확정"
    - "상태 라벨 단일 정본 — 브라우저는 상태 → 문구 switch 를 중복 구현하지 않는다(RELAY_STATE_LABELS)"
    - "상태 표면 색 격리 — 연결 상태 배지·문구에 방향색 토큰 0건(사다리 의미색과 충돌 차단)"
key-files:
  created:
    - webapp/src/lib/relay-url.ts
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/components/orderbook/relay-status-bar.tsx
    - webapp/src/components/orderbook/orderbook-skeleton.tsx
    - webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx
  modified: []
key-decisions:
  - "sub 을 onopen 이 아니라 **인증 ACK(첫 state 프레임) 이후**에 보낸다 — relay 의 토큰 검증이 비동기라 onopen 직후 sub 은 close(4400) 를 맞을 수 있다"
  - "백오프 카운터는 state.s === 'ready' 에서만 0 으로 되돌린다 — 아무 프레임에서나 리셋하면 '붙자마자 끊는' 서버 상대로 무한 재시도가 된다"
  - "종목 전환은 quote/tape/account/orders 전량 리셋, 거래소 토글은 quote/tape 만 리셋 — 계좌는 종목 스코프가 아니다"
  - "ServerMessage 에 브라우저 수신 시각(receivedAt)을 훅에서 한 번만 스탬프 — 서버가 시각을 주지 않는데 UI-SPEC C3 는 '시각·레벨·본문' 을 요구한다"
  - "상태 줄과 알림 영역에 aria-live 를 **형제로** 둔다 — 공통 조상에 하나만 두면 C3 계약을 못 지키고, 중첩하면 이중 안내가 된다"
  - "manual_required 는 failed 톤 재사용 + 문구만 교체 (UI-SPEC 명시)"
patterns-established:
  - "wss 훅 테스트: 전역 WebSocket 을 fake 클래스로 대체하고 테스트가 서버 프레임을 주입(chat-sse.test.ts 의 readerFromChunks 사상 확장)"
  - "재접속 상한/백오프를 훅에서 export 해 UI 가 같은 값으로 'k/10 (다음 n초)' 를 그린다"
requirements-completed: [RELAY-01]
duration: 27min
completed: 2026-09-05
---

# Phase 15 Plan 12: 브라우저 실시간 계층 (wss 훅 · 연결 상태 바) Summary

**wss 첫 메시지 인증 · 인증 ACK 게이트 구독 · 유한 재접속(30s/10회) · 스냅샷 캐시를 갖춘 `useRelaySocket` 훅과, 그 상태를 UI-SPEC 문구 verbatim 으로 그리는 연결 상태 바 + 호가창 스켈레톤. 단위 테스트 26건 green.**

## Performance

- **Duration:** 약 27분
- **Tasks:** 3
- **Files created:** 6 (총 1,800줄)
- **Commits:** 3

## 무엇을 만들었나

| 산출물 | 내용 |
|--------|------|
| `webapp/src/lib/relay-url.ts` | `resolveRelayWsUrl()` — `.trim()` + `ws:`/`wss:` 스킴 검증 + 모듈 1회 경고 후 `ws://localhost:8090/ws` 폴백 |
| `webapp/src/lib/use-relay-socket.ts` | wss 훅 — 인증·구독 동기화·reducer 6종 분기·백오프 재접속·스냅샷 캐시·정리 |
| `webapp/src/lib/__tests__/relay-socket.test.ts` | fake WebSocket 하네스 + 케이스 16건 |
| `webapp/src/components/orderbook/relay-status-bar.tsx` | L6 전폭 상태 바 — 배지 9종 + 안내 문구 + ServerMessage 최근 3건 |
| `webapp/src/components/orderbook/orderbook-skeleton.tsx` | 3컬럼 골격 (사다리 20행 / 테이프 8행 / 주문 폼) |
| `webapp/src/components/orderbook/__tests__/relay-status-bar.test.tsx` | 상태 바·스켈레톤 케이스 10건 |

## Task Commits

1. **Task 1: resolveRelayWsUrl + useRelaySocket 훅** — `d7514f9` (feat)
2. **Task 2: useRelaySocket 단위 테스트** — `862ce5c` (test)
3. **Task 3: 연결 상태 바 + 스켈레톤 컴포넌트** — `2f5767b` (feat)

## must_haves 이행

| 계약 | 이행 |
|------|------|
| SC-7 / D-11 토큰은 첫 메시지 본문 전용 | `onopen` 에서 `{t:"auth", token}` 1건. `grep -c 'token=' use-relay-socket.ts` = **0**. 테스트 ③ 이 URL 에 토큰 문자열 부재를 단언 |
| SC-7 / D-41 `.trim()` + 1회 경고 + 로컬 폴백 | `resolveRelayWsUrl()` 이 `api.ts:resolveBaseUrl` 규약을 그대로 이식. 스킴 검증까지 추가 |
| SC-7 / D-37 스냅샷 캐시로 깜빡임 0 | `Map<"isin\|ex", RelayQuote>` ref. 테스트 ⑤ 가 KRX→NXT→KRX 왕복에서 **프레임 없이 즉시 복원**을 단언 |
| SC-7 / D-36 상태 분기 중복 금지 | 라벨은 전부 `RELAY_STATE_LABELS`, `ServerMessage` 는 해석 없이 누적. 테스트 ① 이 9상태 라벨 일치를 단언 |
| SC-7 종목 전환 시 반드시 unsub + 상태 초기화 | 테스트 ⑦ 이 `unsub`→`sub` 순서 + `quote`/`tape`/`account` 잔존 0 + **지연 도착 프레임 차단**까지 단언 |

## 위협 대응 (threat register)

| Threat | 대응 | 증명 |
|--------|------|------|
| T-15-04 토큰 노출 | wss 첫 메시지 본문 전용, URL·쿼리스트링 금지 | `grep 'token='` 0건, 테스트 ③ |
| T-15-40 stale 상태로 오주문 | `isin` 변경 시 unsub + 전량 리셋 + `wantedKeyRef` 로 지연 프레임 차단 | 테스트 ⑦ |
| T-15-10 재접속 루프 | 백오프 상한 30s + 시도 상한 10회 + 4401/4400 재시도 없음 | 테스트 ⑨(재연결 0회) · ⑩(`manual_required`) |
| T-15-41 깨진 프레임 | `JSON.parse` 실패·비객체·미지의 `t` 전부 스킵 | 테스트 ⑭ |
| T-15-42 env 오설정 | `.trim()` + 스킴 검증 + 폴백 경고 | `relay-url.ts` |
| T-15-43 상태 오독 | 라벨 단일 정본 + 상태 표면 방향색 0건 | `grep -cE '\-\-(up\|down)\b'` = **0**, 테스트 ⑥·⑩ |

## Decisions Made

- **인증 ACK 게이트.** `onopen` 직후 `sub` 을 보내지 않고, relay 가 인증 성공 직후 1회 내려주는 상태 프레임(15-04 연결수명 5)을 ACK 로 삼아 그 뒤에 구독한다. relay 의 토큰 검증이 비동기이므로 `onopen` 직후 `sub` 은 "인증 전 구독"으로 판정돼 `close(4400)` 를 맞을 수 있다.
- **백오프 리셋은 `ready` 에서만.** 아무 상태 프레임에서나 카운터를 되돌리면 "붙자마자 끊는" 서버를 상대로 상한 10회가 무력화된다.
- **연결 effect 는 `isin`/`exchange` 에 의존하지 않는다.** 전환은 재연결이 아니라 재구독이다. 의존시키면 종목/거래소 토글마다 TLS 핸드셰이크 + 재인증이 발생한다.
- **`account` 리셋 범위.** 종목 전환에서만 리셋한다(계약상 계좌 상태는 종목 스코프가 아니지만, 보유 종목 목록이 이전 종목 맥락으로 읽히는 것을 막는 안전 우선 선택 — 플랜 명시).
- **`aria-live` 를 형제 2개로.** UI-SPEC 은 상태 바(§접근성)와 알림 영역(C3) 각각에 `aria-live="polite"` 를 요구한다. 공통 조상에 하나만 두면 C3 계약 위반, 중첩하면 이중 안내가 되므로 형제 배치로 둘 다 만족시켰다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] ServerMessage 수신 시각 스탬프 추가**
- **Found during:** Task 3 (연결 상태 바)
- **Issue:** UI-SPEC C3 는 알림을 `시각·레벨·본문` 으로 렌더하라고 못박았으나, `RelayServerMsg`(shared 계약)에는 시각 필드가 없다. 렌더 시점에 시각을 만들면 리렌더마다 값이 흔들린다.
- **Fix:** 훅이 `msg` 프레임 수신 시 한 번만 `receivedAt`(`HH:MM:SS`)을 스탬프하고, `RelayServerMessageEntry = RelayServerMsg & { receivedAt }` 로 노출. `RelayServerMsg` 의 상위집합이라 15-13/15-18 이 선언한 소비자 타입은 그대로 성립한다.
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`
- **Verification:** typecheck exit 0, 훅 테스트 16건 재실행 green, 상태 바 테스트 ④ 가 시각 노출을 단언
- **Committed in:** `2f5767b`

**2. [Rule 2 - Missing Critical] 재접속 상한·백오프 계산을 훅에서 export**
- **Found during:** Task 3 (`재접속 중 k/10`, `(다음 n초)` 문구)
- **Issue:** 상태 바가 `10` 과 백오프 초를 자체 하드코딩하면 훅과 두 정본이 생겨 어긋난다(15-RESEARCH "Don't Hand-Roll" 의 `ReconnectPolicy` 단일 정본 규율).
- **Fix:** `RELAY_MAX_RECONNECT_ATTEMPTS`, `relayBackoffDelayMs()` 를 export 하고 상태 바가 그대로 사용.
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`, `webapp/src/components/orderbook/relay-status-bar.tsx`
- **Verification:** 테스트 ③ 이 `3/10회 (다음 4초)` 를 단언(백오프 1s→2s→4s)
- **Committed in:** `2f5767b`

**3. [Rule 2 - Missing Critical] 지연 도착 프레임 키 필터**
- **Found during:** Task 1 (구독 전환)
- **Issue:** 플랜은 전환 시 리셋만 요구했으나, `unsub` 이후에도 in-flight 프레임이 도착하면 리셋 직후 **이전 종목 호가가 다시 채워진다**. 그 가격으로 주문하면 T-15-40 그 자체다.
- **Fix:** `wantedKeyRef` 를 두고 `q`/`tape` 프레임의 `i|x` 가 현재 화면 키와 다르면 dispatch 하지 않는다(캐시에는 저장).
- **Files modified:** `webapp/src/lib/use-relay-socket.ts`
- **Verification:** 테스트 ⑦ 후반부가 전환 후 이전 키 프레임 주입 → `quote` 가 계속 null 임을 단언
- **Committed in:** `d7514f9`

**4. [Rule 2 - Missing Critical] `resolveRelayWsUrl` 스킴 검증**
- **Found during:** Task 1
- **Issue:** 플랜이 스킴 검증을 명시했으나 URL 파싱 실패 경로는 미정의였다. `https://…` 나 깨진 값이 `new WebSocket()` 까지 흘러가면 "호가창이 조용히 안 뜬다"로 나타난다.
- **Fix:** `new URL()` 파싱 실패도 오설정으로 간주해 해석 시점에 throw. 훅은 이를 잡아 `failed` + 메시지로 표면화한다.
- **Files modified:** `webapp/src/lib/relay-url.ts`, `webapp/src/lib/use-relay-socket.ts`
- **Verification:** typecheck exit 0, 훅의 try/catch 경로가 상태 바 `failed` 톤으로 흐름
- **Committed in:** `d7514f9`

**5. [Rule 2 - Missing Critical] `enabled` false 전환 정리 테스트 추가 (Radix Tabs 언마운트)**
- **Found during:** Task 2
- **Issue:** 15-11 이 남긴 4탭 셸은 Radix Tabs 라 비활성 패널이 **언마운트**된다. 탭 이탈 시 소켓이 완전히 해제되고 재진입 시 깨끗하게 재연결되는지가 플랜의 10개 케이스에 없었다.
- **Fix:** 케이스 ⑫ 추가 — `enabled` true→false 에서 `unsub` + `close(1000)` 확인, false→true 에서 새 소켓 생성 확인.
- **Files modified:** `webapp/src/lib/__tests__/relay-socket.test.ts`
- **Verification:** 테스트 green
- **Committed in:** `862ce5c`

---

**Total deviations:** 5 auto-fixed (전부 Rule 2 — 계약/안전성 요구사항 누락 보완)
**Impact on plan:** 전부 SC-7 · UI-SPEC · threat register 를 만족시키기 위한 최소 보완. 새 의존성 0, 새 표면 0, 범위 확대 없음.

## Issues Encountered

- **`@gh-radar/shared` 미빌드로 typecheck 전면 실패.** 워크트리가 새 체크아웃이라 `packages/shared/dist` 가 없어 `TS2307` 이 14개 파일에서 났다. `pnpm --filter @gh-radar/shared run build` 로 해소(소스 변경 없음, 커밋 대상 아님). 이후 실행자도 워크트리에서는 shared 빌드를 먼저 해야 한다.

## 검증 결과

| 검증 | 결과 |
|------|------|
| `pnpm --filter webapp run typecheck` | exit 0 |
| `pnpm --filter webapp test relay-socket relay-status-bar` | **26 passed** (16 + 10, 요구 12+/7+) |
| `pnpm --filter webapp test` (전체) | 40 files / **318 passed**, 1 skipped — 회귀 0 |
| `pnpm --filter webapp run lint` | 신규 파일 경고 0 |
| `grep -c 'token=' use-relay-socket.ts` | **0** |
| `grep -cE '\-\-(up\|down)\b' relay-status-bar.tsx` | **0** |
| `grep -c 'unsub' use-relay-socket.ts` | 7 (요구 3+) |
| `grep -c 'aria-live="polite"' relay-status-bar.tsx` | 2 |
| `grep -c 'aria-busy="true"' orderbook-skeleton.tsx` | 1 |
| `grep -c 'data-density="compact"' orderbook-skeleton.tsx` | 4 |

## Known Stubs

없음. `RelayStatusBar` 의 `lastTradeAt` / `exchange` 는 **선택 prop** 이며 미전달 시 해당 보조 문구만 생략된다 — 훅이 소유하지 않는 값(체결 시각·표시 거래소)을 컴포넌트가 지어내지 않기 위한 의도적 설계다. 15-13 이 섹션 셸에서 `quote.et` 와 토글 상태를 넘겨 채운다.

## Next Phase Readiness

- **15-13** (호가 사다리·체결 테이프·섹션 셸): `quote` / `tape` / `isStale` / `status` 소비 준비 완료. `RelayStatusBar` 와 `OrderbookSkeleton` 을 그대로 마운트하면 된다. 섹션 셸은 `enabled={활성 탭 여부}` 를 넘길 필요가 **없다** — Radix Tabs 가 이미 언마운트하며, 훅의 cleanup 이 그 경로를 처리한다(테스트 ⑪·⑫).
- **15-18** (주문·계좌 패널): `accounts` / `account` / `orders` / `status` 소비 준비 완료. **주문은 이 소켓으로 보내지 않는다**(D-08 REST 전용) — `send()` 는 구독 제어 전용임이 훅 docblock 에 명시돼 있다.
- **15-04** (relay wss fanout) 전제 공유: 브라우저는 **인증 성공 직후 상태 프레임 1건**을 ACK 로 기다린다. relay 가 이 프레임을 보내지 않으면 브라우저는 영원히 구독하지 않는다.
- 배포 시 `NEXT_PUBLIC_RELAY_WS_URL` 을 Vercel 에 추가해야 하며, paste 후 `vercel env pull` → `tail -c1 | xxd -p` 가 `0a` 가 아닌지 확인할 것.

---
*Phase: 15-dma-relay-kb-gh-trade-server-10-wss*
*Completed: 2026-09-05*

## Self-Check: PASSED

- 파일 7건 전부 디스크에 존재 (산출물 6 + SUMMARY)
- 커밋 3건 전부 `git log` 에 존재 — `d7514f9` · `862ce5c` · `2f5767b`
- `pnpm --filter webapp run typecheck` exit 0 · 전체 테스트 318 passed (회귀 0)
