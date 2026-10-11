---
phase: 18-gh-trade-ui-nxt-vi
plan: 10
subsystem: ui
tags: [trading, card-body, orderbook-tab, container-query, dirty-action-bar, portal, manual-order, react, tdd]
status: complete

requires:
  - phase: 18-06
    provides: "StrategyCard body 렌더 prop · useStrategyCardState · LC_CONTAINER_CLASS · QuoteGrid10"
  - phase: 18-07
    provides: "ManualOrderForm(variant) · ManualOrderEntry(적응형 진입) · PriceSelection 계약"
  - phase: 18-09
    provides: "AccountPanel onSelectUnfilled?/selectedOrderNo? (행 선택 → 정정/취소)"
provides:
  - "CardBody(variant card|orderbook) — 좌 호가(+체결) | 우 옵션 4그룹 + 적응형 수동주문 (card/card-body.tsx)"
  - "cardGroupStatusOf(server, fired) — 그룹 보조문 5문구 순수 함수 · cardDirtyHint(name, n) — 종목명 더티 바 문구"
  - "LimitChaserForm 의 dirtyHint? · dirtyBarClassName? · tab?(제어형) · hideTabs? · sweepStatusText? · cancelStatusText? + LIMIT_CHASER_DIRTY_HINT export"
  - "OrderbookLadder 의 onPriceSelect?(chaser 전용 가격 선택 · 빈 단 무반응)"
  - "queuedWindowBadgeOf(w) — 상태줄 구간 배지(모름이면 null) (lib/queued-window.ts)"
  - "chat/fab-clearance.ts — CHAT_FAB_WIDTH_VAR · CHAT_FAB_CLEARANCE_CLASS (FAB 실측 폭 변수로 하단 고정 바 오른쪽 끝을 당김)"
  - "StockOrderbookSection 교체 — 상태줄 → 10칸 → CardBody orderbook → 이 종목 미체결/잔고"
affects: [18-11, 18-12, 18-13]

actuals:
  tokens: 22778
  tasks: 3
  commits: 7
plan_head_before: e1ec15417a9c95f1ec432cac5766a7c50d1275c4

tech-stack:
  added: []
  patterns:
    - "본문은 상태를 소유하지 않는다 — 카드 상태 훅의 반환(StrategyCardState)을 card prop 으로 받아 두 표면(카드 · 호가 탭)이 같은 컴포넌트를 쓴다"
    - "시세 미수신은 빈 호가(EMPTY_LADDER_QUOTE)로 10단 「—」 — 안내 카드로 바꾸지 않아 행 수·높이가 고정된다"
    - "공유 표면의 새 동작은 opt-in prop 으로 연다(onPriceSelect · dirtyHint · dirtyBarClassName · hideTabs) — 옛 호출부 DOM 무변"
    - "하단 고정 바와 FAB 의 겹침은 z-index 가 아니라 FAB 이 싣는 실측 폭 CSS 변수로 바의 오른쪽 끝을 당겨 푼다"
    - "공용 패널(AccountPanel)은 고치지 않고 넘기는 계좌 상태를 이 종목으로 걸러 「이 종목만」을 만든다"

key-files:
  created:
    - webapp/src/components/trading/card/card-body.tsx
    - webapp/src/components/trading/__tests__/card-body.test.tsx
    - webapp/src/components/stock/__tests__/stock-orderbook-section.test.tsx
    - webapp/src/components/chat/fab-clearance.ts
  modified:
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/stock/stock-orderbook-section.tsx
    - webapp/src/components/stock/__tests__/orderbook.test.tsx
    - webapp/src/components/stock/__tests__/stock-detail-client.test.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/lib/queued-window.ts
    - webapp/src/lib/__tests__/queued-window.test.ts
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/chat/__tests__/chat-fab.test.tsx

