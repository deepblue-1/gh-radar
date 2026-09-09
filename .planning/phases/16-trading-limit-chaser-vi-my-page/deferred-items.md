# Deferred Items — Phase 16

Plan 실행 중 발견했으나 **그 plan 의 변경이 원인이 아니어서** 손대지 않은 것들.
스코프 밖 수정 금지 규율(executor SCOPE BOUNDARY)에 따라 여기 기록만 남긴다.

## 16-11 (2026-09-08)

E2E 전량(`pnpm --filter gh-radar-webapp test:e2e`)에서 **3건이 실패**한다. 셋 다
16-11 의 diff 가 닿지 않는 파일이고, `app-sidebar.tsx` 를 16-11 이전 버전
(`a43cabfd`)으로 되돌린 상태에서 재현해 **선행 실패임을 실측 확인**했다.

| Spec | 케이스 | 증상 | 원인 추정 |
|------|--------|------|-----------|
| `a11y.spec.ts` | `/stocks/005930 — critical/serious 위반 0` | axe `aria-prohibited-attr` 1건 | `stock-daily-chart-skeleton.tsx` 의 `<div data-slot="skeleton" aria-busy aria-label="일봉 차트 로딩 중">` — role 없는 `div` 에 `aria-label` 은 금지다. `role="status"` 를 주면 해소된다(`themes-skeleton`·`watchlist-skeleton` 은 이미 `role="status"` 를 갖고 있어 같은 계열의 누락으로 보인다). |
| `news.spec.ts` | `caps list at server-provided limit` | `toBeGreaterThan` 실패 | 뉴스 목록 상한 계약 회귀. 16-11 무관. |
| `search.spec.ts` | `⌘K 단축키 → 검색 → 선택` | `getByRole('dialog')` 미출현 | ⌘K 단축키가 헤드리스에서 CommandDialog 를 열지 못함. 키보드 포커스/단축키 경로 회귀. |

`news.spec.ts` 의 `refresh cooldown (V-19)` 은 실행에 따라 통과/실패가 갈렸다(불안정).

**하지 않은 것:** 위 3건 중 어느 것도 고치지 않았다. 16-11 의 표면(사이드바·게이트·배지·
라우트 셸)과 무관하고, 손대면 이 plan 의 diff 가 진단 불가능해진다.

## 16-15 (2026-09-09)

16-11 이 기록한 선행 실패 3건(`a11y` · `news` · `search`)이 **그대로 재현**된다. 16-15 의
diff(`/me` 표면 · 전략 현황 카드 · 계좌 상태 맵)와 닿는 파일이 하나도 없고, 실패 케이스도
`/stocks/005930` · `/news` · ⌘K 로 전부 다른 표면이다. 손대지 않았다.

추가로 기록해 두는 것:

| 대상 | 내용 |
|------|------|
| `account-panel` 의 `min-w-0` | 지금 마크업에서는 표 컨테이너의 `overflow-x:auto` 가 콘텐츠 최소폭 전파를 막아 **이 값을 지워도 당장은 넘치지 않는다**(변이 실측). 규칙 자체는 `me.spec.ts` 케이스 7 이 computed style 로 잠갔다 — 표를 감싸는 방식이 바뀌면 이 값이 유일한 방어선이 된다. |
| 「발주됨」 배지 | My page 에서는 뜨지 않는다. 주문 통보(`RelayOrderMsg`)에 ISIN 이 없어 어느 전략의 발주인지 귀속시킬 수 없다. 근거 없이 붙이면 한 번도 발주되지 않은 전략에 「발주됨」이 붙으므로 **의도적으로 만들지 않았다**. 귀속 경로가 생기면(통보에 ISIN 추가 등) 그때 붙인다. |

## 16-13 (2026-09-09)

