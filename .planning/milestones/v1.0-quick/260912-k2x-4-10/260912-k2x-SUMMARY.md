---
phase: quick-260912-k2x
plan: 01
subsystem: webapp
tags: [ui, trading, limit-chaser, container-query, responsive, a11y, orderbook]
status: complete

requires:
  - quick-260912-gyz (상따 후속 다듬기 · 헤더 8칸 한 줄 나열 · 폼 글자 확대 · --lw 76/104)
  - quick-260911-w5h (상따 모바일 전면 정리 · 1단 사다리 · compact 체결 테이프)
  - "목업 260912-chaser-breakpoints.html (Chromium/Playwright 9개 실폭 프레임 전수 측정 · 사용자 확정)"
provides:
  - "상따 본문의 반응형 판정이 뷰포트가 아니라 **본문 폭**(CSS 컨테이너 쿼리 `@container/lc`)이다"
  - "본문 폭 4밴드 — 폰(~699) · 컴팩트(700~829) · 와이드(830~991) · 데스크톱(992~)"
  - "2단 호가 트리 신설 — 사다리 트리가 셋이고 어느 폭에서도 정확히 하나만 산다"
  - "헤더 종목정보 10칸 (`기준`·`거래` 추가) · 5열 순서는 CSS `order` 하나로만"
  - "`formatTradeValue` — 누적거래대금 조/억 2단위 (스캐너 `formatTradeAmount` 와 별개)"
  - "밴드 표·경계 3개 실측 근거의 **정본 1곳** (globals.css §2.2b) + 포인터 1곳 (CLAUDE.md)"
affects:
  - /trading/limit-chaser/{new,[key]} 본문 (데이터·전송·무장 판정 경로 불변)
  - 사이드바 그룹 소제목 글꼴 (11px → 14px)

tech-stack:
  added: []
  patterns:
    - "상따 본문만 컨테이너 쿼리 · 앱 셸/사이드바/account-panel 은 여전히 뷰포트 브레이크포인트"
    - "컨테이너(`container-type:inline-size`)는 `position:fixed` 자손의 컨테이닝 블록 — 하단 고정 바는 `document.body` 포털"
    - "배치 순서 차이는 CSS `order` 로만 — 배열/JSX 는 한 벌"
    - "사다리 트리 분리는 조건문이 아니라 **나란한 렌더 블록 + 배타적 노출 조건**"

key-files:
  created:
    - .planning/quick/260912-k2x-4-10/260912-chaser-breakpoints.html
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/lib/quote-format.ts
    - webapp/src/lib/__tests__/quote-format.test.ts
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
    - CLAUDE.md
    - .planning/WINDOWS.md

decisions:
  - "본문 폭 컨테이너 쿼리로 간 이유는 취향이 아니라 **271px 역전**이다 — 사이드바 240 + 패딩 증가로 창 1023px 의 본문은 1007px, 창 1024px 의 본문은 736px. 뷰포트로 끊으면 이 역전을 규칙에 손으로 적어야 하고 사이드바 폭을 바꾸는 순간 전부 틀어진다"
  - "컨테이너를 건 **같은 커밋에서** 더티 액션 바를 `document.body` 로 포털했다 — layout containment 가 fixed 자손의 컨테이닝 블록이 되므로 포털 없이는 바가 본문 끝으로 내려앉아 1차 CTA 가 사실상 죽는다. 단위 테스트가 `bar.parentElement === document.body` 로 잠근다"
  - "공유 `dirty-action-bar.tsx` 는 **한 줄도 고치지 않았다** — VI 설정 화면도 같은 바를 쓰고 그쪽은 컨테이너 밖이다. 포털은 상따 호출부의 사정이다"
  - "3단 호가표 하한을 380 → **400px** 로 올렸다 — 프로덕션 트리의 마커 슬롯(16+4=20px)을 넣고 재니 380 에서 가격이 3px 잘렸다. 슬롯을 빼면 380 도 서지만 3열 표에서 상한가·최근 체결가를 말하는 유일한 채널이 사라진다. 비용은 경계 10px(820→830)이고 그 사이에 해당하는 기기가 하나도 없다"
  - "탭 pane 숨김을 DOM `hidden` 속성 → CSS 클래스로 옮겼다 — **본문 폭은 미디어 질의 API 로 관측할 수 없다**(그 API 는 뷰포트만 본다). 조건부 렌더로는 바꾸지 않았다: 언마운트하면 탭을 옮길 때마다 매도 설정이 초기화되고 더티 카운트가 망가진다"
  - "2단 호가의 등락률은 목업의 `+1.0%` 가 아니라 **3단 표와 같은 `ladderPctText`**(부호·% 없음, 최소폭 40px)를 쓴다 — 목업 표기는 목업 편의였지 계약이 아니고, 한 화면에서 두 트리가 다른 문자열을 말하면 안 된다"
  - "`formatTradeValue` 를 `lib/format.ts` 의 `formatTradeAmount` 와 **합치지 않았다** — 저쪽은 스캐너의 `133.4조`(한 단위), 여기는 `133조 4,120억`(두 단위). 합치면 스캐너 거래대금 표기가 함께 바뀐다. `git diff --stat -- lib/format.ts` 출력 0줄로 확인"
  - "깨진 기존 단언은 **전부 새 계약으로 다시 썼고 삭제는 0건**이다. 범위 단언(`toBeGreaterThan`)으로 무르게 만들지 않고 실제 수를 세어 정확한 값으로 고정했다 — 「하나 늘어도 통과」는 게이트가 아니다"
  - "커밋에 `Co-Authored-By` 를 넣었다 — 사용자 전역 규칙은 금지이나 이 세션의 attribution 지시가 명시 요구했고 더 나중이자 상위다(직전 quick 260912-gyz 와 같은 판단)"

