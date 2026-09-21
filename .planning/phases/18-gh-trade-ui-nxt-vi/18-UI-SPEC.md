---
phase: "18"
slug: "gh-trade-ui-nxt-vi"
status: approved
shadcn_initialized: true
preset: radix-nova
created: "2026-09-21"
---

# Phase 18 — UI Design Contract

> `/trading` 통합 트레이딩 작업대 · 종목상세 호가 탭 · 종목정보 팝업의 시각·상호작용 계약.
> gsd-ui-researcher 작성 · gsd-ui-checker 검증 · gsd-planner/gsd-executor 소비.

---

## 0. 이 문서의 지위 — 목업이 정본이다

**정본 우선순위 (D-26):**

1. `18-workbench-mockup.html`(7차) · `18-orderbook-tab-mockup.html`(6차) — **레이아웃·수치·문구의 정본.** 목업이 코드와 다르면 목업이 이긴다.
2. `18-CONTEXT.md` D-01 ~ D-30 — 잠긴 사용자 결정.
3. `webapp/src/styles/globals.css` §9(토큰) · §2.2b(4밴드) — 기존 디자인 시스템.
4. 이 UI-SPEC — 위 셋을 실행자가 쓸 수 있는 형태로 옮긴 것. **새 디자인을 하지 않는다.**

**이 문서가 하지 않는 것:** §2.2b 밴드 표를 다시 적지 않는다(CLAUDE.md Conventions · 표가 둘이 되면 갈라진다). 여기서는 **어느 컨테이너가 그 표를 재는가**만 말한다.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (`webapp/components.json`) |
| Preset | `style: "radix-nova"` · `baseColor: "neutral"` · `cssVariables: true` · `registries: {}` |
| Component library | radix-ui 1.4.3 (통합 패키지) |
| Icon library | lucide-react 1.8.0 |
| Font | 본문 `--font-sans` = Pretendard Variable (self-hosted) · 수치 `--font-mono` = Geist Mono (`next/font/google`) |
| 토큰 정본 | `webapp/src/styles/globals.css` §9 (`:root` 라이트 / `.dark` 다크) — **이 phase 는 아래 §토큰 추가 2건 외에 새 토큰을 만들지 않는다** |

---

## Component Inventory

Enumerated by `ls webapp/src/components/ui/*.tsx | wc -l` — 23 components — shadcn@4.2.0 (registry style `radix-nova`, radix-ui@1.4.3) — 2026-09-21.

이 표는 **닫힌 허용 목록이 아니다.** 표 밖 컴포넌트를 쓰려면 먼저 `webapp/src/components/ui/` 에 있는지 확인하고, 없으면 `npx shadcn add` 로 공식 레지스트리에서 받는 것이 기대 경로다.

### shadcn primitives (이 phase 가 실제로 쓰는 것)

| Component | Import path | Notes |
|-----------|-------------|-------|
| Dialog | `@/components/ui/dialog` | 종목정보 팝업(D-25) · 주문확인(D-20) · VI 시작/중지 확인. `order-confirm-dialog.tsx:45` 가 이미 사용 |
| Tabs | `@/components/ui/tabs` | 공용 패널(미체결·잔고·로그) · 모달 3탭 · 옵션 매수/매도/수동 3탭 |
| Switch | `@/components/ui/switch` | 그룹 제목줄 44×26 스위치(매수주문·한방체결·매도주문 켜기) · VI 줄 on/off |
| Checkbox | `@/components/ui/checkbox` | VI 발동 표 「확인」 · 옵션 폼 필드 체크 |
| Table | `@/components/ui/table` | 돌파 표 · VI 발동 표 · 미체결/잔고 표 |
| ToggleGroup | `@/components/ui/toggle-group` | 카드 헤더 KRX\|NXT 세그먼트 · 상태줄 1·2·3단 세그먼트 · 호가 탭 거래소 세그먼트 |
| Button | `@/components/ui/button` | 「추가」·「수정」·「더보기」·「거래 추가」·주문 4버튼 |
| Input | `@/components/ui/input` | 폼 수치 입력(단위 접미는 래퍼) |
| Command | `@/components/ui/command` | 종목 추가 검색란(Phase 16 종목검색 재사용) |
| Badge | `@/components/ui/badge` | 거래소 태그 · 상태 배지 · 「신규」 필 |
| Tooltip / Popover / Sheet / Separator / Skeleton | `@/components/ui/*` | 보조 |

### 프로젝트 자산 (재구현 금지 — 이 phase 의 실제 재료)

| Component | Import path | Notes |
|-----------|-------------|-------|
| `LatchLed` | `@/components/trading/latch-led` | LED 3칩. `latchLedStateOf` 규칙표가 정본(Phase 17 D-21) |
| `StrategyBadge` | `@/components/trading/strategy-badge` | 배지 6종 + 거래소 태그(KRX 테두리형 / NXT 채움) |
| `DirtyActionBar` | `@/components/trading/dirty-action-bar` | `hint`·`className` prop 이 이미 열려 있다 — **문구만 바꾼다** |
| `DmaGate` | `@/components/trading/dma-gate` | 게이트 문구 정본 |
| `StrategyLog` | `@/components/trading/strategy-log` | 공용 패널 「전략 로그」 탭 |
| `ViOrderList` | `@/components/trading/vi-order-list` | VI 발동 표(확인 체크·110초 진행바·`confirm_locked` 규칙) |
| `OrderbookLadder` | `@/components/orderbook/orderbook-ladder` | 3트리 배타 조건이 `@min-[Npx]/lc:` 에 달려 있다 |
| `TradeTape` | `@/components/orderbook/trade-tape` | 최근 체결 |
| `OrderConfirmDialog` | `@/components/orderbook/order-confirm-dialog` | 주문확인 — 요약 행·D-20 고지 |
| `AccountPanel` | `@/components/orderbook/account-panel` | 미체결/잔고 (계좌 전용 모드) |
| `limit-chaser-form` 의 4그룹 | `@/components/trading/limit-chaser-form` | 옵션 세팅 4그룹 필드·더티 판정의 원천 |
| `app-sidebar` 헬퍼 | `@/components/layout/app-sidebar` | `useTradingVisible`·`limitChaserHref`·`viBadgeOf`·`viAnyRunning` — **단일 정의, 재구현 금지** |

---

## Spacing Scale

`globals.css` §9 의 `--s-*` 를 그대로 쓴다. **4의 배수만.**

| Token | Value | Usage (Phase 18) |
|-------|-------|------------------|
| `--s-1` | 4px | 칩 내부 간격, 세그먼트 버튼 간격, 스테퍼 간격, 탭 gap |
| `--s-2` | 8px | 카드 헤더 패딩, pane 패딩(폰), 스택 카드 사이, 표 셀 세로 패딩 |
| `--s-3` | 12px | 페이지 섹션 사이(`.page` flex gap), 격자 gap, 카드 간격 |
| `--s-4` | 16px | `main` 패딩(폰·태블릿), 모달 본문 패딩, 옵션 2열 사이 gap |
| `--s-5` | 24px | `main` 패딩(≥1024), 데스크톱 종목정보 한 줄 칸 사이(20px 는 §예외) |
| `--s-6` | 32px | 대형 섹션 분리(이 phase 에서는 모달 바깥 여백) |
| `--s-8` / `--s-10` | 48 / 64px | 이 phase 의 신규 표면에서는 사용하지 않는다 |

**Exceptions (목업 실측 · 이 목록이 전부):**

- **밀도 여백 6px / 10px / 14px** — 트레이딩 밀도 표면 전용. `.rc-strip{padding:8px 10px}` · `.virow{padding:6px 10px}` · `.pane{padding:10px}`(≥700) · `.mhd{padding:10px 14px}` · `.rc td{padding:0 10px}`. 4의 배수가 아닌 2의 배수이며, 호가 10단 + 옵션 4그룹이 한 카드에 들어가야 하는 §2.2b 실측 제약에서 나온 값이다. **새 자리에 6/10/14 를 도입하지 말 것 — 목업이 쓴 자리에서만.**
- **컨트롤 고정 높이** — 20px(거래소 세그먼트·태그) · 24px(단 수 세그먼트·LED 칩) · 26px(`.btn`) · 28px(`.seg`·탭) · 30px(`.inp`·`.otabs`) · 36px(`.obtn`·표 행 높이 `--row-h`) · 44×26(스위치, 기존 폼 패턴). 높이는 스페이싱이 아니라 **컨트롤 규격**이며 기존 `limit-chaser-form` 규격을 그대로 승계한다.
- **호가 행 높이** — 22px(기본) / 34px(폰 밴드 2단, 가격+등락 2줄). `18-workbench-mockup.html:469,486`.

---

## Typography

선언 스케일 **4단계** — 전부 `globals.css` §9 의 기존 토큰이다.

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Caption | 12px (`--t-caption`) | 400 | 1.5 (`--lh-normal`) | 상태줄, 표 셀, 폼 라벨, 칩, 도움말, 공용 패널 본문 |
| Body | 14px (`--t-sm`) | 400 | 1.5 (`--lh-normal`) | 페이지 기본 본문, 종목 검색 입력, 탭 라벨, 모달 본문 |
| Title | 16px (`--t-base`) | 700 | 1.2 (`--lh-tight`) | 모달 제목, 앱 헤더 |
| Heading | 20px (`--t-h3`) | 700 | 1.2 (`--lh-tight`) | 페이지 제목 「트레이딩」 |

**Weights: 2개 — 400 (regular) · 700 (bold).**

**Exceptions (목업 실측 · 밀도 전용 · 이 목록이 전부 — 새 자리에 도입 금지):**

| 값 | 쓰이는 자리 | 출처 |
|----|-----------|------|
| 600 (semibold) | 수치 강조(`.stat b`·`.rc td .n`·`.qc .v`), 표 `th`, 탭 라벨, 세그먼트 버튼 — 400 과 700 사이의 중간 강조는 **이 자리에서만** | workbench `:259,340,347,443` |
| 15px | 카드 헤더 종목명 `.ch .id b` · 현재가 `.ch .px b` | workbench `:386,395` |
| 13px | 주문 입력 수치 `.inp input` · 주문 버튼 `.obtn` · 검색 입력 · 모달 요약 `.sum` | workbench `:527,613` |
| 11px | 표 `th`, 폼 라벨 `.fr .lb`, 칩 보조, 버튼 `.btn`, 진행바 라벨 | workbench `:340,523` |
| 10px | 거래소 태그 `.tag`, LED `small`, 상태 배지 `.vst`, 체결 테이프, 안내문 `.onote`/`.fine` | workbench `:271,484` |
| 9px | **폰 밴드 호가 2단에서만** — 등락 `em`(`.lad.t2 td.p em`)·잔량(`.lad.t2 td.q span`). 이 phase 유일의 10px 미만이며 전부 `.mono`(tabular-nums)다 | workbench `:488-489` |
| 22px / 800 | 종목상세 히어로(`h.hero .nm b`·`.px b`) — **기존 화면 그대로, 이 phase 가 바꾸지 않는다** | orderbook `:617,621` |