key-decisions:
  - "그룹 보조문은 서버 에코 + latchLedStateOf 로만 정한다(목업 :934-937 동형) — 스위치 ON 이면 래치 armed ? 「감시 중」 : 「무장 · 대기」, OFF 면 「꺼짐」(매수만 fired 면 「발주 완료 · 무장 해제」), 한방은 「켜짐/꺼짐」. 옛 strategyStatusOf(「무장」「대기 (지지벽 미관측)」)는 옛 화면용으로 그대로 둔다"
  - "chaser 사다리의 가격 클릭은 새 prop onPriceSelect 로만 연다 — 옛 A11 계약(「onPriceClick 을 넘겨도 chaser 는 무반응」, ladder-chaser 테스트 ⑦)을 그대로 두기 위해서다. 빈 단(가격 0)은 무반응, roving tabindex 없음"
  - "더티 바 종목명은 공유 바의 hint 문자열에 접두로 싣는다(「{종목명} · {N}개 미반영 · 안내」). hint 가 문자열이라 종목명만 CSS 말줄임할 수 없어 16자 초과 시 글자 수로 자른다(…)"
  - "호가 탭 더티 바는 AI FAB 과 같은 화면이다 — 고정 pr-128 은 실측(FAB 폭 134px, 종목명 따라 가변)에서 다시 겹쳤고, pr 만으로는 바 배경이 FAB 을 덮었다. FAB 이 자기 폭을 --chat-fab-w 로 싣고 바의 right 를 그만큼 당긴다(작업대 카드는 전폭)"
  - "호가 탭 미체결/잔고는 AccountPanel 을 계좌 전용 머리(code 미전달)로 쓴다 — 종목 축 모드는 자기 계좌 셀렉터를 그려 상태줄 셀렉터와 둘이 된다(실측 「계좌 확인 중…」). 「이 종목만」은 계좌 상태를 isin 으로 걸러 넘겨 만든다(잔고도 같은 축 — 목업 「잔고 (1)」)"
  - "원주문 선택은 주문번호만 들고 매 렌더 이 종목·이 계좌의 최신 미체결에서 다시 찾는다 — 부분체결 잔량이 폼으로 가고, 사라진 주문은 선택이 저절로 풀린다. 계좌·거래소·종목 전환 시 해제"
  - "호가 탭 거래소 세그먼트는 등록 여부로 잠그지 않는다 — 탭에서 거래소를 바꾸는 것은 다른 전략 키를 보는 것이지 등록 전략의 거래소 변경이 아니다(카드 헤더의 잠김과 다른 이유)"
  - "연결 중·복구 불가에서도 본문을 비우지 않는다(E9) — 스켈레톤·「호가를 불러오지 못했어요」 카드를 걷고, 상태줄 DMA 필이 말하며 복구 불가면 그 줄에 「다시 연결」"

requirements-completed: [TRADE-07, TRADE-09]

