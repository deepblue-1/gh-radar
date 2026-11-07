---
phase: quick-261107-jhk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (tracer) — 코드 + 단위 테스트
  - webapp/src/components/admin/launch-client.tsx
  - webapp/src/components/admin/launch-orders-tab.tsx
  - webapp/src/components/admin/launch-map-tab.tsx
  - webapp/src/components/admin/launch-server-chips.tsx
  - webapp/src/lib/launch-map.ts
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/admin/__tests__/launch-client.test.tsx
  - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
  - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
  - webapp/src/lib/__tests__/launch-map.test.ts
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  # Task 2 — e2e
  - webapp/e2e/specs/admin-launch.spec.ts
  - webapp/e2e/specs/sidebar-tree.spec.ts
autonomous: true
requirements: ["261107-jhk"]

estimate:
  tokens: 70000
  raw_tokens: 70000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "J-1: 사이드바 Admin 하위 마지막 메뉴 글자가 「러쉬 주문」 이고 href 는 /admin/launch 그대로다(CONTEXT 「이름」)"
    - "J-2: /admin/launch 의 h1 이 「러쉬 주문」 이고 제목 밑 설명 문단이 없다. 문서 제목은 날짜 없으면 「러쉬 주문 · Admin」, ?d 있으면 「러쉬 주문 · Admin · MM/DD」(CONTEXT 「이름」 · 「지우는 문구」)"
    - "J-3: 상단 순서가 제목 → 탭 줄(주문 내역 · 경계 지도) → 서버 칩 줄(두 탭 공용 · DOM 에 한 벌) → 컨트롤 줄이고, 탭 줄-서버 칩 간격(14px)이 서버 칩-컨트롤 줄 간격(10px)보다 넓다(CONTEXT 「상단 순서 — H1」)"
    - "J-4: 컨트롤 줄 = 날짜 알약(주문 내역) 또는 범위 칩(경계 지도) 바로 오른쪽에 발사 세그먼트가 붙는다(간격 10px · 우정렬 없음). 세그먼트 글자는 「16:00」 · 「09:00:30」 이고 각 버튼의 title · aria-label 은 「16:00 예약」 · 「09:00:30 개장차익」(CONTEXT 「컨트롤 줄」)"
    - "J-5: 주문 내역 출처 배지(서버 저널 80 · 적재 시각)와 경계 지도 실제 범위 글이 화면에서 사라진다(CONTEXT 「지우는 문구」)"
    - "J-6: 폰 390 주문 내역 컨트롤(날짜 알약 + 세그먼트)이 한 줄이고, 두 탭 모두 세그먼트가 잘리지 않으며 페이지 가로 넘침 0(경계 지도는 wrap 허용)"
    - "J-7: 동작 불변 — 경로 · ?tab · ?d · ?fire · ?range · ?gw 동작 · API 호출 수 · 본문 「발사」 용어(표 머리 「발사」 · 「오프셋 (발사 기준)」 · 「다음 발사 계획」 · 빈 상태 문구 · radiogroup 「발사 서버」 · 세그먼트 묶음 「발사 기준」)는 그대로다"
  artifacts:
    - path: webapp/src/components/admin/launch-client.tsx
      provides: "제목 「러쉬 주문」(설명 없음) · 문서 제목 · 서버 칩을 Tabs 안 TabsList 바로 아래로"
      contains: "러쉬 주문"
    - path: webapp/src/components/admin/launch-orders-tab.tsx
      provides: "LaunchFireSeg 짧은 글자 + title/aria-label 전체 이름 · 출처 배지 삭제"
      contains: "09:00:30 개장차익"
    - path: webapp/src/components/admin/launch-map-tab.tsx
      provides: "범위 글 삭제 · 세그먼트 우정렬 래퍼 삭제(범위 칩 바로 오른쪽)"
    - path: webapp/src/components/layout/app-sidebar.tsx
      provides: "NAV_ADMIN_LAUNCH 라벨 「러쉬 주문」"
      contains: "label: \"러쉬 주문\""
  key_links:
    - from: webapp/src/components/admin/launch-client.tsx
      to: webapp/src/components/admin/launch-server-chips.tsx
      via: "Tabs 안 TabsList 다음 · TabsContent 앞에 LaunchServerChips 한 번"
      pattern: "LaunchServerChips"
    - from: webapp/src/components/admin/launch-map-tab.tsx
      to: webapp/src/components/admin/launch-orders-tab.tsx
      via: "LaunchFireSeg 두 탭 공용 한 벌"
      pattern: "LaunchFireSeg"