| 대상 | 내용 |
|------|------|
| `use-relay-socket.ts` 의 `clockStamp()` | `now.toLocaleTimeString("ko-KR", { hour12: false })` 가 **Chromium 에서 `0시 57분 16초`** 를 돌려준다(16-13 E2E 가 같은 호출을 쓰던 상따 상태줄에서 실측으로 잡았다). 이 값은 `RelayServerMessageEntry.receivedAt` 이 되어 **호가주문 탭의 `relay-status-bar` 알림 시각**에 그대로 렌더된다 — `.mono` 고정폭 계약이 깨져 알림이 쌓일 때마다 시각 열 폭이 달라진다. 상따 화면은 자체 `clockNow()`(자리수 직접 채움)로 우회했고, **Phase 15 표면인 `use-relay-socket`·`relay-status-bar` 는 손대지 않았다** — 16-13 의 diff 가 닿지 않는 파일이고 고치면 이 plan 의 진단이 흐려진다. 같은 한 줄 수정이면 되므로 다음 quick 에서 함께 정리하는 것이 맞다. |
| `text-[10px]` 선행 사용처 4파일 | `chat/agent-progress.tsx` · `stock/discussion-refresh-button.tsx` · `stock/news-refresh-button.tsx` · `stock/stock-comovement-section.tsx` · `stock/stock-limit-up-section.tsx` 에 10px 이 이미 쓰이고 있다(Phase 8/11/12 표면). 16-UI-SPEC T3 의 「10px 은 정확히 2곳」은 **Phase 16 표면 한정** 계약이고, 16-13 이 추가한 10px 은 호가 등락률·체결 시각 2곳뿐임을 RTL 이 잠갔다. 선행 사용처는 스코프 밖이라 손대지 않았다. |

## 16-14 (2026-09-09)

| 대상 | 내용 |
|------|------|
| 미체결 표 6열 전환 (UI-SPEC B7) | B7 은 「주문번호를 열이 아니라 종목 아래 보조줄(11px mono)로 내려 556px 컬럼에서 잘리지 않게」라고 적었지만, `account-panel.tsx` 의 미체결 표는 **3표면(상따·VI·My page)이 공유**하고 16-13 · 16-15 의 E2E 가 현재 7열 구조(주문번호 열 포함)에 걸려 있다. 한 표면의 폭 문제로 공용 표를 바꾸면 두 plan 의 계약이 함께 흔들린다. 16-14 는 대신 `stack` prop 으로 세로 스택만 고정했고(R3), ≥1280 에서 표는 자체 가로 스크롤로 흡수된다. **표 구조 변경은 3표면 E2E 를 함께 고치는 quick 에서** 하는 것이 맞다. |
| `surface-placeholder.tsx` 죽은 코드 | 16-14 가 마지막 사용처(`vi-client`)를 걷어내 **사용처가 0건**이 됐다(`grep -rn SurfacePlaceholder webapp/src` = 정의 파일 1건뿐). 16-11 이 만든 파일이라 이 plan 의 스코프 밖이고, 지워도 기능 변화가 없지만 남겨 두면 「아직 준비 중인 화면이 있다」는 잘못된 신호를 준다. 16-17 또는 quick 에서 삭제. |
| 확인 체크 잠금의 영구화 가능성 | `vi-order-list` 의 전송 잠금은 73 정정(또는 `confirmLocked`)에서 풀린다. 서버가 그 주문에 대해 **영원히 아무것도 보내지 않으면** 그 행의 체크가 잠긴 채 남는다. D-10 이 「타임아웃 UI 를 만들지 않는다」로 못박아 의도한 동작이지만(무응답이 정상 경로), 실계좌 검증(16-17 Manual-Only)에서 이 상태가 실제로 관측되는지 확인할 가치가 있다. |
| 마감알림 실환경 미검증 | `Notification` 권한·발화는 헤드리스 Chromium 에서 재현이 어려워 **단위 테스트(생성자 호출 여부)까지만** 검증했다. 실제 알림이 뜨는지는 수동 확인 대상이다. |

## 16-17 (2026-09-09)

**선행 실패 3건은 해소됐다.** 16-11 이 기록하고 16-15 가 재현한 `a11y`·`news`·`search`
3건을 진단해 전부 고쳤다 — 자세한 원인·조치는 `16-VALIDATION.md` §Per-Task Verification
Map 하단 표에 있다. 요약: **접근성 위반 1건(진짜 결함) + 스펙의 경주 2건**이었고, 「뉴스
목록 상한 계약」도 「⌘K 단축키」도 처음부터 멀쩡했다. 여기에 불안정으로만 적혀 있던
`news` 「refresh cooldown」도 같은 종류의 경주여서 함께 제거했다.

여전히 남기는 것:

| 대상 | 내용 |
|------|------|
| `surface-placeholder.tsx` 죽은 코드 | 16-14 가 「16-17 또는 quick 에서 삭제」로 넘겼지만 **16-17 도 지우지 않았다.** 사용처는 여전히 0건이고(참조 4건은 전부 `toHaveCount(0)` 류의 「없어야 한다」 단언이라 파일이 사라져도 무해하다), 지우면 기능 변화 0 이다. 지우지 않은 이유는 위험이 아니라 **권한**이다 — 16-17-PLAN 의 `files_modified` 에 없고, 이 plan 은 `autonomous: false` 로 체크포인트에서 멈추므로 계획 밖 파일 삭제를 실행자가 단독으로 결정하지 않는다. 다음 quick 에서 한 줄로 끝난다. |
| `use-relay-socket.ts` 의 `clockStamp()` | 16-13 이 기록한 `toLocaleTimeString("ko-KR", {hour12:false})` → Chromium 에서 `0시 57분 16초`. **여전히 그대로다.** 16-17 은 a11y 만 확장했고 Phase 15 표면인 `use-relay-socket`·`relay-status-bar` 를 손대지 않았다. 단위 테스트로는 영원히 안 잡히는 종류(jsdom 은 `00:57:16`)이므로, 고치는 quick 은 **브라우저 단언(E2E)** 을 함께 넣어야 한다. |
| `webapp/e2e/**` 외 검사 사각지대 | 16-17 이 `tsconfig.e2e.json` 으로 e2e 를 typecheck 에 편입했다. relay `tests/` 는 여전히 루트 `typecheck` 밖이며 `pnpm --filter @gh-radar/relay run typecheck:tests` 를 따로 돌려야 한다 — 통합할지는 relay 소관 quick 에서 결정. |
| 미체결 표 6열 전환 (UI-SPEC B7) | 16-14 가 넘긴 그대로. 3표면 공용 표라 E2E 3개를 함께 고쳐야 한다. |

## 16-17 Task 2 — 배포 후 (2026-09-09)

배포 3종(relay -> server -> webapp)을 실행하며 드러난 것들. 전부 **이 plan 의 변경이 원인이
아니고**, 고치려면 사용자 결정이 필요하다.

| 대상 | 내용 |
|------|------|
| **relay 공개 `/healthz` 503 (degraded)** | `dma_credentials` 2행 + 로그인 세션 1건 + `DMA_HOST` 가 뜨지 않은 로컬 mock(`127.0.0.1:9100`) -> `readyCount 0` -> `degraded` -> 503 -> uptime check 적색 -> `gh-radar-relay-down` 발화. 판정 로직은 15-05 결정 그대로이고 Phase 16 이 손대지 않았다(차분 0). uptime 3일 이력상 `2026-09-06 10:30~13:30 KST` 에도 같은 구간이 있었던 **재발형 상시 조건**이다. **다만 Phase 16 이 `RelayProvider` 를 루트 레이아웃으로 올려(`enabled: user != null`) 트리거 표면이 「호가주문 탭」에서 「로그인한 모든 페이지」로 넓어졌다** — 게이트웨이가 없는 동안 503 구간이 길어진다. 해법 후보 4개(VM 에 mock 상주 / 실서버 결선(D-27 금지) / degraded 판정에서 「한 번도 Ready 인 적 없는 세션」 제외 / 알림 정책 조정)가 전부 결정 사항이라 실행자가 단독으로 고르지 않았다. 상세는 `16-VALIDATION.md` §Deployment Verification 열린 항목 1. |
| **`dma_credentials` 0행 전제가 틀렸다** | 16-17-PLAN·16-VALIDATION 이전 판·`smoke-relay.sh` INV-9 의 SKIP 사유가 모두 「`dma_credentials` 0행」을 근거로 삼는다. 실측은 **2행**(2026-09-06·2026-09-08 생성). 결론(실서버 미검증)은 안 바뀌지만 근거 문장이 틀렸으므로 인용할 때 주의. VALIDATION 은 정정했고 **`smoke-relay.sh` 의 INV-9 주석은 손대지 않았다**(이 plan 의 `files_modified` 밖이고, 그 SKIP 판정 자체는 「토큰 없음」이 실제 사유라 동작은 옳다). |
| **`GET /api/orders?date=<오늘>` 의 200 확인 미실시** | 미인증은 `401 UNAUTHENTICATED` 로 라우트 생존과 관문을 확인했다(smoke INV-11). 200 경로는 로그인 토큰(`SMOKE_AUTH_TOKEN`)이 있어야 하는데 실행자에게 없고 자격증명을 새로 만들지 않았다. 브라우저 로그인 상태의 확인은 §Manual-Only 소관. |
| **`smoke-relay.sh` INV-9 는 여전히 SKIP** | `SMOKE_AUTH_TOKEN` 미설정. 다만 이 검사는 `POST /api/orders` 로 도달성을 재는데 **그 라우트가 16-16 에서 사라졌다** — 지금 이 프로브는 무조건 404 를 받아 `inconclusive` 로 떨어진다. 즉 토큰을 넣어도 의미가 없다. 도달성 판정의 새 근거(예: relay wss 주문 왕복)로 갈아끼우는 것은 relay 스코프 quick 소관. |
| `surface-placeholder.tsx` 죽은 코드 | 그대로 남아 있다(위 16-17 절과 동일 사유 — 계획 밖 파일). |


