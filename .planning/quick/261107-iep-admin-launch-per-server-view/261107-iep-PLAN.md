---
phase: quick-261107-iep
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer) — 발사 서버 목록 한 벌 → ?gw → 서버 칩 → 주문 내역 서버별 · 서버 라벨
  - packages/shared/src/launch.ts
  - packages/shared/src/__tests__/launch.test.ts
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/__tests__/launch-format.test.ts
  - webapp/src/lib/radio-keys.ts
  - webapp/src/components/me/account-chips.tsx
  - webapp/src/components/admin/launch-server-chips.tsx
  - webapp/src/components/admin/__tests__/launch-server-chips.test.tsx
  - webapp/src/components/admin/launch-client.tsx
  - webapp/src/components/admin/__tests__/launch-client.test.tsx
  - webapp/src/components/admin/launch-orders-tab.tsx
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
  - webapp/src/components/admin/launch-gate-chart.tsx
  - webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/e2e/specs/admin-launch.spec.ts
  # Task 2 — 계획 대상 3대(shared · server) + 경계 지도 서버별 · 편집 칸 닫힘
  - packages/shared/src/launch-plan.ts
  - packages/shared/src/__tests__/launch-plan.test.ts
  - server/src/schemas/admin-launch.ts
  - server/src/services/relay-admin-client.ts
  - server/tests/routes/admin-launch.test.ts
  - server/tests/fixtures/fake-relay-admin.ts
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  # Task 3 — e2e 경계 지도 · 계획 묶음 서버별 + 전 범위 회귀 (admin-launch.spec.ts — 위에 이미 있음)
autonomous: true
requirements: ["261107-iep"]

estimate:
  tokens: 160000
  raw_tokens: 160000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "S-1: /admin/launch 제목(PageHeader) 아래 · 탭 줄 위에 서버 칩 한 줄(radiogroup 「발사 서버」)이 있고 칩은 서버 레지스트리 순 KB120 → 교보119 → 교보112 이다. 쿼리가 없으면 KB120 이 골라져 있다"
    - "S-2: 칩 클릭 · 화살표(끝에서 반대편으로 돈다) · Home/End 로 고르면 주소가 router.replace 로 ?gw=<서버키> 가 되고 tab · d · fire · range 는 그대로다. 모르는 gw(KB121 · 소문자 · 빈 값)는 그 키만 replace 로 지우고 KB120 으로 그린다"
    - "S-3: 주문 내역 탭은 고른 서버의 코스닥 · 코스피 머리 카드 2장과 그 서버 조각 묶음만 그리고, 발사가 없으면 「<서버> <시장> · 이 날 발사 없음」 빈 카드다. 출처 칩은 「<서버키> 저널 80 · 16:00:01 적재」(09:00:30 은 09:00:31). 서버를 바꿔도 /orders 재요청은 0 이고 날짜 내비(‹ ›)는 응답 날짜 목록 그대로다"
    - "S-4: 경계 지도 탭은 요약 카드 · 패널이 고른 서버의 2개(코스닥 → 코스피)다. 서버를 바꿔도 /map · /plan 재요청은 0 이고, 열린 계획 편집 칸은 닫힌다(다시 그 서버로 돌아와도 닫힌 채)"
    - "S-5: 라벨이 서버 라벨이다 — 머리 카드 · 조각 묶음 제목 · 지도 패널 · 요약 카드 · 차트 aria 가 「KB120 코스닥」 · 「교보119 코스피」 · 「교보112 코스닥」"
    - "S-6: 기존 기록 보존 — 옛 KB 기록은 KB120 칩, 옛 교보 기록은 교보119 칩에서 그대로 보이고(카드 · 조각 · 지도 점), 교보112 칩은 주문 내역 빈 카드 2장 · 지도 「이 범위에 발사 없음」 패널 2개다. DB 마이그레이션 · 데이터 이전 · 삭제 0건"
    - "S-7: server GET /api/admin/launch/plan 은 relay 에 KB120 · KYOBO119 · KYOBO112 3대를 한 번에 묻고 응답 servers 키도 그 순서 3개다. PUT /api/admin/launch/plan/KYOBO112/:fire/:market 은 relay 로 가고 KB121 은 여전히 400 이다"
    - "S-8: launch-queue(게이트웨이 순열 · order_est) 결과는 기존 서버에 대해 그대로다 — shared ticks-launch-queue 테스트 · tick-convert launch 테스트 무수정 통과"
  artifacts:
    - path: packages/shared/src/launch.ts
      provides: "LAUNCH_SERVERS(KB120 · KYOBO119 · KYOBO112 한 벌) · LaunchServer · launchServerLabelOf · LAUNCH_ORDER = LAUNCH_SERVERS × (Q, K)"
      contains: "LAUNCH_SERVERS"
    - path: packages/shared/src/launch-plan.ts
      provides: "LAUNCH_PLAN_GATEWAYS = LAUNCH_SERVERS (계획 대상 3대)"
    - path: webapp/src/components/admin/launch-server-chips.tsx
      provides: "LaunchServerChips — 목업 D 서버 칩 radiogroup(MeAccountChips 와 같은 꼴 · 키보드 문법)"
      contains: "launch-server-chip"
    - path: webapp/src/lib/radio-keys.ts
      provides: "radioKeyTargetOf — radiogroup 화살표 · Home/End 목표 칩 계산 한 벌(MeAccountChips · LaunchServerChips 공용)"
    - path: webapp/src/lib/launch-format.ts
      provides: "serverMarketLabelOf(서버 라벨) · launchGatewayParamOf(?gw 파서)"
      contains: "launchGatewayParamOf"
    - path: webapp/src/components/admin/launch-client.tsx
      provides: "?gw 쿼리 진실 원본 · 정본화 · 칩 → 두 탭 gw"
    - path: webapp/src/components/admin/launch-orders-tab.tsx
      provides: "주문 내역 서버별(카드 2 · 묶음 · 출처 칩)"
    - path: webapp/src/components/admin/launch-map-tab.tsx
      provides: "경계 지도 서버별(요약 2 · 패널 2) · 서버 전환 시 편집 칸 닫힘"
  key_links:
    - from: webapp/src/components/admin/launch-client.tsx
      to: webapp/src/components/admin/launch-server-chips.tsx
      via: "gw · onGw(router.replace ?gw)"
      pattern: "LaunchServerChips"
    - from: webapp/src/components/admin/launch-client.tsx
      to: "LaunchOrdersTab · LaunchMapTab"
      via: "gw prop"
      pattern: "gw=\\{gw\\}"
    - from: webapp/src/components/admin/launch-orders-tab.tsx
      to: packages/shared/src/launch.ts
      via: "LAUNCH_ORDER 를 gw 로 거른 2칸"
      pattern: "LAUNCH_ORDER"
    - from: server/src/schemas/admin-launch.ts
      to: packages/shared/src/launch-plan.ts
      via: "z.enum(LAUNCH_PLAN_GATEWAYS) — KYOBO112 허용"
      pattern: "LAUNCH_PLAN_GATEWAYS"