---

<objective>
어드민 발사 화면(`/admin/launch`) 상단을 채택 목업 H1(`reference/mockup-launch-header-v2.html`)대로 정리하고, 메뉴 · 제목을 「러쉬 주문」 으로 바꾼다. **배치 · 문구만** 바꾼다 — 경로 · 쿼리 키 · API · 서버 칩(`?gw`) 동작 무변경.

Purpose: 폰 화면 상단이 6줄로 쌓이고 서버 칩이 탭 위에 있어 위계가 어색하다(사용자 스크린샷 2026-11-07). 탭 → 서버 칩 → 날짜 + 발사 한 줄로 줄인다.
Output: 웹 코드 6파일(문구 · 배치) + 단위 테스트 5파일 + e2e 2파일.

Locked decisions (CONTEXT `<decisions>` — 번호 없음, 절 이름으로 인용):
- 「상단 순서 — H1」 = 제목(설명 없음) → 탭 줄 → 서버 칩 줄 → 컨트롤 줄. 서버 칩은 탭 패널 밖 한 번(Tabs 목록 바로 아래). 칩-컨트롤 간격(10px)이 탭-칩 간격보다 좁다.
- 「컨트롤 줄」 = 세그먼트는 날짜 알약 · 범위 칩 바로 오른쪽(`ml-auto` 없음 · gap 10px). 글자 「16:00」 · 「09:00:30」, 전체 이름은 `title` · `aria-label`. `LaunchFireSeg` 한 벌. 폰 390 한 줄 목표 · 넘치면 wrap(잘림 금지).
- 「지우는 문구」 = 출처 배지 · 실제 범위 글 · 제목 밑 설명 삭제.
- 「이름」 = 사이드바 라벨 · 페이지 제목 · 문서 제목만 「러쉬 주문」. 본문 「발사」 용어는 바꾸지 않는다.
- Claude's Discretion 처리: (1) `launchRangeOf` 는 범위 글 삭제 뒤 소비처가 0(grep 확인 — `launch-map-tab.tsx` 한 곳뿐)이라 함수 · 단위 테스트를 함께 지운다(`launchDateLabelOf` 는 다른 소비처가 있어 남긴다). (2) 접근성 이름은 `aria-label` = 전체 이름으로 남긴다 — 보이는 글자가 이름 안에 들어 있어(Label in Name) 기존 `getByRole('button', { name: '09:00:30 개장차익' })` 테스트는 그대로 통과하고, 보이는 글자를 보던 `toHaveText` 만 짧은 글자로 고친다.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/261107-jhk-admin-launch-header-redesign/261107-jhk-CONTEXT.md
@.planning/quick/261107-jhk-admin-launch-header-redesign/reference/mockup-launch-header-v2.html
@webapp/src/components/admin/launch-client.tsx
@webapp/src/components/admin/launch-server-chips.tsx

<interfaces>
<!-- 실행자가 코드베이스를 다시 훑지 않도록 뽑은 현재 상태(2026-11-07 HEAD e5812d86). -->

launch-client.tsx (126줄):
- 36행 `const TITLE = '발사 · Admin';` · 94행 `document.title = d === null ? TITLE : \`${TITLE} · ${fmtYmdShort(d)}\``
- 106행 `<PageHeader title="발사" description="gh-trade 서버 발사 결과 · 머리 + 조각" />`
- 107행 `<LaunchServerChips gw={gw} onGw={onGw} />` — 지금 PageHeader 와 Tabs 사이
- 108행 `<Tabs data-slot="launch-tabs" ... className="min-w-0 gap-3.5">` → 109행 `<TabsList variant="line" className="h-auto gap-4 border-b border-[var(--border-subtle)] p-0">` → 117 · 120행 TabsContent(orders · map)
- 29~31행 문서 주석 「제목 아래 · 탭 위 서버 칩」