## 16-26 — 갭 클로징 종결 후 (2026-09-09)

14건(G1~G4 · CR-01 · WR-01~09)은 전부 닫혔다(`16-VALIDATION.md` §Gap Closure). **여전히
남는 것**을 여기 정직하게 남긴다.

### 범위 밖으로 확정된 Info 6건

`16-REVIEW.md` 의 Info 는 7건이고 그중 **IN-01 은 16-22 가 해소**했다(`PendingOrder.qty` 가
저장만 되고 읽히지 않던 문제 — 다축 상관이 그 값을 매칭 축으로 소비한다). 나머지 6건은
**사용자가 이 phase 의 갭 클로징 범위를 14건으로 명시 확정**했으므로 손대지 않았다.

| ID | 한 줄 요약 | 파일 |
|----|------------|------|
| IN-02 | `CreateOrderResponse` 가 계약에 남아 있다 — 자기 주석이 「16-16 에서 제거된다」고 적었는데 사용처 0건인 채 export 로 살아 있다 | `packages/shared/src/relay.ts:820-836`, `index.ts:43` |
| IN-03 | 인증 왕복 중 도착한 프레임마다 `logger.warn` — 미인증 피어의 로그 증폭(「로그가 곧 두 번째 DoS」 규율과 어긋난다). `authInFlight` 검사를 `t !== "auth"` 보다 앞으로 옮기고 경고를 1회로 묶어야 한다 | `relay/src/ws/fanout.ts:457-467` |
| IN-04 | `relayOrderSecret` 이 실질적으로 아무 라우트도 지키지 않는다 — REST 주문 라우트가 사라진 뒤 남은 것은 `/healthz` 하나뿐이고 가드가 그것을 명시적으로 통과시킨다. 그럼에도 relay 부팅 필수 env 다 | `relay/src/order/order-api.ts:132-151,187` |
| IN-05 | `DmaOrderRow` 주석이 D-03 **이전** 상태를 설명한다(「server 가 요청을 insert 하고」). 계약 문서가 소유권을 틀리게 말하면 다음 사람이 server 에 쓰기 경로를 다시 만든다 | `packages/shared/src/relay.ts:841` |
| IN-06 | 서버 통지 로그가 버퍼 넘침 시 전체를 다시 기록한다 — `messages.indexOf(seen)` 가 참조 동일성이라 `MAX_MESSAGES`(20) 를 넘기면 `idx < 0` 이 되어 20건 전부가 다시 쌓인다 | `webapp/src/components/trading/limit-chaser-client.tsx:322-336` |
| IN-07 | `checkRate` 음수 허용 경로가 UI 에서 도달 불가능하다 — `parseDigits` 가 부호를 제거하므로 두 곳의 근거 주석이 아무 경로도 열지 않는다. 하락 감시가 요구사항이면 입력에 부호를 허용하고, 아니면 스키마를 `min(0)` 으로 좁혀야 한다 | `relay/src/ws/protocol.ts:152`, `relay/src/dma/envelope.ts:1026`, `webapp/src/components/trading/vi-settings-card.tsx:747-750` |

### 새로 드러난 것 — 「절대 실패할 수 없는 검증 명령」이 문서 계약에 박혀 있었다

