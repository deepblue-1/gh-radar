---
phase: quick-260910-jce
plan: 01
subsystem: [webapp, relay]
tags: [RELAY-02, D-24, my-page, dma, logging]
status: complete
requires:
  - "server GET /api/orders (16-16 이후 유일 잔존 라우트)"
  - "relay wss {t:\"order\"} 통보 (D-02)"
provides:
  - "webapp 의 GET /api/orders 호출자 (이전까지 0건)"
  - "My page 「오늘 주문」 표면"
  - "OUT_OF_SCOPE_INBOUND_MSG_TYPES — 범위 밖 유입 드롭의 로그 레벨 분기"
affects:
  - "webapp/src/lib/chat-api.ts (authFetch 이동, 본문 무변경)"
  - "relay 드롭 로그 레벨 (74/75 → debug)"
tech-stack:
  added: []
  patterns:
    - "authFetch 단일 정본(lib/auth-fetch.ts) — 인증 패턴 사본 금지"
    - "순수 병합 함수 + 컴포넌트가 처리 결정 (mergeTodayOrders → unmatchedOrderNos)"
    - "logDroppedFrame(level) — 레벨의 단일 소유자, 기본값 warn"
key-files:
  created:
    - webapp/src/lib/auth-fetch.ts
    - webapp/src/lib/orders-api.ts
    - webapp/src/lib/__tests__/orders-api.test.ts
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
  modified:
    - webapp/src/lib/chat-api.ts
    - webapp/src/components/trading/me-client.tsx
    - webapp/e2e/specs/me.spec.ts
    - relay/src/dma/msg-type.ts
    - relay/src/dma/codec.ts
    - relay/src/dma/envelope.ts
    - relay/src/dma/__tests__/envelope.test.ts
decisions:
  - "병합 키는 orderNo 하나뿐 — rid 는 order.new/cancel/result 에만 있고 dma_orders 에 없다"
  - "라이브 접기는 no 당 첫 등장만 — use-relay-socket 이 앞에 붙이므로 index 0 이 최신"
  - "라이브 프레임으로 행을 합성하지 않는다 — side·isin 이 없어 매매구분 칸이 빈다"
  - "date 쿼리를 붙이지 않는다 — KST 계산의 정본은 서버 kstDateIso()"
  - "카드는 My page 에 두고 AccountPanel 안에 넣지 않는다 — 4표면 공유 + 계좌마다 렌더 = 같은 응답 N회"
  - "D-20 의 「주문 이력 표 미포함」 유예를 명시적으로 되돌리고 주석·E2E 를 같은 커밋에서 갱신"
  - "debug 강등은 응답 대역 5종(57·68·70·74·75)뿐 — 요청 대역 20·26·27·30·31 은 WARNING 유지"
  - "droppedEnvelopes 카운터를 나누지 않는다 — 모집단이 바뀌면 이미 쌓인 로그값과 연속성이 끊긴다"
metrics:
  duration: "약 55분"
  completed: 2026-09-10
actuals:
  tokens: 21000
  tasks: 3
  commits: 2
  plan_head_before: 2a98f9f4382f52853240e78d224f23cf06a9ce8d
---

# quick-260910-jce: RELAY-02 오늘 주문 복원 + relay 드롭 로그 레벨 분리 Summary

RELAY-02 의 마지막 기능 공백(오늘 주문 목록 복원)을 배선하고, 거래원 푸시 드롭이 진짜 이상
신호와 같은 WARNING 으로 쌓이던 문제를 응답 대역 5종만 debug 로 내려 분리했다.

## 커밋

| 범위 | 커밋 | 내용 |
|------|------|------|
| A (webapp) | `04f36d1` | My page 「오늘 주문」 복원 목록 배선 (8파일) |
| B (relay) | `ecbd978` | 범위 밖 msg_type 드롭을 debug 로 분리 (4파일) |

기준 커밋 `2a98f9f`. 한글 메시지, `Co-Authored-By` 없음. 두 범위는 파일이 겹치지 않는다.

## 범위 A — 무엇을 닫았나

**닫은 것.** `webapp/src` 전체에 `GET /api/orders` 호출자가 **0건**이었다. 16-16 이 주문
접수를 wss 단일 경로로 옮기면서 복원은 옮기지 않았고, 서버 라우트만 살아 있었다. 이제
`/me` 가 마운트 시 1회 그 라우트를 부르고, 복원 스냅샷과 라이브 `{t:"order"}` 통보를
`orderNo` 로 병합해 한 줄로 그린다. 라이브가 이기고, 라이브 배열의 `no` 당 **첫 등장**
(=가장 최신)을 취한다.