coverage:
  - deliverable: "카드 본문 — 좌 호가 | 우 옵션 4그룹 · 섹션 라벨 없음 · 스위치 3개 · 보조문 5문구 · 시세 없음 10단 「—」 · 빈 셀 no-op · /lc 3밴드 · variant 콤보 · 3탭 한 줄 · body 포털 더티 바 종목명"
    human_judgment: false
    verification:
      - kind: test
        ref: "card-body.test.tsx (18 cases)"
        status: pass
      - kind: command
        ref: "! grep -nE '\\b(sm|md|lg|xl):' card/card-body.tsx · grep -c 'variant=\"chaser\"' → 2 · grep -cE '@min-\\[(700|830|992)px\\]/lc:' → 6"
        status: pass
  - deliverable: "상따 폼 더티 힌트 prop 화 — 기본 문구 불변 · body 포털 · SSR 가드 · 전송 중 두 버튼 잠금 · 거부 후 더티 보존 · 제어형 탭"
    human_judgment: false
    verification:
      - kind: test
        ref: "limit-chaser-form.test.tsx 18-10 블록 (10 cases) + 기존 76 cases 무수정 green"
        status: pass
      - kind: command
        ref: "git diff --stat -- dirty-action-bar.tsx → 비어 있음 · grep -c createPortal limit-chaser-form.tsx → 2"
        status: pass
  - deliverable: "호가 탭 교체 — @container/lc · CardBody orderbook · 상태줄(DMA·계좌·거래소·LED·구간·반영) · 주문유형 콤보 · 이 종목 미체결만 · 새 각주 · 언마운트 구독 해제"
    human_judgment: false
    verification:
      - kind: test
        ref: "stock-orderbook-section.test.tsx (12 cases) · orderbook.test.tsx (13 cases, 새 표면으로 이관) · queued-window.test.ts 배지 4 cases"
        status: pass
      - kind: command
        ref: "pnpm --filter @gh-radar/webapp test → 90 files, 1320 passed, 1 skipped (하한 1008) · build_command 전문 exit 0"
        status: pass
  - deliverable: "실브라우저 밴드 전환 · FAB 겹침 0 · 목업 대비 시각 대조"
    human_judgment: true
    rationale: "로컬 relay+스텁 게이트웨이로 호가 탭을 390/820/1440 에서 실측했다(컨테이너 374→1단 트리 42%|1fr, 788→2단 260px, 1152→3단 460px · 더티 바 오른쪽 끝 < FAB 왼쪽 끝 두 폭 모두). 스크린샷 대조는 했지만 e2e 로 남긴 것은 아니다 — 폭 램프·겹침 단언의 정본은 18-13 Playwright 다. 작업대 카드 표면은 18-11 조립 전이라 미마운트다"
    verification:
      - kind: manual
        ref: "임시 Playwright 스크립트(커밋하지 않음) · 18-13 e2e 로 이관"
        status: pending

metrics:
  duration: "~24분"
  completed: 2026-09-22
---

# Phase 18 Plan 10: 카드 본문 = 호가 탭 본문 Summary

카드 본문(`CardBody`)을 만들고 **같은 컴포넌트로** 종목상세 호가주문 탭을 교체했습니다. 이제 「카드 본문 = 호가 탭 본문」(D-24)이 코드에서도 성립합니다. 본문은 좌측에 호가(+체결)를, 우측에 옵션 4그룹과 적응형 수동주문을 두며, 밴드는 가장 가까운 `@container/lc` 의 폭을 따릅니다. 호가 탭 루트도 같은 이름의 컨테이너를 선언하므로, 기존 `@min-[Npx]/lc:` 유틸리티가 두 표면을 함께 지탱합니다. §2.2b 표는 한 줄도 복사하지 않았습니다.

## 무엇을 만들었나

### `card/card-body.tsx` — `CardBody` (Task 1)
- **배치:** 좌 pane 은 `OrderbookLadder variant="chaser"`(공유)이고 오른쪽 테두리를 가집니다. 우 pane 은 `ManualOrderEntry` 로, 옵션에 `LimitChaserForm`(4그룹), 폼에 `ManualOrderForm` 이 들어갑니다. 두 칸은 한 그리드의 형제이며 세로로 쌓이지 않습니다.
- **밴드:** 그리드는 `42% | 1fr` 에서 시작해 `@min-[700px]/lc:` 260px, `@min-[830px]/lc:` 400px, `@min-[992px]/lc:` 460px 로 바뀝니다. 뷰포트 브레이크포인트는 0건이고, 주석은 globals.css §2.2b 만 가리킵니다.
- **섹션 라벨 없음:** 「호가」「체결」「옵션 세팅」 제목이 없습니다. 그룹 제목과 보조문은 남깁니다.
- **보조문 5문구:** `cardGroupStatusOf(server, fired)` 가 서버 에코와 `latchLedStateOf` 만으로 정합니다(목업 동형). 네 그룹 모두에 보조문이 붙습니다.
- **시세 없음:** 빈 호가(`EMPTY_LADDER_QUOTE`)를 넘기므로 10단 행은 그대로 그려지고 가격은 「—」입니다. 안내 카드도 스피너도 없습니다.
- **가격 클릭:** 가격 있는 행을 누르면 수동주문 가격이 채워집니다. 빈 단은 no-op 이고, 종목이나 거래소를 바꾸면 고른 가격이 버려집니다.
- **폰 밴드 3탭:** 「매수 | 매도 | 수동」 한 줄입니다. 폼 자체의 2탭 줄은 `hideTabs` 로 없앴고, 옵션 pane 은 제어형 `tab` 이 가릅니다.
- **더티 바:** 문구는 `cardDirtyHint` 가 만든 「{종목명} · {N}개 미반영 · 안내」입니다. 호가 탭(`variant="orderbook"`)에서만 바의 오른쪽 끝이 FAB 앞에서 멈춥니다.