`pnpm --filter gh-radar-webapp test:e2e` 는 **어떤 프로젝트에도 매치되지 않는다.**
`webapp/package.json` 의 이름은 2026-06-10(`b691b15`)부터 `@gh-radar/webapp` 이고,
`gh-radar-webapp` 이라는 이름은 **이 파일 이력에 한 번도 존재한 적이 없다**(`git log -S` 0건).
pnpm 은 `No projects matched the filters` 를 찍고 **exit 0** 으로 끝난다.

이 문자열은 phase 16 문서 **88곳**에 인용돼 있다. 즉 「E2E 전량 green」을 이 명령으로
확인했다고 적은 문장은 **아무것도 확인하지 않았을 수 있다**. 16-17 이 기록한 126/9 는 다행히
실제 값과 일치했지만(16-26 이 올바른 필터로 재실행해 `126 passed · 9 skipped · 0 failed` 를
확인), 그것은 16-17 이 실제로는 제대로 돌리고 **명령 문자열만 잘못 옮겨 적었다**는 뜻이다.

- **조치:** `16-VALIDATION.md` §Test Infrastructure 의 Full suite command 를
  `@gh-radar/webapp` 로 정정하고 정정 사유를 같은 표에 남겼다.
- **하지 않은 것:** 과거 PLAN·SUMMARY 87곳은 **역사 기록이므로 손대지 않았다.** 인용할 때
  주의해야 한다.
- **일반화:** 검증 명령이 「대상을 못 찾아도 exit 0」인 종류인지 확인하는 습관이 필요하다.
  `pnpm --filter` · `vitest -- <패턴>` · `grep` 이 전부 이 부류다.

### 열린 항목 — smoke `INV-9` 는 재작성 후 **첫 실행이 아직 미수행**이다

16-21 이 INV-9 를 「`POST /api/orders` 도달성」(16-16 이 없앤 라우트라 무조건 404)에서
**relay wss 주문 왕복 도달성**으로 재작성했다. 16-26 배포에서도 `SMOKE_AUTH_TOKEN` 이
없어 프로브 본체가 **한 번도 실행되지 않았다.**

「돌렸는데 SKIP 이었다」와 섞지 말 것 — 정확한 상태는 **「토큰이 없어 못 돌렸다」** 이며,
따라서 재작성된 프로브가 실제로 동작하는지는 아직 모른다(16-21 은 스크립트에서 프로브 JS 를
추출해 로컬 가짜 wss 서버로 4갈래 판정만 실측했다).

**재실행 방법 (한 줄).** 로그인한 브라우저 DevTools 의 localStorage
`sb-ivdbzxgaapbmrxreyuht-auth-token` → `access_token` 값(약 1시간 만료)을 넣어:

```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co \
SMOKE_AUTH_TOKEN='<access_token>' bash scripts/smoke-relay.sh
```

기대값은 `reachable`(주문 핸들러가 **거부**로 답한다). `inconclusive` 면 매핑·토큰을 먼저
의심한다. 이 프로브는 화이트리스트 밖 계좌번호 + 미해석 ISIN 을 쓰므로 `dma_orders` insert ·
게이트웨이 송신 **이전에** 끝난다 — 실계좌에 주문이 나가지 않는다 (T-16-28).

### 승계되는 기존 항목