D-20 의 「오늘 주문 이력 표를 만들지 않는다」 유예를 **명시적으로 되돌렸다.**
`me-client.tsx` 헤더 주석 ①·⑤ 와 `me.spec.ts` 케이스 1 의 부재 단언을 **같은 커밋에서**
갱신했다 — 자기 자신을 두고 거짓말하는 파일을 남기지 않기 위해서다.

**닫지 못한 것 (과장 없이).**

1. **라이브 전용 행은 여전히 그리지 않는다.** `RelayOrderMsg` 에 `side`·`isin`·`accountNo`
   가 없어 행을 합성하면 매매구분 칸이 빈 줄이 선다. 대신 짝 없는 주문번호가 나오면
   **그 번호당 1회** 재조회한다. 재조회 응답에도 없으면(예: 서버 insert 가 아직 안 끝남)
   **그 주문은 다음 새로고침 전까지 목록에 보이지 않는다.** 폴링하지 않기로 한 대가다.
2. **`orderNo` 가 null 인 행은 라이브와 영원히 만나지 않는다.** 접수 전 거부·타임아웃 행이
   그렇다. 그 행의 표시는 복원 `status` 가 전부다(설계대로다 — 키가 없다).
3. **체결 수량을 표시하지 않는다.** 통보 프레임에 체결수량이 없어 전량/부분을 구분할 수
   없다. "체결"까지만 말한다. 부분체결 여부는 서버가 쓴 복원 `status` 가 정본이고, 라이브가
   `E` 인 동안에는 그 구분이 화면에서 사라진다.
4. **라이브 배열은 50건 상한(`MAX_ORDERS`)이다.** 오늘 주문이 50건을 넘으면 오래된 주문의
   라이브 프레임이 밀려나 그 행이 복원 `status` 로 되돌아간다. 서버가 같은 행에 이미 반영한
   뒤라면 무해하지만, 반영 전이면 한 틱 뒤처진 상태가 보인다.

## RELAY-02 재판정 — 무엇이 해소되고 무엇이 안 됐나

REQUIREMENTS.md Traceability 의 RELAY-02 Pending 사유는 **두 갈래**였다.

| 잔여 | 이번 작업 이후 |
|------|----------------|
| `GET /api/orders` 오늘 주문 목록 복원 **응답 미관측** | **아직 해소 아님.** 코드 층위의 기능 공백(호출자 0건)은 닫혔지만, 「응답을 관측했다」는 **프로덕션 배포 + 사용자 확인**이 있어야 성립한다. 이 작업은 webapp 배포를 하지 않았다(아래 §배포 보류). |
| 취소(`C`) 왕복과 `cancelled` 전이 미관측 | **별개이며 이 작업이 판정하지 않는다.** 이 잔여는 주문 경로(`order.cancel` → `OrderResp` "C" → `dma_orders.status='cancelled'`)에 관한 것이고, 이번 변경은 **읽기 전용**이다. 실계좌 주문을 내지 않았으므로 새 관측을 만들지도 않았다. |

**따라서 RELAY-02 는 Pending 유지가 맞다.** 승격 조건은 순서대로 ① webapp 프로덕션 배포,
② 사용자가 `/me` 새로고침으로 오늘 주문 3건(접수 2 · 취소 1)을 중복 없이 확인, ③ 취소 왕복
잔여의 별도 판정. REQUIREMENTS.md 는 이 작업에서 건드리지 않았다 — ②가 끝나기 전에 고치면
관측하지 않은 것을 관측했다고 쓰게 된다.

## 범위 B — 드롭 로그 레벨

게이트웨이가 74/75(MemberStats)를 25~55초마다 밀어 넣는데 이것이 정체불명 번호와 같은
WARNING 으로 쌓여 진짜 이상 신호를 가리고 있었다. **드롭 자체는 설계대로 옳다** — Phase 15 가
MemberStats 팬아웃을 명시적으로 범위 밖에 뒀다. 틀린 것은 로그 레벨 하나였다.

