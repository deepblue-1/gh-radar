---
phase: quick-260912-mvo
plan: 01
subsystem: webapp/trading
tags: [ux, a11y, focus, responsive, orderbook, chat-fab]
quick_id: 260912-mvo
requires:
  - webapp/src/styles/globals.css §8.5.5 (Double-Ring Focus)
  - lucide-react (기존 의존성 — 신규 설치 0건)
provides:
  - "AI FAB 경로 게이트 (`/stocks/{code}` 본문 한정)"
  - "텍스트 입력 5곳의 「포커스 한 겹」 규약 (seamless ↔ 테두리 채널 쌍)"
  - "상따 감시대상 세그먼트 2열 정렬 · 매수/매도 카드 방향색 틴트"
  - "2단 호가 240px 스크롤 박스 (20행 유지)"
affects:
  - webapp/src/app/layout.tsx (주석만)
  - webapp/e2e/specs/{chat,trading-limit-chaser,trading-vi}.spec.ts
tech-stack:
  added: []
  patterns:
    - "`--card-base` 변수 스위치 — 배경 선언을 하나로 유지해 틴트와 카드색이 캐스케이드로 다투지 않게 한다"
    - "blur 취소 = `relatedTarget` 포함 판정 + 결과 목록 mousedown 기본동작 차단 (두 장치 한 쌍)"
    - "숨은 트리(display:none) 전용 정렬 effect 는 `clientHeight === 0` 에서 플래그를 세우지 않는다"
key-files:
  created:
    - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-buysell-ladder.html
    - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-chaser-breakpoints.html
  modified:
    - webapp/src/components/chat/chat-fab.tsx
    - webapp/src/components/chat/__tests__/chat-fab.test.tsx
    - webapp/src/components/trading/dirty-action-bar.tsx
    - webapp/src/app/layout.tsx
    - webapp/e2e/specs/chat.spec.ts
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
    - webapp/e2e/specs/trading-vi.spec.ts
    - webapp/src/styles/globals.css
    - webapp/src/components/ui/input.tsx
    - webapp/src/components/ui/textarea.tsx
    - webapp/src/components/trading/vi-settings-card.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/src/components/orderbook/orderbook-ladder.tsx
    - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
    - .planning/WINDOWS.md
decisions:
  - "FAB 경로 판정은 `app/layout.tsx` 가 아니라 `chat-fab.tsx` 안에서 — 레이아웃을 서버 컴포넌트로 남긴다"
  - "`dirty-action-bar.tsx` 의 `pr-[128px]` 는 공용 컴포넌트 방어로 존치 (후속 후보)"
  - "`home-header.tsx` range 슬라이더와 폼 체크박스는 seamless 제외 — 전역 링이 유일한 포커스 표시"
  - "데스크톱 카드 배경을 `@min-[992px]/lc:bg-[var(--card)]` 에서 `--card-base` 변수 스위치로 교체"
metrics:
  duration: 16m
  completed: 2026-09-12
actuals:
  tokens: 61000
  tasks: 3
  commits: 4
plan_head_before: a40f6b8c5a47fb83fefe66e2a17f75ef841c9814
status: complete
---

# Quick 260912-mvo: 상따 화면 후속 7건 (Q-01 ~ Q-07) Summary

상따 화면에서 관측된 일곱 개 UX 결함을 한 번에 닫았다 — FAB 경로 게이트, 텍스트 입력 5곳의
포커스 한 겹화, 감시대상 세그먼트 2열 정렬, 데스크톱 거래소 콤보 확대, 되돌릴 수 있는 종목
변경, 매수/매도 카드 방향색 틴트, 컴팩트 2단 호가의 240px 스크롤 박스.

## 커밋

| # | SHA | 내용 |
|---|-----|------|
| 1 | `9bab286` | **Q-01** AI FAB 경로 게이트. `chat-fab.tsx` `usePathname()` 정규식 + 비렌더 3케이스, `dirty-action-bar` ⑥ 주석 재작성, e2e 3파일 좌표→부재 단언, 목업 2건 박제 |
| 2 | `1098374` | **Q-02(4곳)·Q-03·Q-06** globals.css §8.5.5 규약, `input`/`textarea`/VI 금액/`NumInput` 포커스 한 겹, 감시대상 2열 그리드, `Card` `side` 프롭 + `--card-base` 변수 스위치 |
| 3 | `2851514` | **Q-04·Q-05·Q-02(1곳)·Q-07** 거래소 콤보 데스크톱 확대, 종목 변경 4가지, 검색 입력 seamless, 2단 호가 240px 스크롤 박스, WINDOWS 5건 |

## 게이트 실측값

전부 실제 출력에서 옮긴 값이다.