| 대상 | 현재 상태 |
|------|-----------|
| `surface-placeholder.tsx` 죽은 코드 | **여전히 남아 있다.** 사용처 0건이고 지우면 기능 변화 0 이지만, 16-14 → 16-17 → 16-26 어느 plan 의 `files_modified` 에도 없다. 이유는 위험이 아니라 **권한**이다. 다음 quick 에서 한 줄로 끝난다 |
| `use-relay-socket.ts` 의 `clockStamp()` ko-KR locale 버그 | **여전히 그대로다 — 실측 확인함.** 16-19(`d52e788`·`593f306`)와 16-23(`29cbb03`)이 **같은 파일을 만졌지만** `clockStamp` 는 손대지 않았다. 각 plan 의 스코프(킬 스위치 · 계좌축)에 그 함수가 들어 있지 않았고, 고쳤다면 그 plan 의 diff 진단이 흐려진다. jsdom 은 `00:57:16` 을 돌려주므로 **단위 테스트로는 영원히 안 잡힌다** — 고치는 quick 은 브라우저 단언(E2E)을 함께 넣어야 한다 |
| 미체결 표 6열 전환 (UI-SPEC B7) | 16-14 → 16-17 이 넘긴 그대로. 3표면 공용 표라 E2E 3개를 함께 고쳐야 한다 |
| 실서버·실계좌 검증 (D-27) | **여전히 Manual-Only.** `16-VALIDATION.md` §Manual-Only 표 5행이 정본이며 이번에도 실시하지 않았다. `dma_credentials` 는 2행이지만 「자격증명이 없어서 못 한다」가 아니라 **「있어도 사용자 명시 지시 없이는 하지 않는다」** 가 정확한 사유다 |
| relay `tests/` 가 루트 `typecheck` 밖 | **이번에 실제 피해가 났다.** 16-25 의 형 경계 오류 14건을 `pnpm -r test`(vitest 는 형을 안 본다)가 통째로 놓쳤고 `pnpm --filter @gh-radar/relay run typecheck:tests` 만 잡았다(16-26 `2cb5620`). 루트 편입 여부는 relay 소관 quick 에서 결정하되, 그때까지는 **전량 검증 시 반드시 함께 돌려야 한다** |


## 16-35 — 갭 클로징 **2라운드** 종결 후 (2026-09-09)

2라운드 19건(GC-CR-01~03 · GC-WR-01~12 · GC-IN-01~04)은 전부 닫혔다
(`16-VALIDATION.md` §Gap Closure 2라운드). **여전히 남는 것**을 정직하게 남긴다.

### 네임스페이스 주의 — `IN-0x` 와 `GC-IN-0x` 는 **다른 항목**이다

`16-REVIEW.md` 는 ID 네임스페이스가 둘이다. 아래 표를 혼동하면 「닫힌 것을 열린 것으로」
또는 그 반대로 읽는다.

| 네임스페이스 | 출처 | 현재 상태 |
|--------------|------|-----------|
| `IN-01` ~ `IN-07` | **1라운드** 리뷰 Info 7건 | `IN-01` 은 16-22 가 해소. **`IN-02`~`IN-07` 6건은 여전히 범위 밖 · 열림** (아래 §16-26 표가 정본, 내용 변화 없음) |
| `GC-IN-01` ~ `GC-IN-04` | **2라운드** 갭 클로징 재리뷰 Info 4건 | **전부 종결** — 16-31(GC-IN-01·02) · 16-32(GC-IN-03) · 16-28(GC-IN-04) |

즉 **Info 계열에서 지금 열려 있는 것은 `IN-02`~`IN-07` 6건뿐**이고, 이 6건은 사용자가
1라운드 범위를 14건으로 명시 확정했을 때 밖으로 둔 것이라 2라운드도 손대지 않았다.
(2라운드는 `GC-` 19건이 범위였다.) 상세 표는 이 파일 §16-26 「범위 밖으로 확정된 Info 6건」.

### 인간 검증 6건 — 16-35 결과로 갱신

`16-VERIFICATION.md` §Human Verification Required 의 6건 중 #1·#2 를 이번 실행 결과로
갱신한다. 나머지 #3~#6 은 상태 변화가 없다.

| # | 항목 | 16-35 이후 상태 |
|---|------|-----------------|
| **1** | WinForms ↔ 웹 「한 세션」 동기화 | **여전히 한 번도 실행된 적이 없다 — 이번에 근거가 더 강해졌다.** 배포 후 `/healthz` 실측이 `everReadyCount: 0` · `stalledCount: 2` · **503 degraded** 다(2026-09-09 16:17 KST). Ready 에 도달한 DMA 세션이 프로덕션에 **한 건도 없었고**, 그 상태가 5분 유예를 넘겨 지속 중이라는 뜻이다. `DMA_HOST` 는 D-27 상 로컬 mock 이고 그 mock 은 VM 에 떠 있지 않다. **이것이 TRADE-03 Pending 의 직접 근거다** |
| **2** | smoke `INV-9` 첫 실행 | **여전히 못 돌렸다 — 「돌렸는데 SKIP」이 아니다.** 16-35 배포 후 `smoke-relay.sh` 를 실제로 실행했고(PASS 12 · FAIL 0 · SKIP 1), 그 SKIP 이 INV-9 다. `SMOKE_AUTH_TOKEN` 이 없어 `ws_order_probe()` 첫 줄에서 **조기 반환**했으므로 **프로브 본체는 한 줄도 실행되지 않았다.** 16-21 재작성 이후 프로덕션 첫 실행은 **아직 미수행**이다 |
| 3 | gh-trade mock 서버 대상 전략 왕복 | 변화 없음 — 로컬 mock 바이너리 미실행 |
| 4 | VI 마감알림 브라우저 Notification | 변화 없음 — headless 재현 불가 |
| 5 | 15:40 서버 자동 비활성화(61 Broadcast) | 변화 없음 — 서버 시각 의존 |
| 6 | 확인 체크 잠금의 영구화 | 변화 없음 — mock 으로 재현 불가 |