### `limit-chaser-form.tsx` (Task 2)
- 새 prop 은 `dirtyHint?`(없으면 기존 문구)와 `dirtyBarClassName?`, 제어형 `tab?` · `hideTabs?`, `sweepStatusText?` · `cancelStatusText?` 입니다.
- 포털 ★ 주석은 그대로 두고 「카드가 여럿이므로 바 문구에 종목명을 쓴다…」 한 줄만 더했습니다.
- `dirty-action-bar.tsx` 의 git diff 는 비어 있습니다. 기존 76 케이스도 수정 없이 green 입니다.

### `stock-orderbook-section.tsx` — 호가 탭 교체 (Task 3)
- **구성 순서:** 상태줄 → 종목정보 10칸(`QuoteGrid10`) → `CardBody variant="orderbook"` → 미체결/잔고 순서입니다. 섹션 루트가 `LC_CONTAINER_CLASS`(`@container/lc`)를 선언합니다.
- **상태줄:** DMA(`RELAY_STATE_LABELS` 문구), 계좌 셀렉터, 거래소 KRX|NXT 세그먼트(라디오형), LED 3칩, 구간 배지(`queuedWindowBadgeOf` · 모름이면 없음), 거부 문구, 복구 불가 시 「다시 연결」, 「반영 {시각|—}」 이 들어갑니다.
- **미체결/잔고:** 계좌 상태를 **이 종목으로 걸러** 넘깁니다. 행을 누르면 수동주문 칩이 뜨고 정정·취소로 이어집니다. 다시 누르면 선택이 풀립니다.
- **각주:** 「신규 매수/매도와 정정·취소 · 시간외종가는 정정 불가(취소 후 재등록)」 입니다. 옛 「취소만 지원」 문장은 없습니다.
- **언마운트:** 탭을 떠나면 언마운트되는 규율은 그대로이고, 테스트가 `unsubscribe(isin, exchange)` 를 확인합니다.

## 검증

- `pnpm --filter @gh-radar/webapp test`: **90 files, 1320 passed**, 1 skipped (하한 1008).
- config `build_command` 전문(shared build → relay typecheck ×2 → webapp typecheck): exit 0, `error TS` 0건.
- 변경 파일 eslint 0 문제(기존 `strategy-status-card.test` 경고 1건은 이 plan 과 무관).
- 계획 grep 게이트는 모두 통과했습니다.
  - card-body 뷰포트 0건, `variant="chaser"` 2, 세 밴드 줄 6
  - 섹션 `@container/lc` 1, `CardBody` 4
  - 폼 `createPortal` 2
  - 더티 바 diff 비어 있음
- **실브라우저 실측:** 로컬 relay 와 스텁 게이트웨이, 임시 Playwright 스크립트로 확인했습니다(스크립트는 커밋하지 않았습니다).

  | 뷰포트 | 컨테이너 폭 | 그리드 열 | 사다리 트리 |
  |---|---|---|---|
  | 390 | 374 | `156 | 216` | 1단 |
  | 820 | 788 | `260 | 526` | 2단 |
  | 1440 | 1152 | `460 | 690` | 3단 |

  더티 바의 오른쪽 끝은 두 폭 모두 FAB 왼쪽 끝보다 앞에서 멈춥니다(390: 224 < 231.9, 820: 654 < 661.9).