| 게이트 | 기준선 | 실측 | 판정 |
|--------|--------|------|------|
| `pnpm -C webapp test` | 63 files · 785 passed · 1 skipped | **63 files · 801 passed · 1 skipped (802)** · exit 0 | 통과 (감소 0, +16) |
| `pnpm -C webapp typecheck` | exit 0 | **exit 0** (`tsc --noEmit` + `tsconfig.e2e.json`) | 통과 |
| `pnpm -C webapp lint` | Error 0 · Warning 3 | **Error 0 · Warning 3** | 통과 |
| `pnpm build` (루트) | exit 0 | **exit 0** (webapp build: Done) | 통과 |

lint warning 3건은 기준선과 **같은 3건**이고 새로 늘지 않았다:
- `src/components/theme/theme-detail-client.tsx:9` — `ScannerEmpty` 미사용
- `src/components/trading/__tests__/strategy-status-card.test.tsx:360` — `_msg` 미사용
- `src/lib/use-relay-socket.ts:808` — `wireSubsRef.current` exhaustive-deps

## 포커스 쌍 게이트 (T-mvo-01) — 5개 파일 실측

주석 줄(`*` · `//` · `/*`)을 걸러낸 뒤 `data-focus-ring="seamless"` 와
`focus-(visible|within):border-(\[var\(--ring\)\]|ring)` 을 파일마다 함께 센 결과다.

| 파일 | seamless | border | 비고 |
|------|----------|--------|------|
| `webapp/src/components/ui/input.tsx` | 1 | 1 | `focus-visible:border-[var(--ring)]` 신설 |
| `webapp/src/components/ui/textarea.tsx` | 1 | 1 | 기존 `focus-visible:border-ring` **보존** (과삭제 없음) |
| `webapp/src/components/trading/vi-settings-card.tsx` | 1 | 1 | 래퍼 `focus-within:border-[var(--ring)]` 신설 |
| `webapp/src/components/trading/limit-chaser-form.tsx` | 1 | 2 | `NumInput` 래퍼(기존) + 「감시 대상」 세그먼트 외 1건 — 추가 변경 없음 |
| `webapp/src/components/trading/limit-chaser-client.tsx` | 1 | 1 | 검색 입력 자신이 테두리를 가지므로 `focus-visible:` |

`textarea.tsx` 의 Tailwind 포커스 링 유틸리티 개수: **0** (`grep -cE 'focus-visible:ring-[0-9]'`).
`aria-invalid:ring-*` 은 오류 신호라 그대로 두었다.

**제외 대상 확인** — `home-header.tsx` 의 `data-focus-ring` 개수 **0**,
`limit-chaser-form.tsx` 의 모든 `input[type=checkbox]` 에 `data-focus-ring` 없음(유닛으로 잠금).

## `planning_findings` 두 건의 최종 처리

1. **`home-header.tsx:228` range 슬라이더 — 제외했다.** 트랙이 `h-1` 배경뿐이고 테두리가 없어
   테두리로 포커스를 말할 수 없다. seamless 를 걸면 포커스 표시가 통째로 사라져 WCAG 2.4.7
   위반이 된다. 같은 이유로 `limit-chaser-form.tsx:1413` 체크박스도 제외했고, 그 제외를
   유닛 테스트로 **잠갔다**(「체크박스에는 seamless 를 걸지 않는다」).

2. **`dirty-action-bar.tsx` 의 `pr-[128px]` — 지우지 않고 남겼다.** 값(`pr-[128px]`)과 그 옆
   128 = 24 + 83 + 21 산식 주석은 그대로다. ⑥ 주석만 네 사실(ⓐ FAB 게이트 ⓑ 오늘의 소비처
   둘 다 `/trading/*` ⓒ 공용 컴포넌트라 방어로 남긴다 ⓓ 더 이상 테스트로 잠겨 있지 않다)로
   다시 썼다.

### 후속 후보 — `pr-[128px]`

오늘 `DirtyActionBar` 의 소비처는 `limit-chaser-form.tsx:1026` 과 `vi-settings-card.tsx:600`
**둘뿐이고 둘 다 `/trading/*`** 이다. Q-01 이후 FAB 은 `/stocks/{code}` 본문에만 뜨므로
**이 두 화면에서 FAB 과 바가 공존할 일이 없다.** 즉 128px 여백은 오늘 아무것도 피하지 않는
빈 공간이다. 그럼에도 남긴 이유는 이 바가 공용 컴포넌트여서 종목상세류 표면에 새 소비처가
붙는 순간 같은 충돌이 되살아나기 때문이다. **그리고 이 여백은 이제 테스트로 잠겨 있지
않다** — 좌표 단언이 부재 단언으로 바뀌었으므로, 값을 바꾸거나 지울 때 잡아 줄 기계 장치가
없다. 제거 여부는 별도 승인 항목으로 남긴다.