---

<objective>
어드민 발사 메뉴(`/admin/launch`)를 증권사(KB · 교보) 고정 4칸에서 **서버별 보기**로 바꾼다 — 페이지 제목 아래 · 탭 위 서버 칩(KB120 · 교보119 · 교보112, 목업 D)으로 서버를 고르면 주문 내역 · 발사 경계 지도 · 발사 계획(주문시각) 고치기가 그 서버의 코스닥 · 코스피 2칸만 다룬다. 기존 기록은 지우지 않는다 — KB 기록은 KB120 칩, 교보 기록은 교보119 칩에서 그대로 보인다(DB 는 이미 서버 키로 적재돼 있어 웹은 `gateway` 로 거르기만 한다).

Purpose: 2026-11-05 재투입된 교보112 를 포함해 서버마다 발사 결과를 보고 그 서버의 발사 시각을 손볼 수 있어야 한다(사용자 원문 · CONTEXT 「Task Boundary」).
Output: shared 발사 서버 목록 한 벌 + 서버 라벨 · server 계획 대상 3대 · 웹 서버 칩 · `?gw` · 두 탭 서버별 렌더 · 단위/e2e 테스트.

Locked decisions (CONTEXT `<decisions>` — 번호 없음, 절 이름으로 인용):
- 「서버 고르기 모양」 = 목업 D(My page 계좌 칩 꼴 · radiogroup · 가로 스크롤 · 선택 칩 `--seg-on-*` · 나머지 `--muted`) · 제목 아래 탭 위 · 두 탭 공용 · 칩 글자 `KB120` · `교보119` · `교보112` · 레지스트리 순 · 기본 KB120.
- 「상태 · 주소」 = `?gw=<서버키>` 진실 원본 · 칩 전환 `router.replace`(다른 키 보존) · 모르는 값 replace 로 지움.
- 「탭별 동작」 = 클라이언트 필터(재요청 없음) · 계획 조회 탭 진입 1회 그대로 · 서버 바꾸면 편집 칸 닫힘.
- 「라벨」 = 서버 라벨(「KB120 코스닥」 · 「교보119 코스피」).
- 「계약」 = shared 발사 서버 목록 한 벌 + 표시 이름 · `LAUNCH_ORDER` = 목록 × (Q, K) · `LAUNCH_PLAN_GATEWAYS` 에 KYOBO112.
- 「기존 기록 보존」 = 마이그레이션 · 이전 · 삭제 0건 · 날짜 내비는 응답 전체 날짜 그대로 · 테스트로 못 박는다.
- Claude's Discretion 처리: 칩은 발사 전용 작은 컴포넌트(`LaunchServerChips`)로 두고, 키보드 목표 칩 계산만 순수 함수(`radioKeyTargetOf`)로 뽑아 `MeAccountChips` 와 공유한다(중복 최소 · /me · 작업대 동작 불변 — 기존 테스트로 증명). 서버 목록은 레지스트리 API 가 아니라 shared 상수 한 벌.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261107-iep-admin-launch-per-server-view/261107-iep-CONTEXT.md
@.planning/quick/261107-iep-admin-launch-per-server-view/reference/mockup-launch-server-pick.html
@packages/shared/src/launch.ts
@packages/shared/src/launch-plan.ts
@webapp/src/components/me/account-chips.tsx
@webapp/src/components/admin/launch-client.tsx
@webapp/src/lib/launch-format.ts

<interfaces>
<!-- 실측(2026-11-07 HEAD d163d97f). 탐색 없이 바로 쓴다. -->

packages/shared/src/launch.ts
- `LAUNCH_ORDER` (51행) = 고정 4쌍 [KB120 Q] [KB120 K] [KYOBO119 Q] [KYOBO119 K], `as const satisfies ReadonlyArray<readonly [string, LaunchMarket]>`.
- `LaunchMarket = "K" | "Q"` · `LaunchPieceRow.gateway` 주석 「서버 키 — KB120 · KYOBO119」(66행).
- import 는 `./limitup-report` 타입 하나뿐. `./admin` 의 `brokerOfServerKey(key): "KB" | "KYOBO" | null` · `SERVER_KEY_RE = /^(KB|KYOBO)[0-9]{1,3}$/` — admin.ts 는 launch.ts 를 import 하지 않는다(순환 없음).

packages/shared/src/ticks/launch-queue.ts 256~262행 `gatewayRank(g)` — LAUNCH_ORDER 게이트웨이 중복 제거 순서의 index, 없으면 order.length. KYOBO112 는 지금도 rank 2(모르는 게이트웨이), 바뀐 뒤에도 rank 2 → 결과 불변. 이 파일은 고치지 않는다.

packages/shared/src/launch-plan.ts 21~25행
- `LAUNCH_PLAN_GATEWAYS = ["KB120", "KYOBO119"] as const` · `LaunchPlanGateway` · 주석 「KB121 · KYOBO127 은 대상이 아니다(gh-trade 43 D-02)」.

packages/shared/src/__tests__/launch.test.ts — 84행 「LAUNCH_ORDER = 첨부 ORDER」 toEqual 4쌍 · 171 · 268 · 291행 `for (const [gateway, market] of LAUNCH_ORDER)` 가 첨부 정답지(EXPECTED_DAYS · EXPECTED_PANELS · EXPECTED_RIBBON — 4키)를 돈다 → 6쌍이면 KYOBO112 키가 없어 깨진다.
packages/shared/src/__tests__/launch-plan.test.ts 79~81행 — LAUNCH_PLAN_GATEWAYS = ["KB120","KYOBO119"] 이고 = LAUNCH_ORDER 서버 키 중복 제거.