- `OUT_OF_SCOPE_INBOUND_MSG_TYPES` = **응답 대역 5종**: 57 `SymbolMasterResp` ·
  68 `ReconcileAccountStateResp` · 70 `SetLimitChaserNXTResp` · 74 `MemberStatsResp` ·
  75 `MemberStatsPush`. 값은 생성 코드 enum 이름을 인용했다.
- **요청 대역(20 · 26 · 27 · 30 · 31)은 뺐다.** 같은 「하지 않는 것」 목록에 있지만 C→S 라,
  수신 경로로 들어오는 것 자체가 이상 신호다. 그 번호까지 내리면 이번 강등이 없애려던 실명을
  새로 만든다.
- `logDroppedFrame(level)` 기본값 `warn` — desync·min-envelope-size 호출부는 인자 무변경.
- **카운터는 나누지 않았다.** `droppedEnvelopes` 가 조용히 다른 모집단을 세기 시작하면 Cloud
  Logging 에 이미 쌓인 값과의 연속성이 끊긴다. 두 모집단은 `reason` 으로 이미 분리된다.

## 검증

| 게이트 | 결과 |
|--------|------|
| `pnpm --filter @gh-radar/shared run build` | ✅ (낡은 dist 함정 회피 — 먼저 돌렸다) |
| `pnpm -r test` | ✅ exit 0 — **2,066 pass** (기준선 2,044 → +22: orders-api 13 · today-orders-card 5 · envelope 4) |
| `pnpm -r typecheck` (webapp 은 `tsconfig.e2e.json` 포함) | ✅ exit 0 |
| relay `typecheck:tests` | ✅ exit 0 |
| `next lint` | ✅ 신규 경고 0 (기존 3건만 잔존) |
| 프로덕션 라우트 도달성 | ✅ `GET https://gh-radar-server-fnbhvevuva-du.a.run.app/api/orders` → **401** (배포돼 있고 인증이 붙어 있다) |
| gcloud 호출 | ✅ **0회** — 프로덕션 relay 무변경 |
| 실계좌 주문 | ✅ **0건** — `POST`/wss 송신 호출 없음 |
| Playwright `me.spec.ts` · `orderbook.spec.ts` | ❌ **미실행 (아래 §미실행 게이트)** |

## ★ 미실행 게이트 — Playwright E2E

**worktree 에서 실행할 수 없었다.** Playwright `webServer`(Next dev)가 뜨려면
`webapp/.env.local` · `webapp/.env.test.local` 이 필요한데, 두 파일은 gitignored 라
worktree 에 없다. 그리고 이 실행 환경의 secret-read 가드가 그 경로를 이름으로 지목하는
모든 명령(`cp` · `ln -s` 포함)을 차단하므로 **에이전트가 worktree 로 가져올 방법이 없다.**
가드를 우회하지 않았다.

대신 할 수 있는 만큼은 했다: `tsconfig.e2e.json` 타입체크가 통과하고, 카드의 4가지 표시
계약은 RTL 로 잠겨 있다. 그러나 **「진짜 브라우저에서 세로 순서와 3줄이 실제로 선다」는 아직
증명되지 않았다.**

또한 E2E 라우트 스텁의 단언을 핸들러 **밖**으로 뺐다 — 핸들러 안에서 `expect` 가 던지면
라우트가 영영 fulfill 되지 않아 실패가 아니라 **타임아웃**으로 나타나고 원인이 가려진다.
메서드는 기록만 하고 케이스가 대조한다.

**merge 후 main tree 에서 반드시 실행할 것 (Vercel 배포보다 먼저):**

```bash
cd /Users/alex/repos/gh-radar
pnpm --filter @gh-radar/shared run build
pnpm --filter @gh-radar/webapp exec playwright test specs/me.spec.ts specs/orderbook.spec.ts
```

기대: `me.spec.ts` 케이스 1 이 오늘 주문 카드 3줄 + 세로 순서 5칸을 통과하고,
`orderbook.spec.ts` 케이스 6(REST 주문 라우트 미사용)이 **여전히** 통과한다.
실패하면 배포하지 말 것 — 단언을 약화시켜 통과시키지 않는다.

## ★ 배포 보류 1 — webapp (Vercel)

worktree 에서 빌드하면 산출물이 worktree 에 묶여 main 과 어긋나므로 하지 않았다.
**merge 후 repo root 에서** 실행한다(`rootDirectory=webapp` 이라 `webapp/` 에서 돌리면
`webapp/webapp` ENOENT 가 난다):