launch-orders-tab.tsx:
- 124~127행 `FIRE_SEGMENTS: readonly { value: LaunchFire; label: string; loaded: string }[]` = q16 「16:00 예약」/16:00:01 · n0930 「09:00:30 개장차익」/09:00:31
- 146행 `const seg = FIRE_SEGMENTS.find(...)` — 출처 배지에서만 쓴다(`seg.loaded`)
- 168~176행 컨트롤 줄 `data-slot="launch-controls"`(flex-wrap gap-2.5) = `LimitupDateNav`(root `data-slot="limitup-date-nav"`) · `LaunchFireSeg` · 출처 배지 span(`data-slot="launch-source"` · `ml-auto`)
- 247~281행 `export function LaunchFireSeg` — 버튼 글자 `{s.label}`, 묶음 `aria-label="발사 기준"`
- 43행 · 110행 주석에 「출처 칩」 언급

launch-map-tab.tsx:
- 28행 import `launchRangeOf` · 403행 `const rangeText = ...launchRangeOf(resp.days)`
- 412~439행 컨트롤 줄 = 범위 칩 group(`data-slot="launch-range"`) · 범위 글 span(`data-slot="launch-range-text"`) · `<div className="ml-auto"><LaunchFireSeg .../></div>`
- 60행 주석 「컨트롤 줄(프리셋 칩 · 실제 범위 글 · 발사 기준 세그먼트)」

webapp/src/lib/launch-map.ts 355~369행 = 「지도 탭 — 범위 글」 구획 주석 + `launchRangeOf`. 테스트 webapp/src/lib/__tests__/launch-map.test.ts 16행 import · 425~442행 describe 블록.

app-sidebar.tsx 206행 `const NAV_ADMIN_LAUNCH = { href: "/admin/launch", label: "발사" } as const;` · 주석 42 · 193 · 205 · 765행에 메뉴 이름 「발사」.