server
- `server/src/schemas/admin-launch.ts` 30행 주석 「KB121 · KYOBO127 은 계획 대상이 아니다」 · 33행 `gateway: z.enum(LAUNCH_PLAN_GATEWAYS)`.
- `server/src/services/admin-launch.ts` `readLaunchPlanServers` 는 LAUNCH_PLAN_GATEWAYS 를 돌며 relay 가 빠뜨린 서버를 offline 으로 접는다(코드 무변경).
- `server/src/services/relay-admin-client.ts` 244행 주석 `?servers=KB120,KYOBO119`.
- `server/tests/routes/admin-launch.test.ts` 307행 `PLAN_READ_PATH = "/internal/admin/launch-plan?servers=KB120,KYOBO119"` · 347~357(S1 relay 스텁 2서버 · 키 2개 기대) · 376~404(S3 두 서버 offline) · 409~430(KYOBO119 빠뜨림) · 679행 KB121 400.
- `server/tests/fixtures/fake-relay-admin.ts` 50~53행 `LAUNCH_PLAN_DEFAULT = { KB120: planOf(-245), KYOBO119: planOf(-200) }`.

webapp/src/lib/launch-format.ts
- 95행 `BROKER_LABEL` — `webapp/src/components/pnl/pnl-admin-client.tsx` 가 import 한다(남겨 둔다).
- 98~102행 (서버 키, 시장) → 「KB 코스닥」 라벨 함수 — 소비처: launch-orders-tab.tsx(19 · 213 · 279행) · launch-map-tab.tsx(26 · 631행) · launch-gate-chart.tsx(10 · 102행) · launch-format.ts 254행(카드 title) · 테스트 launch-format.test.ts 216~217.
- `launchTabOf` · `launchFireParamOf`(쿼리 파서 꼴) · `orderIndexOf`(LAUNCH_ORDER index).

webapp/src/components/me/account-chips.tsx — `MeAccountChips`: radiogroup · roving tabindex · onKeyDown 이 ArrowRight/Down +1(돈다) · ArrowLeft/Up −1(돈다) · Home 0 · End 끝 · 그 밖 return, preventDefault → focus → pick. 칩 클래스 `inline-flex h-8 flex-none items-center gap-1 rounded-full px-3 whitespace-nowrap` + on `bg-[var(--seg-on-bg)] text-[var(--seg-on-fg)] shadow-[var(--seg-on-shadow)]` / off `bg-[var(--muted)] text-[var(--muted-fg)]` · 줄 `flex min-w-0 flex-nowrap gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`. 소비처: me-client · workbench-status-bar · pnl-admin-client. 테스트 `webapp/src/components/me/__tests__/account-chips.test.tsx`(키보드 7건) · `webapp/src/components/trading/__tests__/workbench-status-bar.test.tsx`.

webapp/src/components/admin/launch-client.tsx — 쿼리 tab · d · fire · range 파싱 → bad* 플래그 → 정본화 effect 한 번(replace) · `hrefWith` · onTab/onFire/onRange = replace · onGoDate/onLatest = push. 레이아웃 `PageHeader` → `Tabs`. 테스트는 두 탭을 대역으로 mock(`data-fire`).

webapp/src/components/admin/launch-orders-tab.tsx — `LaunchOrdersTab`(받기 · effect deps [d, attempt]) · `LaunchOrdersView`(cards = LAUNCH_ORDER.map → 4장 · groups = groupsOf(orderTabPiecesOf(resp.pieces, fire)) · 출처 칩 문자열 「KB120 · KYOBO119 저널 80 · {seg.loaded} 적재」 · noHistory/emptyDay 는 응답 전체 기준) · `CardsSkeleton` 4칸.

webapp/src/components/admin/launch-map-tab.tsx — `LaunchMapTab`(계획 effect [] · 지도 effect [fire, range, attempt] · `editing = edit !== null && edit.fire === fire ? edit : null` · onFire 에서 closeEdit) · `panelsOf(resp, fire, plan)` = LAUNCH_ORDER.map 4패널 · `LaunchMapView`(sideless · tailProbed = resp.pieces 전체 · KPI grid `grid-cols-2 md:grid-cols-4` · 패널 세로 쌓기) · `MapSkeleton` KPI 4칸.
webapp/src/lib/launch-plan-view.ts `panelPlanOf` — `state.resp.servers[gateway]` 가 없으면 대신 값 경로(server 배포 전 KYOBO112 도 안전 · 무변경).

e2e — `webapp/e2e/specs/admin-launch.spec.ts`(describe 4개: 「주문 내역」 P35-L1~L6 · 「경계 지도」 P35-M1~M5 · 「발사 계획(읽기)」 P35-P1~P2 · 「발사 계획(고치기)」 P35-P3~P6) · `mockLaunchApi(page)` → `api.orders()` · `api.maps()` · `api.planGets()` · `api.planPuts()`. 픽스처 `webapp/e2e/fixtures/launch.ts` 는 KB120 · KYOBO119 행만 — KYOBO112 0행(실DB 와 같음) · 고치지 않는다.