**INV-9 재실행 명령 (갱신).** 16-30 이 토큰을 argv → env 로 옮겼으나 **호출 인터페이스는
그대로 `SMOKE_AUTH_TOKEN`** 이다(내부에서 `SMOKE_TOKEN` env 로 프로브에 넘긴다).
로그인한 브라우저 DevTools 의 localStorage `sb-ivdbzxgaapbmrxreyuht-auth-token` →
`access_token`(약 1시간 만료):

```bash
GCP_PROJECT_ID=gh-radar SUPABASE_URL=https://ivdbzxgaapbmrxreyuht.supabase.co \
SMOKE_AUTH_TOKEN='<access_token>' bash scripts/smoke-relay.sh
```

기대값은 `reachable`(주문 핸들러가 **거부**로 답한다). `inconclusive` 면 매핑·토큰을 먼저
의심한다. 이 프로브는 화이트리스트 밖 계좌번호 + 미해석 ISIN 을 쓰므로 `dma_orders` insert ·
게이트웨이 송신 **이전에** 끝난다 — 실계좌에 주문이 나가지 않는다 (T-16-28).

### 이번 라운드가 **새로 미루기로 한 것** — 3건

빈 칸을 남기지 않기 위해 명시한다. 「없음」이 아니라 아래 3건이다.

| 대상 | 내용 · 미룬 근거 |
|------|------------------|
| **`/healthz` 503 이 상시화된다 — 알림 정책을 어떻게 할 것인가** | GC-WR-07 의 의도된 동작이다. 게이트웨이가 없는 한 세션 생성 5분 뒤 `stalledCount > 0` 으로 503 이 되고 uptime check 적색 · `gh-radar-relay-down`(`enabled=True`) 발화가 **반복된다**. 이는 「사실을 정확히 말하는 알림」이지만 **운영상 소음**이기도 하다. 해법 후보 4개(① `STALE_SESSION_MS` 연장 ② VM 에 mock 게이트웨이 상주 ③ 알림 정책 임계·억제 조정 ④ 실서버 결선 — **D-27 상 사용자 명시 지시 필요**)가 전부 **사용자 결정 사항**이라 실행자가 단독으로 고르지 않았다(deviation Rule 4) |
| **smoke `INV-5a` 의 판정 기준이 시각 의존이 됐다** | `INV-5a`(공개 `/healthz` 200)는 16-35 실행 시각(16:14 경)에 통과했으나, 5분 뒤 같은 검사는 **FAIL** 이 된다. 위 항목과 같은 뿌리다 — 「200 이어야 한다」는 단언이 GC-WR-07 이후로는 **게이트웨이가 있을 때만** 참이다. `INV-5a` 를 「200, 또는 `stalledCount>0` 인 503 이면 게이트웨이 부재로 판정」식으로 다시 설계할지는 위 결정에 딸린 문제라 함께 미뤘다 |
| **16-34 의 취소 대기 `side` 변이가 관측 불가** | 취소 대기의 `side` 에 DB 표기(`"S"`)를 주입하는 변이가 **테스트를 하나도 깨뜨리지 못했다** — `!p.isCancel` 가드가 먼저 걸러 축에 도달하지 않기 때문이다. 이는 **의도적 중복 방어**이지 결함이 아니지만, 「테스트로 잠기지 않은 한 줄」이 남았다는 사실은 기록해 둔다. 이 줄을 지우면 다른 케이스가 깨지므로 실질 위험은 없다 |