- **jsdom 한계:** jsdom 은 컨테이너 쿼리를 평가하지 않습니다. 단위 테스트는 **클래스 존재**로만 단언했고, 폭 램프와 겹침 단언의 정본은 **18-13 Playwright** 입니다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - 차단 회피] chaser 사다리에 가격 선택 prop 추가 (`orderbook-ladder.tsx`, files_modified 밖)**
- **문제:** plan 은 「값 있는 가격 셀 클릭 → 가격 콜백 1회」를 요구합니다. 그런데 공유 chaser 트리는 A11 규율상 클릭을 받지 않고, 기존 테스트 ⑦ 이 「onPriceClick 을 넘겨도 무반응」을 잠그고 있습니다.
- **조치:** 새 opt-in prop `onPriceSelect` 를 추가했습니다. 세 트리 모두 같은 `selectOf` 를 쓰고, 빈 단은 무반응이며 roving tabindex 는 없습니다. 사다리를 새로 만들지 않았고 ⑦ 도 그대로 green 입니다.
- **커밋:** 132e341

**2. [Rule 1 - 시각 결함] 호가 탭 더티 바 ↔ AI FAB 겹침 (`chat/chat-fab.tsx`, `chat/fab-clearance.ts` 신설)**
- **발견:** 실브라우저 실측에서 드러났습니다. 처음 둔 `pr-[128px]`(`dirty-action-bar.tsx` ⑥ⓐ 의 옛 실측값)는 FAB 폭 134px(「AI · 삼성전자 분석」)에서 「수정」과 겹쳤습니다. 여백만 늘려도 바 배경과 블러가 FAB 밑에 깔렸고, 둘 다 z-40 이라 포털이 FAB 을 덮었습니다.
- **조치:** FAB 이 자기 실측 폭을 `--chat-fab-w` 로 싣습니다(ResizeObserver 로 따라가고, 사라지면 지웁니다). 호가 탭 바는 `right-[calc(var(--chat-fab-w,0px)_+_32px)]` 로 오른쪽 끝을 당깁니다. z-index 는 건드리지 않았습니다.
- **커밋:** d970702

**3. [Rule 1 - 시각 결함] 미체결 패널의 두 번째 계좌 셀렉터**
- **문제:** `AccountPanel` 종목 축 모드(`code` 전달)는 자기 셀렉터를 그립니다. 실측 화면에 상태줄 셀렉터와 「계좌 확인 중…」 셀렉터가 함께 섰습니다.
- **조치:** `code` 를 넘기지 않아 계좌 전용 머리(글자 되읽기)를 쓰게 했습니다(옛 상따 화면과 같은 배선). 「이 종목만」은 걸러 넘긴 계좌 상태가 만듭니다.
- **커밋:** d970702

**4. [Rule 1 - 시각 결함] 체결 근거 문장 중복**
- **문제:** 2단·1단 트리의 compact 체결 테이프가 이미 근거 문장을 달고 있어, 본문이 덧붙인 줄과 두 줄로 섰습니다.
- **조치:** 본문 쪽 문장은 3단 밴드(`@min-[830px]/lc:`)에서만 보이게 했습니다.
- **커밋:** d970702

**5. [Rule 3] 옛 섹션 테스트 이관 (`orderbook.test.tsx` · `stock-detail-client.test.tsx`)**
- **문제:** Phase 15 표준 사다리(5단 접힘 · roving tabindex · 바 정규화), 주문 패널, 전폭 상태 바, 헤더 `dl` 을 잠그던 케이스가 표면째 사라졌습니다.
- **조치:** 지운 케이스마다 그 규칙이 지금 어느 테스트에 사는지 파일에 적었습니다(ladder-chaser · stock-orderbook-section · quote-grid-10 · manual-order-form). 남은 케이스는 새 표면으로 옮겼습니다(가격 클릭, 거래소, NXT 빈 호가, 게이트, 빈 호가 「—」, stale, 체결 색, CR-01 ×2, DMA 문구, 종가 배선).