명령(그라운딩 완료): `pnpm --filter @gh-radar/shared exec vitest run <파일> --maxWorkers=2` 통과 확인 · `pnpm --filter @gh-radar/tick-convert exec vitest run tests/launch-queue.test.ts tests/launch-live.test.ts --maxWorkers=2` 통과 확인. server · webapp 의 tsc 는 shared `dist` 타입을 보므로 **shared build 먼저**.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): 발사 서버 목록 한 벌 → ?gw → 서버 칩 → 주문 내역 서버별 · 서버 라벨</name>
  <files>packages/shared/src/launch.ts, packages/shared/src/__tests__/launch.test.ts, webapp/src/lib/launch-format.ts, webapp/src/lib/__tests__/launch-format.test.ts, webapp/src/lib/radio-keys.ts, webapp/src/components/me/account-chips.tsx, webapp/src/components/admin/launch-server-chips.tsx, webapp/src/components/admin/__tests__/launch-server-chips.test.tsx, webapp/src/components/admin/launch-client.tsx, webapp/src/components/admin/__tests__/launch-client.test.tsx, webapp/src/components/admin/launch-orders-tab.tsx, webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx, webapp/src/components/admin/launch-gate-chart.tsx, webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx, webapp/src/components/admin/launch-map-tab.tsx, webapp/e2e/specs/admin-launch.spec.ts</files>
  <behavior>
    - shared: LAUNCH_SERVERS = KB120 · KYOBO119 · KYOBO112 순 · LAUNCH_ORDER = 6쌍(KB120 Q · KB120 K · KYOBO119 Q · KYOBO119 K · KYOBO112 Q · KYOBO112 K) · 앞 4쌍 = 첨부 ORDER 그대로.
    - shared: launchServerLabelOf("KB120") = "KB120" · ("KYOBO119") = "교보119" · ("KYOBO112") = "교보112" · ("KB121") = "KB121" · 형식 밖("X1" · "") = 원문.
    - webapp: 라벨 함수 (KB120, Q) = "KB120 코스닥" · (KYOBO119, K) = "교보119 코스피" · (KYOBO112, Q) = "교보112 코스닥" · 모르는 시장은 원문.
    - webapp: launchGatewayParamOf — "KB120" · "KYOBO119" · "KYOBO112" 는 그대로 · "KB121" · "kyobo119" · "" · null → null.
    - webapp: radioKeyTargetOf(key, at, count) — →/↓ +1(끝에서 0) · ←/↑ −1(0 에서 끝) · Home 0 · End count−1 · 그 밖 null.
    - 칩: 라디오 3개 「KB120」 · 「교보119」 · 「교보112」 · 선택 칩만 aria-checked · tabIndex 0 · 다른 칩 클릭 → onGw(키) 1회 · 선택 칩 재클릭 0회 · 교보112 에서 → 는 KB120(포커스 + onGw) · Home/End.
    - 클라이언트: 쿼리 없음 → 주문 탭 gw = KB120 · replace 0 / gw=KYOBO112 그대로 · replace 0 / gw=KB121 · gw=kyobo119 → 그 키만 지운 주소로 replace 1회(다른 키 보존) · 잘못된 fire 와 gw 가 함께면 한 번에 둘 다 / 칩 「교보119」 클릭 → replace 가 다른 키를 보존한 `gw=KYOBO119` 주소.
    - 주문 내역 뷰: gw=KB120 → 카드 [KB120|Q, KB120|K] · KB120 묶음만 · 출처 칩 「KB120 저널 80 · 16:00:01 적재」 / gw=KYOBO119 → 교보 기록 카드 · 묶음 · 「교보119 코스피 · 이 날 발사 없음」 / gw=KYOBO112 → 빈 카드 2장 「교보112 코스닥 · 이 날 발사 없음」 · 「교보112 코스피 · 이 날 발사 없음」 · 묶음 0 · emptyDay 문구 아님(그날 다른 서버 발사가 있으니까).
  </behavior>
  <action>
**① shared `packages/shared/src/launch.ts`** (「계약」 절)
- `LAUNCH_ORDER` 위에 발사 서버 목록 한 벌 `LAUNCH_SERVERS = ["KB120", "KYOBO119", "KYOBO112"] as const` 와 `type LaunchServer` 를 둔다. 주석: 순서 = 서버 레지스트리 순(`dma_servers` sort_order) · KB121 은 꺼진 서버라 넣지 않는다 · KYOBO112 = gh-trade 2026-11-05 옛 127 기계를 10.16.207.112 로 재투입한 교보 서버(119 사본) · 새 발사 서버 추가는 이 줄 한 칸 · 레지스트리 API 로 동적으로 받지 않는다(quick-261107-iep).
- `launchServerLabelOf(key: string): string` — 표시 이름. 증권사 접두는 `./admin` 의 `brokerOfServerKey` 로 판정(정규식 두 벌 금지), KB 는 키 그대로(「KB120」), KYOBO 는 「교보」 + 번호(「교보119」), 형식 밖은 원문. 표시 문자열 「교보」 는 이 모듈 안 작은 맵 한 곳.
- `LAUNCH_ORDER` 를 `LAUNCH_SERVERS` × 시장(코스닥 Q → 코스피 K)으로 만든다 — 타입은 `ReadonlyArray<readonly [LaunchServer, LaunchMarket]>`. 주석 고침: 앞 4쌍 = 첨부 ORDER 그대로(기존 두 서버 순서 불변), `ticks/launch-queue` `gatewayRank` 에서 KYOBO112 는 바뀌기 전에도 「모르는 게이트웨이 = rank 2」 였으므로 기존 서버 · 112 모두 순열 · order_est 결과 불변(모르는 게이트웨이 둘이 동시에 올 때의 이름순 동률만 달라지는데 KB121 은 꺼져 있다). `LaunchPieceRow.gateway` 주석에 KYOBO112 추가. `ticks/launch-queue.ts` 는 고치지 않는다.

**② shared 테스트 `packages/shared/src/__tests__/launch.test.ts`**
- 첨부 정답지를 도는 세 루프(launchDaysOf · launchPanelStatsOf · launchRibbonAt)는 `LAUNCH_ORDER` 대신 테스트 안 지역 상수 `ATTACH_ORDER`(첨부 4쌍)를 돈다 — 정답지는 첨부 4패널 그대로.
- 「LAUNCH_ORDER = 첨부 ORDER」 테스트를 바꾼다: LAUNCH_SERVERS 순서 · LAUNCH_ORDER 6쌍 전체 · 앞 4쌍 = ATTACH_ORDER. `launchServerLabelOf` 표 테스트 추가(behavior 대로).

**③ webapp `webapp/src/lib/radio-keys.ts`(신규)** — `radioKeyTargetOf(key: string, at: number, count: number): number | null`(behavior 대로). 머리 주석: WAI-ARIA radio group 화살표 문법 한 벌 · `MeAccountChips` ②와 `LaunchServerChips` 가 같이 쓴다.
`webapp/src/components/me/account-chips.tsx` 의 onKeyDown 은 if-사슬 대신 이 함수를 쓴다 — null 이면 그대로 return, 아니면 지금처럼 preventDefault → focus → pick. **동작은 한 글자도 바꾸지 않는다**(잠금 · 같은 계좌 가드 · data-account-no 그대로). 기존 테스트 무수정 통과가 증거.

**④ webapp `webapp/src/lib/launch-format.ts`** (「라벨」 절)
- (서버 키, 시장) 라벨 함수를 서버 라벨로 바꾸고 이름을 `serverMarketLabelOf` 로 바꾼다 — `launchServerLabelOf(gateway)` + 시장 라벨. 옛 이름 별칭은 남기지 않는다. 소비처 import · 호출을 모두 새 이름으로: launch-orders-tab.tsx · launch-map-tab.tsx(import + 요약 카드 한 줄만 — 서버별 거르기는 Task 2) · launch-gate-chart.tsx · 같은 파일 카드 title. 안 쓰게 된 `brokerOfServerKey` import 는 지운다. `BROKER_LABEL` export 는 남긴다(pnl-admin-client 가 쓴다).
- `launchGatewayParamOf(raw: string | null | undefined): LaunchServer | null` 를 `launchFireParamOf` 옆에 둔다(LAUNCH_SERVERS 정확 일치만 · 대소문자 구분).
- 머리 주석 ② · `LaunchHeadCardBase.title` 예시(「KB 코스닥」 → 「KB120 코스닥」) · orderTabPiecesOf 주석을 맞춘다.
- 테스트 `webapp/src/lib/__tests__/launch-format.test.ts`: 라벨 기대값 서버 라벨로 · 교보112 · 모르는 시장 케이스 추가 · `launchGatewayParamOf` 케이스(behavior) · 「LAUNCH_ORDER 묶음 순」 제목 · 카드 title 기대값(「KB120 코스닥」).