**수치 표기 규율 (기존 유지):** 가격·수량·시각·주문번호·비율은 전부 `.mono`(`--font-mono` + `tabular-nums slashed-zero`). 한글 라벨은 `--font-sans`. `html[lang="ko"]` 의 `word-break: keep-all` 은 그대로.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg` (`#FFFFFF` / `oklch(0.08 0 0)`) | 페이지 배경, 호가 사다리 셀 배경, LED 칩 배경 |
| Secondary (30%) | `--card` (`#FFFFFF` / `oklch(0.12 0 0)`) + `--muted` (`oklch(0.96 0 0)` / `oklch(0.18 0 0)`) | 카드·스트립·표 컨테이너 표면(`--card`), 상태줄·표 헤더·스티키 `th` 배경(`--muted`), 사이드바(`--sidebar`) |
| Accent (10%) | `--accent` / `--accent-fg` | 아래 「Accent reserved for」 목록 **전용** |
| Destructive | `--destructive` | 아래 「Destructive reserved for」 목록 **전용** |

**Accent reserved for (이 목록이 전부 — 「모든 상호작용 요소」가 아니다):**

1. 사이드바 활성 항목(「⚡ 트레이딩」)
2. 공용 패널 탭 · 모달 탭의 선택 상태 (`aria-selected="true"`)
3. 상태줄 단 수 세그먼트(1·2·3단)의 선택 버튼
4. 카드 헤더 / 호가 탭 상태줄의 거래소 세그먼트 선택 버튼
5. NXT 거래소 태그(채움형) — KRX 는 테두리형(`--border` + `--muted-fg`)
6. 미체결 표에서 **선택된 행** 과 수동주문 폼 위 「원주문」 선택 칩(`.selchip`)
7. 구간 배지 중 G2/G3 (`.winpill.g2/.g3`)

**Destructive reserved for (이 목록이 전부):**

1. VI 발동 상태 배지 「거부」(Rejected) — 10% 틴트 배경 + `--destructive` 전경
2. 110초 진행바의 **잔여 ≤20초** 구간(`.dl .bar i.hot`)
3. 주문확인 다이얼로그의 경고 박스(`.warn` — 8% 틴트 배경 + `--destructive` 테두리)

> `--destructive-fg`(흰색)는 `.obtn.buy`/`.obtn.sell`/`.btn.pri` 의 **전경색으로만** 쓰인다(기존 코드 관행 그대로). 배경이 `--destructive` 라는 뜻이 아니다.

**가격 방향 축 (별도 축 — destructive 와 섞지 말 것):** `--up`(빨강 = 상승·매수) · `--down`(파랑 = 하락·매도) · `--flat`(보합) · `--up-bg`/`--down-bg`(탭 선택·부분체결 틴트). 한국 시장 관행 축이며 「위험」이 아니다.

**래치 LED 축 (또 다른 별도 축):** `--led-latent`(주황 = 잠복/대기) · `--led-armed`(초록 = 래치 ON/감시) · `--flat`+`--muted-fg`(OFF). globals.css §9 주석이 정본 — **이 축을 `--up`/`--down` 으로 대체하지 말 것.**

**Primary (`--primary`):** 「수정」 CTA · 더티 입력 테두리·라벨 · 체크박스 `accent-color` · 포커스 링(`--ring`) · 확인 다이얼로그의 정정/취소 확정 버튼. **일반 버튼은 `--card` + `--border` 다.**

### 토큰 추가 2건 (목업이 도입 · globals.css 로 승격 필요)

| Token | Light | Dark | 쓰이는 자리 |
|-------|-------|------|-----------|
| `--new-bg` | `oklch(0.97 0.08 95)` | `oklch(0.28 0.06 95)` | 신규 돌파 30초 강조 행/칩(D-18) · 미확인 VI 행/칩(D-06) · 「신규 N」/「미확인 N」 필 · 예약구간·장전 구간 배지 · 확인 다이얼로그 예약 안내 줄(`.resv`) |
| `--new-bd` | `oklch(0.86 0.14 92)` | `oklch(0.45 0.10 92)` | 위 표면의 테두리 |

> 목업 원문이 `★ 이 목업 전용 신규 제안 토큰 — 채택 시 globals.css 로 승격` 이라고 선언한 둘이다(`18-workbench-mockup.html:91-93`). **라이트/다크 둘 다 정의할 것** — 한쪽만 두면 반대 테마에서 「신규/미확인」의 색 축이 조용히 사라진다(`--led-*` 주석의 선례).
> `--ctl-h` 는 목업 컨트롤 바 전용이다. **프로덕션으로 옮기지 않는다.**

---

## 레이아웃 계약 — `/trading` 작업대

정본: `18-workbench-mockup.html`. 위 → 아래 **고정 순서**(D-04 ~ D-13):

| # | 섹션 | 구성 | 목업 |
|---|------|------|------|
| 1 | 제목줄 | `h2` 「트레이딩」 + 계좌 필(`1234567801 · 위탁종합 ▾`) | `:728` |
| 2 | 상태줄 | DMA 상태 · 돌파 N(+「신규 M」 필) · VI 발동 N(+「미확인 M」 필) · 거래 종목 N · 「임계 20% · 재무장 −2%p」 · 구간 배지(모름이면 **없음**) · 우측 끝 「반영 HH:MM:SS」 + **1·2·3단 세그먼트** | `:729-740` |
| 3 | VI 설정 2줄 | KRX 한 줄 · NXT 한 줄. 줄 = 거래소 태그 · on/off 스위치 · 「가동중」+「서버 반영 {시각}」(또는 「중지」) · 상승률 % · 금액 만원 · 더티면 줄 끝 「수정」. **계좌·마감알림 없음** | `:742, :825-831` |
| 4 | VI 발동 스트립 | 「VI N」 + 「미확인 M」 필 + 칩 가로 스크롤 + 「더보기」 | `:743, :833-836` |
| 5 | VI 발동 표 | 「더보기」로 펼침. 헤더 「VI 발동 주문」 + 「VI N · 미확인 M · 양 거래소 한 목록 · 최신 위」 + 「접기 ▴」 | `:744, :837-855` |
| 6 | 돌파 스트립 | 「돌파 N」 + 「신규 M」 필 + 칩 + 「더보기」. **거래소 미표시**(D-07) | `:745, :861-867` |
| 7 | 돌파 표 | 종목 · 현재가 · 등락률 · 임계 · 기준가 · 돌파시각 · 액션 | `:746, :868-882` |
| 8 | 종목 추가 | 검색 입력(placeholder 「종목 추가 — 종목명 또는 코드」 + `⌘K`) + 「추가」 버튼. **거래소 토글 없음** | `:748-751` |
| 9 | 카드 격자 | 펼친 카드 먼저 각각 한 칸 → 접힌 카드는 **스택 한 칸**에 세로(gap 8px). 스택 위 라벨 없음 | `:753, :1089-1096` |
| 10 | 공용 패널 | 탭 「미체결 (N) / 잔고 (N) / 전략 로그」. ≥700 은 격자 아래 섹션, 폰은 하단 sticky 접이식 | `:754, :1104-1131` |

**사이드바(D-03):** 「⚡ 트레이딩」 제목 자체가 `/trading` 링크(활성 표시). 3단 목록 = 「KRX VI(가동중)」 · 「NXT VI」 · 등록된 상따 전략(종목명 + LED 3점 7px). 개별 「상따」/「VI」 메뉴 없음. 앱 셸·사이드바는 **뷰포트 브레이크포인트 그대로**(컨테이너 쿼리 아님).

### 카드 계약 (D-10 ~ D-12)

**헤더(펼침·접힘 공통, `:1062-1070`):** `l1` = 캐럿 ▶(펼치면 90° 회전) · 종목명(15px/700, ellipsis) · 코드(11px mono) · **KRX\|NXT 세그먼트** · 우측 현재가+등락률. `l2` = LED 3칩(매수/매도/취소) · ⓘ 종목정보 · ✕ 카드 제거.
- 카드 폭 **760px 이상**에서 `l1`/`l2` 가 한 줄로 붙는다(`@container card (min-width:760px)`). **760 은 §2.2b 4밴드의 경계가 아니다 — 카드 헤더 컴포넌트의 로컬 규칙이며 주석에 그 사실을 명시할 것.**
- 폰 밴드(카드 ≤699)에서는 종목명/코드가 2줄로 접힌다(`line-height:1.15`, 코드 10px).
- **매수/매도/한방 스위치는 헤더에 없다.** 접힌 카드의 스위치 상태는 LED 로 읽는다.
- 거래소 세그먼트는 **등록 전 카드(스위치 전부 OFF · 서버 전략 없음)에서만 활성**, 등록 후 잠김(D-10).

**종목정보 10칸 (`lc-quote-grid` 라벨 그대로, 펼친 카드에만):** 기준 · 시가 · 고가 · 저가 · 상한 · 하한 · 상승VI · 거래 · 시총 · 발행1%. 색: 기준 대비 up/down/flat · 상한·상승VI 는 `--up` 고정 · 하한 `--down` 고정 · 거래/시총/발행1% 중립.

**본문 (`:1072-1082`):** 어느 밴드에서도 **좌 호가(+최근 체결) | 우 옵션 세팅 4그룹**. 세로 스택 없음. 좌 pane 은 `border-right: 1px solid var(--border)`.
- 옵션 4그룹 = 매수주문 · 한방체결 / 매도주문 · 매수취소 (2열 배치에서 좌열 = 매수+한방, 우열 = 매도+취소).
- **「호가」「체결」「옵션 세팅」 같은 섹션 라벨을 넣지 않는다**(D-12).
- 스위치는 각 그룹 제목줄 우측 끝(44×26, `ml-auto`).
- 그룹 제목 옆 상태 보조문: 「감시 중」 / 「무장 · 대기」 / 「꺼짐」 / 「켜짐」 / 「발주 완료 · 무장 해제」.

### 호가 탭 계약 (D-24 · `18-orderbook-tab-mockup.html`)