actuals:
  tokens: 96000
  tasks: 3
  commits: 4
  plan_head_before: a34ea9773f208d2f34c830698ae6128254085940

metrics:
  duration: "약 25분"
  completed: 2026-09-12
  tasks: 3
---

# Quick 260912-k2x: 상따 본문 4밴드 컨테이너 쿼리 + 확정 4건 Summary

상따 본문의 반응형 판정을 뷰포트에서 **본문 폭 컨테이너 쿼리 4밴드(700 · 830 · 992)** 로 옮기고,
2단 호가 트리 신설 · 종목정보 10칸 · 사이드바 소제목 폰트 · 오더북 제목행·범례 삭제를 함께 구현했다.

## 커밋

| # | SHA | 담은 것 |
|---|-----|---------|
| 1 | `c8818b4` | **Task 1 (tracer).** `@container/lc` 컨테이너 + 본문 그리드 4밴드 · 더티 액션 바 `document.body` 포털(SSR 가드 포함) · 옛 1024 1열 강제 분기 삭제 · `globals.css §2.2b` 밴드 표 정본 · `CLAUDE.md` 포인터 1줄 · 목업 HTML 박제 · 테스트 ⑭ 컨테이너 계약 재작성 + ⑭b 포털 신규 단언 |
| 2 | `69bc8eb` | **Task 2.** `formatTradeValue`(조/억 2단위) + 단위 테스트 6건 · 종목정보 10칸(`기준`·`거래`) · 5열 순서 CSS `order` · 오더북 카드 제목행 삭제 · 사다리 범례 전 구간 삭제 · 사이드바 소제목 14px · 8칸 단언 4건 → 10칸 계약 |
| 3 | `87fcaac` | **Task 3.** 2단 호가 트리 신설 + 세 트리 배타 노출 · 탭 폰 전용화 & pane 숨김 CSS 전환(`matchMedia` 경로 제거) · 데스크톱 치장 992 키 이전(값 불변) · 헤더 주석 3개 갱신 · e2e 가시성 단언 전환 · 깨진 단언 재작성 + 신규 케이스 5건 · `WINDOWS.md` 2건 |
| 4 | `797464a` | **문서.** PLAN · SUMMARY 아티팩트 + STATE Quick Tasks 행 (소스 diff 0줄) |

## 게이트 결과 (실측)

| 게이트 | 기준선 | 실측 | 판정 |
|--------|--------|------|------|
| `pnpm -C webapp test` | 771 passed / 1 skipped / 63 files | **785 passed / 1 skipped / 63 files** | 통과 (감소 0 · +14) |
| `pnpm -C webapp typecheck` | exit 0 | **exit 0** (`tsc --noEmit` + `tsc -p tsconfig.e2e.json`) | 통과 |
| `pnpm -C webapp lint` | Warning 3 · Error 0 | **Warning 3 · Error 0** (`ScannerEmpty` · `_msg` · `use-relay-socket`) | 통과 |
| `pnpm -C webapp build` | exit 0 | **exit 0** | 통과 |

테스트 증가 내역: Task 1 +1(⑭b 포털) → 772, Task 2 +8(포맷 6 + `order` 1 + 제목행 1) → 780,
Task 3 +5(⑰ 배타성 · ⑰b 2단 구조 · ⑰c 규약 · ⑰d 등락률 · 탭 값 보존) → 785.