**⑤ webapp `webapp/src/components/admin/launch-server-chips.tsx`(신규)** (「서버 고르기 모양」 절 · 목업 D)
- `'use client'` · `LaunchServerChips({ gw, onGw }: { gw: LaunchServer; onGw: (g: LaunchServer) => void })`.
- 그룹: `role="radiogroup"` · `aria-label="발사 서버"` · `data-slot="launch-server-chips"` · MeAccountChips 와 같은 줄 클래스(가로 스크롤 · 스크롤바 숨김).
- 칩: `LAUNCH_SERVERS` 순 · 글자 `launchServerLabelOf(key)` · `type="button"` · `role="radio"` · `aria-checked` · `data-slot="launch-server-chip"` · `data-gw={key}` · roving tabIndex(선택 0 · 나머지 −1) · 클릭 = 같은 칩이면 무시, 아니면 onGw. 클래스는 MeAccountChips 칩과 같은 꼴 + 글자 `text-[12.5px] font-semibold`(목업 `.srvchips button`).
- onKeyDown = `radioKeyTargetOf` → 목표 칩 focus + 같은 가드로 onGw(포커스 이동 = 선택 · MeAccountChips ② 와 같은 이유: 로컬 상태라 왕복 없음).
- 머리 주석: 왜 탭이 아니라 radiogroup(바로 아래가 탭 줄 — 탭 안 탭 회피) · 목업 D · 잠금 · 줄인 칩 기능은 필요 없어 두지 않는다 · 값은 부모(`LaunchClient` 쿼리)가 쥔다.
- 테스트 `webapp/src/components/admin/__tests__/launch-server-chips.test.tsx`(신규): behavior 칩 항목 전부 — `@testing-library/react` + `user-event` 꼴은 account-chips.test.tsx 를 따른다(제어형 래퍼로 → 세 번 돌기 확인).

**⑥ webapp `webapp/src/components/admin/launch-client.tsx`** (「상태 · 주소」 절)
- `gw` 쿼리: `launchGatewayParamOf` 로 파싱 · 기본 `LAUNCH_SERVERS[0]`(KB120) · `badGw` 를 기존 정본화 effect 에 합친다(그 키만 delete · 한 번의 replace). `onGw = (g) => router.replace(hrefWith((p) => p.set('gw', g)))`.
- 렌더: `PageHeader` 다음 · `Tabs` 앞에 `<LaunchServerChips gw onGw />`. `LaunchOrdersTab` 에 `gw` 를 넘긴다(LaunchMapTab 에는 Task 2 에서 넘긴다).
- 머리 주석 쿼리 목록에 `gw` 항목 추가(두 탭 공용 · 클라이언트 필터라 재요청 없음 · 잘못된 값 replace 로 지움 · quick-261107-iep).
- 테스트 `webapp/src/components/admin/__tests__/launch-client.test.tsx`: 두 탭 mock 에 `data-gw` 추가(orders mock 은 gw prop 을 읽는다) · behavior 클라이언트 항목 전부 추가 · 기존 3건 유지.

**⑦ webapp `webapp/src/components/admin/launch-orders-tab.tsx`** (「탭별 동작」 주문 내역)
- `LaunchOrdersTabProps` · `LaunchOrdersViewProps` 에 `gw: LaunchServer`. 받기 effect deps 는 [d, attempt] 그대로 — gw 를 넣지 않는다(서버 전환 = 같은 응답 다시 거르기).
- cards = `LAUNCH_ORDER` 중 gateway === gw 인 2쌍(코스닥 → 코스피). groups = 탭 조각 중 gateway === gw 만. 출처 칩 = 「{gw} 저널 80 · {seg.loaded} 적재」(CONTEXT 가 「고른 서버 키」 로 잠금 — 목업은 표시 이름이었지만 잠긴 결정을 따른다). noHistory · emptyDay · 날짜 내비는 응답 전체 기준 그대로(「기존 기록 보존」 — 날짜 목록을 서버별로 좁히지 않는다). `CardsSkeleton` 4칸 → 2칸. 머리 주석의 「머리 카드 4장(LAUNCH_ORDER 순)」 을 「고른 서버의 2장」 으로.
- 테스트 `webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx`: `view()` 기본 `gw: 'KB120'`. 「카드 4장」 류는 서버별로 다시 쓴다 — KB120 카드 2장 순서 · 「KB120 코스피 · 이 날 발사 없음」 / KYOBO119 는 `gw: 'KYOBO119'` 로(「교보119 코스피 · 이 날 발사 없음」 · 교보 묶음) / KYOBO112 빈 카드 2장 · 묶음 0 · 「이 날은 발사가 없어요」 아님 / 출처 칩 텍스트 gw 별 · 09:00:30 은 09:00:31. 라벨 문자열 전부 서버 라벨로. 기존 기대값(조각 수 · 결과 · 오프셋 등)은 그 서버 칩에서 그대로 성립해야 한다 — 숫자를 바꾸지 말고 gw 만 맞춘다(「기존 기록 보존」 증거).

**⑧ `webapp/src/components/admin/__tests__/launch-gate-chart.test.tsx`** — 라벨 문자열만(「KB 코스닥」 → 「KB120 코스닥」 · 「교보 코스피」 → 「교보119 코스피」 · heading 이름 · svg aria-label · describe/it 제목). 다른 기대값은 건드리지 않는다.