`/stocks/[code]` 호가주문 탭 = **카드 본문과 같은 컴포넌트**. 순서: 히어로(기존) → 갱신줄(기존) → 4탭 바(기존) → **상태줄**(DMA · 계좌 · 거래소 KRX\|NXT 세그먼트 · LED 3칩 · 구간 배지 · 반영 시각) → 종목정보 10칸 → 좌 호가(+체결) \| 우 옵션 4그룹 + 적응형 수동주문 → 미체결/잔고 공용 패널.

**카드와 다른 점은 셋뿐이다:** ① 거래소가 헤더가 아니라 상태줄에 있다 ② 수동주문 폼에 **주문유형 콤보(지정가 \| 시간외종가)** 가 있다 ③ 미체결이 이 종목만이다. 매수 비율 버튼 없음은 기존대로.

---

## 반응형 계약 — 컨테이너 쿼리 2단위 (D-28)

**뷰포트 분기를 신설하지 않는다.** 밴드 수치의 정본은 `webapp/src/styles/globals.css` §2.2b 한 곳이며, 이 phase 는 **그 표를 재는 컨테이너를 둘로 늘릴 뿐**이다.

| 컨테이너 이름 | 선언 위치 | 무엇을 재는가 | 소비자 |
|---------------|----------|--------------|--------|
| `card` (Tailwind `@container/lc`) | 상따 카드 래퍼(`strategy-card.tsx`) **와** 호가 탭 본문 래퍼(`stock-orderbook-section.tsx`) — 같은 이름 | 카드/탭 **본문 폭** | 종목정보 10칸 배치 · 호가 2단↔3단 · 호가표 폭(260/400/460) · 옵션 1열↔2열 · 폼 라벨칸 `--lw`(76→104) · 수동주문 3탭↔덮기 |
| `page` (Tailwind `@container/wb`) | `/trading` 작업대 본문 래퍼 | **페이지 본문 폭** | 격자 열 수(1/2/3단) · 단 수 세그먼트 표시/숨김 · 스트립 표의 열 접기 · 공용 패널 sticky 전환 |

**이관 규율 (RESEARCH Pattern 2):** 기존 `@container/lc` 선언 1곳(`limit-chaser-client.tsx:542`)을 **카드 래퍼로 옮긴다.** 그러면 `@min-[700px]/lc:`·`@min-[830px]/lc:`·`@min-[992px]/lc:` 유틸리티 43개(client 22 · form 16 · ladder 5)가 **한 글자도 안 바뀐 채** 카드 폭을 재기 시작한다. 이름을 신설하면 §2.2b 의 소비처가 둘이 된다.

**globals.css 에 더할 것:** §2.2b 본문 맨 아래 3~4줄 문단 하나 — 「이 표를 재는 컨테이너는 이제 둘이다: `lc`(카드 본문 = 호가 탭 본문, 같은 컴포넌트) · `wb`(작업대 페이지 본문). **밴드 수치는 위 표 그대로이고 측정 대상만 다르다.**」 **숫자를 다시 적지 말 것.**

**결과적으로 2·3단 격자에서는 카드 안 밀도가 폰 밴드로 떨어진다**(사용자 확인 완료 · D-12). 예: 3단 격자의 카드 ≈376px → 폰 밴드.

**로컬 경계 1개 (밴드 표와 무관):** 카드 헤더 한 줄 접힘 `@container card (min-width:760px)`. 4밴드의 네 번째 경계로 승격시키지 말 것.

**포털 규율 (§2.2b ★ · D-28):** `container-type:inline-size` 가 layout containment 를 걸어 `position:fixed` 자손의 컨테이닝 블록이 된다. 그래서 **더티 액션 바는 `react-dom` 의 `createPortal` 로 `document.body`** 에 보낸다. 포털을 걷으면 바가 카드 안으로 내려앉는다. 카드가 여럿이므로 **바 문구에 종목명을 쓴다**.

---

## 상호작용·상태 계약

**서버 진실을 클라가 재해석하지 않는다(D-27).** 아래 모든 상태의 출처는 relay 프레임 또는 §localStorage 표의 키뿐이다.

| 상태 | 규칙 | 출처(재해석 금지) |
|------|------|------------------|
| **에코가 이긴다** | 서버 에코가 오면 baseline 을 덮고 더티를 지운다. 더티 중 에코가 오면 값을 덮고 「다른 단말에서 변경됨」 `role="status"` 를 인라인으로 띄운다 | 60 에코 / 64 스냅샷 · `formFromServer`/`dirtyFieldsOf` |
| **카드별 에코 상관** | 카드는 **자기 `key`(ISIN:계좌:거래소)로만** 필터한다. 작업대 상위에서 에코를 받아 카드에 분배하지 말 것 | `limit-chaser-client.tsx:252-258` |
| **더티** | 입력 테두리 `--primary` + 라벨 `● ` 접두 + `--primary` 색. 카드마다 바가 하나. 문구에 종목명 필수 | 로컬 폼 상태 |
| **VI 미확인 강조** | `state === 'Accepted' ∧ !confirmed` → 칩·행 `--new-bg`. 확인 체크는 **표에서만**, `주문번호 有 ∧ !confirm_locked ∧ Accepted` 일 때만 활성. 체크 즉시 잠기고 즉시 전송(`ConfirmVIOrderReq 33`) · **더티가 아니다** | 73 에코의 `confirm_locked` |
| **신규 돌파 30초 강조** | 추가 후 30초 `--new-bg` + 「신규」 배지 → 기본. **깜박임 없음**(D-18 이 gh-trade 의 5초 깜빡임을 의도적으로 뺐다). 목록 전체에 **타이머 1개**(1초 tick, 강조 행이 있을 때만) — 행마다 `setTimeout` 금지(최대 200행) | 76 도착 시각 |
| **78 스냅샷 행은 무음·무강조** | 78 로 들어온 행은 알림음도 30초 강조도 없고, 그러면서 「오늘 울린 종목」 집합에는 **기록**한다 | gh-trade `rate-cross-alert.md` |
| **거래중 표식** | 카드가 이미 있는 돌파 종목의 칩/행은 「거래중」(`.state` — 앞에 초록 ● · 점선 테두리 칩 · 커서 default). 행 클릭 시 새 카드를 만들지 않고 기존 카드를 펼치고 스크롤 | 카드 집합 |
| **이탈 삭제** | 등락률 < (행의 임계 − 2%p) **∧ (무장 ∨ 추가 후 3초 유예 경과)** 일 때만 삭제. ⚠️ **무장/유예 조건은 D-16 이 생략했다** — 빼면 낡은 체결 한 건이 목록을 즉시 지운다. 구독하지 못한 행은 **이탈 판정을 하지 않는다**(76 의 마지막 가격을 그대로 보여주고 삭제하지 않음) | 구독 시세 + 76 의 `ThresholdPct`·기준가 |
| **거래소 토글 잠김** | 등록 전 카드에서만 활성. 등록 후 `disabled` + `aria-disabled="true"` + title 로 이유 고지. 등록된 전략의 거래소 변경은 **이연(deferred)** | 전략 키 = `ISIN:계좌:거래소` |
| **77 구간** | `queuedWindow === undefined` = 「모름」 = **전부 false**. 벽시계 판정 금지 · 이 값으로 주문을 막지 않는다. 라벨·입력 전환에만 | 77 프레임 |
| **주문 응답 3분기** | `accepted` → 「주문이 접수됐어요 · 주문번호 {No}」 / `rejected` → 「주문이 거부됐어요 · {message}」(**파싱 금지 · 표시만**) / `timeout` → 「접수 응답이 늦어지고 있어요」 + 「주문이 이미 나갔을 수 있어요. 미체결 목록에서 접수 여부를 확인한 뒤 다시 주문해 주세요.」 | `order-panel.tsx:377,611-642` 기존 문구 |

### 77 → 라벨·입력 매핑 (표시 전용 · 두 표면 공유 순수 함수)

| 조건 | 버튼 | 조각 입력 | 확인 문구 |
|------|------|----------|-----------|
| `orderType === 'offhours'` | 매수 / 매도 | 숨김(조각 1) | 없음 |
| `open ∧ KRX` | **예약매수 / 예약매도** | **보임** — 기본 5, 상한 `maxPieces`, 단위 「/ 최대 {max}」 | 없음 |
| `preopenOpen ∧ KRX` | **예약매수 / 예약매도** | 숨김(조각 1) | 「예약: 증권사 보관 후 09:00 처리」 |
| `nxtPreopenOpen ∧ NXT` | **예약매수 / 예약매도** | 숨김(조각 1) | 「예약: 증권사 보관 후 08:00 처리」 |
| 그 외 / `undefined`(모름) | 매수 / 매도 | 숨김(조각 1) | 없음 |

폰 밴드에서 4버튼이 좁아지면 「예약」이 윗줄로 접힌다(`.obtns.four .obtn .pre { display:block }`, 10px, `line-height:1.15`).

**시간외종가(호가 탭 전용 · D-23):** 콤보 「지정가 \| 시간외종가」. `KRX ∧ (g2Open ∨ g3Open)` 일 때만 선택 가능, **창이 닫히면 지정가로 복귀**. 선택 시 가격 입력 잠금(`--muted` 배경, 값 `—`) + 「참고 종가 {가격}」 + 안내 「가격 0 · krx_session 으로 전송 · 정정 불가(취소 후 재등록)」 + 주문금액 「종가 확정 후」 + **정정 버튼 비활성**. 버튼 라벨은 창과 무관하게 「매수/매도」. **작업대 카드의 수동주문에는 주문유형이 없다.**

### localStorage 키 (D-04 · D-15 · D-17 · 기기별)

| 키 | 값 | 목적 |
|----|----|------|
| `gh-radar:breakout-sounded` | `{"d":"yyyyMMdd","codes":[ISIN…]}` | 「오늘 알림 울린 종목」 — **소리를 내기 전에 저장한다**(순서가 계약이다) |
| `gh-radar:breakout-dismissed` | 동형 | 「사용자가 지운 종목」 — 그날 재돌파에도 안 나옴 |
| `gh-radar:breakout-tone` | `"on" \| "off"` (기본 **off**) | 알림음 토글 |
| `gh-radar:trading-cols` | `"1" \| "2" \| "3"` | 격자 단 수 |
| `gh-radar:vi-alert` (기존) | — | VI 마감알림. 이름 변경 없음 |

KST 날짜 키 `yyyyMMdd` · 날짜가 다르면 읽을 때 빈 집합 · 값은 **ISIN**(단축코드 아님) · 읽기/쓰기 전부 `typeof window` 가드 + try/catch(`vi-alert.ts:137-158` 패턴). 기기별임을 UI 문구에 「(이 기기만)」으로 명시하는 선례를 따른다.