## 깨진 계약 → 새 계약 (단언 삭제 0건)

| # | 파일 | 무엇을 | 무엇으로 |
|---|------|--------|----------|
| 1 | `trading-limit-chaser.spec.ts` 케이스 4 | FAB `boundingBox()` 좌표 비교 3줄 | FAB `toHaveCount(0)` + 「수정」 박스 non-null + `width > 0` (단언 3줄 유지) |
| 2 | `trading-vi.spec.ts` 케이스 2 | 같은 좌표 비교 3줄 | 같은 부재 단언 3줄 |
| 3 | `chat.spec.ts` 비로그인 게이트 | `/login` 진입 + `name: 'AI', exact` | `/stocks/000660` 진입(시나리오 3 의 mock 재사용) + `name: /^AI/`. **검증 대상(로그인 게이트·스트리밍 미발생)은 무변경** |
| 4 | `chat.spec.ts` SSE 스트리밍 | `/` 진입 + `mockHomeApi` | `/stocks/000660` + `mockStockApi`. SSE·시트 단언 무변경 |
| 5 | `limit-chaser-form.test.tsx` 카드 크롬 | `toContain('@min-[992px]/lc:bg-[var(--card)]')` 1줄 | `[--card-base:transparent]` + `@min-[992px]/lc:[--card-base:var(--card)]` + `bg-[var(--card-base)]` 3줄 — **같은 명제**(데스크톱에서만 카드 배경이 `--card`)를 새 기계로 |
| 6 | `orderbook-ladder-chaser.test.tsx` ⑦ tabindex | `toHaveLength(3)` + `['tape-scroll','ladder-scroll','tape-scroll']` | `toHaveLength(4)` + `['ladder-scroll-two','tape-scroll','ladder-scroll','tape-scroll']` — 같은 규칙(스크롤 영역은 tab stop)이 적용되는 영역이 하나 늘었다. 범위 단언으로 무르게 바꾸지 않았다 |

신규 테스트 **16건**: chat-fab 3 · limit-chaser-form 4 · limit-chaser-client 6 · orderbook-ladder 3.

## `chat/composer.tsx` 챗 입력 포커스 — 코드 확인 결과

**보인다.** `composer.tsx:50-57` 은 `Textarea` 에 `max-h-[120px] min-h-[40px] flex-1 resize-none`
만 덧붙인다 — 포커스 관련 유틸리티를 하나도 override 하지 않으므로 base 의
`focus-visible:border-ring` 이 그대로 살아 있다. `Textarea` 소비처는 이 한 곳뿐이다.
즉 Tailwind 링을 걷은 뒤에도 챗 입력의 포커스는 **테두리색 변화 한 겹**으로 남는다.

## 관찰 (이번 범위 밖 — 고치지 않았음)

`vi-settings-card.tsx` 의 금액 입력 래퍼는 더티일 때
`shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_18%,transparent)]` 링 그림자를 얹는다.
상따 `NumInput` 은 260911-w5h 에서 같은 링을 **걷고 테두리 한 겹만** 남겼다 — 고밀도 폼에서
링이 이웃 행과 겹쳐 어느 입력이 더티인지가 오히려 흐려졌기 때문이다. 두 화면의 더티 표현
규율이 지금 **갈라져 있다.** 이번 승인 목록에 없어 손대지 않았다(포커스 채널이 아니라 더티
채널이므로 Q-02 의 대상도 아니다). VI 폼은 4행뿐이라 상따만큼 밀집하지 않는다는 차이가
있으나, 두 화면이 같은 `DirtyActionBar` 를 쓰는 이상 표현 규율은 언젠가 통일해야 한다.

## WINDOWS.md 등재 항목 (5건, 전부 `unrun-verify` · `status: open`)

| id | 파일 | 미검증 사실 |
|----|------|-------------|
| 4 | `webapp/e2e/specs/chat.spec.ts` | Playwright 미실행 — e2e 3파일의 새 FAB 부재/라우트 계약은 `tsconfig.e2e.json` 타입 통과로만 확인했다 |
| 5 | `webapp/src/components/trading/limit-chaser-form.tsx` | Q-03 세그먼트 버튼 폭(폰 67px · 와이드 78px, 접힘·잘림 0)은 목업 실측일 뿐 실기기 미확인 |
| 6 | `webapp/src/components/trading/limit-chaser-form.tsx` | Q-06 카드 가로 패딩 8px×2 가 본문 700px 경계의 잘림 여유를 16px 갉아먹는다 — 미측정 (T-mvo-07 accept) |
| 7 | `webapp/src/components/orderbook/orderbook-ladder.tsx` | Q-07 240px 박스 초기 스크롤이 매도1/매수1 경계를 정중앙에 놓는지 브라우저 미확인 — jsdom `offsetTop`·`clientHeight` 는 0 이라 정렬 effect 가 아예 돌지 않는다 |
| 8 | `webapp/src/components/trading/limit-chaser-client.tsx` | Q-05 검색 입력(`h-9`)과 종목명 트리거 블록의 높이 차로 인한 잔여 레이아웃 점프량 미측정 |