PageHeader(`webapp/src/components/layout/page-header.tsx`): root `data-slot="page-header"`, title = h1, description 이 없으면 `p` 를 그리지 않는다(무변경).
Tabs(`webapp/src/components/ui/tabs.tsx`): root 는 flex-col + gap — Radix Root 라 TabsList 와 TabsContent 사이에 다른 요소를 둘 수 있다. 비활성 TabsContent 는 언마운트된다.
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1 (tracer): 「러쉬 주문」 개명 + 상단 H1 순서 + 컨트롤 한 줄 + 문구 삭제 (코드 · 단위 테스트)</name>
  <files>webapp/src/components/admin/launch-client.tsx, webapp/src/components/admin/launch-orders-tab.tsx, webapp/src/components/admin/launch-map-tab.tsx, webapp/src/components/admin/launch-server-chips.tsx, webapp/src/lib/launch-map.ts, webapp/src/components/layout/app-sidebar.tsx, webapp/src/components/admin/__tests__/launch-client.test.tsx, webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx, webapp/src/components/admin/__tests__/launch-map-tab.test.tsx, webapp/src/lib/__tests__/launch-map.test.ts, webapp/src/components/layout/__tests__/app-sidebar.test.tsx</files>
  <read_first>
    - .planning/quick/261107-jhk-admin-launch-header-redesign/261107-jhk-CONTEXT.md (「상단 순서 — H1」 · 「컨트롤 줄」 · 「지우는 문구」 · 「이름」)
    - .planning/quick/261107-jhk-admin-launch-header-redesign/reference/mockup-launch-header-v2.html (H1 분기 `header()` · `.ctx` gap 10px · `.main` gap 14px)
    - webapp/src/components/admin/launch-client.tsx · launch-orders-tab.tsx 110~285행 · launch-map-tab.tsx 385~440행
  </read_first>
  <behavior>
    launch-client.test.tsx — describe 「LaunchClient — 서버 칩」 을 「LaunchClient — 상단 순서 · 이름」 으로 바꾸고 첫 테스트(「서버 칩은 제목 아래 · 탭 줄 위」)를 다음으로 교체:
    - Test A: 쿼리 없음 → h1 이름 「러쉬 주문」 · `[data-slot="page-header"] p` 없음(설명 문단 없음).
    - Test B: 쿼리 없음 → `getByRole('tablist')` 다음(DOCUMENT_POSITION_FOLLOWING)에 `[data-slot="launch-server-chips"]`, 그 다음에 `[data-slot="orders"]` · 서버 칩 radiogroup 은 정확히 1개.
    - Test C: `tab=map` → 서버 칩 1개 · tablist 다음 · `[data-slot="map"]` 앞.
    - Test D: 쿼리 없음 → `document.title === '러쉬 주문 · Admin'` · `d=20261026` → `'러쉬 주문 · Admin · 10/26'`.
    - 「칩 교보119 클릭 → replace」 테스트와 「쿼리 정본화」 describe 는 그대로 통과(동작 불변 J-7).
    launch-orders-tab.test.tsx:
    - Test E: `LaunchFireSeg` 버튼 보이는 글자 = ['16:00', '09:00:30'], 각 `title` · `aria-label` = ['16:00 예약', '09:00:30 개장차익'] (`view()` 로 그린 뒤 `[data-slot="launch-fire-seg"] button` 을 본다).
    - Test F: 「서버별」 describe 의 출처 칩 기대 3곳(218 · 237 · 251행)을 고친다 — 218 · 237행 테스트는 이름에서 「출처 칩」 을 빼고 그 단언 줄을 지운다. 251행 「09:00:30 출처 칩」 테스트는 「출처 배지 없음 · 컨트롤 줄 = 날짜 알약 → 발사 세그먼트 두 칸」 으로 바꾼다: `fire: 'n0930', gw: 'KYOBO112'` 에서 `[data-slot="launch-source"]` 가 null 이고 `[data-slot="launch-controls"]` 의 자식 data-slot 목록이 ['limitup-date-nav', 'launch-fire-seg'].
    - 기존 「세그먼트 → onFire」(`getByRole('button', { name: '09:00:30 개장차익' })`)는 무수정 통과.
    launch-map-tab.test.tsx:
    - Test G: 168행 테스트 이름을 「칩 3개 · 「전체」 선택 · 범위 글 없음 · 컨트롤 줄 = 범위 칩 → 발사 세그먼트」 로 바꾸고 범위 글 단언을 `[data-slot="launch-range-text"]` null + `[data-slot="launch-controls"]` 자식 data-slot 목록 ['launch-range', 'launch-fire-seg'] 로 교체. 271 · 300 · 337행의 범위 글 단언 줄은 지운다.
    launch-map.test.ts: `launchRangeOf` import 와 describe 「launchRangeOf — 실제 범위 글」 블록 삭제.
    app-sidebar.test.tsx:
    - Test H: 1510행 describe 의 `launch()` = `queryByRole("link", { name: "러쉬 주문" })` · href /admin/launch · data-sidebar-item admin-launch 그대로 · 순서 배열 마지막 원소 「러쉬 주문」 · describe/it 제목 속 메뉴 이름 「발사」 → 「러쉬 주문」.
  </behavior>
  <action>
    먼저 위 behavior 대로 테스트를 고쳐 RED 를 확인한 뒤(launch-client · orders · map · sidebar 테스트가 새 기대에서 실패) 코드를 고친다. 새 컴포넌트 · 새 추상화 · API/shared/server 변경 없음.

    1) launch-client.tsx (CONTEXT 「이름」 · 「지우는 문구」 · 「상단 순서 — H1」):
       - `TITLE` 을 '러쉬 주문 · Admin' 으로(날짜 붙는 꼴 유지).
       - PageHeader 를 `title="러쉬 주문"` 만 넘기고 `description` prop 을 뺀다.
       - PageHeader 바로 아래의 `<LaunchServerChips gw={gw} onGw={onGw} />` 를 `<Tabs>` 안으로 옮겨 `</TabsList>` 바로 다음 · 첫 `<TabsContent>` 앞에 한 번 둔다(두 탭 공용 · 탭 패널 밖).
       - 간격(목업 `.main` 14px · `.ctx` 10px): Tabs className 의 `gap-3.5` 를 `gap-2.5` 로, TabsList className 에 `mb-1` 을 더한다 → 탭 줄-칩 14px · 칩-컨트롤 줄 10px(컨트롤 줄은 각 TabsContent 첫 줄). PageHeader-Tabs 간격(바깥 gap-4)은 그대로.
       - 29~31행 `gw` 문서 주석의 「제목 아래 · 탭 위」 를 「탭 줄 아래 · 컨트롤 줄 위(Tabs 안 · 탭 패널 밖 한 벌 · quick-261107-jhk H1)」 로 고친다.
    2) launch-server-chips.tsx — 주석만: 4행 「제목 아래 · 탭 줄 위」 → 「탭 줄 아래 · 컨트롤 줄 위(quick-261107-jhk H1)」, ② 의 「바로 아래가 탭 줄이다」 → 「바로 위가 탭 줄이다」. 코드 무변경.
    3) launch-orders-tab.tsx (CONTEXT 「컨트롤 줄」 · 「지우는 문구」):
       - `FIRE_SEGMENTS` 원소 타입을 `{ value; label; full }` 로: q16 = label '16:00' · full '16:00 예약', n0930 = label '09:00:30' · full '09:00:30 개장차익'. `loaded` 필드는 출처 배지 전용이라 지운다.
       - `LaunchFireSeg` 버튼에 `title={s.full}` · `aria-label={s.full}` 를 더한다(보이는 글자 = `s.label`). 묶음 `aria-label="발사 기준"` · 모양 클래스 무변경.
       - `LaunchOrdersView` 에서 `const seg = ...` 와 컨트롤 줄 안 출처 배지 span 전체를 지운다 → 컨트롤 줄 자식 = LimitupDateNav · LaunchFireSeg 두 개(gap-2.5 그대로라 세그먼트가 날짜 바로 오른쪽 10px).
       - 주석 43행 「컨트롤 줄(날짜 알약 · 세그먼트 · 출처 칩)」 → 「컨트롤 줄(날짜 알약 → 바로 오른쪽 발사 세그먼트)」, 110행 `gw` 주석의 「· 출처 칩」 제거.
       - 본문 「발사」 용어(표 머리 「발사」 · EmptyBox 문구 · 카드 문구)는 손대지 않는다(CONTEXT 「이름」).
    4) launch-map-tab.tsx (CONTEXT 「지우는 문구」 · 「컨트롤 줄」):
       - `rangeText` 상수와 범위 글 span 을 지운다. `<div className="ml-auto">` 래퍼를 벗겨 `<LaunchFireSeg fire={fire} onFire={onFire} />` 를 컨트롤 줄 직계 자식으로(범위 칩 group 바로 오른쪽 · gap-2.5).
       - import 에서 `launchRangeOf` 를 뺀다. 60행 주석 → 「컨트롤 줄(프리셋 칩 → 바로 오른쪽 발사 기준 세그먼트)」.
    5) webapp/src/lib/launch-map.ts — 「지도 탭 — 범위 글」 구획 주석 + `launchRangeOf` 함수를 지운다(Claude's Discretion — 소비처 0). `launchDateLabelOf` · `launchRangeParamOf` 는 남긴다.
    6) app-sidebar.tsx (CONTEXT 「이름」): `NAV_ADMIN_LAUNCH` label 을 「러쉬 주문」 으로. 같은 파일 주석 42 · 193 · 205 · 765행의 메뉴 이름 「발사」 를 「러쉬 주문」 으로(205행은 「Phase 35 D-11 — 러쉬 주문(발사 경계 지도 · 주문 내역) …」 꼴). href · data-sidebar-item 무변경.
    7) 테스트를 다시 돌려 GREEN. typecheck 로 지운 필드(`loaded`) · import 잔재가 없음을 확인.
    8) 커밋(경로 지정 `git add` — 위 11파일만, `-A` 금지): `feat(quick-261107-jhk): 러쉬 주문 개명 · 상단 탭→서버 칩→날짜+발사 한 줄 · 출처·범위·설명 글 삭제`. 한글 · Co-Authored-By 없음 · push/배포 금지.
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-orders-tab.test.tsx src/components/admin/__tests__/launch-map-tab.test.tsx src/components/admin/__tests__/launch-server-chips.test.tsx src/lib/__tests__/launch-map.test.ts src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2 && pnpm --filter @gh-radar/webapp run typecheck && test "$(grep -c 'label: "러쉬 주문"' webapp/src/components/layout/app-sidebar.tsx)" = 1 && test "$(grep -c 'title="러쉬 주문"' webapp/src/components/admin/launch-client.tsx)" = 1</automated>
  </verify>
  <done>
    단위 테스트 6파일 · webapp typecheck(e2e tsconfig 포함) 통과. grep 게이트 2개(기준선 HEAD = 0 · 0 → 1 · 1). LaunchClient 렌더에서 h1 「러쉬 주문」 · 설명 없음 · tablist → 서버 칩(1개) → 탭 본문 순서 · 문서 제목 「러쉬 주문 · Admin」. 두 탭 컨트롤 줄 자식이 정확히 [왼쪽 컨트롤, 발사 세그먼트] 두 개이고 세그먼트 글자 「16:00」 · 「09:00:30」, title · aria-label 전체 이름. 사이드바 「러쉬 주문」 링크 /admin/launch. 커밋 1건.
  </done>