**알림음(D-17 재량 · 확정):** Web Audio 합성 — sine 880Hz, 총 160ms, gain 0 → 0.18(ramp 10ms) → 0(exponential). 파일 자산 0. `AudioContext.state === 'suspended'` 면 스피커 아이콘에 「클릭해 활성화」를 붙이고, `resume()` 은 사용자 제스처 안에서만 호출한다.

---

## Copywriting Contract

**모든 사용자 문구는 한국어이며, 목업이 보여주는 것은 목업 원문 그대로다.** 어투는 기존 코드베이스의 「~어요/~예요」 존댓말.

### 템플릿 필수 행

| Element | Copy |
|---------|------|
| Primary CTA | **「추가」** (종목 추가 · `.btn.pri`) / **「수정」** (더티 반영 · 카드·VI 줄 공통) |
| Empty state heading | 카드 격자: **「거래할 종목이 없어요」** |
| Empty state body | **「위 검색란에서 종목을 추가하거나, 돌파 목록의 종목을 눌러 시작하세요.」** |
| Error state | 주문 실패: **「주문은 나가지 않았어요. 사유를 확인한 뒤 다시 시도해 주세요. (코드 {resultCode})」** (기존 `order-panel.tsx:175` 원문 유지) |
| Destructive confirmation | 미체결 취소: 제목 **「미체결 주문을 취소할까요?」** · 요약 행 **「취소 수량 · {N}주 (미체결 잔량 전부)」** · 경고 **「취소 수량은 미체결 잔량 전부예요.」** · 확정 버튼 **「취소 주문」** |

### 상태줄 · VI 설정 2줄

| 자리 | 문구 |
|------|------|
| 제목 | 「트레이딩」 |
| DMA | 「DMA **실시간**」 (● = `--led-armed`) |
| 카운터 | 「돌파 {N}」 · 「신규 {M}」 · 「VI 발동 {N}」 · 「미확인 {M}」 · 「거래 종목 {N}」 |
| 임계 | 「임계 20% · 재무장 −2%p」 |
| 반영 | 「반영 {HH:MM:SS}」 (mono) |
| 단 수 | 「1단」 「2단」 「3단」 · 그룹 `aria-label="카드 단 수"` |
| 구간 배지 | 「정규」 / 「예약구간 · 조각 최대 {maxPieces}」 / 「장전 · 예약매수/매도」 / 「시간외종가 G2 창」 / 「시간외종가 G3 창」 / **모름이면 배지 없음** |
| VI 줄 | 「가동중」(빨강 `--up`) + 「서버 반영 {HH:MM:SS}」 / 중지 시 「중지」 · 라벨 「상승률」 `%` · 「금액」 `만원` · 더티 시 「수정」 |
| VI 스위치 `aria-label` | 「VI {KRX\|NXT} 시작」 / 「VI {KRX\|NXT} 중지」 |

### VI 발동 스트립 · 표

- 스트립 라벨: 「VI {N}」 + 「미확인 {M}」 · 버튼 「더보기」 / 「접기」
- 표 헤더줄: 「VI 발동 주문」 + 「VI {N} · 미확인 {M} · 양 거래소 한 목록 · 최신 위」 + 「접기 ▴」
- 열: 확인 · 주문시간 · 종목 · 거래소 · 발동가 · 전일대비 · 주문가 · 수량 · 체결 · 상태 · 110초
- 상태 라벨 6종 + 파생: 「접수 전」 · 「접수」 · 「취소 중」 · 「취소」 · 「체결」 · 「거부」 · **「부분체결 {filled}/{qty}」**
- 확인 체크박스 `aria-label`: **「{종목명} 주문 확인 — 119초 미확인 취소 면제」**
- 확인 체크박스 `title`(비활성 사유): 잠김 → **「서버가 잠근 확인(confirm_locked)」** · 주문번호 없음 → **「접수 전(주문번호 없음)은 확인할 수 없어요」**
- 표 캡션: **「확인 체크 = 119초 미확인 취소 면제 · 110초 미도달 취소는 서버 규칙이라 면제되지 않아요 · 접수 전(주문번호 없음)은 확인할 수 없어요 · 확인은 즉시 전송(ConfirmVIOrderReq 33)이고 더티가 아니에요」**
- 빈 상태 [신규]: **「오늘 발동된 VI 주문이 없어요」**

### 돌파감지 스트립 · 표

- 스트립 라벨: 「돌파 {N}」 + 「신규 {M}」 · 버튼 「더보기」 / 「접기」
- 표 헤더줄: 「돌파감지」 + 「돌파 {N} · 신규 {M} · 임계 20% · 최신 위」 + 「접기 ▴」
- 열: 종목 · 현재가 · 등락률 · 임계 · 기준가 · 돌파시각 · (액션)
- 액션: **「거래 추가」** (신규 행은 `--primary` 채움) / 이미 카드가 있으면 **「거래중」**
- 칩 `title`: 「{종목명} {코드} · 임계 {N}% · 기준가 {가격} · 돌파 {HH:MM:SS}」
- 폰 밴드 종목 셀 보조줄: 「{HH:MM:SS} 돌파」
- 수동 삭제 ✕ `aria-label` [신규]: **「{종목명} 돌파 목록에서 지우기 (이 기기만 · 오늘)」**
- 빈 상태 [신규]: **「아직 임계 20% 를 넘은 종목이 없어요」**
- 알림음 토글 `aria-label` [신규]: **「돌파 알림음 켜기 (이 기기만)」** / 차단 시 라벨 **「클릭해 활성화」**

### 카드

| 자리 | 문구 |
|------|------|
| ⓘ | `title` 「종목정보 (차트 · 종목정보 · 뉴스·토론)」 · `aria-label` 「종목정보」 |
| ✕ | `title` 「카드 제거」 · `aria-label` [신규] 「{종목명} 카드 닫기」 |
| 거래소 세그먼트 | 그룹 `aria-label` 「거래소」 · 버튼 「KRX」 「NXT」 · 잠김 `title` [신규] 「거래소는 전략 키의 일부라 등록 후에는 바꿀 수 없어요」 |
| LED | 라벨 「매수」 「매도」 「취소」 + 값 「OFF」 「대기」 「감시」 · `aria-label` 「{매수\|매도\|취소} 래치 {OFF\|대기\|감시}」 · 발주 후 보조 「(발주됨)」 |
| 종목정보 10칸 | 기준 · 시가 · 고가 · 저가 · 상한 · 하한 · 상승VI · 거래 · 시총 · 발행1% |
| 그룹 제목 | 「매수주문」 「한방체결」 「매도주문」 「매수취소」 |
| 그룹 보조문 | 「감시 중」 / 「무장 · 대기」 / 「꺼짐」 / 「켜짐」 / 「발주 완료 · 무장 해제」 |
| 스위치 `aria-label` | 「매수주문 켜기」 「한방체결 켜기」 「매도주문 켜기」 |
| 필드 라벨 | 비교가격(원) · 감시 대상(매도잔량 \| 매수잔량) · 잔량(주) · 체결(주) · 매수가격(원) · 주문금액(만원) · 호가변경(건) · 한방가격(원) · 호가잔량(주) · 잔량추적(%) · 매도가격(원) · 취소잔량(주) |
| 파생값 | 「잔량추적 기준선」 {N}주 |
| 더보기 생략 | 「···」 |
| 더티 바 | 「**{종목명} · {N}개 미반영**」 + 「「수정」을 눌러야 반영돼요 · 스위치를 켜면 변경한 값까지 함께 반영돼요」 + 버튼 「되돌리기」 「수정」 · 전송 중 「반영 중…」 |
| VI 줄 더티 바 | 기존 문구 유지 — 「「수정」을 눌러야 반영돼요 · 가동 상태(run)는 그대로 유지돼요」 |

### 호가·체결

- 3단 표 헤더: 「매도잔량」 「가격」 「매수잔량」 · 2단: 「가격」 「잔량」 · `aria-label="호가 10단"`
- 체결: `aria-label="체결 테이프"` + 주석 「수량 색(빨강 매수 · 파랑 매도)은 거래소 체결구분 기준이에요」 (폰 밴드에서는 숨김)

### 수동주문

| 자리 | 문구 |
|------|------|
| 진입 (폰 밴드) | 탭 「매수」 「매도」 「수동」 |
| 진입 (≥700) | 버튼 「수동주문」 · 열린 뒤 헤더 「**수동주문**」 + 「키 {ISIN}:{계좌}:{거래소}」 + ✕ `aria-label` 「수동주문 닫기」 |
| 선택 칩 | 「원주문 **{주문No}**」 / 「{매수\|매도} **{가격} × {수량}**」 + ✕ `aria-label` 「선택 해제」 |
| 폼 라벨 | 「주문유형」(호가 탭만) · 「가격」(원) · 「수량」(주) · 「조각 수」(「/ 최대 {max}」) · 「주문금액」 |
| 조각 스테퍼 | `aria-label` 「조각 줄이기」 / 「조각 늘리기」 |
| 버튼 4개 | 「매수」/「예약매수」 · 「매도」/「예약매도」 · 「정정」 · 「취소」 (미선택이면 정정·취소 `disabled`) |
| 예약 안내 | 「예약: 증권사 보관 후 09:00 처리」 / NXT 「예약: 증권사 보관 후 08:00 처리」 |
| 주문유형 옵션 | 「지정가」 「시간외종가」 · 비활성 `title` 「시간외종가는 KRX · 시간외종가 창(G2/G3)에서만 고를 수 있어요」 |
| 시간외종가 | 가격 `aria-label` 「가격(시간외종가 · 잠김)」 · 「참고 종가」 · 안내 「가격 0 · krx_session 으로 전송 · 정정 불가(취소 후 재등록)」 · 주문금액 「종가 확정 후」 |
| 각주 (호가 탭) | **「신규 매수/매도와 정정·취소 · 시간외종가는 정정 불가(취소 후 재등록)」** — ⚠️ 기존 `order-panel.tsx:581` 의 「신규 매수/매도와 취소만 지원해요 · 정정은 취소 후 다시 주문해 주세요」를 **반드시 이 문장으로 교체**한다(정정이 열리므로 옛 문장은 거짓이 된다) |

### 주문확인 다이얼로그

