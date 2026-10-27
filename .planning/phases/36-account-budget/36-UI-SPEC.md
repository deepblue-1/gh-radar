---
phase: "36"
slug: "account-budget"
status: approved
shadcn_initialized: true
preset: "radix-nova (components.json · base radix · baseColor neutral · Toss TDS 토큰 override)"
created: "2026-10-27"
reviewed_at: "2026-10-27"
---

# Phase 36 — UI Design Contract

> 계좌별 주문가능 금액(예수금 · 수수료 · 매도세) + 일자별 매매손익. gsd-ui-researcher 가 만들고 gsd-ui-checker 가 검증한다.
> **이 계약은 채택 목업을 옮긴 것이다(CONTEXT D-00).** 정본 목업 `reference/mockup-account-budget.html` — 사용자 검토 2026-10-27 「5번은 A안으로. 나머지는 OK」: 화면 ①~④ 그대로, ⑤ 는 **A 안**(일자 행 한 줄 + 종목별 펼침). 목업의 배치 · 문구 · 상태 · 폰 390 / 데스크톱 1120 은 확정된 결정이다. 다시 묻지 않는다.
> **디자인 시스템은 이미 확립돼 있다.** 새 토큰 · 새 shadcn 컴포넌트 · 새 아이콘 라이브러리 없음. 목업의 색 값(`#e5484d` · `#ff9f43` 등)은 목업 프레임 값이다 — 구현은 `webapp/src/styles/globals.css` 의 실제 토큰(아래 Color)을 쓴다. 목업 픽셀 값(13 · 13.5 · 12.5 · 11.5 · 17 · 30 · 84 등)은 Phase 33/34 와 같은 규칙으로 프로젝트 글자 체계 · 4 배수로 옮겼다(옮긴 값은 각 절에 적었다).
> **용어:** 화면 낱말은 전부 **「예수금」**. 「한도」 는 화면에 쓰지 않는다(와이어 `budget_krw` · gh-trade 문서의 「한도」 = 같은 것). 목업 캡션의 「예수금는」 은 오타 — 정본 문구는 「예수금은」(CONTEXT D-01).
> 결정 출처: `36-CONTEXT.md` D-00 ~ D-19(잠금) · 「Claude's Discretion」, `36-RESEARCH.md`(Pattern 4 · 5 · 7 · Pitfall 12 · 13 · Open Question 4), gh-trade `41-CONTEXT.md` D-14 ~ D-20(WinForms 동형 기준). 이 문서가 새로 정한 것은 **`(researcher decision)`** 표시 — 「Researcher Decisions」 절에 모았다.

### 표면 지도

| # | 표면 | 결정 | 주 파일(실재 경로 · 새 파일은 이름 예시) |
|---|---|---|---|
| ① | 어드민 계좌 카드 「예수금 · 수수료 · 매도세」 상시 행 + 상태 6종 | D-01 ~ D-07 | `webapp/src/components/admin/account-editor.tsx`(`AccountRow` 590~ · `WARN_LINE` 421 · `EDIT_ERROR_LINE` · `NOTE` · `RESULT_CHIP`/`chipOfResult` 196~) · `use-field-save.ts` · `reflect-chip.tsx` · `webapp/src/lib/admin-api.ts` |
| ② | 계좌 패널 요약 줄 「주문가능 / 예수금」 | D-08 ~ D-11 | `webapp/src/components/orderbook/account-panel.tsx`(잔고 `<section data-testid="account-holdings">` 997~ · 임베드 `EmbeddedSection` 1203~) |
| ③ | 수동주문 폼 「주문가능」 행 + 초과 검증 줄 | D-12 | `webapp/src/components/trading/card/manual-order-form.tsx`(주문금액 행 987~ · 주문계좌 행 999~ · 버튼 1038~) |
| ④ | 상따 카드 금액 3칸 합산 경고 | D-13 | `webapp/src/components/trading/limit-chaser-form.tsx`(`pane('buy', …)` · `ArmBlockedPanel`) · `webapp/src/components/trading/lc/lc-fields.ts`(선매수 `buyOrderAmount` 금액 행) · `lc/setting-group.tsx`(`lc-row-value`) |
| ⑤a | `/admin/pnl` 일자별 매매손익(계정별 \| 계좌별 · 기간 세그먼트) | D-17 ~ D-19 | 새 `webapp/src/app/admin/pnl/page.tsx` · 새 `webapp/src/components/pnl/*`(예: `pnl-admin-client.tsx` · `pnl-group-card.tsx` · `pnl-period-control.tsx`) |
| ⑤b | `/me` 5번째 탭 「손익」 | D-17 · D-18 | `webapp/src/components/trading/me-client.tsx`(`ME_TABS` 303) · ⑤a 의 `components/pnl/*` 재사용 |
| ⑥ | 사이드바 Admin 묶음 「매매손익」 | D-17 | `webapp/src/components/layout/app-sidebar.tsx`(`NAV_ADMIN_LAUNCH` 199 옆) |
| (공통) | 표시 변환(만원 내림 · 손익 부호 · 소수 1자리 · % ↔ ppm) · 주문가능 계산 | D-09 · D-11 · D-18 | shared 한 벌(RESEARCH 가칭 `packages/shared/src/account-budget.ts` — `availableKrwOf` · `formatManwonFloor` · `formatPnlManwon` · `formatManwon1` · `pctToPpm` · `ppmToPct`) |

**반응형 층.** ③ 수동주문 폼과 ④ 상따 카드는 `/trading` 작업대 안 **상따 카드 본문 폭 컨테이너 쿼리 밴드**(`@…/lc`) 안에 산다 — 밴드 표 · 경계는 `webapp/src/styles/globals.css` §2.2b 가 정본이다(여기 복사하지 않는다). ② 의 작업대 임베드 잔고 탭은 작업대 컨테이너(`@…/wb`) 안이지만 요약 줄은 밴드별 분기가 없다. ① · ⑤a · ⑤b · ⑥ 과 /me 잔고 탭은 앱 셸 층 = **뷰포트 브레이크포인트**다(admin 폰 터치 치수 `sm` 640 · 매매손익 7열 `lg` 1024).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (이미 초기화 — `webapp/components.json`) |
| Preset | `radix-nova` · base `radix` · baseColor `neutral` · cssVariables · tailwind v4(`src/styles/globals.css`) — 색은 Toss TDS 토큰이 override |
| Component library | radix (`radix-ui@1.4.3`) — 이 phase 는 radix 프리미티브를 새로 쓰지 않는다(기존 `Tabs` · `Checkbox` 그대로) |
| Icon library | lucide (`lucide-react@1.8.0`) — `ChevronDown`(매매손익 일자 행 셰브론) 1개만. 「보내는 중」 칩 스피너는 아이콘이 아니라 CSS 원형(9px · 1.5px `--faint` 테두리 · 위쪽 투명 · 0.8s 회전 · `motion-reduce:animate-none` — 목업 `.ch.busy::before` 그대로) |
| Font | Pretendard Variable(`--font-sans`) · 금액 · % · 계좌번호 · 일자는 `tabular-nums`(`mono` 클래스 = `--font-num`) |

---

## Component Inventory

Enumerated by `npx shadcn info` (cwd `webapp/`, 「Installed Components」 절) — 21 components — shadcn@4.2.0 — 2026-10-27.

설치 목록: badge, button, card, chart, checkbox, command, dialog, input-group, input, popover, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toggle-group, toggle, tooltip(`radix-ui@1.4.3` 위). 아래 표는 **이 phase 가 닿는 것만 고른 비배타 목록**이다 — 표 밖 컴포넌트를 확인해 쓰는 것은 정상 경로다. 이 phase 는 shadcn 컴포넌트를 새로 설치하지 않는다.