**jsdom 에는 레이아웃이 없다.** 위 다섯 건은 폭·높이·스크롤 위치에 관한 것이라 유닛으로
증명할 수 없어 그대로 열어 두었다. 「했다」고 적지 않았다.

## 계획 대비 편차

1. **`app/layout.tsx` 를 무변경으로 두지 않고 주석 한 줄을 갱신했다.**
   계획 안에 모순이 있었다 — Task 1 `<action>`(2) 와 `<done>` 은 「`:47-48` 주석의 『모든 페이지
   우하단에서 접근한다』는 이제 거짓이므로 그 줄만 사실로 고쳐라, 거짓 주석을 남기는 것이 이
   계획이 닫으려는 결함 그 자체다」라고 명시하는데, `<verification>` 표와 `<success_criteria>`
   는 「`git diff --name-only -- layout.tsx` 비어 있음 / 무변경」을 요구한다.
   **`<action>`/`<done>` 을 따랐다** — 거짓이 된 주석을 남기는 것은 이 계획의 목적에 정면으로
   어긋나고, `<verification>` 표의 항목은 자동 게이트가 아니라 서술이다(Task 1·3 의 automated
   verify 어디에도 이 diff 검사가 없다). 실제 변경은 **주석 4줄뿐**이고 JSX 는 0줄,
   `'use client'` 없음, import 증가 0 — 「서버 컴포넌트로 남는다」는 실질 요건은 지켰다.

2. **`chat.spec.ts` 의 FAB 조회구를 `name: 'AI', exact: true` → `name: /^AI/` 로 완화했다.**
   종목상세에서는 `setStockContext` 발행 시점에 따라 aria-label 이 `AI` 또는
   `AI · SK하이닉스 분석` 이 된다. 정확 일치로 두면 라벨 타이밍에 따라 플래키해진다.
   이 두 테스트의 검증 대상은 라벨이 아니라 **게이트와 스트리밍**이고, 라벨 계약은 같은
   파일의 시나리오 3 이 정확 일치로 이미 잠근다. (Playwright 미실행이므로 WINDOWS ⓐ 로
   열려 있다.)

3. **`chat.spec.ts` SSE 테스트의 `a[href="/stocks/000660"]` 단언은 한 글자도 고치지 않았다.**
   계획이 「검증 대상은 한 글자도 바꾸지 않는다」고 못박았으므로 그대로 뒀다. 다만 라우트를
   `/stocks/000660` 으로 옮겼으므로 이 단언이 **페이지 자신의 링크에 걸려 무르게 통과할
   가능성**이 생겼다(미니 종목카드가 아니라 브레드크럼 등). 스코프를 챗 시트로 좁히면
   강해지지만 그것은 단언을 고치는 일이라 하지 않았다. Playwright 실행 시 확인 대상이다.

4. **`orderbook-ladder-chaser.test.tsx` ⑦ 의 tabindex 단언을 3 → 4 로 다시 썼다.**
   계획이 예상한 신규 케이스(⑰e/f/g) 외에 기존 단언 하나가 깨졌다. 삭제하지 않고 새 계약으로
   다시 썼고, 「범위 단언으로 무르게 두지 않는다」는 원래 주석의 규율도 유지했다.

5. **`limit-chaser-form.test.tsx` 카드 크롬 단언 1건도 같은 방식으로 다시 썼다** (위 표 #5).

## 자기 점검 결과

- 목업 HTML 2건 존재 확인 ✓
- 커밋 3건 `git log` 확인 ✓ (`9bab286` · `1098374` · `2851514`)
- 커밋 수 **측정값** = `git rev-list --count a40f6b8..HEAD` = **4** (코드 3 + 이 SUMMARY 문서 커밋 1)
- 삭제된 추적 파일 0건 (세 커밋 모두 `--diff-filter=D` 비어 있음)
- 미추적 잔여 파일: 이번 quick 의 `260912-mvo-PLAN.md`(오케스트레이터 문서 커밋 몫) 외에는
  전부 이전 quick 들의 것으로 이번 작업과 무관

## Self-Check: PASSED