- 제목: 「{매수\|매도\|예약매수\|예약매도\|정정} 주문을 넣을까요?」 / 취소는 「미체결 주문을 취소할까요?」
- 확정 버튼: 「{라벨} 주문」 / 「취소 주문」 · 취소 버튼 「취소」
- 요약 행(dt/dd): 종목 · 계좌 · 거래소 · (정정/취소면) 원주문 · 주문유형 · 가격 · 수량 · (예약구간이면) 조각 수 · 주문금액 / (취소면) 취소 수량
- 주문유형 값: 「지정가 · 보통」 / 「시간외종가 · 가격 0 (KRX 세션)」
- 가격 값(시간외종가): 「참고 종가 {가격}원」 · 조각 수 값: 「{N} (서버 상한 {max})」
- 예약 줄(`--new-bg` 박스): 위 「예약: …」 문장
- 경고 박스: 「가격·수량을 다시 확인해 주세요. 서버에는 금액·수량 한도가 없어요.」 / 취소는 「취소 수량은 미체결 잔량 전부예요.」

### 공용 패널

| 자리 | 문구 |
|------|------|
| 탭 | 「미체결 ({N})」 「잔고 ({N})」 「전략 로그」 |
| 접기(폰) | 「접기 ▾」 / 「펼치기 ▴」 |
| 미체결 열 | 종목 · 거래소 · 구분 · 주문가 · 주문/미체결 · 주문No · (취소 버튼) — 호가 탭은 「매매」·「단가」·「상태」 열 구성 |
| 행 `title` | 「행을 누르면 수동주문 폼에서 정정·취소할 수 있어요」 |
| 출처 배지 | 「상따」 / 「수동」 |
| 잔고 열 | 종목 · 수량 · 매도가능 · 평단 · 현재가 · 평가손익 · 손익률 |
| 빈 상태 [신규] | 미체결 「미체결 주문이 없어요」 · 잔고 「보유 종목이 없어요」 · 로그 「아직 기록이 없어요」 |
| 로그 문구 예 | 「등락률 20% 돌파 ({N}% · KRX) — 목록에 추가됐어요」 · 「매도 진입 래치 ON — 감시 시작」 · 「매수 진입 래치 ON — 잔량 항 판정 시작」 · 「매수 발주 — 무장 해제」 · 「서버 반영 완료」 · 「전략이 등록됐어요」 |

### 종목정보 팝업

제목 = 종목명 + 코드(mono) · 탭 「차트」 「종목정보」 「뉴스·토론」 · 닫기 `aria-label` 「닫기」. 기간 버튼 「1개월」 「3개월」 「6개월」 「1년」. 섹션 제목 「상한가 다음날 이력」 · 「동반상승」 · 「뉴스」 · 「종목토론 요약」(「AI 요약」 배지 + 출처 「네이버 종목토론방 (24h 캐시)」).

### 게이트·연결 실패 (기존 문구 유지 — 새로 쓰지 말 것)

「DMA 계정이 연결되지 않았어요」 / 「로그인이 필요해요」 / 「차트·뉴스·종목토론방은 그대로 이용할 수 있어요.」 / 「홈·상승률 상위·테마는 로그인 없이도 볼 수 있어요.」 / 「시세 서버에 연결돼 있지 않아 주문을 보내지 못했어요.」 / 「주문 가격을 확인해 주세요.」 / 「주문 수량을 확인해 주세요.」 / 「주문 계좌를 선택해 주세요.」 / 「주문 종목을 확인하지 못했어요.」 / 「취소할 원주문번호를 확인하지 못했어요.」

**「불러오는 중」으로 위장하지 않는다** — `surface-placeholder.tsx` 의 규율. 준비 중이면 준비 중이라고 쓴다.

---

## 접근성 계약

**토스트 라이브러리 없음(D-27).** 모든 일시 안내는 **인라인 `role="status"` + `aria-live="polite"`**. 기존 선례: `dirty-action-bar.tsx:88-89` · `account-panel.tsx:927,956` · `copy-text-button.tsx:135`.

### 포커스 순서 — 카드 격자

DOM 순서가 곧 포커스 순서다. 격자는 **펼친 카드 → 접힌 카드 스택** 순으로 렌더되므로(`renderCards()`), 탭 이동은 「펼친 카드들 → 스택 안 접힌 카드들」이 된다. 카드 안 순서는:

1. 헤더 — 캐럿/토글 버튼 → 거래소 세그먼트(KRX, NXT) → LED 3칩 → ⓘ → ✕
2. 종목정보 10칸 (비대화형, 포커스 없음)
3. 좌 호가 pane — 가격 셀은 **버튼 시맨틱**(클릭 시 수동주문 가격 채움). 10단 × 2 = 20개가 탭 체인을 먹으므로 사다리 전체를 하나의 **roving tabindex 그룹**으로 다룬다(진입은 Tab 1회, 안에서는 ↑/↓, 탈출은 Tab). `aria-label="호가 10단"` 유지
4. 우 옵션 pane — 수동주문 진입(탭/버튼) → 그룹 1 스위치 → 그룹 1 필드 → … → 그룹 4
5. 더티 바는 **`document.body` 포털**이라 DOM 끝에 있다 — 시각적으로는 화면 하단 고정이고 **탭 순서상 페이지 맨 끝**이다. 그래서 바가 뜨면 `role="status"` 로 먼저 고지하고, 바 안의 「수정」/「되돌리기」는 키보드로 도달 가능해야 한다. (카드가 N개이므로 바 문구의 종목명이 「어느 카드인가」를 말하는 유일한 채널이다 — 시각·스크린리더 양쪽에서.)

**펼침/접힘 상태 변경은 재렌더이고 애니메이션이 없다**(D-09). 접기로 카드가 스택으로 이동하면 포커스가 사라지므로, **토글을 누른 헤더 버튼으로 포커스를 되돌린다**(`aria-expanded` 를 헤더 토글에 부여).

### 키보드 핸들링

| 컨트롤 | 시맨틱 | 키 |
|--------|--------|----|
| 거래소 세그먼트 (KRX\|NXT) | `role="group"` + `aria-label="거래소"` 안의 라디오형 — 선택 버튼 `aria-pressed="true"` (ToggleGroup `type="single"`) | Tab 으로 그룹 진입 → ←/→ 로 이동·선택 → Tab 으로 탈출. 잠긴 상태는 `disabled` + `aria-disabled="true"` + `title` 로 이유 고지 |
| 단 수 세그먼트 (1·2·3단) | 동형 (`aria-label="카드 단 수"`) | 동형. 폰 밴드에서는 **DOM 에서 제거**(`display:none` 이 아니라 조건부 렌더) — 숨긴 컨트롤이 탭 체인에 남지 않게 |
| 카드 펼침/접힘 | 헤더가 `<button>` 또는 `<header>` 안의 토글 버튼. `aria-expanded` · `aria-controls` | Enter / Space. **헤더 전체를 클릭 영역으로 두되, 그 안의 세그먼트·LED·ⓘ·✕ 클릭은 전파를 막는다**(`stopPropagation`) |
| ✕ (카드 제거) | `<button aria-label="{종목명} 카드 닫기">` | Enter / Space. 제거 후 포커스를 **다음 카드 헤더**(없으면 종목 추가 검색란)로 옮긴다 |
| 수동주문 덮기 ✕ | `<button aria-label="수동주문 닫기">` | Escape 로도 닫는다. 닫은 뒤 포커스를 「수동주문」 버튼으로 복귀 |
| 미체결 행 선택 | 행이 `<tr>` + `aria-selected` 는 쓰지 않는다 — 행 안 첫 셀에 `<button>` 을 두거나 행에 `tabindex=0` + `role="button"` + `aria-pressed`. 선택 해제 ✕ 는 별도 버튼 | Enter / Space 로 선택 토글 |
| 모달 (종목정보 · 주문확인) | Radix `Dialog` — focus trap · 초기 포커스는 닫기 버튼 · 닫으면 트리거로 복귀 | Escape 로 닫힘. 배경 클릭 닫힘 |
| VI 확인 체크 | 네이티브 `<input type="checkbox">` | Space. 비활성 사유는 `title` 이 아니라 **`aria-describedby` 로도** 연결(마우스 없는 사용자에게 `title` 은 안 읽힌다) |

### 그 밖

- **포커스 링:** `globals.css` §8.5.5 이중 링 전역 규칙을 그대로 따른다. 텍스트 입력류만 `data-focus-ring="seamless"` + 테두리색 변화 쌍.
- **색만으로 말하지 않는다:** 「신규」/「미확인」은 연노랑 **+ 배지 텍스트**, LED 는 색 **+ 라벨(OFF/대기/감시)**, 매수/매도는 색 **+ 라벨**. 110초 진행바는 바 **+ 숫자(`{N}s`)**.
- **`[hidden]`:** 탭 pane 처럼 `display:grid/flex` 를 얹은 요소를 숨길 때는 HTML `hidden` 속성을 쓴다(globals.css 가 작성자 우선순위를 복원해 둠). 접근성 트리에서도 빠진다.
- **reduced-motion:** 이 phase 는 애니메이션을 거의 쓰지 않는다(D-09 스택 전환 무애니메이션, D-18 깜박임 없음). 남는 것은 캐럿 회전 150ms · 스위치 노브 150ms · 더티 바 fade 120ms 뿐이며 `prefers-reduced-motion` 에서 전환을 끈다(`dirty-action-bar` 기존 규율).
- **Pitfall — 더티 바 z-40 vs 폰 공용 패널 z-20:** 폰 밴드에서 더티 바가 떠 있으면 하단 sticky 공용 패널을 덮는다. **z-index 로 덮는 해법은 금지**(선례: `dirty-action-bar.tsx:48`). 더티 바 높이만큼 공용 패널에 하단 여백을 주거나 공용 패널을 접힘으로 밀어내린다. 카드가 N개이므로 **폰에서 상시 발생**한다 — Playwright 에서 두 `boundingBox()` 가 겹치지 않음을 단언할 것.

---

## UI Considerations

> ui-phase UI-consideration probe(Step 9.5) 결과 · plan-phase `## UI Considerations` lift 규칙이 `## Edge Coverage` 와 동일하게 읽는다.
> 형태 기반 UI **상태** 커버리지(empty / loading / error / populated / partial / overflow / zero-one-many / long-text).
> 빈 상태·오류 **문구**는 위 `## Copywriting Contract` 가 정본이며 이 표는 그 행을 **참조**만 한다(중복 금지).
> 엘리먼트 종류는 휴리스틱 분류에 Claude 가 kind 를 확정(합집합)한 값이다 — 사용자 비참여 실행이라 `--auto` 관례를 따랐고, 기본 backstop 을 명시 truth 로 올릴 수 있는 항목만 ✅ 로 올렸다.

Applicable state considerations resolved: **80 covered, 6 backstop, 13 dismissed, 0 unresolved** (applicable 99 · 엘리먼트 16개)