| Component | Import path | Notes |
|-----------|-------------|-------|
| Input | `@/components/ui/input` | ① 예수금 · 수수료 · 매도세 칸 — `size="sm"`(h-8 · 12px) + 폰 `h-9`. `aria-invalid` 이 빨간 테두리 채널(컴포넌트 내장 · Phase 30 D-04 동형) · `data-focus-ring="seamless"` 내장 |
| Tabs · TabsList · TabsTrigger · TabsContent | `@/components/ui/tabs` | ⑤b `/me` 5번째 탭 — 기존 `ME_TABS` 루프 그대로 |
| Skeleton | `@/components/ui/skeleton` | ⑤ 로딩 자리표시(`launch-orders-tab.tsx` `CardsSkeleton` 문법) |
| Button | `@/components/ui/button` | ⑤ 오류 「다시 시도」 는 `launch-orders-tab.tsx` 와 같은 글자 버튼(`<button>` · `--accent-fg`) — Button 변형을 새로 쓰지 않는다 |
| `ReflectChip` · `ADMIN_CHIP_BASE` · `ADMIN_TONE_CLASS` (프로젝트) | `@/components/admin/reflect-chip` | ① 서버 결과 칩 — 톤 ok/warn/err/only · `title` = 서버 message 원문 |
| `chipOfResult` · `RESULT_CHIP` · `chipStatusText` · `chipFullText` · `ACCOUNT_EDITOR_TEXT` (프로젝트) | `@/components/admin/account-editor` | ① 결과 → 칩/줄. op 6/7 문구는 `ACCOUNT_EDITOR_TEXT` 에 키를 더한다(아래 Copywriting) |
| `useFieldSave` (프로젝트) | `@/components/admin/use-field-save` | ① 칸 저장 리듬(비행 1건 · 마지막 값만 큐) — 예수금(op 6) 1벌 · 비용률(op 7) 1벌 |
| `PageHeader` (프로젝트) | `@/components/layout/page-header` | ⑤a 제목 「매매손익」 · `actions` = 「계정별 \| 계좌별」 세그먼트 |
| `AppShell` · `AppSidebar` (프로젝트) | `@/components/layout/app-shell` · `app-sidebar` | ⑤a 페이지 셸(`/admin/launch/page.tsx` 와 같은 꼴 + `Suspense`) |
| `CARD` · `ROW_DIVIDER` · `PAGE_WRAP` (프로젝트) | `@/components/layout/page-layout` | ⑤ 묶음 카드 면(`rounded-[16px] bg-[var(--card)]`) · 일자 행 구분선 |
| `MeAccountChips` (프로젝트) | `@/components/me/account-chips` | ⑤b 탭 위 계좌 칩이 고른 계좌 한 벌(무변경) |
| `AccountPanel` (프로젝트) | `@/components/orderbook/account-panel` | ② 요약 줄이 들어가는 부품(4 호출부 공유) |
| `holdingQuotePrice` (프로젝트) | `webapp/src/components/trading/workbench/trading-workbench.tsx` | ② · ③ · ④ 시장가 매수 미체결의 현재가(KRX → NXT) — D-11 |
| `MINUS` (프로젝트) | `@/lib/teamflow-report` | ⑤ 손실 부호 U+2212 「−」 |
| lucide `ChevronDown` | `lucide-react` | ⑤ 일자 행 셰브론(`aria-hidden` · 열림 `rotate-180` · 200ms · `motion-reduce:transition-none` — `accum-day-grid.tsx` 동형) |

---

## Spacing Scale

Declared values (must be multiples of 4) — 프로젝트 토큰 `--s-*` 그대로:

| Token | Value | Usage |
|-------|-------|-------|
| xs (`--s-1`) | 4px | ① 라벨–칸–단위 사이(`gap-1`) · ⑤ 종목 줄 사이(`mb-1`) · 칩 사이 |
| sm (`--s-2`) | 8px | ① 행 안 필드 사이(`gap-2`) · 행 위 여백(`mt-2`) · ② 요약 줄 항목 사이(`gap-x-2`) · ③ 행 사이(폼 기존 `gap-2`) · ⑤ 기간 컨트롤 사이(`gap-2`) · 요약 칸 사이(`gap-x-2`) · 종목 줄 안 칸 사이(`gap-2`) |
| (`--s-3`) | 12px(표준 집합 밖 — 4 배수 프로젝트 토큰 · Phase 33/34 와 같은 상속) | ② 요약 줄 좌우(`px-3`) · ⑤ 일자 행 위아래(`py-3`) · 칸 사이(`gap-x-3`) · 요약 행 위아래(`py-3`) · 폰 요약 줄 사이(`gap-y-3`) · 종목 줄 좌우(`px-3`) · 펼침 아래(`pb-3`) |
| md (`--s-4`) | 16px | ⑤ 카드 안 좌우 패딩(`px-4` — 묶음 머리 · 요약 · 열 머리 · 일자 행 · 펼침) · 페이지 세로 간격(`gap-4` — 머리 → 컨트롤 → 묶음 카드들) |
| lg (`--s-5`) | 24px | (변경 없음) |
| xl (`--s-6`) | 32px | (변경 없음) |
| 2xl (`--s-8`) | 48px | ⑤ 빈 · 오류 상자 세로 패딩(`py-12` — `launch-orders-tab.tsx` `EmptyBox` 상속) |
| 3xl (`--s-10`) | 64px | (변경 없음) |

이 phase 가 정하는 치수:

| 치수 | 값 | 근거(목업 → 계약) |
|---|---|---|
| ① 예수금 칸 폭 | 96px(`w-24`) · 우측 정렬 · 좌우 패딩 8(`px-2`) | 목업 84 → 「999,999,999」(9자리 만원 상한) 12px/600 tabular ≈ 77 + 16 이 들어가는 4 배수 |
| ① 수수료 · 매도세 칸 폭 | 64px(`w-16`) · 우측 정렬 · `px-2` | 목업 60 → 「0.0125」(소수 4자리) 가 들어가는 값 |
| ① 칸 높이 | 데스크톱 32px(`Input size="sm"` h-8) · 폰(<640) 36px(`h-9 sm:h-8`) | 목업 30 → 기존 admin 폰 터치 36(`ACCOUNT_BUTTON` `h-9 sm:h-7` 결) |
| ① 행 위치 · 여백 | IP/MAC 읽기 줄(교보는 지점 · 트레이더 줄) 다음 · 서버 토글 알약 줄 앞 · `mt-2` · `flex flex-wrap items-center gap-2` | 목업 `.lim` gap 6/8 → 8 |
| ② 요약 줄 | `flex flex-wrap items-baseline gap-x-2` · 기본 모드는 잔고 섹션 첫 자식(섹션 패딩 상속) · 임베드는 `px-3 pt-2 pb-2` | 목업 `.avail` 10/12/8 · gap 6 → 8/12/8 · 8 |
| ③ 주문가능 행 | `min-h-[44px]` · `justify-between gap-2` — 주문금액 행과 **같은 클래스** | 목업 `.row` 44 · 기존 주문금액 행 그대로 |
| ④ 경고 줄 | 매수 열 그룹들 다음 · `ArmBlockedPanel` 앞 · `mt-2 px-0.5` | 목업 `.notice` 4/6/6 → 8/2 |
| ⑤ 기간 세그먼트 | 트랙 `rounded-[10px] bg-[var(--muted)] p-[3px] gap-0.5` · 칸 `min-h-8 rounded-[8px] px-3` | `launch-orders-tab.tsx` 발사 세그먼트 상속(목업 `.seg` 3px · r10 · 5/11 과 같은 꼴) |
| ⑤ 「이달」 알약 | `min-h-8 rounded-[10px] border px-3` | 목업 `.mon` 6/11 · r10 → 32 높이 · 12 |
| ⑤ 묶음 카드 | `CARD`(r16 · `--card`) · 라이트 `ring-1 ring-inset ring-[var(--border-subtle)]` · 다크 `ring-0` · `overflow-hidden` | 목업 `.pnl` · `launch-orders-tab.tsx` `CARD_FACE` 결 |
| ⑤ 묶음 머리 | `px-4 pt-3 pb-2 bg-[var(--band)] border-b border-[var(--border-subtle)]` · 제목–부제 `gap-2` | 목업 `.gh2` 11/16/8 → 12/16/8 |
| ⑤ 요약 행 | `px-4 py-3 border-b` · 데스크톱(≥1024) `grid-cols-[1.2fr_repeat(5,1fr)_0.7fr] gap-x-2` · 폰 `grid-cols-3 gap-x-2 gap-y-3`(첫 칸 `col-span-full`) | 목업 `.sum` 그대로(10 → 12) |
| ⑤ 열 머리(≥1024 만) | `px-4 py-2 border-b` · 일자 행과 같은 열 템플릿 | 목업 `.dhead` |
| ⑤ 일자 행 버튼 | `min-h-11 w-full px-4 py-3` · 데스크톱 `grid-cols-[96px_96px_72px_72px_minmax(104px,1fr)_minmax(104px,1fr)_48px_16px] gap-x-3` · 폰 `grid-cols-[minmax(0,1fr)_auto_16px] gap-x-2 gap-y-1`(2줄) | 목업 110 96 80 80 110 110 60 16 · gap 10 → 합 608 + 칸 사이 84 = 692 ≤ `lg` 최소 본문(1024 − 사이드바 240 − 48) 736 − 카드 패딩 32 = 704 |
| ⑤ 펼침 | `px-4 pb-3` · 요약 한 줄 아래 `pb-2` · 종목 줄 `rounded-[8px] bg-[var(--band)] px-3 py-2 mb-1` · 데스크톱 `grid-cols-[minmax(0,1fr)_88px_minmax(0,184px)] gap-2` · 폰 `grid-cols-[minmax(0,1fr)_80px]`(금액 줄 `col-span-full`) | 목업 `.dbody` 0/16/12 · `.sl` 6/10 · 1fr 90 180 → 8/12 · 88 · 184 |

Exceptions (상속 — 간격 스케일 밖으로 선언):
- ① · 어드민 줄 상수 `NOTE` · `WARN_LINE` · `EDIT_ERROR_LINE` 의 위 여백 6px(`mt-1.5`) — `account-editor.tsx` 상속(캡션 · 경고 줄 · 오류 줄은 이 상수를 그대로 쓴다).
- ① 결과 칩 패딩 2/6(`ADMIN_CHIP_BASE` `px-1.5 py-0.5`) — `reflect-chip.tsx` 상속.
- ③ 초과 검증 줄은 기존 `priceIssue` 줄 클래스 상속(`pl-0.5` 2px · `leading-snug`) — 단 위치 보정 `-mt-1` 은 쓰지 않는다(버튼 줄 위라 앞 행과 겹칠 필요 없음).
- ⑤ 세그먼트 트랙 안쪽 3px(`p-[3px]`) · 칸 사이 2px(`gap-0.5`) — 발사 세그먼트 · 수동주문 폰 탭 트랙 상속.
- ⑤ 폰 일자 행 2줄 사이 4px(`gap-y-1`) · ⑤ 그룹 머리 부제와 계좌 배지 사이 4px.