```bash
cd /Users/alex/repos/gh-radar
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

확인: `vercel inspect https://gh-radar-webapp.vercel.app` 의 age 가 방금인지.
그다음 사용자가 프로덕션 `https://gh-radar-webapp.vercel.app/me` 를 새로고침해 오늘 주문
3건(접수 2 · 취소 1)이 **중복 없이** 한 줄씩 보이는지 확인한다. **새 주문은 내지 않는다.**
이 확인이 RELAY-02 잔여 ①의 해소 조건이다.

## ★ 배포 보류 2 — relay (Cloud Run)

**지금 장중이고 컨테이너 재시작이 DMA 세션을 끊는다.** 마감(15:30 KST) 후 실행한다.

```bash
cd /Users/alex/repos/gh-radar
GCP_PROJECT_ID=gh-radar SUPABASE_URL=<기존 값> ./scripts/deploy-relay.sh
```

**`DMA_HOST` 를 주입하지 않는다** — 16-45 의 3단 우선순위가 실행 중인 컨테이너 값을
보존한다(16-46 이 무주입 배포로 실증했다).

배포 후 확인:

```bash
curl -s https://dma.jx1.io/healthz
```

기대: `"dma":true` 이고 `"version"` 이 **`ecbd978`**(또는 merge 후 그 커밋의 main 해시)다.
`sessionCount` · `everReadyCount` 가 배포 전 값 대비 회복되는지도 같이 본다.
확인 후 Cloud Logging 에서 `reason="out-of-scope-msg-type"` 이 debug 로 들어오고
WARNING 스트림에서 74/75 가 사라졌는지 대조하면 이 변경의 효과가 실측된다.

## Deviations from Plan

계획 대비 실질 이탈은 없다. 계획이 지시한 배포 2건은 **계획 자체가/실행 지시가 보류로
정한 것**이므로 이탈이 아니다. 기록해 둘 두 가지:

1. **[Rule 3 - Blocking] Playwright 를 worktree 에서 돌릴 수 없었다.** 원인·대응은 위
   §미실행 게이트. 밀어붙이지 않았고 단언을 약화시키지도 않았다.
2. **[Rule 1 - Bug] E2E 라우트 핸들러 안의 `expect` 를 밖으로 뺐다.** 처음 작성한 스텁이
   핸들러 안에서 메서드를 단언했는데, 그 단언이 깨지면 라우트가 fulfill 되지 않아 실패가
   타임아웃으로 위장된다. 같은 커밋(범위 A) 안에서 고쳤다.

## Known Stubs

없다. 이번 변경은 하드코딩된 빈 값이나 placeholder 를 남기지 않는다. 화면에 보이는 모든
값의 원천은 서버 응답 또는 라이브 프레임이고, 모르는 값은 지어내지 않고 `—` 로 둔다.

## Threat Flags

없다. 새 네트워크 표면·인증 경로·스키마 변경이 없다. `GET /api/orders` 는 이미 존재하던
라우트이고 서버 코드는 한 줄도 고치지 않았다. 새 패키지 설치 0건.

## 이관 (범위 밖 발견)

- **worktree 에 E2E 환경이 없다** — gitignored env 파일 때문에 worktree 로 격리된 에이전트는
  Playwright 를 돌릴 수 없다. 병렬 wave 에서 E2E 가 걸린 plan 을 worktree 로 보내면 같은 벽에
  부딪힌다. 고치지 않았다(이 작업의 범위 밖). 대응 후보: worktree 생성 스크립트가 env 파일을
  심볼릭 링크로 걸어 주기.
- `webapp` 스위트에 **skipped 1건**, `workers` 에 **todo 6건**이 기준선부터 있다. 이번 작업이
  만든 것이 아니며 손대지 않았다.

## Self-Check

아래를 실제로 확인했다.

- 생성 파일 5개 전부 디스크에 존재 (`auth-fetch.ts` · `orders-api.ts` · `orders-api.test.ts` ·
  `today-orders-card.tsx` · `today-orders-card.test.tsx`)
- 커밋 `04f36d1` · `ecbd978` 이 `git log` 에 존재하고, 두 커밋의 파일 목록이 겹치지 않는다
- 두 커밋 모두 **삭제된 파일 0건** (`git diff --diff-filter=D`)
- `git rev-list --count 2a98f9f..HEAD` = **2** (프론트매터 `commits` 와 일치)

## Self-Check: PASSED