| # | 엘리먼트 | kinds (확정) |
|---|---------|--------------|
| E1 | 상태줄 | static-content + interactive-control |
| E2 | VI 설정 2줄 | form + interactive-control |
| E3 | VI 발동 스트립·표 | list-collection + form |
| E4 | 돌파감지 스트립·표 | list-collection + interactive-control |
| E5 | 종목 추가 검색란 | form + interactive-control |
| E6 | 카드 격자 | list-collection |
| E7 | 카드 헤더 | static-content + interactive-control |
| E8 | 종목정보 10칸 | static-content + list-collection |
| E9 | 호가 10단·체결 | list-collection + interactive-control |
| E10 | 옵션 세팅 4그룹 | form + interactive-control |
| E11 | 수동주문 폼 | form + interactive-control |
| E12 | 주문확인 다이얼로그 | static-content + interactive-control |
| E13 | 공용 패널 | list-collection + nav + interactive-control |
| E14 | 종목정보 팝업 | nav + media + list-collection |
| E15 | 더티 액션 바 | static-content + interactive-control |
| E16 | 사이드바 트레이딩 그룹 | nav + list-collection |

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | E2 VI 설정 2줄 | ✅ covered | VI 스냅샷 전/전략 미설정이어도 KRX·NXT 두 줄은 항상 그린다 — 스위치 OFF · 「중지」 · 상승률/금액은 Phase 16 `formFromServer` 기본값. 별도 빈 상태 문구 없음. |
| empty | E3 VI 발동 스트립·표 | ✅ covered | 칩 0개 → 라벨 「VI 0」 유지 + 칩 영역에 §Copywriting 「오늘 발동된 VI 주문이 없어요」 · 「미확인」 필 `hidden` · 「더보기」 표도 같은 빈 문구. |
| empty | E4 돌파감지 스트립·표 | ✅ covered | 행 0개(78 빈 배열도 권위값, D-14) → 라벨 「돌파 0」 유지 + §Copywriting 「아직 임계 20% 를 넘은 종목이 없어요」 · 「신규」 필 `hidden`. |
| empty | E5 종목 추가 검색란 | ✅ covered | 입력 공란이면 「추가」 disabled, 결과 목록 없음. 검색 결과 0건은 Phase 16 종목검색 컴포넌트의 기존 빈 문구 그대로(신규 문구 없음). |
| empty | E6 카드 격자 | ✅ covered | 카드 0개 → §Copywriting 「거래할 종목이 없어요」 + 「위 검색란에서 종목을 추가하거나, 돌파 목록의 종목을 눌러 시작하세요.」 를 격자 자리에 그린다. |
| empty | E8 종목정보 10칸 | ✅ covered | 시세 수신 전 10칸 값은 「—」, 라벨 10개는 항상 그린다. |
| empty | E9 호가 10단·체결 | ✅ covered | 구독 전/호가 없음: 10단 행은 그리되 가격·잔량 「—」, 체결 테이프는 비움(문구 없음). |
| empty | E10 옵션 세팅 4그룹 | ✅ covered | 등록 전 카드 = 기존 `limit-chaser-form` 기본값(스위치 OFF · 보조문 「꺼짐」). 필드 공란이면 「수정」 disabled. |
| empty | E11 수동주문 폼 | ✅ covered | 빈 폼 = 가격·수량 공란 · 원주문 미선택 → 「정정」「취소」 disabled · 「매수」「매도」는 활성이되 제출 시 §게이트 검증 문구(「주문 가격을 확인해 주세요」 등). |
| empty | E13 공용 패널 | ✅ covered | 탭별 §Copywriting 빈 문구 — 「미체결 주문이 없어요」 · 「보유 종목이 없어요」 · 「아직 기록이 없어요」. 탭 카운트는 「미체결 (0)」. |
| empty | E14 종목정보 팝업 | ✅ covered | 뉴스/토론 0건은 기존 종목상세 탭의 빈 문구 그대로(신규 문구 없음). `name`/`code` 없는 돌파 항목은 ⓘ 비활성이라 팝업이 열리지 않는다(D-30). |
| empty | E16 사이드바 트레이딩 그룹 | ✅ covered | 등록 전략 0 → 「KRX VI」「NXT VI」 2항목만. 빈 문구 없음. |
| loading | E1 상태줄 | ✅ covered | DmaGate 통과(Ready) 전에는 상태줄이 아니라 기존 게이트 문구(§게이트)가 페이지를 대신한다. Ready 직후 첫 스냅샷 전에는 카운터 0 · 구간 배지 없음 · 「반영 —」. 스켈레톤·「불러오는 중」 위장 없음(surface-placeholder 규율). |
| loading | E2 VI 설정 2줄 | ✅ covered | `vi.set` 전송 후 에코 전: 줄 끝 「수정」 → 「반영 중…」 + disabled. 스위치는 확인 다이얼로그(Phase 16 D-07) 뒤 에코까지 pending 표시. 스피너 없음. |
| loading | E3 VI 발동 스트립·표 | ✅ covered | 73 스냅샷 도착 전에도 빈 상태를 그린다(위와 동일). 별도 fetch 가 없으므로 스피너·스켈레톤 없음. |
| loading | E4 돌파감지 스트립·표 | ✅ covered | 78 스냅샷 전에도 빈 상태를 그린다. 인증 직후 78 이 오면 전량 교체(D-14). 스피너 없음. |
| loading | E5 종목 추가 검색란 | ✅ covered | 검색 중 상태는 Phase 16 종목검색 컴포넌트의 기존 처리(디바운스 · 결과 갱신 · 첫 항목 자동 활성, quick 60) 그대로. 신규 로딩 표면 없음. |
| loading | E6 카드 격자 | ✅ covered | DmaGate 통과 전에는 격자를 그리지 않는다(게이트 문구). Ready 직후 64 스냅샷 도착까지의 짧은 구간은 빈 문구를 그린다 — 스켈레톤·「불러오는 중」 없음. |
| loading | E7 카드 헤더 | ✅ covered | 시세 미수신 시 현재가·등락률 「—」. 서버 전략 없으면 LED 「OFF」 3개. 캐럿·세그먼트·ⓘ·✕ 는 즉시 활성. |
| loading | E8 종목정보 10칸 | ✅ covered | 위와 동일 — 값 「—」, 스켈레톤 없음. |
| loading | E9 호가 10단·체결 | ✅ covered | 위와 동일 — 「—」 유지, 스피너 없음. |
| loading | E10 옵션 세팅 4그룹 | ✅ covered | 전송 중 더티 바 「반영 중…」 + 두 버튼 disabled. 스위치 토글 후 에코까지 pending(기존 규율). |
| loading | E11 수동주문 폼 | ✅ covered | 제출 → 응답까지 4버튼 disabled(기존 `order-panel` pending 규율). 지연 시 `timeout` 분기 문구(§상호작용 표). |
| loading | E12 주문확인 다이얼로그 | ✅ covered | 확정 버튼 클릭 → 즉시 disabled, 다이얼로그 닫힘, 이후 상태는 E11 폼의 pending/응답 문구로 이어진다(기존 `order-confirm-dialog`). |
| loading | E13 공용 패널 | ✅ covered | 미체결·잔고는 인증 직후 relay 스냅샷으로 채워진다. 스냅샷 전 = 빈 문구, 스피너 없음. |
| loading | E14 종목정보 팝업 | ✅ covered | 기존 종목상세 탭의 로딩 처리 그대로(surface-placeholder 규율 — 준비 중이면 준비 중이라고 쓴다). |
| loading | E15 더티 액션 바 | ✅ covered | 전송 중 문구 「반영 중…」 + 「되돌리기」「수정」 disabled. |
| loading | E16 사이드바 트레이딩 그룹 | ✅ covered | 64 스냅샷 전 = 2항목만(빈 상태와 동일). 스피너 없음. |
| error | E1 상태줄 | ✅ covered | relay 끊김/재연결은 DMA 필 하나가 말한다 — 기존 `useRelay().status` 표시 규칙(● 색 + 라벨) 그대로, 재시도 버튼 없음(자동 재연결). 주문·설정 오류는 상태줄이 아니라 해당 폼의 인라인 `role="status"` 가 담당한다. |
| error | E2 VI 설정 2줄 | ✅ covered | 에코 대신 거부/타임아웃이면 줄 아래 인라인 `role="status"` 로 기존 VI 화면의 오류 문구를 그대로 옮긴다(신규 문구 없음) · 더티 값은 보존 · `message` 는 표시만(파싱 금지, D-27). |
| error | E3 VI 발동 스트립·표 | 🧪 backstop | 확인 체크 전송(ConfirmVIOrderReq 33) 이 거부/타임아웃되면 체크 잠김이 풀리고 행 인라인 `role="status"` 가 기존 `vi-order-list` 문구로 고지한다(신규 문구 없음) — 실기 왕복 UAT 로 확인. |
| error | E4 돌파감지 스트립·표 | ✅ covered | 목록은 relay push 전용이라 로드 실패 경로가 없다. 시세 구독 실패/상한(`MAX_BREAKOUT_SUBS`) 초과 행은 이탈 판정을 하지 않고 76 의 마지막 가격을 그대로 보인다(§상호작용 「이탈 삭제」). relay 끊김은 상태줄 DMA 필이 말한다. |
| error | E5 종목 추가 검색란 | ✅ covered | 검색 API 실패는 Phase 16 컴포넌트 기존 처리 그대로. 이미 카드가 있는 종목을 「추가」하면 새 카드를 만들지 않고 기존 카드를 펼치고 스크롤(D-07 과 같은 규칙). |
| error | E6 카드 격자 | ✅ covered | 격자 자체의 로드 실패 경로 없음(relay push). 카드별 등록/반영 실패는 그 카드의 더티 바 + 인라인 `role="status"` 가 말한다. |
| error | E7 카드 헤더 | ✅ covered | 헤더 자체의 오류 표면 없음. ✕ 는 등록된 전략이면 기존 삭제 확인 다이얼로그(Phase 16) 를 거치고, 거부되면 카드 유지 + 인라인 `role="status"`. 거래소 잠김 사유는 `title`(§Copywriting). |
| error | E8 종목정보 10칸 | ➖ dismissed | (사유) 표시 전용 셀이며 시세 push 로 채워진다. 실패 경로가 따로 없고 미수신은 empty 항목(「—」)이 덮는다. |
| error | E9 호가 10단·체결 | ✅ covered | 구독 실패 시 「—」 유지 + 상태줄 DMA 필이 연결 상태를 말한다. 값 없는 가격 셀 클릭은 no-op(수동주문 가격을 채우지 않음). |
| error | E10 옵션 세팅 4그룹 | ✅ covered | 거부/타임아웃 = §상호작용 「주문 응답 3분기」 문구 · 검증 실패 = §게이트 기존 문구(「주문 가격을 확인해 주세요」 등) · 더티 중 에코 = 「다른 단말에서 변경됨」 `role="status"`. |
| error | E11 수동주문 폼 | ✅ covered | `rejected` 「주문이 거부됐어요 · {message}」(표시만) · `timeout` 두 문장 · 「주문은 나가지 않았어요 … (코드 {resultCode})」 — 전부 §Copywriting 기존 문구, 인라인 `role="status"`. |
| error | E12 주문확인 다이얼로그 | ➖ dismissed | (사유) 다이얼로그는 표시·확정 전용. 제출 오류는 E11 error 가 전담한다. |
| error | E13 공용 패널 | ✅ covered | 행 취소 버튼 실패 → 그 행 인라인 `role="status"` 3분기 문구(rejected/timeout). 목록 로드 실패 경로 없음(push). |
| error | E14 종목정보 팝업 | ✅ covered | 기존 종목상세 탭의 오류 처리 그대로. 새 데이터 경로 없음(D-25). |
| error | E15 더티 액션 바 | ✅ covered | 거부/타임아웃 → 바 유지 + 기존 `dirty-action-bar` `role="status"` 문구 · 더티 값 보존. |
| error | E16 사이드바 트레이딩 그룹 | ➖ dismissed | (사유) 사이드바는 relay 상태를 표시하지 않는다(상태줄 담당). 링크 실패 경로 없음. |
| populated | E3 VI 발동 스트립·표 | ✅ covered | 칩은 가로 스크롤 한 줄(줄바꿈 없음) · 표는 양 거래소 한 목록 최신 위 · 110초 진행바 + `{N}s` 숫자 · 미확인(`Accepted ∧ !confirmed`) 칩/행 `--new-bg`. 목업 `:833-855` 그대로. |
| populated | E4 돌파감지 스트립·표 | ✅ covered | 칩 가로 스크롤 + 「더보기」 표 최신 위 · 신규 행 30초 `--new-bg` + 「신규」 배지(목록 전체 타이머 1개, 깜박임 없음) · 카드 있는 종목은 「거래중」 표식. 78 스냅샷 행은 무음·무강조. 목업 `:861-882`. |
| populated | E6 카드 격자 | ✅ covered | 펼친 카드 먼저 각각 한 칸 → 접힌 카드는 스택 한 칸에 세로(gap 8px) · 1/2/3단은 page 컨테이너 + localStorage `gh-radar:trading-cols` · 헤더 클릭으로 스택 이동(재렌더, 애니메이션 없음, D-09). |
| populated | E8 종목정보 10칸 | ✅ covered | 카드 폭 ~699 2단×5행 / 700–991 5단×2행 / 992+ 한 줄(D-11). 기준 대비 up/down/flat · 상한·상승VI `--up` 고정 · 하한 `--down` 고정 · 거래/시총/발행1% 중립. |
| populated | E9 호가 10단·체결 | ✅ covered | 3단(카드 ≥830) 「매도잔량 · 가격 · 매수잔량」 / 2단 「가격 · 잔량」 · 호가표 폭 260/400/460(§2.2b) · 체결 수량 색 빨강 매수/파랑 매도(거래소 체결구분) · `aria-label="호가 10단"`/`"체결 테이프"`. |
| populated | E13 공용 패널 | ✅ covered | 미체결 열 종목 · 거래소 · 구분 · 주문가 · 주문/미체결 · 주문No · 취소 / 잔고 열 종목 · 수량 · 매도가능 · 평단 · 현재가 · 평가손익 · 손익률 / 로그 시각 + 메시지. 출처 배지 「상따」/「수동」. 목업 `:1104-1131`. |
| populated | E14 종목정보 팝업 | ✅ covered | 폰 전체화면 시트 / ≥700 최대 960px 중앙 · 탭 「차트 \| 종목정보 \| 뉴스·토론」 · 기존 4탭 내용에서 호가주문 제외 · 닫기 ✕ · 배경 · ESC. |
| populated | E16 사이드바 트레이딩 그룹 | ✅ covered | 「KRX VI(가동중 배지)」 · 「NXT VI」 · 등록 전략 N개(종목명 + LED 3점 7px), 카드 집합과 동기. 그룹 항상 펼침(Phase 16 D-16/D-19). |
| partial | E2 VI 설정 2줄 | ✅ covered | 상승률·금액 중 하나만 바꿔도 줄 단위 더티(「수정」 1개, 바뀐 라벨만 `● `). 공란 입력은 「수정」 disabled. 서버 스냅샷에 한 거래소만 있으면 나머지 줄은 기본값·「중지」. |
| partial | E3 VI 발동 스트립·표 | ✅ covered | `Accepted ∧ filledQty>0` → 배지 「부분체결 {filled}/{qty}」(§Copywriting). 주문번호 없는 행은 확인 체크 disabled + `title` 「접수 전(주문번호 없음)은 확인할 수 없어요」 + `aria-describedby`. |
| partial | E4 돌파감지 스트립·표 | ✅ covered | relay `name`/`code` 가 없으면(lookup 실패) ISIN 을 그대로 표시하고 ⓘ 팝업 비활성(D-30). 시세 미구독 행은 76 의 가격·등락률 유지. |
| partial | E5 종목 추가 검색란 | ➖ dismissed | (사유) 단일 입력 + 버튼 하나. 부분 입력 상태가 없다. |
| partial | E6 카드 격자 | ✅ covered | 시세 미수신(구독 전) 카드는 헤더 현재가·등락률 「—」, 10칸 값 「—」 로 그리되 카드는 정상 렌더. 서버 전략 없는 카드(등록 전)는 LED OFF 3개. |
| partial | E8 종목정보 10칸 | ✅ covered | 10칸 중 일부 필드 부재(예: 상승VI 미제공) → 그 칸만 「—」, 배치·칸 수 불변. |
| partial | E9 호가 10단·체결 | ✅ covered | 10단 중 빈 단(잔량 0/가격 없음) → 해당 행 「—」, 행 수 10 고정. |
| partial | E10 옵션 세팅 4그룹 | ✅ covered | 필드별 더티(`● ` 접두 + `--primary`). 4그룹 중 일부만 켜짐은 정상(LED 로 표시). 서버 스냅샷에 필드가 없으면 기본값. |
| partial | E11 수동주문 폼 | ✅ covered | 원주문 선택 시 가격·수량이 원주문 값으로 채워지고 칩 「원주문 {No}」 표시, 해제해도 값 유지. 조각 수는 `open ∧ KRX` 에서만 보임(그 외 1). 시간외종가 선택 시 가격 잠금 「—」 + 「참고 종가」. |
| partial | E13 공용 패널 | ✅ covered | 주문No 없는 미체결 행(접수 전)은 취소 버튼·행 선택 disabled + `title` 사유(기존 Q-ID 가드). 잔고에 현재가 미수신 종목은 평가손익 「—」. |
| partial | E14 종목정보 팝업 | ✅ covered | 탭별 독립 로드 — 한 탭이 실패해도 다른 탭은 정상(기존 종목상세 규율). |
| partial | E16 사이드바 트레이딩 그룹 | ✅ covered | `RelayLimitChaser.name` 없는 전략은 코드(없으면 ISIN) 표시. |
| overflow | E1 상태줄 | 🧪 backstop | page 컨테이너 폰 밴드(<700)에서 단 수 세그먼트는 DOM 에서 제거되고 나머지 필은 2줄로 wrap 하며 어느 필도 잘리지 않는다 — Playwright 실폭(폰/와이드) 잘림 0 단언(D-29). |
| overflow | E3 VI 발동 스트립·표 | ✅ covered | 칩 줄 = `overflow-x:auto` 가로 스크롤. 표는 page 폰 밴드에서 목업 `:837-855` 의 열 접기 규칙 그대로(목업이 정본, D-26). 표 캡션 문장은 wrap. |
| overflow | E4 돌파감지 스트립·표 | ✅ covered | 상한 200행(Phase 17 리듀서). 칩 줄 가로 스크롤 · 표는 page 폰 밴드에서 목업 `:868-882` 열 접기(종목 셀 보조줄 「{HH:MM:SS} 돌파」). |
| overflow | E6 카드 격자 | 🧪 backstop | 카드 폭 4밴드 × 격자 1/2/3단 × 폰/와이드에서 잘림 0 — Playwright 실브라우저 단언(D-29, Phase 17 `trading-limit-chaser.spec.ts` 케이스 9·11·12·13 패턴). |
| overflow | E7 카드 헤더 | ✅ covered | 카드 폭 760 미만은 `l1`/`l2` 2줄, 폰 밴드(≤699)는 종목명/코드 2줄(`line-height:1.15`, 코드 10px). 잘림 0 은 E6 overflow backstop 이 덮는다. |
| overflow | E8 종목정보 10칸 | ➖ dismissed | (사유) 칸 수 10 고정, 값은 mono 숫자(단위 축약). 밴드별 배치가 폭을 흡수하며 잘림 0 은 E6 overflow backstop 이 덮는다. |
| overflow | E9 호가 10단·체결 | ✅ covered | 행 수 10 · 행 높이 22/34px 고정, 체결 테이프는 최근 N건 고정(폰 밴드 숨김). 내부 스크롤 없음. |
| overflow | E12 주문확인 다이얼로그 | ✅ covered | 요약 dt/dd 는 세로 스택 · 폰에서 다이얼로그 본문 세로 스크롤(기존 `order-confirm-dialog` 규율) · Radix Dialog focus trap. |
| overflow | E13 공용 패널 | 🧪 backstop | ≥700 은 표 열 접기(목업 정본) + 세로 자연 확장. 폰 sticky 패널 펼침 시 격자·더티 바와 겹침 0 · 잘림 0 을 Playwright `boundingBox()` 로 단언. |
| overflow | E14 종목정보 팝업 | ✅ covered | 모달 본문 세로 스크롤(Radix Dialog) · 차트는 컨테이너 폭에 맞춤(lightweight-charts resize, hex/rgb 색 주입). |
| overflow | E15 더티 액션 바 | 🧪 backstop | 폰 밴드에서 더티 바(z-40)와 sticky 공용 패널(z-20)이 겹치지 않음을 두 `boundingBox()` 로 Playwright 단언 — z-index 로 덮는 해법 금지(§접근성 Pitfall). |
| overflow | E16 사이드바 트레이딩 그룹 | ✅ covered | 전략 수 상한 없음 → 사이드바 세로 자연 확장(앱 셸 스크롤). 앱 셸은 뷰포트 브레이크포인트 그대로. |
| zero-one-many | E3 VI 발동 스트립·표 | ✅ covered | 0 = 빈 문구 · 1+ = 칩·행 동일 문법(단수 특별 취급 없음). 라벨은 항상 「VI {N}」 숫자형이라 한국어 단/복수 어휘 분기 없음. |
| zero-one-many | E4 돌파감지 스트립·표 | ✅ covered | 0 = 빈 문구 · 1+ = 동일 문법. 라벨 「돌파 {N}」·「신규 {M}」 숫자형, 단/복수 어휘 분기 없음. 「신규」 필은 M=0 이면 `hidden`. |
| zero-one-many | E6 카드 격자 | 🧪 backstop | 펼침 0/1/2+ × 접힘 0/1/N 조합에서 스택이 정확히 한 칸을 차지하고 펼친 카드가 먼저 오는지 — Playwright 실폭 프레임 시각 단언. |
| zero-one-many | E8 종목정보 10칸 | ➖ dismissed | (사유) 칸 수 10 고정 — 가변 컬렉션이 아니다. |
| zero-one-many | E9 호가 10단·체결 | ➖ dismissed | (사유) 행 수 10 고정. |
| zero-one-many | E13 공용 패널 | ✅ covered | 탭 라벨 「(N)」 숫자형 · 0 = 빈 문구 · 1+ = 동일 행 문법. 단/복수 어휘 분기 없음. |
| zero-one-many | E14 종목정보 팝업 | ➖ dismissed | (사유) 내부 목록(뉴스·토론)은 기존 종목상세 컴포넌트 소유 — 이 phase 가 새로 정의하지 않는다. |
| zero-one-many | E16 사이드바 트레이딩 그룹 | ✅ covered | 0 = 2항목 · 1+ = 동일 항목 문법. 단/복수 어휘 없음. |
| long-text | E1 상태줄 | ➖ dismissed | (사유) 상태줄 문자열은 전부 고정 어휘 + 숫자(카운터·시각·임계). 자유 텍스트 입력·표시가 없다. |
| long-text | E2 VI 설정 2줄 | ➖ dismissed | (사유) 입력은 숫자 전용(% · 만원), 라벨은 고정 어휘. 자유 텍스트 없음. |
| long-text | E3 VI 발동 스트립·표 | ✅ covered | 종목명은 칩·셀에서 1줄 ellipsis, 전체 문자열은 `title`. 상태 배지·숫자는 고정 어휘. |
| long-text | E4 돌파감지 스트립·표 | ✅ covered | 종목명 1줄 ellipsis, 칩 `title` 에 「{종목명} {코드} · 임계 {N}% · 기준가 {가격} · 돌파 {HH:MM:SS}」 전체. |
| long-text | E5 종목 추가 검색란 | ✅ covered | 결과 항목의 긴 종목명은 1줄 ellipsis, 입력값은 네이티브 가로 스크롤. |
| long-text | E7 카드 헤더 | ✅ covered | 종목명 15px/700 1줄 ellipsis, 전체는 `title`. 코드는 6자 mono 고정. |
| long-text | E8 종목정보 10칸 | ➖ dismissed | (사유) 값은 숫자, 라벨은 2~4자 고정 어휘. |
| long-text | E9 호가 10단·체결 | ➖ dismissed | (사유) 가격·잔량은 mono 숫자 전용. |
| long-text | E10 옵션 세팅 4그룹 | ➖ dismissed | (사유) 숫자 입력 전용 + 고정 라벨. |
| long-text | E11 수동주문 폼 | ✅ covered | 칩은 mono 고정폭 · 예약/시간외종가 안내 문장은 wrap · 폰 밴드 4버튼은 「예약」이 윗줄로 접힘(`.obtns.four .obtn .pre`, 10px). |
| long-text | E12 주문확인 다이얼로그 | ✅ covered | 종목명은 wrap 허용(ellipsis 없음 — 확인 화면이므로 전체 노출). 예약 줄·경고 박스 문장은 wrap. |
| long-text | E13 공용 패널 | ✅ covered | 전략 로그 메시지는 clamp 없이 줄바꿈 허용(`min-width:0` + `word-break:keep-all`) — Open Questions Q-4 채택값. 종목 열은 1줄 ellipsis. |
| long-text | E14 종목정보 팝업 | ✅ covered | 제목 종목명은 wrap 허용, 본문 텍스트는 기존 컴포넌트 규율 그대로. |
| long-text | E15 더티 액션 바 | ✅ covered | 「{종목명} · {N}개 미반영」 의 종목명은 1줄 ellipsis · 안내 문장은 폰에서 2줄 wrap 허용. |
| long-text | E16 사이드바 트레이딩 그룹 | ✅ covered | 종목명 1줄 ellipsis, 전체는 `title`. |