**6. [Rule 2] `queuedWindowBadgeOf` 신설 (`lib/queued-window.ts`)**
- 상태줄의 구간 배지를 판정하는 함수가 코드베이스에 없었습니다. 순수 함수로 두어 18-11 작업대 상태줄도 같은 함수를 쓰게 했습니다. 모름이면 `null` 이고, 벽시계는 읽지 않습니다.

### 계획 문면과 다르게 한 것

- **실행 순서:** Task 1(카드 본문)이 폼의 새 prop(제어형 탭 · 한방/취소 보조문 · dirtyHint)에 의존해서 Task 2 를 먼저 실행했습니다. 각 Task 는 RED → GREEN 커밋 순서를 지켰습니다.
- **옛 상따 화면(`limit-chaser-client.tsx`)은 재배선하지 않았습니다.** plan 의 「본문 그리드 조립을 옮긴다」와 달리 옛 화면 조립은 그대로 두고, 카드 본문에 같은 그리드를 새로 세웠습니다. 옛 화면은 1,908줄 테스트와 e2e 가 잠그고 있고 18-12 에서 통째로 제거됩니다(18-06 결정과 같은 판단). 그리드 클래스 두 벌은 18-12 에서 한 벌이 됩니다.
- **호가 탭 잔고도 이 종목만 보입니다.** 계약 ③ 은 미체결만 말하지만, 목업 정본(「잔고 (1)」)을 따랐습니다.
- **E9 세부 두 곳은 기존 chaser 트리를 그대로 씁니다.**
  - 빈 단의 잔량은 「—」가 아니라 빈칸입니다.
  - 체결이 없을 때 2단·1단 compact 테이프는 「아직 체결이 없어요」를 보입니다.
  - 3단 표 헤더도 UI-SPEC 의 「매도잔량 | 가격 | 매수잔량」이 아니라 기존 「체결」 헤더 행입니다.
  - 이 셋은 공유 사다리(옛 화면 포함) 층위의 변경이라 이 plan 에서 건드리지 않았습니다. 아래 deferred 에 남깁니다.

**Total deviations:** 6 auto-fixed(Rule 1 ×3 · Rule 2 ×1 · Rule 3 ×2) + 문면 차이 4건. **Impact:** 옛 상따 화면과 My page, VI 의 DOM 과 동작은 그대로입니다. 바뀐 것은 종목상세 호가 탭과 새 카드 본문뿐입니다.

## TDD Gate Compliance

세 Task 모두 RED → GREEN 순서로 커밋했습니다. 시각 결함 수정은 별도 `fix` 커밋입니다.
- Task 2: RED 54de3f8 (7 fail) → GREEN 50c5ebe
- Task 1: RED 7356813 (import 실패) → GREEN 132e341
- Task 3: RED 22e7aa6 (10 fail) → GREEN ed36281
- 실측 결함: d970702

## 18-13 이 함께 고칠 e2e 셀렉터 (`orderbook.spec.ts`)