---

## Typography

이 phase 가 **새로 짓는** 글자 역할은 아래뿐이다 — 크기 4개(12 · 14 · 15 · 18), 굵기 2개(400 · 600).

| Role | Size | Weight | Line Height | 자리 |
|------|------|--------|-------------|------|
| 캡션 · 보조(Label) | 12px(`--t-caption`) | 400(본문) / 600(① 칸 값) | 1.5 | ① 행 라벨 「예수금 · 수수료 · 매도세」 · 단위 「만원 · %」 · 칸 값(600 · tabular) · 캡션 · 경고/오류/메모 줄 / ② 「주문가능」 라벨 · 「/ 예수금 2,000만」 / ④ 경고 줄 / ⑤ 묶음 부제 · 요약 칸 라벨 · 열 머리 · 데스크톱 행의 수수료 · 세금 · 매수 · 매도 · 체결 칸 · 폰 행 아랫줄 · 펼침 요약 줄 · 종목 줄(이름 400 · 손익 600 · 금액 400) · 기간 범위 캡션 |
| 본문(Body) | 14px(`--t-sm`) | 400 / 600 | 1.5 | ⑤ 묶음 제목(600) · 요약 칸 값(600) · 데스크톱 일자(600) · 데스크톱 행 실현손익(600) · 빈/오류 제목(600) |
| 강조 금액(Heading) | 15px | 600 | 1.5 | ② 주문가능 값(D-08 「15/600」 잠금) · ⑤ 폰 일자 행 실현손익(목업 `.dbtn .p` 15) |
| 기간 합 실현손익(Display) | 18px(`--t-lg`) | 600 | 1.2 | ⑤ 요약 행 첫 칸 「30일 실현손익」 값(목업 17 → 가장 가까운 토큰 18 · 과장 금지 — 20 KPI 역할로 올리지 않는다) |

상속(바꾸지 않음 — 기존 승인 역할):
- 어드민 칩 11/600(`ADMIN_CHIP_BASE`) · 어드민 카드 제목 14/600 · 서버 알약 12.5.
- 수동주문 폼 행 라벨 14/400 · 행 값 14/500(`font-medium`) — ③ 주문가능 행은 주문금액 행과 같은 클래스. 초과 때만 값 600(목업 `.row .v.bad` 600). ③ 초과 검증 줄 12.5/400(`priceIssue` 줄 상속).
- 상따 금액 값 15/500(`lc-row-value` · `setting-group.tsx`) — ④ 는 색만 바꾼다.
- 페이지 h1 22/700(`PageHeader`) · 세그먼트 칸 13/600(발사 세그먼트 상속 — 목업 off 500 은 600 으로 통일) · /me 탭 트리거(`URL_TAB_TRIGGER_CLASS`) · 사이드바 항목.

**전체 합계(상한선):** 이 phase 표면에 보이는 크기는 8개(11 · 12 · 12.5 · 13 · 14 · 15 · 18 · 22) · 굵기 4개(400 · 500 · 600 · 700) — 이 중 11 · 12.5 · 13 · 22 와 500 · 700 은 위 「상속」 의 기존 승인 역할에서만 온다(새 역할은 12 · 14 · 15 · 18 / 400 · 600 뿐). 플래너 · 실행자는 위 표 밖의 크기 · 굵기를 **새로 추가하지 않는다**. 목업 값 옮김: 13 → 12(① 행 · 목업 `.lim` 13 → 기존 IP/MAC 줄 12 와 맞춤) · 13.5 → 14 · 12.5 → 12(② 예수금 · ⑤ 보조) · 11.5 → 12(열 머리 · 캡션) · 11 → 12(요약 라벨) · 17 → 18 · 목업 500 → 400(종목명 · 미설정 「—」).

숫자는 전부 `tabular-nums`. 금액 칸은 `whitespace-nowrap`(값이 줄바꿈되지 않는다).

---

## Color

실제 토큰(`webapp/src/styles/globals.css` §9 · 라이트 / 다크). 새 토큰 0.

| Role | Value (light / dark) | Usage |
|------|-------|-------|
| Dominant (60%) | `--bg` #ffffff / #0a0a0a · 본문면 `--surface` #f2f4f6 / #0a0a0a | 페이지 바탕 · /me 탭 바 바탕 |
| Secondary (30%) | `--card` #ffffff / #151515 · `--muted` #f2f4f6 / #2d2d2d · `--band` #f2f4f6 / #050505 | 카드 면(어드민 계좌 카드 · 계좌 패널 · 수동주문 · 상따 · 매매손익 묶음) · 입력칸 채움 · 세그먼트 트랙 · ⑤ 묶음 머리 띠 · 종목 줄 면 |
| Accent (10%) | `--primary` / `--ring` #3182f6 / #3485fa | 아래 「Accent reserved for」 목록만 |
| Destructive | `--destructive` #f04452 / #f04251 | **초과 · 오류 표시 전용**(파괴적 동작 아님 — 이 phase 에 파괴적 동작은 없다): ② 주문가능 「0만」 · ③ 주문가능 값 · 초과 검증 줄 · ④ 선매수 금액 값 · ① 범위 밖 칸 테두리 · 범위 오류 줄 · 실패 칩(err) · 실패 줄 |
| Warn | `--led-latent` #ff9f1a / #ffb13d | ① 서버 간 불일치 줄 · 미반영 줄 · offline/skipped 칩 · ④ 「주문가능 초과: 상따 합 …」 줄(기존 `WARN_LINE` · 반영 칩 warn 과 같은 토큰 — 목업 `--warn` 의 실제 값) |
| Success | `--led-armed` #03b26c / #2fca73 | ① 반영된 서버 칩(ok · 키만) |
| 손익 방향 | `--up` #f04452 / #f04251(수익 · `+`) · `--down` #3182f6 / #3485fa(손실 · `−`) · 0 = `--fg-2` | ⑤ 실현손익(기간 합 · 일자 행 · 종목 줄) **만**. 수수료 · 세금 · 매수 · 매도 금액은 방향색을 쓰지 않는다 |
| 흐림 | `--muted-fg` #6b7684 / #9e9e9e · `--faint` #b0b8c1 / #636363 | 라벨 · 단위 · 예수금(② 뒷부분) · 미설정 「—」(② `--muted-fg` · ③ `--faint`) · placeholder · 구분점 「·」(`--faint`) · 「확인 전」 · 「보내는 중」 · 「변경 없음」 칩(only 톤 점선) |

Accent reserved for(이 phase 에서 `--primary`/`--ring` 이 닿는 곳 — 이 밖에는 쓰지 않는다):
1. ① 예수금 · 수수료 · 매도세 입력칸의 포커스 테두리(`focus-visible:border-[var(--ring)]` — `Input` 내장).
2. ⑤ 오류 상자 「다시 시도」 글자(`--accent-fg` — `launch-orders-tab.tsx` 상속).
3. (기존 유지) 사이드바 활성 항목 `--nav-on-*` · 서버 알약의 「주문」 꼬리표.

세그먼트(⑤ 기간 · 계정별/계좌별) · /me 탭 선택은 accent 가 아니라 **중립 선택 면** `--seg-on-bg` / `--seg-on-fg` / `--seg-on-shadow` 다(Phase 20 D-02 — 파랑은 하락/매도 방향색으로 읽힌다). 「이달」 알약 켜짐 = 테두리 · 글자 `--fg`(목업 `.mon.on`).