</task>

<task type="auto">
  <name>Task 2: e2e — 러쉬 주문 제목 · H1 상단 순서 · 세그먼트 붙임 · 지운 글 · 사이드바 트리</name>
  <files>webapp/e2e/specs/admin-launch.spec.ts, webapp/e2e/specs/sidebar-tree.spec.ts</files>
  <read_first>
    - webapp/e2e/specs/admin-launch.spec.ts 1~80행(헤더 주석 · `open()` · 헬퍼) · 175~300행(P35-L3 · P-SV1 · `rangeText` 헬퍼) · 340~450행(P35-M2 · P35-M3) · 486~498행(P-SV2)
    - webapp/e2e/specs/sidebar-tree.spec.ts 80~106행(`TREE_LINKS` · 주석)
  </read_first>
  <precondition>Task 1 커밋이 있다(`git log -1 --format=%s` 가 quick-261107-jhk feat).</precondition>
  <action>
    admin-launch.spec.ts (CONTEXT 「이름」 · 「상단 순서 — H1」 · 「컨트롤 줄」 · 「지우는 문구」):
    1) `open()` 의 h1 이름을 「러쉬 주문」 으로. 헤더 주석 ① 의 「서버는 제목 아래 서버 칩」 → 「서버는 탭 줄 아래 서버 칩」.
    2) P35-L1(1280): 76행 `toHaveText` 기대를 '16:00' 으로 바꾸고 같은 버튼 `toHaveAttribute('title', '16:00 예약')` 를 더한다. 77행 출처 배지 기대를 `[data-slot="launch-source"]` `toHaveCount(0)` 로 바꾼다. `root(page).locator('[data-slot="page-header"] p')` `toHaveCount(0)`(설명 없음)을 더한다. 세그먼트 붙임 단언을 더한다: `[data-slot="limitup-date-nav"]` 박스와 `[data-slot="launch-fire-seg"]` 박스가 같은 줄(세로 중심 차 ≤ 4)이고 `seg.x − (nav.x + nav.width)` 가 6 이상 14 이하(gap 10 · 우정렬이면 수백 px 라 실패).
    3) P35-L2: 141행 기대 → '09:00:30'. 142행 출처 배지 줄 삭제. 139행 `getByRole('button', { name: '09:00:30 개장차익' })` 클릭은 그대로(aria-label).
    4) P35-L3(390): 가로 넘침 검사 앞에 2) 와 같은 날짜 알약-세그먼트 같은 줄 · 간격 6~14 단언을 더한다(폰 390 한 줄 — CONTEXT 「컨트롤 줄」).
    5) P-SV1(1280): 주석 「제목 아래 · 탭 줄 위」 → 「탭 줄 아래 · 컨트롤 줄 위」. titleBox 의 heading 이름 → 「러쉬 주문」. 순서 단언을 tab.y > title.y · chips.y > tab.y 로 뒤집고, `getByRole('tablist')` · 칩 radiogroup · `[data-slot="launch-controls"]`(주문 내역 탭이 보일 때 하나) 박스로 `chips.y − (tablist.y + tablist.height)`(≈14)이 `controls.y − (chips.y + chips.height)`(≈10)보다 크고 후자가 6~14 임을 단언한다. 263행 출처 배지 줄 삭제.
    6) `rangeText` 헬퍼(298행)와 그 사용 5곳(308 · 353 · 363 · 376 · 494행)을 지운다. 대신 P35-M1 에서 `[data-slot="launch-range-text"]` `toHaveCount(0)` 와 범위 칩 group `[data-slot="launch-range"]` 박스와 세그먼트 박스의 같은 줄 · 간격 6~14 단언을 더한다. P35-M1 테스트 제목의 「범위 글」 → 「범위 글 없음」.
    7) P35-M2: 402행 기대 → '09:00:30'.
    8) P35-M3(390): 세그먼트 박스 오른쪽 끝 ≤ 390(잘림 없음 · wrap 은 허용)을 더한다. 기존 가로 넘침 0 단언 유지.
    9) 그 밖 `getByRole('button', { name: '09:00:30 개장차익' })` 사용처(192 · 373 · 443 · 832행 등)는 aria-label 로 계속 맞으므로 무수정.

    sidebar-tree.spec.ts (CONTEXT 「이름」): `TREE_LINKS` 마지막 원소 「발사」 → 「러쉬 주문」, 86행 주석의 메뉴 이름도 같이.

    실행: playwright `--workers=1`. webServer 가 NextFontGoogleFontFileReplacer 반복으로 타임아웃하면 `rm -rf webapp/.next` 후 재실행. 실패가 이 작업과 무관한 기존 실패면 SUMMARY 에 원문 그대로 적고 넘어가지 말고 원인부터 확인한다.

    커밋(경로 지정 — 위 2파일만): `test(quick-261107-jhk): e2e 러쉬 주문 제목 · 탭→서버 칩→컨트롤 순서 · 세그먼트 날짜 옆 · 지운 글 · 사이드바 트리`. 한글 · Co-Authored-By 없음 · push/배포 금지(웹 전용 변경 — 배포 = 메인 세션의 git push).
  </action>
  <verify>
    <automated>pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/webapp exec playwright test admin-launch.spec.ts sidebar-tree.spec.ts --workers=1</automated>
  </verify>
  <done>
    admin-launch.spec.ts 전부(setup 포함 · 직전 기준 21건) + sidebar-tree.spec.ts 전부 통과. e2e 가 1280 · 390 에서 h1 「러쉬 주문」 · 설명 없음 · 탭 → 서버 칩 → 컨트롤 순서와 간격(14 > 10) · 세그먼트가 날짜 알약/범위 칩 바로 오른쪽(6~14px) · 출처 배지 · 범위 글 0개 · 390 주문 내역 한 줄 · 페이지 가로 넘침 0 을 증명. 커밋 1건.
  </done>