| 옛 셀렉터/문구 | 지금 |
|---|---|
| `[data-slot="relay-status-bar"]` (+ `data-status`) | `[data-slot="orderbook-status-bar"]` (`data-status` 유지) |
| 「실시간 · 계좌 1개」 · 「재접속 중 k/10」 · 「연결이 끊겨 다시 연결하는 중이에요」 | DMA 필 = `statusLabel` 그대로(「실시간」 등). 재접속 회차·본문 문구 없음, 복구 불가면 「다시 연결」 버튼 |
| `getByLabel('NXT 호가')` | `[data-slot="orderbook-exchange-segment"]` 안 `getByRole('radio', { name: 'NXT' })` |
| `getByTestId('order-panel')` · 버튼 「매수 주문」 | `manual-order-form` · 버튼 「매수」(4버튼) → 다이얼로그 확정 「매수 주문」. ≥700 은 먼저 「수동주문」 버튼, 폰은 「수동」 탭 |
| `order-result-accepted/unknown/rejected` | `manual-order-result`(단일 testid · 문구로 분기) |
| 사다리 `tbody th[scope="row"]` 20개 | chaser 트리: 3단 표 + 2단 표에 각 20개(표시 트리 하나만 보임), 1단은 `[data-slot="ladder-row-mobile"]` |
| `[data-slot="trade-tape"]` 1개 | 2단·1단 트리에 compact 테이프가 각 1개(보이는 것은 하나) · 3단은 사다리 안 `ladder-fill-cell` |
| 계좌 패널 탭 「미체결 (N)」/「잔고 (N)」 | 계좌 전용 머리(`account-panel-account-no`) + 미체결 → 잔고 나열 |
| 「이 종목은 NXT 호가가 없어요」 | 유지(본문 위 한 줄) |
| `orderbook-access-gate` | 유지 |

## Deferred

- chaser 사다리 E9 세부 3건(빈 단 잔량 「—」 · 빈 체결 테이프 무문구 · 3단 표 헤더 「매도잔량 | 가격 | 매수잔량」). 공유 사다리 변경이라 옛 화면이 제거되는 18-12 이후에 맞추는 편이 안전합니다.
- 호가 탭이 더 이상 쓰지 않는 `RelayStatusBar` · `OrderbookSkeleton` · `OrderPanel` 컴포넌트는 소비처가 0 입니다. 파일은 남아 있으며(`order-panel.tsx` 는 `DISABLED_LABEL`·`PriceSelection` export 때문에 필요), 정리는 18-12 에서 합니다.

## 다음 plan 이 알아야 할 것

- **18-11:**
  - 카드 본문은 `StrategyCard body={(card) => <CardBody variant="card" card={card} isin accountNo exchange name code status={relay.status} queuedWindow={relay.queuedWindow} selectedUnfilled onClearSelection />}` 로 채웁니다.
  - 작업대 상태줄의 구간 배지는 `queuedWindowBadgeOf` 를 쓰면 됩니다.
  - 카드 본문은 `variant="card"` 일 때 스스로 `border-t` 를 답니다.
- **18-12:** 옛 상따 화면을 제거하면 본문 그리드 클래스 두 벌이 한 벌이 되고, 위 Deferred 두 항목을 처리할 수 있습니다.
- **18-13:** 위 e2e 셀렉터 표, 폭 램프(374/788/1152 실측값), 더티 바 ↔ FAB 겹침 0(boundingBox)을 e2e 로 옮깁니다.

## Known Stubs

없습니다.

## Threat Flags

없습니다. 새 네트워크 경로는 없습니다. 주문은 기존 `sendOrder`(relay wss), 전략은 기존 `send({t:'lc.set'})` 입니다.
- T-18-47: 빈 셀 no-op 을 테스트가 단언합니다.
- T-18-48: 본문과 수동주문이 단일 `isin`/`exchange` 를 쓰고, 종목·거래소가 바뀌면 고른 가격을 리셋합니다.
- T-18-49: `createPortal` grep 2건이 게이트입니다.
- T-18-50: chaser 트리를 공유합니다.
- T-18-51: 이 종목 필터와 테스트 ⑤ 로 막았습니다.
- `--chat-fab-w` 는 표시 기하 값일 뿐이고 신뢰 경계를 넘지 않습니다.

## Self-Check: PASSED

- 신설 4파일(card-body.tsx · card-body.test.tsx · stock-orderbook-section.test.tsx · fab-clearance.ts)이 존재합니다.
- 커밋 7건(54de3f8 · 50c5ebe · 7356813 · 132e341 · 22e7aa6 · ed36281 · d970702)이 git log 에 있고, `git rev-list --count e1ec154..HEAD` = 7 입니다.