**⑨ e2e `webapp/e2e/specs/admin-launch.spec.ts` — 「어드민 발사 · 주문 내역」 describe 만**
- P35-L1~L6 을 서버별로 고친다: 카드 수 2 · 기본 KB120 순서 [KB120|Q, KB120|K] · 출처 칩 「KB120 저널 80 · 16:00:01 적재」(L2 는 09:00:31) · 라벨 「KB120 코스피 · 이 날 발사 없음」. KYOBO119 를 보던 단언(교보 코스피 빈 카드 · 10/23 KYOBO119 K 6행 · 교보 코스닥 고정 −200)은 칩 「교보119」 클릭 뒤(또는 `?gw=KYOBO119` 주소)로 옮긴다. 테스트 제목의 「4장」 → 「2장」. 1280 2열 단언(첫 두 장 같은 y)은 그대로 성립한다.
- 새 테스트 `P-SV1 1280 — 서버 칩 · 주문 내역 서버별 · 기존 기록 보존 · 재요청 0 · 잘못된 gw 지움` (이 describe 안): 칩 3개 글자 · 순서 · KB120 aria-checked → KB120 카드에 기존 KB 기록(18조각 등 L1 과 같은 값) → 「교보119」 클릭 → `?gw=KYOBO119` · 카드 [KYOBO119|Q, KYOBO119|K] · 교보 기록 보임 · 출처 칩 KYOBO119 → 「교보112」 클릭 → 빈 카드 2장 · 묶음 0 → `api.orders()` 1건(서버 전환 재요청 0) → 「경계 지도」 탭 클릭 시 주소에 gw 보존 → `?gw=KB121` 로 열면 주소에서 gw 가 지워지고 KB120 이 골라져 있다.

**이 태스크 커밋 시점에 아직 옛 기대를 가진 것(고치지 말 것 — 뒤 태스크 몫):** `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`(6패널 · 라벨) · `packages/shared/src/__tests__/launch-plan.test.ts`(계획 대상 = LAUNCH_ORDER 서버 키) → Task 2. e2e 경계 지도 · 발사 계획 describe → Task 3.

커밋: 위 `<files>` 경로만 `git add <경로…>`(절대 `-A` · `.` 금지 — 다른 세션과 트리 공유) · 한글 메시지 예 「feat(quick-261107-iep): 발사 어드민 서버 칩 · 주문 내역 서버별 · 서버 라벨」 · Co-Authored-By 넣지 않음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts src/__tests__/ticks-launch-queue.test.ts src/__tests__/ticks-launch-queue.golden.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch-format.test.ts src/components/admin/__tests__/launch-server-chips.test.tsx src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-orders-tab.test.tsx src/components/admin/__tests__/launch-gate-chart.test.tsx src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test admin-launch.spec.ts --workers=1 --grep "주문 내역"</automated>
  </verify>
  <done>shared 발사 서버 목록 · 서버 라벨 · LAUNCH_ORDER 6쌍이 있고, /admin/launch 에 서버 칩 3개가 제목 아래 · 탭 위에 보이며, 주문 내역이 고른 서버의 카드 2장 · 묶음 · 출처 칩만 그린다(KB120 = 옛 KB 기록 · 교보119 = 옛 교보 기록 · 교보112 = 빈 카드 2장 · 서버 전환 재요청 0). launch-queue · account-chips · workbench 테스트 무수정 통과. 위 명령 전부 통과 · 커밋 완료.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 계획 대상 3대(shared · server) + 경계 지도 서버별 · 서버 전환 시 편집 칸 닫힘</name>
  <files>packages/shared/src/launch-plan.ts, packages/shared/src/__tests__/launch-plan.test.ts, server/src/schemas/admin-launch.ts, server/src/services/relay-admin-client.ts, server/tests/routes/admin-launch.test.ts, server/tests/fixtures/fake-relay-admin.ts, webapp/src/components/admin/launch-map-tab.tsx, webapp/src/components/admin/__tests__/launch-map-tab.test.tsx, webapp/src/components/admin/launch-client.tsx, webapp/src/components/admin/__tests__/launch-client.test.tsx</files>
  <behavior>
    - shared: LAUNCH_PLAN_GATEWAYS = ["KB120","KYOBO119","KYOBO112"] = LAUNCH_SERVERS = LAUNCH_ORDER 서버 키 중복 제거.
    - server GET /plan: relay 경로 `/internal/admin/launch-plan?servers=KB120,KYOBO119,KYOBO112` · 응답 servers 키 [KB120, KYOBO119, KYOBO112] · relay 실패 · 미설정이면 세 서버 모두 offline · relay 가 KYOBO112 를 빠뜨리면 그 서버만 offline(warn 의 offline 목록에 포함).
    - server PUT `/api/admin/launch/plan/KYOBO112/q16/Q` → 200 · relay `/internal/admin/launch-plan/KYOBO112` · result.server KYOBO112 · 이력 RPC gateway KYOBO112 / KB121 은 400 그대로.
    - 지도 뷰: gw=KB120 → 요약 카드 · 패널 [KB120|Q, KB120|K] · 「KB120 코스닥 · 10일」 / gw=KYOBO119 → 교보 패널 2개(옛 교보 점 그대로) / gw=KYOBO112 → 패널 2개 「이 범위에 발사 없음」 · 요약 「교보112 코스닥 · 0일」 / KB120 점 수 + KYOBO119 점 수 = 196(첨부 전체) · KYOBO112 = 0.
    - 지도 탭: gw 를 바꿔 다시 그려도 fetchLaunchMap · fetchLaunchPlan 호출 수 불변 / KB120 코스닥 편집 칸을 연 채 gw=KYOBO119 로 → 편집 칸 없음 → 다시 KB120 → 여전히 닫힘.
  </behavior>
  <action>
**① shared `packages/shared/src/launch-plan.ts`** (「계약」 절) — `LAUNCH_PLAN_GATEWAYS` 를 `./launch` 의 `LAUNCH_SERVERS` 그대로로 바꾼다(목록 한 벌 — 같은 상수를 다시 적지 않는다). `LaunchPlanGateway` 타입은 유지. 주석을 고친다: 계획 대상 = 발사 서버 한 벌 · 「KB121 은 대상이 아니다(gh-trade 43 D-02 · 꺼진 서버)」 · KYOBO112 는 119 사본 같은 빌드라 44/94 를 받는다(못 받으면 relay 결과 failed 경로로 보인다 · CONTEXT domain). 옛 문구의 KYOBO127 언급은 지운다. `launch.ts` 가 `launch-plan.ts` 를 import 하지 않는지 확인(순환 없음 — 지금은 launch-plan → launch 한 방향).
테스트 `packages/shared/src/__tests__/launch-plan.test.ts` 79~81행: 3서버 순서 · LAUNCH_ORDER 서버 키 중복 제거와 같음 · LAUNCH_SERVERS 와 같음.