### 잔존 검사 (주석 제외)

| 검사 | 결과 |
|------|------|
| 상따 3파일의 옛 `min-[1280px]` 분기 | **0 · 0 · 0** |
| `limit-chaser-client.tsx` 의 옛 `min-[1024px]` 분기 | **0** |
| `orderbook-ladder.tsx` 의 범례 식별자 | **0** |
| `limit-chaser-form.tsx` 의 `matchMedia` | **0** |
| `app-sidebar.tsx` 의 `text-[11px]` | **0** |

### 비침습 검사

`git diff --stat` 출력 **0줄** — `dirty-action-bar.tsx` · `account-panel.tsx` · `lib/format.ts`.
공유 액션 바 · 앱 셸 표면 · 스캐너 거래대금 표기가 한 글자도 바뀌지 않았다.

### 빌드 산출 CSS 실측 (컨테이너 쿼리가 실제로 나오는가)

목업 숫자가 클래스 문자열로만 남고 CSS 가 안 나오면 배치는 **에러 없이** 폰 밴드로 떨어진다.
그래서 산출물을 직접 셌다:

```
container:lc/inline-size              → 1   (@container/lc 유틸)
@container lc (min-width:700px)       → 1
@container lc (min-width:830px)       → 1
@container lc (min-width:992px)       → 1
```

예: `@container lc (min-width:830px){.@min-[830px]/lc:grid-cols-[400px_minmax(0,1fr)]{grid-template-columns:400px minmax(0,1fr)}`

## 조건부 항목 — 입력 박스 좌우 패딩 6px

**이미 충족 — 변경 0줄.** `NumInput` 의 래퍼가 이미 `px-1.5`(= 0.375rem = **6px**)였다.
사용자 결정 G 는 8px → 6px 를 말했지만 현재 코드가 그 목표값을 이미 쓰고 있어 고칠 것이 없었다.
없는 변경을 지어내지 않았다.

## TDD 기록

- **Task 2 RED:** `formatTradeValue` 케이스 6건 추가 → `6 failed | 9 passed` (함수 부재가 사유).
  GREEN: 구현 후 `15 passed`.
- **Task 3 RED:** 2단 트리 케이스 4건 + 카운트 재작성 4건 → `8 failed | 14 passed`.
  GREEN: 구현 후 `22 passed`. 폼 CSS 계약 RED `1 failed | 64 passed` → GREEN `65 passed`.

## 기존 단언을 무엇으로 바꿨는가 (삭제 0건)

| 파일 | 기존 단언 | 새 계약 |
|------|-----------|---------|
| `limit-chaser-client.test.tsx` ⑭ | 본문 그리드가 `min-[1280px]:grid-cols-[460px…]` · `min-[1024px]:grid-cols-1` 를 갖는다 | 래퍼가 `@container/lc` 이고 그리드가 **네 밴드 템플릿 전부**를 선언하며 뷰포트 분기가 0개다 + 자식 둘 전부 `min-w-0` |
| 〃 종목정보 4건 | 칸 8개 · 라벨 8개 순서 · 전부 대시 8 · 값 8 | 칸 **10개** · 라벨 10개 DOM 순서 · 전부 대시 10 · 값 10 (`기준`·`거래` 포함) |
| 〃 색 케이스 | 인덱스 0~7 의 방향색 | 인덱스 0~9, `기준`(0)이 **언제나 `--flat`** 임을 명시 추가 |
| 〃 데스크톱 override | `min-[1280px]:flex/flex-wrap/items-baseline/gap-x-[22px]` | `@min-[992px]/lc:` 동형 + `gap-x-[20px]`(칸 8→10 예산) + `@min-[700px]/lc:grid-cols-5` |
| 〃 헤더 글꼴 4종 | `min-[1280px]:text-[20/12/22/13px]` | **값 불변**, 키만 `@min-[992px]/lc:` |
| `orderbook-ladder-chaser.test.tsx` ① | 단계 라벨 2개(트리 2벌) | **3개**(트리 3벌) |
| 〃 ⑦ | tabbable 2개 `[ladder-scroll, tape-scroll]` | **3개** `[tape-scroll, ladder-scroll, tape-scroll]`(2단 트리 테이프 추가), DOM 순서까지 고정 |
| 〃 ⑧ | compact 테이프 1 · `hr` 1 | 테이프 **2** · `hr` **2** |
| 〃 ⑨ | 범례가 데스크톱에만 1개 | 범례가 **전 구간 0개**인데도 방향 라벨 30+30 · 상한가/최근체결가 텍스트가 남아 있다 |
| 〃 ⑪ | `text-[10px]` 60개 | **90개** (등락률 20×3 + 체결 시각 10 + 테이프 10×2). `text-[9px]` 는 **20 그대로** |
| `limit-chaser-form.test.tsx` ⑫ 2건 | `matchMedia` 를 갈아끼워 pane `hidden` **속성** 확인 | pane 이 `hidden @min-[700px]/lc:block` **클래스 쌍**을 갖는다 / 두 pane 이 **언제나 DOM 에 있다** |
| 〃 카드 크롬·입력·단위 3건 | `min-[1280px]:[--lw:104px]` 등 | **값 불변**, 키만 `@min-[992px]/lc:` + 「뷰포트 분기 0개」 단언 추가 |
| `trading-limit-chaser.spec.ts` 9 | `toHaveAttribute('hidden','')` | `toBeHidden()` — 성질 동일, 표현만 CSS 로 |