주의: 라이트 테마에서 `--destructive` 와 `--up` 은 같은 값(#f04452)이다. ② · ③ · ④ 의 빨강은 「초과」 이고 ⑤ 의 빨강은 「수익」 이다 — 두 뜻이 한 화면에 같이 서지 않는다(② ~ ④ 에는 손익색이 없고 ⑤ 에는 초과색이 없다).

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | 버튼 없음 — ① 칸마다 **Enter 또는 포커스 이탈 = 저장**(D-02 · 저장 버튼 없음). 캡션이 동작을 말한다: 「예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제」 |
| Empty state heading | ⑤ 「이 기간에는 체결이 없어요」 · ② 미설정 「주문가능 — / 예수금 미설정」 · ③ 미설정 「—」 |
| Empty state body | ⑤ 「손익은 기록을 시작한 날부터 쌓여요 — 기간을 넓혀 보세요」 (researcher decision · D-18 백필 없음) |
| Error state | ⑤ 「매매손익을 불러오지 못했어요」 + 글자 버튼 「다시 시도」 · ① 범위 밖 「수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요」 · ① 서버 미지원(code 1) 「KB120 실패: 서버 미지원 · <서버 message 원문> — 서버 업데이트 뒤 다시 저장」 |
| Destructive confirmation | 없음 — 이 phase 에 파괴적 동작은 없다. 예수금 빈 칸/0 저장 = 「해제」 는 **확인 다이얼로그 없이** 즉시 저장(D-01 즉시 저장 리듬 · 캡션 「0 = 해제」 가 미리 말한다). 초과 경고는 차단 · alert · 토스트 · 확인창 전부 없음(D-12 · D-13) |

### 문구 정본 — ① 어드민 계좌 카드(`ACCOUNT_EDITOR_TEXT` 에 키 추가)

| 키(예시) | 문구 | 비고 |
|---|---|---|
| `budgetLabel` · `feeLabel` · `sellTaxLabel` | 「예수금」 · 「수수료」 · 「매도세」 | `<label htmlFor>` 로 칸과 묶는다 |
| `budgetUnit` · `pctUnit` | 「만원」 · 「%」 | 칸 뒤 글자 |
| 칸 접근 이름 | 「{증권사} {계좌번호} 예수금(만원)」 · 「… 수수료(%)」 · 「… 매도세(%)」 | `aria-label`(같은 시트에 계좌 카드가 여럿) |
| `costCaption` | 「예수금은 체결 손익·수수료·세금만큼 서버가 스스로 조정해요 · 0 = 해제」 | KB · 교보 같은 문구(researcher decision) |
| `costCaptionUnsetSuffix` | 「 · 비우면 미설정」 | 예수금이 미설정(0)일 때만 캡션 끝에 붙인다(목업 그대로) |
| placeholder | 예수금 「—」 · 수수료/매도세 「0」 · 87 미확인 세 칸 모두 「—」 | researcher decision |
| `costMismatchBudget(key, v)` | 「{key}{은/는} {v} — 저장하면 등록 서버가 모두 같아져요」 · 예 「KB121 은 500만 — 저장하면 등록 서버가 모두 같아져요」 · 그 서버 미설정 「KB121 은 미설정 — …」 | D-03 · 원인 단정 없음 · `WARN_LINE` |
| `costMismatchFee(key, fee, tax)` | 「{key}{은/는} {fee}% · {tax}% — 저장하면 등록 서버가 모두 같아져요」 · 예 「KB121 은 0.05% · 0.2% — …」 | D-03 · 예수금 줄과 따로(둘 다 다르면 두 줄) |
| 조사 | 서버 키 끝 숫자의 한자어 읽기로 고른다 — 0 · 1 · 3 · 6 · 7 · 8 → 「은」, 2 · 4 · 5 · 9 → 「는」(예: KB120 은 · KB121 은 · KYOBO119 는 · KYOBO127 은). 키와 조사 사이는 목업처럼 한 칸 띄운다 | researcher decision |
| `costRangeInvalid` | 「수수료 · 매도세는 0~1%, 소수 넷째 자리까지예요」 | `EDIT_ERROR_LINE` · 그 칸 `aria-invalid` · 보내지 않음(D-02) |
| `costUnchanged` | 「변경 없음」 | 클라 판정으로 요청을 보내지 않았을 때 `NOTE` 줄(아래 상태표) |
| 칩 — 반영됨 | 「KB120」(키만 · ok) | 기존 `chipFullText` |
| 칩 — 보내는 중 | 「KB120 · 보내는 중」(only 톤 · 점선 · 9px CSS 스피너 · 스피너와 글자 사이 4px) | 목업 `busy` |
| 칩 — 변경 없음 | 「KB120 · 변경 없음」(only 톤) | 목업 `same` |
| 칩 — 실패 | 「KB120 · 실패」(err) · `title` = code 1 이면 「서버 미지원 · <message 원문>」, 그 밖 「<message 원문>」 | D-06 · 목업 `fail` |
| 칩 — 응답 없음 | 「KB120 · 응답 없음」(err) | 기존 `RESULT_CHIP.timeout` |
| 칩 — 서버 연결 안 됨 | 「KB120 · 서버 연결 안 됨」(warn) | 기존 `RESULT_CHIP.offline` · 목업 `off` |
| 칩 — 미반영(꺼진 서버 skipped) | 「KB120 · 미반영」(warn) | 기존 `REFLECT_LABEL.warn` |
| 칩 — 87 미확인 | 「KB121 · 확인 전」(only 톤) | 쉬는 상태 · researcher decision(기존 `ipmacUnknown` 낱말) |
| 줄 — code 1 실패 | 「KB120 실패: 서버 미지원 · <message 원문> — 서버 업데이트 뒤 다시 저장」 | `EDIT_ERROR_LINE` · `role="alert"` · message 문장 대조 없음(분기는 `code === 1` 만) |
| 줄 — 그 밖 실패 | 「KB120 실패: <message 원문 · 없으면 칩 낱말>」 | 기존 `editFailedLine` · `role="alert"` |
| 줄 — offline/skipped | 「KB120 미반영: <사유 원문 · 없으면 「서버 연결 안 됨」>」 | 기존 `skippedLineText` · `WARN_LINE` · role 없음 |

### 문구 정본 — ② ~ ④ 주문가능 · 초과

| 자리 | 문구 | 비고 |
|---|---|---|
| ② 요약 줄 정상 | 「주문가능 **1,234만** / 예수금 2,000만」 | 「주문가능」 12 muted · 값 15/600 `--fg` · 「/ 예수금 N만」 12 muted |
| ② 초과(주문가능 < 0) | 「주문가능 **0만** / 예수금 2,000만」 — 「0만」 만 `--destructive` | D-09 · 예수금은 그대로 흐림 |
| ② 미설정(`budget_krw` 0 · 구 서버 프레임 · 필드 없음) | 「주문가능 — / 예수금 미설정」 — 「—」 `--muted-fg` 400 | 경고 없음 |
| ③ 주문가능 행 | 라벨 「주문가능」 · 값 「1,234만」 / 미설정 「—」(`--faint`) / 음수 「0만」(`--destructive` 600) | 주문금액 행 바로 밑 · 같은 라벨 열 · 읽기 전용 |
| ③ 초과 검증 줄 | 「주문가능 초과: 1,500만 > 1,234만」 | `role="status"` `aria-live="polite"` · 버튼 줄 바로 위 · 왼쪽 = 주문금액 만원 내림 · 오른쪽 = max(0, 주문가능) 만원 내림 |
| ④ 상따 경고 줄 | 「주문가능 초과: 상따 합 2,000만 > 1,234만 — 등록은 그대로 돼요」 | warn 톤 · role 없음(값 바꿀 때마다 재판정 · 읽기 소음 방지) |

### 문구 정본 — ⑤ 매매손익 · ⑥ 사이드바 · /me 탭

| 자리 | 문구 |
|---|---|
| 사이드바 Admin 하위 | 「사용자」 · 「서버」 · 「발사」 · **「매매손익」**(맨 뒤 · researcher decision) |
| /me 탭 | 「현황」 · 「잔고」 · 「주문」 · 「설정」 · **「손익」**(5번째 · 개수 배지 없음) |
| `/admin/pnl` 제목 · 문서 제목 | h1 「매매손익」 · `document.title` 「매매손익 · Admin」 |
| 묶음 세그먼트 | 「계정별」 · 「계좌별」(그룹 `aria-label` 「묶음」) — 기본 계정별 |
| 기간 세그먼트 | 「7일」 · 「30일」 · 「90일」 + 알약 「이달」(그룹 `aria-label` 「기간」) — 기본 30일 |
| 기간 범위 캡션 | 「9/28 ~ 10/27」(M/D ~ M/D · KST · 오른쪽 끝) — researcher decision |
| 요약 행 라벨 | 「{7일 · 30일 · 90일 · 이달} 실현손익」 · 「수수료」 · 「세금」 · 「매수」 · 「매도」 · 「체결」 |
| 열 머리(≥1024) | 「일자」 · 「실현손익」 · 「수수료」 · 「세금」 · 「매수」 · 「매도」 · 「체결」 |
| 일자 | 「10/27 (화)」(KST · 요일 한 글자) |
| 폰 행 아랫줄 | 「매수 1,500만 · 매도 1,640만 · 7건」 |
| 펼침 요약 줄 | 「수수료 **1.6만** · 세금 **3.3만** · 체결 **7건**」 |
| 종목 줄 | 「{종목명}」 · 「+87만」 · 「매수 750만 · 매도 820만 · 3건」 |
| 계정별 묶음 머리 | 제목 = `dma_user_id`(예 「ezmesya」) · 부제 = 그 묶음 계좌 「KB 37728502101 · 교보 10279758101」 |
| 「미상」 묶음 머리 | 제목 「미상」 · 부제 「dma_user_id 없는 체결 · 계좌 50011122233」(계좌 여럿이면 「· 계좌 A · B」) |
| 계좌별 묶음 머리 | 제목 = 증권사 배지(「KB」 · 「교보」) + 계좌번호 · 부제 = 「{dma_user_id(들) ' · '} · {계좌명}」(계좌명 없으면 생략) |
| 로딩 | Skeleton(`aria-busy="true"` · `aria-label="불러오는 중"`) — 글자 없음 |
| 빈 | 「이 기간에는 체결이 없어요」 / 「손익은 기록을 시작한 날부터 쌓여요 — 기간을 넓혀 보세요」 |
| 오류 | 「매매손익을 불러오지 못했어요」 + 「다시 시도」 |
| /me 계좌 미정 | 「계좌 정보를 불러오는 중이에요…」(잔고 탭 `me-accounts-loading` 문구 · 모양 그대로) |

목업 전용 표시(구현하지 않는다): 사이드바 · 탭 · h1 옆 「추가」 배지(`.new` · `.badge-new` — 새 항목 표시용), `.foot` 설명 문단, `.synth` 글자(「ezmesya 편집 시트」 · 「하단 공용 계좌 패널」 · 「10/14 (수) 체결 0건 · 행 없음」), 목업 데이터 값 전부(합성).

---

## 표면별 계약

### ① 어드민 계좌 카드 — 예수금 · 수수료 · 매도세 행 (D-01 ~ D-07)

**위치 · 노출.** `AccountRow` 안 — 지점 · 트레이더 줄 → (KB) 주문자 IP/MAC 읽기 줄 + 불일치 줄 → **예수금 행 + 캡션 + 결과/경고 줄** → 서버 토글 알약 줄 → 주문 서버. 편집 모드(Phase 30 D-01)와 **무관하게 항상** 보인다(편집 모드에서는 편집 블록 다음 · 서버 알약 앞). 편집 모드의 op 3 저장에는 싣지 않는다(`editSaveBodyOf` 무변경). 87 에만 있는 흐린 계좌 줄(`ServerOnlyAccountRow`)에는 행이 **없다**(D-23 ⑤ 보기만 · researcher decision). 교보 카드도 같은 행 · 같은 캡션.

**배치.**
- 데스크톱(≥640): 한 줄 「예수금 [ 1,000 ] 만원 · 수수료 [ 0.01 ] % · 매도세 [ 0.2 ] %  [칩…]」 — 넘치면 `flex-wrap`.
- 폰(<640): 1줄 「예수금 [ … ] 만원」(필드 `basis-full`) / 2줄 「수수료 [ … ] % · 매도세 [ … ] %  [칩…]」. 1줄 끝의 구분점 「·」 은 폰에서 숨긴다(2줄이 「·」 로 시작하지 않게 · researcher decision).
- 칩 묶음은 행 끝(`inline-flex flex-wrap gap-1`). 캡션은 행 아래 한 줄(`NOTE`), 그 아래 결과/경고 줄.

**입력 규칙(D-02).**
- 예수금: `inputMode="numeric"` · 숫자만 남기고 천단위 콤마로 다시 쓴다(수동주문 폼 `formatDigits` 결) · 최대 9자리(999,999,999만원) · 빈 칸 = 0 = 해제. 보내는 값 = 만원 × 10000(원).
- 수수료 · 매도세: `inputMode="decimal"` · 0 ~ 1 · 소수 넷째 자리까지. 범위 밖 · 다섯째 자리 이상 · 숫자 아님 → 그 칸 `aria-invalid` 빨간 테두리 + `costRangeInvalid` 줄, **보내지 않는다**. 고치면 줄이 사라진다. 저장 전 ppm = `round(% × 10000)`. **어느 칸을 저장하든 두 값을 함께 op 7 로** 보낸다.
- 저장 트리거: **Enter** = 그 칸 저장 시도 · **포커스 이탈** = 그 칸이 편집(dirty)됐을 때만 저장 시도(탭 이동만으로 fan-out 이 나가지 않게 · researcher decision).
- 「변경 없음」(클라 판정): 값이 표시값과 같고 **등록 서버 간 불일치 줄이 없으면** 요청 없이 「변경 없음」 상태. 불일치 줄이 있으면 같은 값이어도 Enter 로 보낸다(「저장하면 등록 서버가 모두 같아져요」 를 지키기 위함 — Phase 30 IP/MAC 「D-10 맞추기」 동형 · researcher decision).
- 비행 중: 그 op 의 칸(예수금 = 1칸 · 비용률 = 2칸) `readOnly` + 불투명도 .5 · 다른 op 칸은 그대로. 카드 편집 저장 비행 중(`editSaving`)에는 세 칸 모두 `readOnly`(30 WR-03 결 · researcher decision).
- 표시값 고정: 칸에 포커스가 있거나 dirty 인 동안에는 개요 재조회 값이 칸을 덮지 않는다. 그 밖에는 최신 개요 값을 따른다(D-05: 67 캐시 `budgetKrw` 우선, 없으면 87 — 서버 체결 조정이 조용히 반영된다).
- 표시: 예수금 = 원/10000 내림 콤마(0 → 빈 칸 + placeholder 「—」) · 비용률 = ppm/10000 을 끝 0 없이(100 → 「0.01」 · 2000 → 「0.2」 · 0 → 빈 칸 + placeholder 「0」).

**상태 6종(목업 ① 상태 토글) + 쉬는 상태.**

| 상태 | 칸 | 칩(행 끝) | 줄(캡션 아래) |
|---|---|---|---|
| 쉬는 상태(시트 열기 직후) | 표시값 | 활성 등록 서버마다 — 87 값을 아는 서버 「KB120」(ok) · 모르는 서버 「KB121 · 확인 전」(only) | 불일치가 있으면 불일치 줄 |
| 반영됨(`ok`) | 저장한 값 | 응답 결과 서버마다 「KB120」(ok) | 없음 |
| 저장 중(`busy`) | 그 op 칸 `readOnly` · .5 | 활성 등록 서버마다 「KB120 · 보내는 중」(only + 스피너) | 없음 |
| 변경 없음(`same`) | 그대로 | 활성 등록 서버마다 「KB120 · 변경 없음」(only) | 「변경 없음」(`NOTE`) — 그 칸을 다시 고치면 지운다 |
| 실패 · 서버 미지원(`fail`) | 입력값 유지 | 「KB120 · 실패」(err · `title`) | 「KB120 실패: 서버 미지원 · <message> — 서버 업데이트 뒤 다시 저장」(`role="alert"`) |
| 서버 연결 안 됨(`off`) | 입력값 유지 | 「KB120 · 서버 연결 안 됨」(warn) | 「KB120 미반영: 서버 연결 안 됨」(`WARN_LINE`) |
| 서버별 다름(`diff`) | **(유효) 주문 서버**의 값 | 쉬는 상태 칩 | 다른 서버마다 「KB121 은 500만 — 저장하면 등록 서버가 모두 같아져요」(비용률은 「KB121 은 0.05% · 0.2% — …」) |

- 결과는 서버마다 칩 1개 — 응답 배열(전 등록 서버 fan-out · D-07)을 그대로 칩으로(목업은 서버 1대만 그렸다). code 0 은 서버 message 가 「변경 없음」 이어도 **ok 칩**(message 문장 대조 없음 · D-06 · Phase 30 D-11).
- 칩 자리는 행 하나에 한 벌 — 가장 최근에 끝난 저장(op 6 또는 op 7)의 결과다. 실패/미반영 줄은 op 별로 남고, 그 op 의 칸을 다시 고치면 지운다(researcher decision).
- 결과 칩 · 줄은 시트가 열려 있는 동안 유지, 시트를 닫으면 쉬는 상태로(기존 overlay 규칙).
- 불일치 판정은 shared 한 벌(`summarizeOrderEndpoint` 동형 함수 — RESEARCH Pattern 4 `summarizeAccountCosts`) 결과만 그린다. 87 을 모르는 서버는 불일치에서 뺀다.
- op 6/7 결과는 서버 알약의 반영 칩(users.toml 반영)을 **바꾸지 않는다**(RESEARCH Pitfall 5 — 칩 줄이 다르다).
- 토스트 · alert · 확인창 없음.

### ② 계좌 패널 요약 줄 (D-08 ~ D-11)

- **자리:** 잔고(보유 종목) 표 바로 위 한 줄. 기본 모드(/me 잔고 탭 · `hideAccountHeader`)는 잔고 섹션(`data-testid="account-holdings"`)의 **첫 자식**(「잔고」 소제목 위). 임베드 잔고(`section="holdings"` · `embedScope="account"` — 작업대 하단 공용 패널 「잔고」 탭)는 표/빈 상태 위. `data-slot="account-budget-summary"`.
- **종목 축 임베드(`embedScope="stock"` — 카드 탭 「보유」)에는 그리지 않는다** — 그 자리는 한 종목 보유뿐이고 높이가 고정이며, 주문가능은 같은 카드의 ③ · ④ 가 말한다(researcher decision).
- /me 기본 모드에서 미체결 섹션이 잔고 섹션보다 위인 지금 순서는 바꾸지 않는다(목업은 보유 → 미체결 순으로 그렸지만 D-08 은 「보유 표 바로 위」 다).
- **모양:** `flex flex-wrap items-baseline gap-x-2` — 「주문가능」(12/400 `--muted-fg`) · 값(15/600 `--fg` · tabular) · 「/ 예수금 2,000만」(12/400 `--muted-fg`). 폰 · 데스크톱 같은 한 줄.
- **값:** shared `availableKrwOf(account, priceOf)` → `null` = 미설정, 숫자면 `formatManwonFloor(max(0, v))`. v < 0 → 「0만」 `--destructive`. 예수금 = `formatManwonFloor(budgetKrw)`.
- **상태:** 정상 · 초과 · 미설정(위 문구표). `account` 가 null(상태 미수신)이면 줄 없음. 세션 준비 전(`!sessionReady`)에는 섹션 기존 `opacity-[.55]` 를 따른다.
- **갱신:** 66/67 · 시세(`priceOf`) · 계좌 변경 때 다시 계산(`useMemo`). 예수금 변경(어드민 · 체결 조정 67)은 **조용히** 반영 — 깜빡임 · 강조 애니메이션 · 토스트 없음(gh-trade D-20).

### ③ 수동주문 폼 — 주문가능 행 + 초과 검증 줄 (D-12)

- **주문가능 행:** 「주문금액」 행 바로 아래, 「주문계좌」 행 위. 주문금액 행과 같은 클래스(`flex min-h-[44px] min-w-0 items-center justify-between gap-2` · 라벨 14 `--muted-fg` · 값 14/500 `--fg-2` tabular `whitespace-nowrap`). `data-slot="mo-available"`. 읽기 전용(버튼 · 쉐브런 없음).
- **주문금액 행 단위는 원 그대로**(목업 ③ 의 「만」 은 그림일 뿐 — CONTEXT Deferred 「단위 통일」). 주문가능 행만 만원.
- **판정(초과):** 예수금 설정됨 ∧ `price × qty`(원) > 주문가능(원) ∧ **매수 판정 대상**일 때.
  - 매수 판정 대상 = 아래가 아닌 모든 경우(Pitfall 12 · RESEARCH Open Question 4 해소 · researcher decision): (a) 선택된 미체결이 매도(`selectedUnfilled?.side === 'S'` — 정정 · 취소 대상이 매도 = 목업 「매도 탭」), (b) 시간외종가(주문금액 「종가 확정 후」 — 금액 미정), (c) 주문금액 0(가격 · 수량 미입력).
  - 초과면: 주문가능 값 `--destructive` 600 + 버튼 줄 바로 위 검증 줄 「주문가능 초과: 1,500만 > 1,234만」(`data-testid="manual-order-budget-over"` · `role="status"` `aria-live="polite"` · `priceIssue` 줄과 같은 12.5px `--destructive` `break-keep`).
  - 주문가능 음수면 판정과 무관하게 행 값 「0만」 `--destructive`(D-09).
- **비차단:** 매수 · 매도 · 정정 · 취소 버튼은 **활성 유지**, 주문은 그대로 나간다. 토스트(alert-toasts) · 확인창 · 결과 배너 변경 없음.
- **재판정:** 가격 · 수량 · 계좌 · 66/67 · 시세가 바뀔 때마다(렌더 계산 — 로그 없음).
- **미설정:** 행 값 「—」(`--faint`) · 줄 없음.
- **밴드:** 폰 밴드(<685 · 「매수 | 매도 | 수동」 탭)에서는 「수동」 탭 폼 안, ≥685 는 덮은 폼 안 — 같은 부품이라 분기 없음. 행은 높이만 44px 늘린다(폭 불변 — §2.2b 685 경계의 최악값 행이 아니다). 검증 줄은 `break-keep` 로 줄바꿈.

### ④ 상따 카드 — 금액 3칸 합산 경고 (D-13)

- **합:** 선매수 금액(`buyOrderAmount` · 항상) + 줄매수 금액(`extraBuyOrderAmount` · 켜짐일 때) + 후매수 금액(`postBuyOrderAmount` · 켜짐일 때) — 만원 → 원. 「켜짐」 = 그 그룹 스위치 ON **또는** 「자동」 체크 ON(`extraBuyEnabled || extraBuyAuto` · `postBuyEnabled || postBuyAuto` — 같은 파일 `buyAmountsNeedWatchPrice` 의 「살아 있는 그룹」 판정과 같은 식 · researcher decision: 자동 무장 그룹도 돈을 쓴다).
- **판정:** 예수금 설정됨 ∧ 합(원) > 주문가능(원). 비교 기준 값은 폼에 보이는 값(서버 동기값 · D-06 낙관 반영 없음).
- **초과 표시:** 선매수 그룹의 「금액」 행 값(`lc-row-value`)만 `--destructive`(크기 · 굵기 그대로 15/500) + 매수 열(`pane('buy')`)의 그룹들 다음 · 「켤 수 없는 이유」 패널 앞에 경고 줄 「주문가능 초과: 상따 합 2,000만 > 1,234만 — 등록은 그대로 돼요」(`data-slot="lc-budget-over"` · 12px/400 · `--led-latent` · `leading-[1.5] break-keep` · `mt-2 px-0.5` · role 없음).
- **비차단:** 스위치 · 무장 · 등록 · 값 적용은 막지 않는다. 「켤 수 없는 이유」 목록에 넣지 않는다(무장 불가 사유가 아니다). 토스트 없음.
- **재판정:** 값을 바꿀 때마다 색 · 줄 재판정(로그 없음). 합이 내려오면 기본색 · 줄 사라짐. 미설정이면 판정 없음.
- **밴드:** 폰 밴드(<685)는 「매수」 탭을 골랐을 때 보이고, ≥685 는 매수 열 맨 아래. 줄이 생겨도 그 아래 「켤 수 없는 이유」 패널만 내려간다(그룹 행은 밀리지 않는다 — 260911-w5h 「열 맨 아래 한 곳」 규칙과 같은 이유로 그룹 사이에 끼우지 않는다).

### ⑤ 일자별 매매손익 — A 안 (D-17 ~ D-19)

**공통 부품**(⑤a · ⑤b 가 같은 부품 · `components/pnl/*`):

1. **기간 컨트롤 줄** `flex flex-wrap items-center gap-2`: 세그먼트 [7일 | 30일 | 90일] + 알약 「이달」 + 오른쪽 끝 범위 캡션(12 `--muted-fg` tabular · `ml-auto`). 넷은 한 선택(`role="group"` `aria-label="기간"` · 버튼 `aria-pressed`). 기본 30일. 폰에서 캡션이 넘치면 다음 줄.
2. **묶음 카드**(묶음마다 1장 · /me 는 1장): [묶음 머리(⑤a 만)] → 요약 행 → [열 머리(≥1024)] → 일자 행 목록.
3. **요약 행:** 첫 칸 「{기간} 실현손익」 라벨(12) + 값(18/600 · 손익색) / 수수료 · 세금(소수 1자리 「만」) / 매수 · 매도(만원 내림) / 체결 「N건」 — 값 14/600 `--fg`. 폰 3열(첫 칸 한 줄 전체).
4. **일자 행(버튼):** 최신 일자가 위. 체결 0 인 날은 행 없음.
   - 데스크톱(≥1024): 8칸 — 일자(14/600 `--fg`) · 실현손익(14/600 손익색 · 우측) · 수수료 · 세금 · 매수 · 매도 · 체결(12/400 `--muted-fg` · 우측) · 셰브론.
   - 폰(<1024): 1줄 일자(14/600) · 실현손익(15/600 손익색) · 셰브론 / 2줄 「매수 … · 매도 … · N건」(12 `--muted-fg`). 수수료 · 세금은 펼침에서.
   - hover/열림 면 `bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]`(accum 행 결) · `aria-expanded` · 열렸을 때만 `aria-controls` · 셰브론 `rotate-180`.
5. **펼침:** 요약 줄 「수수료 1.6만 · 세금 3.3만 · 체결 7건」(12 `--muted-fg`, 값 `--fg-2`) → 종목 줄(`--band` 면 r8) — 종목명(12/400 `--fg` · `truncate` + `title`) · 실현손익(12/600 손익색 · 우측) · 「매수 … · 매도 … · N건」(12 `--muted-fg` · 데스크톱 우측 · 폰 아랫줄 왼쪽).
   - 종목 정렬: 실현손익 큰 순(수익 → 손실) · 같으면 종목명(researcher decision). 종목명은 `stocks` 마스터 이름 → 없으면 코드 → 없으면 ISIN.
6. **펼침 규칙(목업 동작 · researcher decision):** 행마다 따로 열고 닫는다(여럿 동시 열림 허용 — 목업 `classList.toggle`). 첫 화면은 **첫 묶음의 첫(최신) 일자 행만 열림**(목업 기본). 기간 · 묶음 세그먼트 · 계좌 칩이 바뀌면 이 기본으로 되돌린다.
7. **상태:** 로딩 = Skeleton 카드 1장(머리 1줄 + 행 4줄 · `aria-busy`) / 오류 = `CARD` 상자 `py-12` 가운데 제목 + 「다시 시도」(`role="alert"`) / 빈 = `CARD` 상자 `py-12` 제목 + 본문(위 문구) / 데이터. 기간을 바꿔도 컨트롤 줄은 그대로 서 있고 아래만 상태가 바뀐다.

**⑤a `/admin/pnl`.**
- 페이지: `app/admin/pnl/page.tsx` = `AppShell` + `AppSidebar` + `Suspense(fallback null)` + 클라이언트 본문(발사 페이지와 같은 꼴 · researcher decision). 본문 `mx-auto flex w-full min-w-0 max-w-[1120px] flex-col gap-4`.
- 머리: `PageHeader title="매매손익"` · `actions` = 세그먼트 「계정별 | 계좌별」(발사 세그먼트 모양). 설명 문단 없음(목업).
- 주소가 진실 원본(발사 페이지 규율 · researcher decision): `?group=user|account`(기본 user) · `?range=7|30|90|month`(기본 30). 전환은 `router.replace`, 잘못된 값은 그 키만 지운다.
- 묶음: 계정별 = `dma_user_id` 오름차순 · 「미상」 맨 뒤(D-17 · discretion 확정). 계좌별 = KB → 교보, 같은 증권사 안 계좌번호 오름차순(researcher decision). 기간 안 체결 0 인 묶음은 카드 없음. 모든 묶음이 0 이면 빈 상자 1개.
- 계좌별 머리 증권사 배지: 「KB」 · 「교보」(`lib/launch-format.ts` `BROKER_LABEL` 과 같은 낱말) · 11/600 배지(`ADMIN_CHIP_BASE` 결 · `--muted` 면).
- 접근: 미들웨어 `/admin` 접두(admin 만) + server `requireAdmin` — 화면 판정은 표시 장치일 뿐.

**⑤b `/me` 「손익」 탭.**
- `ME_TABS` 5번째 `{ v: "pnl", label: "손익" }`(researcher decision: 값 `pnl`) · 개수 배지 없음 · 다른 탭과 같은 `ME_PANEL` 패널 · 한 번 연 탭은 숨김 유지(기존 `keepMounted`).
- 내용: 기간 컨트롤 줄 → 묶음 카드 1장(**묶음 머리 없음** — 계좌는 탭 위 `MeAccountChips` 가 말한다 · 목업). 고른 계좌가 바뀌면 다시 받는다.
- 기간은 탭 안 로컬 상태(기본 30일 · 주소에 싣지 않는다 — /me 의 `?tab=` 훅과 섞지 않는다 · researcher decision).
- 계좌 미정(`shownAccountNo === undefined`)이면 잔고 탭과 같은 「계좌 정보를 불러오는 중이에요…」 상자. 어드민 권한 분기 없음(내 계좌만 · D-17).

### ⑥ 사이드바

- `NAV_ADMIN_PNL = { href: "/admin/pnl", label: "매매손익" }` — Admin 하위 「사용자 · 서버 · 발사」 **다음**(맨 뒤 · 목업 순서). 활성은 하위 항목이 켠다(기존 규율) · 레일은 `/admin` 접두 그대로 · 모바일 탭바에는 넣지 않는다.

---

## 숫자 표기 계약 (shared 한 벌 · D-09 · D-18 · Pitfall 13)

| 함수(RESEARCH 가칭) | 규칙 | 예 |
|---|---|---|
| `formatManwonFloor(krw)` | `floor(krw / 10000)` + ko-KR 천단위 콤마 + 「만」 · 억 표기 없음 · 음수 입력 금지(호출부가 `max(0, v)`) | 12,345,678 → 「1,234만」 · 0 → 「0만」 · 1,234,567,890,000 → 「123,456,789만」 |
| `formatPnlManwon(krw)` | 부호(> 0 「+」 · < 0 U+2212 「−」 · 0 없음) + `floor(abs / 10000)` 콤마 + 「만」 — **절댓값 내림 후 부호** · 색도 원 값의 부호로(> 0 `--up` · < 0 `--down` · 0 `--fg-2`) | +1,234,567 → 「+123만」 · −12,345 → 「−1만」 · +5,000 → 「+0만」(`--up`) |
| `formatManwon1(krw)` | `floor(abs / 1000) / 10` + ko-KR(끝 .0 생략) + 「만」 · 부호 없음 | 16,400 → 「1.6만」 · 10,000 → 「1만」 · 800 → 「0만」 · 12,345,600 → 「1,234.5만」 |
| 매수 · 매도 금액 | `formatManwonFloor`(부호 · 색 없음) | 「1,500만」 |
| 체결 건수 | 「N건」 | 「7건」 |
| 일자 | KST 「M/D (요일)」 | 「10/27 (화)」 |
| `pctToPpm(pct)` / `ppmToPct(ppm)` | `round(pct × 10000)` / `ppm / 10000` 끝 0 없이(소수 4자리까지) | 0.01 ↔ 100 · 0.05 ↔ 500 · 0.2 ↔ 2000 |

---

## Researcher Decisions

CONTEXT · 목업이 정하지 않은 자리를 기존 출하 부품과 가장 가까운 보수적 선택으로 메웠다. 플래너가 근거 없이 바꾸지 않는다.

1. ① placeholder: 예수금 「—」 · 수수료/매도세 「0」 · 87 미확인 세 칸 「—」.
2. ① 「보내는 중」 칩: 활성 등록 서버마다 「<키> · 보내는 중」(only 톤 + 9px 스피너). 쉬는 상태 칩: 87 을 아는 서버 「<키>」(ok) · 모르는 서버 「<키> · 확인 전」(only).
3. ① 실패 칩 글자는 「<키> · 실패」, 서버 미지원(code 1)의 상세는 칩 `title` 과 줄에(D-06 의 「서버 미지원 · <message>」 를 목업 칩 「KB120 · 실패」 와 합침). 분기는 `code === 1` 만 — message 문장 대조 없음.
4. ① 교보 카드 캡션 = KB 와 같은 문구.
5. ① 포커스 이탈은 dirty 일 때만 저장 · Enter 는 dirty 또는 불일치일 때 저장 · 불일치가 있으면 같은 값이어도 「변경 없음」 으로 접지 않는다.
6. ① 칸이 포커스/dirty 인 동안 개요 재조회가 칸을 덮지 않는다 · 카드 편집 저장 비행 중 세 칸 `readOnly`.
7. ① 칩 자리 1벌 = 마지막으로 끝난 저장(op 6/7) · 실패 줄은 op 별 · 폰에서 첫 구분점 숨김.
8. ① 87 전용 흐린 계좌 줄에는 예수금 행 없음.
9. ① 불일치 줄 조사(은/는)는 서버 키 끝 숫자 읽기로.
10. ② 종목 축 임베드(카드 탭 「보유」)에는 요약 줄 없음 · `account` null 이면 줄 없음.
11. ③ 매수 판정 제외 = 선택 미체결 매도 · 시간외종가 · 주문금액 0(Pitfall 12 해소).
12. ④ 「켜짐」 = 스위치 ON 또는 「자동」 체크 ON · 경고 줄은 매수 열 그룹들 다음 · 「켤 수 없는 이유」 패널 앞 · 무장 불가 사유에 넣지 않음.
13. ⑤ 일자 행은 행마다 따로 펼침 · 기본 = 첫 묶음 첫 행 열림 · 컨트롤 변경 때 기본으로.
14. ⑤ 종목 줄 정렬 = 실현손익 큰 순 · 종목명 폴백 코드 → ISIN.
15. ⑤ 기간 범위 캡션 「M/D ~ M/D」 를 컨트롤 줄 오른쪽 끝에.
16. ⑤ 빈 상태 본문 「손익은 기록을 시작한 날부터 쌓여요 — 기간을 넓혀 보세요」 · 오류 「매매손익을 불러오지 못했어요」 + 「다시 시도」.
17. ⑤a 라우트 `webapp/src/app/admin/pnl/page.tsx`(발사 페이지 꼴) · 주소 `?group=` · `?range=` · 계좌별 정렬 KB → 교보 → 계좌번호.
18. ⑤b 탭 값 `pnl` · 기간은 로컬 상태.
19. ⑥ 사이드바 「매매손익」 은 Admin 하위 맨 뒤.
20. ⑤ 7열 전환은 뷰포트 `lg`(1024) — 목업 데스크톱 1120 이 7열이고, `lg` 최소 본문 736 에 열 템플릿 692 가 들어간다(accum 의 `xl` 은 1120 에서 폰 배치가 되어 목업과 어긋난다).

---

## UI Considerations

프로브(ui-consideration-probe · 2026-10-27 · 요소 7 · kind 는 오케스트레이터 지정 · 사용자 「일괄 해결」): applicable 42 — resolved 40(explicit 38 · backstop 2) · dismissed 2 · unresolved 0.

요소 kind: E1 ① 어드민 카드 행 = form · list-collection(서버 칩) · static-content / E2 ② 요약 줄 = static-content / E3 ③ 수동주문 행 = form · static-content / E4 ④ 상따 경고 = form · static-content / E5 ⑤ 매매손익 표 = list-collection · interactive-control · static-content / E6 ⑤a 머리 · 묶음 세그먼트 = nav · list-collection · static-content / E7 ⑥ 사이드바 · /me 탭 = nav.

빈 상태 · 오류 **문구**는 「Copywriting Contract」 가 정본이다 — 아래는 모양(상태) 계약만 적고 문구표를 가리킨다.

| Element | Category | Status | Resolution / Reason |
|---|---|---|---|
| E1 ① | empty | ✅ resolved | 값 0 = 빈 칸 + placeholder(예수금 「—」 · 비용률 「0」) · 87 미확인 서버만 있으면 세 칸 「—」 + 「<키> · 확인 전」 칩(only) |
| E1 ① | loading | ✅ resolved | 저장 비행 중 그 op 의 칸만 `readOnly` + 불투명도 .5 · 「<키> · 보내는 중」 칩(스피너) · 개요 재조회는 포커스/dirty 칸을 덮지 않는다 |
| E1 ① | error | ✅ resolved | 실패 칩(err · `title`) + 줄 「<키> 실패: 서버 미지원 · <message> — 서버 업데이트 뒤 다시 저장」(`role="alert"`) · offline 「<키> 미반영: 서버 연결 안 됨」(`WARN_LINE`) · 범위 밖 입력은 `aria-invalid` 빨간 테두리 + `costRangeInvalid` 줄 · 보내지 않음 · 입력값 유지 |
| E1 ① | populated | ✅ resolved | 표시값 = 67 캐시 `budgetKrw` 우선 · 없으면 87 · 비용률은 87 ppm → % 끝 0 없이 · 활성 등록 서버마다 ok 칩 |
| E1 ① | partial | ✅ resolved | 등록 서버 간 87 값 다름 → (유효) 주문 서버 값 표시 + 다른 서버마다 「<키> 은 500만 — 저장하면 등록 서버가 모두 같아져요」 · 87 모르는 서버는 불일치 판정에서 빼고 「확인 전」 칩 |
| E1 ① | overflow | ✅ resolved | 폰(<640) 2줄(예수금 `basis-full` / 수수료 · 매도세 · 칩) · 데스크톱 한 줄 `flex-wrap` · 칩 묶음 `inline-flex flex-wrap gap-1` |
| E1 ① | zero-one-many | ✅ resolved | 등록 서버마다 칩 1개 · 서버 1대면 불일치 줄 없음 · 2대 이상일 때만 불일치 줄(서버마다 1줄) |
| E1 ① | long-text | ✅ resolved | 서버 message 원문 줄 `break-keep` 줄바꿈 · 칩은 `title` 로 전문 · 예수금 입력 최대 9자리(999,999,999만원) |
| E2 ② | overflow | 🧪 backstop | 조 단위 값(「123,456,789만」)이 ② 한 줄(`flex-wrap items-baseline`) · ⑤ 데스크톱 매수 · 매도 칸(104px)에서 잘리지 않는다 — 폰 390 · `lg` 1024 시각 확인 |
| E2 ② | long-text | ✅ resolved | 고정 라벨 + 숫자 2개 · 넘치면 「/ 예수금 …」 이 다음 줄(`flex-wrap`) · 미설정 「— / 예수금 미설정」 흐림 |
| E3 ③ | empty | ✅ resolved | 미설정 = 행 값 「—」(`--faint`) · 검증 줄 없음 · 주문금액 0(가격 · 수량 미입력)이면 판정 없음 |
| E3 ③ | loading | ✅ resolved | `account` null(상태 미수신) = 「—」 · 세션 준비 전 섹션 `opacity-[.55]` 상속 · 자체 스피너 없음(렌더 계산) |
| E3 ③ | error | ✅ resolved | 조회 실패 상태 없음(66/67 푸시 값 계산) · 초과는 오류가 아니라 경고 — 값 `--destructive` 600 + 「주문가능 초과: 1,500만 > 1,234만」(`role="status"` `aria-live="polite"`) · 버튼 활성 유지 |
| E3 ③ | partial | ✅ resolved | 시장가 매수 미체결(price 0) → 현재가(KRX → NXT) · 없으면 0(상한가 금지) · 매도 미체결 선택 · 시간외종가 · 주문금액 0 은 판정 제외 |
| E3 ③ | overflow | 🧪 backstop | 행은 높이만 44px 늘린다(폭 불변) — 기존 §2.2b 685 사다리 e2e(4c · P20-3 · P24-7 최악값)가 그대로 통과 · 「123,456,789만」 값 `whitespace-nowrap` 잘림 없음(폰 390) |
| E3 ③ | long-text | ✅ resolved | 검증 줄 12.5px `break-keep` 줄바꿈 · 값 칸 `whitespace-nowrap` · 라벨 고정 |
| E4 ④ | empty | ✅ resolved | 미설정이면 판정 없음 · 금액 칸 전부 0 이면 합 0 → 경고 없음 · 기본색 |
| E4 ④ | loading | ✅ resolved | 계좌 상태 미수신이면 판정 없음 · 비교 값은 폼에 보이는 서버 동기값(낙관 반영 없음) · 별도 로딩 표시 없음 |
| E4 ④ | error | ✅ resolved | 초과는 경고만 — 선매수 「금액」 값 `--destructive`(15/500 유지) + 매수 열 맨 아래 「주문가능 초과: 상따 합 2,000만 > 1,234만 — 등록은 그대로 돼요」(`--led-latent` · role 없음) · 「켤 수 없는 이유」 목록 미포함 · 스위치 · 무장 · 등록 비차단 |
| E4 ④ | partial | ✅ resolved | 줄매수 · 후매수는 켜짐(스위치 ON 또는 「자동」 ON)일 때만 합산 · 꺼진 그룹 금액 제외 · 선매수는 항상 |
| E4 ④ | overflow | ✅ resolved | 경고 줄은 매수 열 맨 아래 한 곳 · 아래 「켤 수 없는 이유」 패널만 밀림(그룹 행 불변) · 폰 밴드(<685)는 매수 탭에서만 · `break-keep` |
| E4 ④ | long-text | ✅ resolved | 고정 문구 + 숫자 2개 · 12px `leading-[1.5] break-keep` 줄바꿈 |
| E5 ⑤ | empty | ✅ resolved | 기간 안 체결 0 → 묶음 카드 대신 `CARD` 상자 `py-12` 제목 + 본문(문구표 「이 기간에는 체결이 없어요」) · 체결 0 인 날은 행 없음 · 기간 컨트롤 줄은 그대로 |
| E5 ⑤ | loading | ✅ resolved | Skeleton 카드 1장(머리 1줄 + 행 4줄 · `aria-busy="true"` · `aria-label="불러오는 중"`) · /me 계좌 미정은 「계좌 정보를 불러오는 중이에요…」 상자 · 컨트롤 줄 유지 |
| E5 ⑤ | error | ✅ resolved | `CARD` 상자 `py-12` 「매매손익을 불러오지 못했어요」 + 「다시 시도」(`--primary` 글자 · `role="alert"`) |
| E5 ⑤ | populated | ✅ resolved | 요약 행(기간 실현손익 18/600 손익색) + 최신 일자 위 · 데스크톱 ≥1024 8칸 / 폰 2줄 · 첫 묶음 첫(최신) 행만 펼침 · 행마다 따로 열고 닫음 |
| E5 ⑤ | partial | ✅ resolved | 옛 체결(4필드 0 · 배포일 이전) 백필 없음 · 서버 값 그대로(「0만」) · 평단 모르는 매도 = −(수수료 + 세금) · 종목명 없음 → 코드 → ISIN · 화면은 보정하지 않는다 |
| E5 ⑤ | overflow | ✅ resolved | 페이지 세로 스크롤만 · 가로 스크롤 없음(7열은 `lg` 최소 본문 안 · 폰은 2줄) · 큰 금액 칸 잘림은 E2 backstop 에서 함께 확인 |
| E5 ⑤ | zero-one-many | ✅ resolved | 묶음 0 = 빈 상자 1개 · 1 = 카드 1장(/me 는 항상 1장 · 묶음 머리 없음) · 여럿 = `gap-4` 세로 나열 · 일자 · 종목 1/여럿 같은 행 모양 · 「N건」 단복수 무차이 |
| E5 ⑤ | long-text | ✅ resolved | 종목명 `truncate` + `title` · 묶음 제목 `truncate` · 계좌 목록 부제 `break-keep` |
| E6 ⑤a | empty | ✅ resolved | 모든 묶음 0 → 빈 상자 1개 · `PageHeader` · 「계정별 \| 계좌별」 세그먼트 · 기간 줄은 그대로 |
| E6 ⑤a | loading | ✅ resolved | `Suspense(fallback null)` → 본문 Skeleton(E5) · PageHeader · 세그먼트는 즉시 그림 |
| E6 ⑤a | error | ✅ resolved | `?group` · `?range` 잘못된 값은 그 키만 지우고 기본(user · 30) · 조회 실패는 E5 오류 상자 · 비어드민은 미들웨어 `/admin` 접두가 막음 |
| E6 ⑤a | populated | ✅ resolved | 계정별 = `dma_user_id` 오름차순 · 「미상」 맨 뒤 / 계좌별 = KB → 교보 · 계좌번호 오름차순 · 증권사 배지 11/600(`BROKER_LABEL` 낱말) |
| E6 ⑤a | partial | ✅ resolved | `dma_user_id = ""` 체결은 「미상」 한 묶음(부제 계좌번호) · 계좌별에는 미상 없음 · 기간 안 0 묶음은 카드 없음 |
| E6 ⑤a | overflow | ✅ resolved | 묶음 카드 세로 나열 · 세그먼트는 `PageHeader actions`(폰은 기존 규율대로 제목 아래 wrap) |
| E6 ⑤a | zero-one-many | ✅ resolved | 묶음 0/1/여럿은 E5 와 같다 · 세그먼트 2항 고정(계정별 \| 계좌별) |
| E6 ⑤a | long-text | ✅ resolved | 묶음 제목(`dma_user_id`) `truncate` + `title` · 계좌 목록 부제 `break-keep` 줄바꿈 |
| E7 ⑥ | loading | ⛔ dismissed | 정적 링크 · 탭 라벨 — 데이터 로딩 없음(패널 내용 로딩은 E5 가 맡는다) |
| E7 ⑥ | error | ⛔ dismissed | 링크 자체에 실패 상태 없음 · 권한은 미들웨어 `/admin` 접두 + server `requireAdmin` · 비어드민에게는 Admin 그룹 자체가 없다(기존 규율) |
| E7 ⑥ | overflow | ✅ resolved | 「매매손익」 4자 · 기존 사이드바 항목 폭 안 · 모바일 탭바 미포함 · `ME_TABS` 5번째 「손익」 2자 — 기존 탭 줄 배치 규율 그대로 |
| E7 ⑥ | long-text | ✅ resolved | 고정 라벨 2~4자 · 줄바꿈 없음 |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | 없음(새 설치 0 — 기존 input · tabs · skeleton · button 사용) | not required |

서드파티 레지스트리 없음(`components.json` `registries: {}`).

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS (FLAG — 터치 표면 전체 합계 8 사이즈 · 4 굵기는 기존 컴포넌트 상속분 · 4/2 한도는 새 역할에만 적용)
- [x] Dimension 5 Spacing: PASS (FLAG — 12px `--s-3` · 6/2/3px 예외는 기존 토큰 · 코드 상속분 · 새 간격 추가 없음)
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved — gsd-ui-checker 2026-10-27 · 7/7 PASS · FLAG 2(비차단 · 수용) · UI 상태 프로브 42건 해결(explicit 38 · backstop 2 · dismissed 2)