**② server** (코드 무변경 — enum 이 shared 를 따른다)
- `server/src/schemas/admin-launch.ts` 30행 주석 → 「KB121 은 계획 대상이 아니다(gh-trade 43 D-02) — 대상 = shared 발사 서버 한 벌(KB120 · KYOBO119 · KYOBO112)」.
- `server/src/services/relay-admin-client.ts` 244행 주석 예시 경로에 KYOBO112 추가.
- `server/tests/fixtures/fake-relay-admin.ts` `LAUNCH_PLAN_DEFAULT` 에 KYOBO112 계획 추가(예 planOf(-200)) · 파일 머리 주석의 「{ KB120, KYOBO119 }」 를 3서버로.
- `server/tests/routes/admin-launch.test.ts`: `PLAN_READ_PATH` 3서버 · S1 relay 스텁이 KYOBO112 도 싣고 body · 키 순서 3개 기대 · S3(실패 3종 · 미설정) 기대에 KYOBO112 · 「relay 가 KYOBO119 를 빠뜨림」 은 KYOBO112 도 빠진 스텁이면 둘 다 offline(warn offline 목록 기대 갱신) · 새 테스트 behavior 의 PUT KYOBO112(기본 가짜 PUT 응답 경로 · 이력 행 gateway) · KB121 400 은 그대로 둔다. 테스트 제목의 「두 서버」 → 「세 서버」.

**③ webapp `webapp/src/components/admin/launch-map-tab.tsx`** (「탭별 동작」 경계 지도)
- `LaunchMapTabProps` · `LaunchMapViewProps` 에 `gw: LaunchServer`. 계획 effect([]) · 지도 effect([fire, range, attempt]) deps 에 gw 를 넣지 않는다 — 서버 전환은 클라이언트 필터(재요청 0).
- `panelsOf` 에 gw 를 받아 `LAUNCH_ORDER` 중 gateway === gw 2쌍만(코스닥 → 코스피). 패널 배치는 지금처럼 세로 쌓기(SVG 640 고정 — 목업의 2열은 모양 확인용이라 따르지 않는다).
- 요약 카드 그리드: `md:grid-cols-4` 를 빼고 `grid-cols-2` 한 가지(2장). `MapSkeleton` 요약 4칸 → 2칸.
- 범례 플래그 `sideless` · `tailProbed` 는 고른 서버 조각만 보고 정한다(안 그린 표식을 범례가 말하지 않게). 범위 글 · noHistory 는 응답 전체 그대로(「기존 기록 보존」 — 범위를 서버별로 좁히지 않는다).
- 편집 칸 닫힘(「탭별 동작」 — 발사 세그먼트 규칙과 같게): `editing` 판정에 `edit.gateway === gw` 를 더하고(렌더 즉시 닫힘), gw 가 바뀌면 `edit` · `lastSave` 를 비운다(effect 또는 이전 gw 비교 — 돌아와도 다시 열리지 않게). 저장 비행 중 서버를 바꿔도 계획 상태(서버별 키)는 지금 로직 그대로 반영된다 — `reloadPlan` · `markPlan` · 저장 핸들러는 건드리지 않는다.
- 머리 주석: 「요약 카드 4장 · 서버 × 시장 4패널(LAUNCH_ORDER 순)」 → 고른 서버 2개 · 서버 전환 = 클라이언트 필터(지도 · 계획 재요청 없음) · 서버를 바꾸면 편집 칸이 닫힌다(quick-261107-iep).
- `webapp/src/components/admin/launch-client.tsx`: `LaunchMapTab` 에 `gw` 를 넘긴다. 테스트 `webapp/src/components/admin/__tests__/launch-client.test.tsx` 의 map mock 이 gw 를 `data-gw` 로 내고, `?tab=map&gw=KYOBO112` → map 에 KYOBO112 · replace 0 한 건 추가.

**④ 테스트 `webapp/src/components/admin/__tests__/launch-map-tab.test.tsx`**
- `view()` 기본 `gw: 'KB120'`. 「요약 카드 4장」 · 「패널 4개」 류를 서버별로 다시 쓴다(behavior 지도 뷰 항목). 「점 합 196」 은 gw=KB120 렌더 점 수 + gw=KYOBO119 렌더 점 수 = 196 · KYOBO112 = 0 으로 같은 불변식을 지킨다. 09:00:30 · 계획 ready · 대신 값 테스트도 숫자는 그대로 두고 그 패널의 gw 만 맞춘다(「기존 기록 보존」 증거). 라벨 문자열 전부 서버 라벨.
- `LaunchMapTab` 렌더(saveKbq 등)에 `gw="KB120"` 을 넘기고 `rerender` 를 돌려준다. 「R 이 비행 중에 교보 코스닥을 저장」 테스트는 KB120 저장 → `rerender(gw="KYOBO119")` 로 교보119 코스닥 편집 · 저장 → R 도착 → `rerender(gw="KB120")` 로 KB120 줄 새 값 확인 → 다시 KYOBO119 에서 교보 값 유지 · 저장 비활성 확인 · fetchLaunchPlan 2회 — 같은 불변식(늦은 다시 읽기가 다른 서버 최신 값을 되돌리지 않음)을 그대로 단언한다.
- 새 테스트(behavior 지도 탭 두 항목): gw 전환 재요청 0 · 편집 칸 닫힘(돌아와도 닫힘).

커밋: `<files>` 경로만 `git add` · 한글 메시지 예 「feat(quick-261107-iep): 발사 계획 대상 교보112 추가 · 경계 지도 서버별 · 서버 전환 시 편집 닫힘」 · Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts src/__tests__/launch-plan.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-launch.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/launch-map-tab.test.tsx src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-gate-chart.test.tsx src/components/admin/__tests__/launch-plan-bar.test.tsx src/components/admin/__tests__/launch-plan-editor.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck</automated>
  </verify>
  <done>LAUNCH_PLAN_GATEWAYS = 3서버(발사 서버 한 벌) · server 가 3대를 묻고 KYOBO112 PUT 을 relay 로 보낸다(KB121 400). 경계 지도가 고른 서버의 요약 2 · 패널 2 만 그리고, 서버 전환에 /map · /plan 재요청 0 · 열린 편집 칸이 닫힌다. KB120 · KYOBO119 의 기존 지도 숫자가 각 칩에서 그대로 · 교보112 는 「이 범위에 발사 없음」. 위 명령 전부 통과 · 커밋 완료.</done>
</task>

<task type="auto">
  <name>Task 3: e2e 경계 지도 · 발사 계획 묶음 서버별 + 서버 칩 지도 e2e + 전 범위 회귀</name>
  <files>webapp/e2e/specs/admin-launch.spec.ts</files>
  <action>