### 이번 라운드가 **드러낸 규율** — 다음 라운드가 반복하지 말 것

| 항목 | 내용 |
|------|------|
| **`grep "10.41.1.120"` 0건은 만족 불가능한 승인 기준이다** | 2라운드 plan 6건이 이 조건을 인용했고 **6회 연속 같은 불일치**를 관측했다(실측 33건). 16-26 이 이미 정정했는데도 2라운드 plan 문서에 남아 있었다. **정본 계약은 리터럴 0건이 아니라 「접속 경로 0건」** — `webapp/src`·`webapp/e2e` 0건 ∧ relay·scripts 잔존이 전부 경고·가드·주석. 상세는 `16-VALIDATION.md` §승인 기준 문구 정정 |
| **`pnpm --filter gh-radar-webapp` 은 없는 필터다 (재발 2회)** | 16-26 이 §Test Infrastructure 를 정정했으나 **16-31·16-32 가 자기 plan 의 승인 기준에서 또 만났다.** 정본은 `@gh-radar/webapp`. 잘못된 필터는 `No projects matched the filters` + **exit 0** 이라 「절대 실패할 수 없는 검증」이다 |
| **기존 테스트가 결함을 「진실」로 잠그고 있을 수 있다** | 16-33 이 3건(⑨·⑭ 문구·단언이 프로덕션에서 거짓), 16-34 가 1건을 만났다. 갭을 고칠 때 **깨지는 기존 테스트가 곧 회귀 신호는 아니다** — 그 단언이 옛 구현을 베낀 것인지 먼저 확인할 것 |
| **REVIEW 의 Fix 스니펫이 그 자체로 새 버그일 수 있다** | `GC-WR-03` 의 제안(`sideTrusted && side !== ""`)을 그대로 넣었다면 **취소거부가 살아 있는 신규 매수를 「거부됨」으로 정산**했을 것이다. 16-34 가 `noticeType ∈ {A, E}` 가드를 더 걸어 닫았다. 리뷰 스니펫은 방향이지 정답이 아니다 |
| **이 저장소에는 자동 포매터가 없다** | prettier 설정이 없어 `npx prettier --write` 가 기본 `printWidth: 80` 으로 무관한 줄을 통째로 재배열한다(16-30 사고, 459 insertions, 되돌림). **돌리지 않는다** |

### 승계되는 기존 항목 (상태 변화 없음)

| 대상 | 현재 상태 |
|------|-----------|
| `surface-placeholder.tsx` 죽은 코드 | **여전히 남아 있다.** 사용처 0건. 16-14 → 16-17 → 16-26 → 16-35 어느 plan 의 `files_modified` 에도 없다. 이유는 위험이 아니라 **권한**이다. 다음 quick 에서 한 줄로 끝난다 |
| `use-relay-socket.ts` 의 `clockStamp()` ko-KR locale 버그 | **여전히 그대로다.** 2라운드는 `use-relay-socket.ts` 를 한 줄도 건드리지 않았다(webapp diff 5파일 전부 트레이딩 컴포넌트). jsdom 은 `00:57:16` 을 돌려주므로 **단위 테스트로는 영원히 안 잡힌다** — 고치는 quick 은 브라우저 단언(E2E)을 함께 넣어야 한다 |
| 미체결 표 6열 전환 (UI-SPEC B7) | 16-14 → 16-17 → 16-26 이 넘긴 그대로. 3표면 공용 표라 E2E 3개를 함께 고쳐야 한다 |
| 실서버·실계좌 검증 (D-27) | **여전히 Manual-Only.** `16-VALIDATION.md` §Manual-Only 표 5행이 정본이며 이번에도 실시하지 않았다. `dma_credentials` 는 2행이지만 「자격증명이 없어서 못 한다」가 아니라 **「있어도 사용자 명시 지시 없이는 하지 않는다」** 가 정확한 사유다 |
| relay `tests/` 가 루트 `typecheck` 밖 | 그대로. 16-35 도 `pnpm --filter @gh-radar/relay run typecheck:tests` 를 **따로 돌려 exit 0** 을 확인했다. 루트 편입 여부는 relay 소관 quick |
| 16-11 계열 선행 E2E 실패 3건 | **해소 상태 유지** — 16-35 전량 재실행에서 126 passed · 0 failed |