</task>

</tasks>

<verification>
- Task 1 · Task 2 의 `<automated>` 가 모두 통과한다(단위 6파일 · typecheck · e2e 2파일).
- `git diff e5812d86 --stat -- server packages workers` 가 비어 있다(API · shared · server 무변경).
- 본문 「발사」 용어 보존: `grep -c '<th className={TH}>발사</th>' webapp/src/components/admin/launch-orders-tab.tsx` = 1(기준선 1) · `grep -c 'aria-label="발사 기준"' webapp/src/components/admin/launch-orders-tab.tsx` = 1(기준선 1).
</verification>

<success_criteria>
- 사이드바 · 페이지 제목 · 문서 제목이 「러쉬 주문」 이고 제목 밑 설명이 없다.
- 상단이 제목 → 탭 → 서버 칩 → [날짜 알약 | 범위 칩] + 짧은 발사 세그먼트(바로 오른쪽) 순서다. 출처 배지 · 범위 글이 없다.
- 폰 390 주문 내역 컨트롤 한 줄 · 두 탭 가로 넘침 0. 서버 칩 · 쿼리 · 요청 수 동작은 직전(261107-iep)과 같다.
</success_criteria>

<output>
Create `.planning/quick/261107-jhk-admin-launch-header-redesign/261107-jhk-SUMMARY.md` when done — 배포 메모: 웹 전용(webapp) 변경이라 배포 = 메인 세션의 git push 한 번(server · relay · DB 불필요).
</output>