<!-- Status vocabulary (locked by probe-core projectTruths):
     ✅ covered   → a plain truth string lifted into must_haves.truths
     🧪 backstop  → a flat scalar { statement, verification: backstop }; at verify time, no explicit
                    evidence → insufficient_spec → human_needed (never a silent pass, #1154)
     ➖ dismissed → reason recorded; not lifted
     ⚠ unresolved → an explicit planner assumption (surfaced, never silently dropped)
     Rows are REPLACED (not appended) on a probe re-run — idempotent. -->

---
## 요구사항 ↔ 표면 ↔ 목업 매핑

| 요구사항 | UI 표면 | 정본 목업 · 섹션 |
|----------|---------|-----------------|
| **TRADE-06** 돌파감지 목록 | 상태줄 「돌파 N / 신규 M」 · 알림음 토글 · 돌파 스트립(칩 + 더보기) · 돌파 표(7열 + 「거래 추가」/「거래중」) · 30초 강조 · ✕ 수동 삭제 | `18-workbench-mockup.html` §돌파 스트립/표 (마크업 `:745-746` · 렌더 `:859-884` · CSS `:282-300`, `:330-358`) |
| **TRADE-07** 예약/시간외종가 발주 + 수동주문(신규·정정·취소) | 카드·호가 탭의 적응형 수동주문(3탭 / 덮기) · 「매수·매도·정정·취소」 4버튼 · 원주문 선택 칩 · 조각 수 스테퍼 · 주문유형 콤보(호가 탭 전용) · 주문확인 다이얼로그 · 구간 배지 | workbench §수동주문 (`:571-619`, `:1017-1033`) + `18-orderbook-tab-mockup.html` §수동주문·확인 (`:811-835`, `:863-875`) |
| **TRADE-08** NXT VI 설정 | VI 설정 2줄(KRX/NXT) · VI 발동 스트립 · VI 발동 표(확인 체크·110초) · 사이드바 3단 「KRX VI(가동중)」/「NXT VI」 | workbench §VI (마크업 `:742-744` · 렌더 `:809-858` · CSS `:301-329`) |
| **TRADE-09** 통합 트레이딩 작업대 | 페이지 전체 10섹션 순서 · 카드 헤더/10칸/본문 · 스택 정렬 · 단 수 세그먼트 · 공용 패널 · 종목정보 팝업 · 사이드바 재구성 · 호가 탭 통일 | workbench 전체 (`:692-771`) + orderbook 전체 (`:682-726`) |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | dialog · tabs · switch · checkbox · table · toggle-group · button · input · command · badge · tooltip · popover · sheet · separator · skeleton (전부 **이미 설치되어 있다**) | not required |
| (third-party) | 없음 — `components.json` 의 `"registries": {}` 실측 (2026-09-21) | not applicable |

**이 phase 는 새 npm 패키지도, 새 레지스트리 블록도 도입하지 않는다.** 알림음은 브라우저 네이티브 Web Audio, 컨테이너 쿼리는 Tailwind v4 내장, 포털은 `react-dom`.

---

## Open Questions

> 사용자가 이 실행에 참여하지 않았으므로 **차단하지 않고 권장 기본값을 확정**한다. 플래너는 이 값을 채택하거나 명시적으로 뒤집을 것.

| # | 질문 | 권장 기본값 (채택) | 근거 |
|---|------|------------------|------|
| Q-1 | VI 「마감알림」 로컬 설정의 거취 (D-05 재량 / RESEARCH O-3) | **상태줄로 옮긴다.** 알림음 토글(D-17) 옆에 「이 기기 전용 알림 2종」으로 나란히. 제거하지 않는다 | 제거하면 「VI 해제 10초 전 알림」 기능이 사라지고 `vi-alert.ts` 의 권한 거부 문구 경로가 죽는다 |
| Q-2 | 공용 패널의 계좌 축 (RESEARCH O-2) | **상태줄에서 고른 단일 계좌**의 `AccountPanel`(계좌 전용 모드). 다계좌 합산은 `/me` 가 이미 담당 | MYPAGE-01 과 표면 중복 방지 |
| Q-3 | 카드에서 고르는 계좌 (RESEARCH O-4) | 상태줄 계좌 = **신규 카드의 기본값**. 이미 등록된 카드는 자기 키의 계좌를 유지하고, 상태줄을 바꿔도 움직이지 않는다 — 그 사실을 UI 가 말해야 한다(카드 헤더 `title` 또는 수동주문 「키 …」 줄) | 계좌는 전략 키의 일부(거래소와 같은 논리, D-10) |
| Q-4 | 전략 로그 긴 메시지 줄바꿈 | **clamp 없이 줄바꿈 허용** (`min-width:0` + `word-break:keep-all`) | 로그는 읽히는 것이 목적. §UI Considerations E13 long-text 가 이 값을 ✅ truth 로 채택 |
| Q-5 | `/trading?focus=` 파라미터 이름·인코딩 (D-02 재량) | **`?focus={encodeURIComponent(key)}`** — 기존 `limitChaserHref` 의 인코딩 규율 그대로. `[key]/page.tsx` 에서 `decodeURIComponent` 후 서버 `redirect()` | 기존 리다이렉트 선례(`limit-chaser/page.tsx:13`)와 같은 규율 |
| Q-6 | 돌파 구독 상한 값 | **`MAX_BREAKOUT_SUBS = 40`** (보수 선택 · 게이트웨이 상한 미확인) | relay `SubscriptionHub` 에 상한 없음이 실측됐고, 게이트웨이 상한은 이번 리서치에서 확인하지 못했다. 「상한이 없다」고 읽지 말 것 |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** APPROVED — gsd-ui-checker 7/7 PASS (2026-09-21) · UI-consideration probe 99/99 resolved (80 explicit · 6 backstop · 13 dismissed)