**① e2e `webapp/e2e/specs/admin-launch.spec.ts` — 「경계 지도」 · 「발사 계획(읽기)」 · 「발사 계획(고치기)」 describe** (주문 내역 describe 는 Task 1 에서 끝났다 — 다시 손대지 않는다)
- 패널 · 요약 카드 수 4 → 2, 순서 [KB120|Q, KB120|K], 라벨 서버 라벨, 테스트 제목의 「4패널」 → 「2패널」.
- P35-M1 「점 196」 은 기본(KB120) 점 수 + 칩 「교보119」 뒤 점 수 = 196 으로(같은 불변식) · 칩 전환 뒤 `api.maps()` 1건 그대로.
- KYOBO119 를 보던 단언(P35-M2 교보 코스닥 KPI −200 · P35-P2 ① 4조합 루프 · P35-P5 KYOBO119 코스피 편집)은 칩 클릭 또는 `?gw=KYOBO119` 주소로 옮긴다 — 숫자 · PUT 경로(`/plan/KYOBO119/n0930/K`) · 바디 기대는 그대로(「기존 기록 보존」).
- P35-M3 390: 차트 2개 · 요약 카드 2장이 한 줄 2열(grid-cols-2) · 페이지 가로 스크롤 0 · 서버 칩 줄도 페이지를 넓히지 않는다.
- P35-P6: 「세그먼트 바꾸면 닫힘」 뒤에 「서버 칩 바꾸면 닫힘(돌아와도 닫힘)」 단언 추가.
- 새 테스트 `P-SV2 1280 — 경계 지도 서버별 · 교보112 빈 패널 · 지도 · 계획 재요청 0 · 탭 전환에 gw 보존` (「경계 지도」 describe 안): `?tab=map&range=all` 로 열고 → 「교보112」 칩 → 주소에 gw=KYOBO112 + tab · range 보존 · 패널 [KYOBO112|Q, KYOBO112|K] 각 「이 범위에 발사 없음」 · 요약 「교보112 코스닥 · 0일」 → `api.maps()` 1건 · `api.planGets()` 1건(mockLaunchApi 에 plan 핸들러를 줘서 계획 ready 상태로) → 「주문 내역」 탭 → gw 보존 · 교보112 빈 카드 2장. 픽스처는 고치지 않는다(KYOBO112 계획이 없으면 그 패널은 대신 값 경로 — 그 문구는 단언하지 않는다).

**② 전 범위 회귀** — 아래 verify 를 한 번에 돌린다. Playwright webServer 가 NextFontGoogleFontFileReplacer 반복으로 타임아웃 나면 `rm -rf webapp/.next` 후 재실행. 동시 세션 메모리 때문에 vitest `--maxWorkers=2` · playwright `--workers=1` 고정 · 전체 e2e 스위트는 돌리지 않는다(이 spec 한 파일만).

**③ 배포 메모(실행하지 않는다 — 메인 세션 몫, SUMMARY 에 그대로 적는다):** `packages/shared` · `server/` 가 바뀌었다 → server 새 revision(deploy-server.sh — 교보112 계획 조회 · 저장은 이 뒤부터) 먼저, 그 뒤 webapp push. server 배포 전에 webapp 만 나가도 교보112 패널은 계획 「대신 값」 경로로 안전하다(`panelPlanOf` 가 없는 서버를 대신 값으로 그린다). relay · DB · tick-convert 재배포 불필요(relay 는 서버 키 형식 · 상한 8 만 본다 / 마이그레이션 0 / tick-convert 는 shared 를 쓰지만 KYOBO112 순위가 전과 같다). relay `admin-api.ts` 의 「대상은 지금 2대」 주석은 relay 무변경 원칙상 이번에 고치지 않는다.

커밋: `webapp/e2e/specs/admin-launch.spec.ts` 만 `git add` · 한글 메시지 예 「test(quick-261107-iep): 발사 어드민 e2e 경계 지도 · 계획 서버별 · 교보112 빈 패널」 · Co-Authored-By 없음 · push 없음.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared exec vitest run src/__tests__/launch.test.ts src/__tests__/launch-plan.test.ts src/__tests__/ticks-launch-queue.test.ts src/__tests__/ticks-launch-queue.golden.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/tick-convert exec vitest run tests/launch-queue.test.ts tests/launch-live.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server exec vitest run tests/routes/admin-launch.test.ts --maxWorkers=2 && pnpm --filter @gh-radar/server run typecheck && pnpm --filter @gh-radar/relay run typecheck && pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/launch- src/components/admin/__tests__/launch- src/components/me/__tests__/account-chips.test.tsx src/components/trading/__tests__/workbench-status-bar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test admin-launch.spec.ts --workers=1</automated>
  </verify>
  <done>admin-launch.spec.ts 전체(주문 내역 · 경계 지도 · 계획 읽기 · 고치기 · P-SV1 · P-SV2)가 `--workers=1` 로 통과하고, shared · tick-convert · server · relay 타입 · webapp 발사 관련 단위 테스트 · webapp typecheck 가 모두 통과한다. 배포 메모가 SUMMARY 에 있다. 커밋 완료.</done>
</task>

</tasks>

<verification>
- 쿼리 없는 `/admin/launch` = KB120 칩 선택 · 주문 내역 카드 2장(KB120 코스닥 · 코스피) · 출처 칩 「KB120 저널 80 · 16:00:01 적재」.
- 칩 교보119 → `?gw=KYOBO119` · 옛 교보 기록(카드 · 조각 · 지도 점) 그대로 / 교보112 → 빈 카드 2장 · 지도 「이 범위에 발사 없음」 2패널.
- 서버 전환에 /orders · /map · /plan 재요청 0 · 열린 계획 편집 칸 닫힘.
- server GET /plan relay 경로 `servers=KB120,KYOBO119,KYOBO112` · PUT KYOBO112 허용 · KB121 400.
- launch-queue(shared · tick-convert) 테스트 무수정 통과 · account-chips · workbench 테스트 무수정 통과.
- Task 3 verify 한 줄이 전부 통과.
</verification>

<success_criteria>
- must_haves.truths S-1 ~ S-8 이 단위 · e2e 테스트로 단언되어 통과한다.
- DB 마이그레이션 · relay 변경 0 · `packages/shared/src/ticks/launch-queue.ts` 무변경.
- 세 커밋(Task 1 · 2 · 3) — 각자 경로 지정 `git add` · 한글 메시지 · Co-Authored-By 없음 · push 없음 · 배포 없음.
</success_criteria>

<output>
Create `.planning/quick/261107-iep-admin-launch-per-server-view/261107-iep-SUMMARY.md` when done — 배포 메모(server 먼저 → webapp push · relay/DB/tick-convert 불필요)를 포함한다.
</output>