**신규로 잠근 것**(이전에는 어떤 테스트도 잡지 않던 회귀):

- 더티 액션 바가 `limit-chaser-page` 래퍼 **밖**(body 직속)에 렌더된다 — 포털이 걷히면 실패
- 10칸 **전부**가 700 밴드 `order` 를 갖고 992 에서 전부 0 으로 돌아온다
- 세 사다리 트리의 노출 조건이 **서로 겹치지 않는다**
- **탭을 오가도 반대편 입력값과 더티 수가 보존된다**(언마운트 금지)

## 계획 대비 편차

**없음 — 3개 task 를 계획대로 실행했다.** 계획에 명시되지 않았으나 계획의 규율이 요구해서
한 일이 둘 있다:

1. **`limit-chaser-form.test.tsx` 의 `afterEach` import 제거.** `setViewport` 헬퍼와
   `afterEach` 블록을 걷자 import 가 고아가 되어 lint warning 이 4건으로 늘었다. 계획이
   「고아가 남으면 lint 기준선이 깨진다」고 못박은 바로 그 경우라 같은 커밋에서 걷었다.
   (Rule 3 — 블로킹 이슈 자동 해소)
2. **오더북 카드 제목행 삭제에 대한 단위 케이스 추가.** 계획 Task 2 ⑦ 이 열거한 대상은
   아니었지만, 「제목행은 없는데 접근성 이름은 줄지 않았다」는 쌍을 잠그지 않으면 그 삭제가
   접근성 회귀와 구분되지 않는다. `card.querySelector('h3') === null` + 사다리
   `aria-label` 존재를 한 케이스로 묶었다.

## 무엇을 증명하지 않았는가 (WINDOWS.md 기록)

jsdom 에는 레이아웃이 없다 — `getBoundingClientRect()` 가 전부 0 이고 컨테이너 쿼리도
평가되지 않는다. 그래서 **폭 판정 자체는 유닛 테스트로 증명되지 않았다.** 증명한 것은
「규칙이 선언돼 있다」와 「빌드 산출 CSS 에 그 규칙이 실제로 나온다」까지다.

| id | kind | file | 내용 |
|----|------|------|------|
| 2 | `unrun-verify` | `webapp/src/styles/globals.css` | 밴드 경계 700/830/992 의 폭 판정 미검증 — 근거는 목업 실측(9개 실폭 프레임 374/700/736/752/792/845/892/992/1152, 전 구간 잘림 0)뿐이고 실기기 확인은 아직이다 |
| 3 | `unrun-verify` | `webapp/e2e/specs/trading-limit-chaser.spec.ts` | 390px 케이스의 pane 숨김 단언을 가시성으로 다시 썼으나 Playwright 미실행 — 타입 통과로만 확인 |

★ 「와이드 380px 이 프로덕션 트리에서 빠듯하다」 항목은 **만들지 않았다** — 마커 슬롯을 넣은
목업으로 다시 재어 380 잘림(3px)·400 이상 정상을 확인했고 그 결과가 이미 밴드 표(400px ·
경계 830)에 반영돼 있다. 닫힌 사실을 열린 항목으로 적으면 다음 사람이 같은 측정을 또 한다.

## Self-Check: PASSED

- `.planning/quick/260912-k2x-4-10/260912-chaser-breakpoints.html` — FOUND (830 × 3 · 400px × 2 = 마커 슬롯 반영 갱신본)
- 커밋 `c8818b4` · `69bc8eb` · `87fcaac` — 전부 FOUND
- `git rev-list --count a34ea97..HEAD` = **4** (측정값 · 서술 아님 — task 3건 + 문서 1건)
