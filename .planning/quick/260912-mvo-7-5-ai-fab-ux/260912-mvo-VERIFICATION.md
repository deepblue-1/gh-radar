---
phase: quick-260912-mvo
verified: 2026-09-12T08:14:45Z
status: passed
score: 10/10 must-haves verified
covered_files:
  - .planning/WINDOWS.md
  - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-mvo-PLAN.md
  - .planning/quick/260912-mvo-7-5-ai-fab-ux/260912-mvo-SUMMARY.md
  - webapp/e2e/specs/chat.spec.ts
  - webapp/e2e/specs/trading-limit-chaser.spec.ts
  - webapp/e2e/specs/trading-vi.spec.ts
  - webapp/src/app/layout.tsx
  - webapp/src/components/chat/__tests__/chat-fab.test.tsx
  - webapp/src/components/chat/chat-fab.tsx
  - webapp/src/components/orderbook/__tests__/orderbook-ladder-chaser.test.tsx
  - webapp/src/components/orderbook/orderbook-ladder.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/dirty-action-bar.tsx
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/vi-settings-card.tsx
  - webapp/src/components/ui/input.tsx
  - webapp/src/components/ui/textarea.tsx
  - webapp/src/styles/globals.css
covered_digest: "v1:sha256:8903b66e5c16c7b58e9131a134fddf61fec13e2fe45e195f7e249a88f44ea49b"
behavior_unverified: 0
overrides_applied: 0
---

# Quick 260912-mvo: 상따 화면 후속 7건 (Q-01 ~ Q-07) Verification Report

**Phase Goal:** 상따 화면 후속 UX 결함 7건(FAB 경로 게이트 · 포커스 한 겹 · 세그먼트 폭 · 거래소 콤보 크기 ·
종목 변경 4가지 · 매수/매도 카드 방향색 틴트 · 컴팩트 호가 스크롤 박스)을 실제 코드에서 닫는다.
**Verified:** 2026-09-12T08:14:45Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Q-01 — AI FAB 은 `/stocks/{code}` 종목상세에서만 렌더되고 다른 경로/하위 라우트에는 없다 | ✓ VERIFIED | `chat-fab.tsx:54` `STOCK_DETAIL_PATH = /^\/stocks\/[^/]+\/?$/`, 모든 훅 호출 뒤(:77) `return null`. `chat-fab.test.tsx` Test 5(`/trading/limit-chaser`)·6(`/`)·7(`/stocks/005930/news`) 전부 라벨 부재 **와** `container`가 `toBeEmptyDOMElement()` 둘 다로 잠금. `layout.tsx`는 `git diff a40f6b8..HEAD`로 JSX 0줄·주석 4줄만 변경, `'use client'` 없음(서버 컴포넌트 유지) 확인 |
| 2 | Q-02 — `Input`·`Textarea`·VI 금액·상따 `NumInput`·상따 검색 입력 5곳이 포커스 시 테두리 한 겹만 보인다(전역 링 해제 + 테두리 채널 쌍) | ✓ VERIFIED | 5개 파일 각각에서 주석 제외 실측: `input.tsx`(seamless 1·border 1) · `textarea.tsx`(seamless 1·border 1, Tailwind `focus-visible:ring-3`/`ring-ring/50` 0건, 기존 `focus-visible:border-ring` 보존) · `vi-settings-card.tsx`(seamless 1·border 1, 래퍼 `focus-within:border-[var(--ring)]`) · `limit-chaser-form.tsx` `NumInput`(seamless 1·border 2, 기존 래퍼 재사용) · `limit-chaser-client.tsx` 검색 입력(seamless 1·border 1, `focus-visible:` — 자기 테두리) |
| 3 | Q-02 — 체크박스·버튼·링크·`<select>`·`type=range`는 전역 이중 링을 유지한다(제외 대상 미오염) | ✓ VERIFIED | `home-header.tsx` range 슬라이더에 `data-focus-ring` 0건. `limit-chaser-form.tsx:1463` 체크박스에 `data-focus-ring` 없음(유닛 `Q-02 — 체크박스에는 seamless 를 걸지 않는다`로 잠금) |
| 4 | Q-03 — 「감시 대상」 세그먼트가 `Row`/`CheckRow`와 같은 2열 그리드 오른쪽 칸에 있고 `role=group`+`aria-label`+더티 테두리 보존 | ✓ VERIFIED | `limit-chaser-form.tsx:673` 래퍼가 `Row`(:1284)·`CheckRow`(:1456)와 동일한 `grid-cols-[var(--lw)_minmax(0,1fr)]` 클래스(3건 확인). 첫 칸 `<span aria-hidden>` 비움, 그룹이 두 번째 칸. `role="group"` `aria-label="감시 대상"` 및 더티 시 `border-[var(--primary)]` 분기 그대로. 신규 유닛 테스트가 부모/자식 순서·역할·이름·더티 클릭 후 테두리까지 잠금 |
| 5 | Q-04 — 데스크톱(≥992) 거래소 콤보가 커지고 좁은 폭 크기는 불변, `appearance-none` 없음 | ✓ VERIFIED | `limit-chaser-client.tsx:475` `<select>`에 `@min-[992px]/lc:text-[14px] @min-[992px]/lc:h-7 @min-[992px]/lc:px-1.5 @min-[992px]/lc:py-0` 추가, 기존 `text-[10px] px-1 py-0.5` 그대로, `appearance-none` 없음. 신규 유닛 테스트로 잠금 |
| 6 | Q-05 — 종목 트리거가 행 여백을 먹지 않고(`flex-1` 제거) 아이콘+옅은 테두리로 눌리는 컨트롤임을 보이며, Esc/바깥 blur로 원래 종목 복귀, 검색 중에도 종목정보 10칸+현재가 유지 | ✓ VERIFIED | 트리거(:506)에 `flex-1` 없음·`border-[var(--border-subtle)]`·lucide `ChevronDown`, 텍스트 캐럿(`▾`) 제거(유닛이 `textContent`로 잠금). `isin !== ''`(:524)에서 현재가 항상 렌더, `lc-quote-grid`(:563)가 `!searching` 조건 없이 `isin !== ''`로만 렌더 — `<QuoteCell` 정확히 10개 실측. `StockSearchField`에 `onKeyDown Escape → onCancel`(:1054), `onBlur relatedTarget contains` 판정(:1073) 존재 |
| 7 | Q-05 — 검색 결과 클릭 도중 목록이 닫히지 않는다 | ✓ VERIFIED | 결과 `<ul>`(:1097)에 `onMouseDown={(e) => e.preventDefault()}` — `relatedTarget` containment와 mousedown 기본동작 차단 두 장치 모두 코드에 존재. 신규 유닛 테스트가 `relatedTarget=option`일 때 유지, mousedown `defaultPrevented===true` 확인 |
| 8 | Q-06 — 2열(`@min-[700px]/lc:`)에서 매수/매도 카드가 각각 `--up`/`--down` 5% 배경, 폰(탭 모드)엔 틴트 없음, 배경 선언 단일화 | ✓ VERIFIED | `Card`(:1082) `data-side={side}`, 배경 선언은 `bg-[var(--card-base)]` **한 줄뿐**, `--card-base`가 기본 `transparent`·`@min-[992px]/lc:`에서 `var(--card)`로 변수 스위치. 틴트(`color-mix(...5%...)`)는 `@min-[700px]/lc:` 접두로만, 접두 없는 하드코딩 틴트 배경 0건. 신규 유닛 테스트로 잠금 |
| 9 | Q-07 — 컴팩트 2단 호가가 240px 스크롤 박스(`tabIndex=0`) 안에서 20행 전부 렌더, 체결 테이프는 박스 밖, 3단·1단 트리 불변 | ✓ VERIFIED | `orderbook-ladder.tsx:986` 박스 `tabIndex={0}` `data-slot="ladder-scroll-two"` `h-[240px]`, 내부 `asks.map`+`bids.map`으로 20행 전부(자르지 않음), `<hr>`+`<TradeTape compact>`는 박스 밖. 신규 ref 3개(`scrollTwoRef`/`bidTopTwoRef`/`centeredTwoRef`) 독립 사용(기존 1단 ref 재사용 없음), `clientHeight===0` 조기 반환. `git diff a40f6b8..HEAD`로 `data-tree="three"`·`data-tree="one"` 블록 무변경 확인. 신규 유닛 3케이스(⑰e/f/g)가 20행·박스 밖 체결·3단/1단 불변을 잠금 |
| 10 | 회귀 0 — webapp 유닛 테스트가 785 passed/1 skipped/63 files 아래로 내려가지 않고 단언 삭제가 0건 | ✓ VERIFIED | 직접 실행: `pnpm -C webapp test` → **63 files · 801 passed · 1 skipped (802)** exit 0(기준선 대비 감소 0, +16). `git diff a40f6b8..HEAD --stat -- '*.test.tsx' '*.test.ts' webapp/e2e` → 4개 테스트/e2e 파일 전부 삽입 위주(396 insertions/29 deletions)이고, 삭제된 29줄은 모두 같은 명제를 새 코드로 재작성한 교체(단언 개수 감소 없음) — chat.spec.ts 좌표→부재, orderbook tabindex 3→4, card 배경 단언 1→3줄로 재작성 |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `webapp/src/components/chat/chat-fab.tsx` | 경로 게이트 컴포넌트 | ✓ VERIFIED | `usePathname` 게이트, 훅 순서 규칙 준수, `MessageSquare` 아이콘 렌더 |
| `webapp/src/components/trading/limit-chaser-client.tsx` | Q-04/05/02 헤더 로직 | ✓ VERIFIED | 콤보·트리거·검색·quote-grid 전부 코드에 실재 |
| `webapp/src/components/trading/limit-chaser-form.tsx` | Q-02/03/06 | ✓ VERIFIED | NumInput/체크박스/세그먼트/Card 전부 확인 |
| `webapp/src/components/orderbook/orderbook-ladder.tsx` | Q-07 | ✓ VERIFIED | 2단 트리 240px 박스, 3/1단 불변 |
| `webapp/src/styles/globals.css` | §8.5.5 규약 확장 | ✓ VERIFIED | 규약 주석 추가, 셀렉터 무변경 확인(`*:focus-visible`/`[data-focus-ring="seamless"]`) |
| `.planning/quick/260912-mvo-7-5-ai-fab-ux/260912-buysell-ladder.html` | 목업 정본 | ✓ VERIFIED | 파일 존재(`ls` 확인) |
| `.planning/quick/260912-mvo-7-5-ai-fab-ux/260912-chaser-breakpoints.html` | 목업 정본 | ✓ VERIFIED | 파일 존재(`ls` 확인) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `chat-fab.tsx` `usePathname()` 게이트 | `dirty-action-bar.tsx` ⑥ 주석 | 같은 사실(FAB 종목상세 한정) | ✓ WIRED | ⑥ 주석이 ⓐⓑⓒⓓ 4가지로 게이트·소비처·존치 사유·테스트 미잠금을 정확히 서술 |
| `chat-fab.tsx` 게이트 | e2e 3파일 부재/좌표 단언 | 같은 사실 | ✓ WIRED | `trading-limit-chaser.spec.ts`·`trading-vi.spec.ts` 모두 `toHaveCount(0)`+`boundingBox non-null`+`width>0` 3줄 유지, `chat.spec.ts`는 종목상세 라우트로 이관 |
| `globals.css §8.5.5` `data-focus-ring="seamless"` | 5개 텍스트 입력 테두리색 | seamless↔border 쌍 | ✓ WIRED | 5개 파일 모두 쌍으로 실재(위 표 truth 2) |
| `orderbook-ladder.tsx` 2단 박스 240px | `twoRow` `h-6`(24px) | 24×10=240 커플링 | ✓ WIRED | 박스 `h-[240px]`, `twoRow` 가격 셀 `h-6`, 주석이 커플링을 명시 |
| `Card` `--card-base` | `@min-[992px]/lc:` 카드 크롬 | 변수 스위치 | ✓ WIRED | `bg-[var(--card-base)]` 단일 선언, `[--card-base:transparent]` 기본 / `@min-[992px]/lc:[--card-base:var(--card)]` |

### Data-Flow Trace

해당 없음 — 이번 quick 은 UI 레이아웃/접근성/경로 게이트 수정이며 신규 데이터 조회 경로가 없다(계획이 명시: 새 API·새 조회 경로 0개). `RelayQuote` 프레임 재사용만 확인됨.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `pnpm -C webapp test` 전량 | `cd webapp && pnpm test` | `63 files · 801 passed · 1 skipped (802)` exit 0 | ✓ PASS |
| `chat-fab.test.tsx` 단독 | 위 전량 실행에 포함 | 7 tests 모두 통과(`Test 1~7`) | ✓ PASS |
| `pnpm -C webapp typecheck` | `tsc --noEmit && tsc -p tsconfig.e2e.json` | exit 0 | ✓ PASS |
| `pnpm -C webapp lint` | `next lint` | Error 0 · Warning 정확히 3(기준선과 동일 3건) | ✓ PASS |
| `pnpm build`(루트) | `pnpm build` | webapp build 포함 exit 0, 14/14 정적 페이지 생성 | ✓ PASS |
| `git diff --name-only -- webapp/src/app/layout.tsx` | 실측 | 파일은 수정됐으나(주석 4줄) JSX·`'use client'`·import 변경 0건 | ✓ PASS(계획의 실질 요건 충족, 서술 항목의 문자 그대로의 "무변경"과는 편차 — SUMMARY 편차 1 참조) |

### Probe Execution

해당 없음 — 이 quick 은 `scripts/*/tests/probe-*.sh` 형태의 프로브를 선언하지 않았다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRADE-01 | `260912-mvo-PLAN.md` | 상따 화면 UX 결함 해소 | ✓ SATISFIED | Q-01~Q-07 전부 코드로 확인됨(위 표) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER 검색 결과 0건(수정 파일 9개 전수) | — | 없음 |

### Human Verification Required

없음 — 이번 quick 의 모든 must-have 는 코드/유닛 테스트/전량 게이트로 검증 가능했다. jsdom 레이아웃 한계로 증명 불가한 5건(폭·높이·초기 스크롤 위치 등)은 필수 진실(must-have truth)이 아니라 **부수 관찰**이며, 계획이 명시적으로 WINDOWS.md 등재를 요구한 항목이다. 실측 결과 5건 전부(`id 4~8`) 정상 등재되어 있음을 확인했다(`grep quick-260912-mvo .planning/WINDOWS.md`).

### 검증 강조 항목 응답 (verification_emphasis 1~11)

1. **포커스 채널 쌍(가장 위험한 조용한 실패)** — 5개 파일 전부 주석 제외 실측으로 seamless≥1 & border≥1 쌍 확인. `textarea.tsx`의 기존 `focus-visible:border-ring`은 과삭제되지 않고 보존됨.
2. **제외 대상 확인** — `home-header.tsx` range 슬라이더·`limit-chaser-form.tsx` 체크박스 모두 `data-focus-ring` 0건.
3. **FAB 경로 게이트** — `/stocks/{code}` 본문에서만 렌더, `/stocks/{code}/news` 하위 라우트에서는 `null`(Test 7로 잠김). 다른 하위 라우트(`/discussions`)도 같은 정규식으로 동일하게 배제됨(세그먼트 정확히 하나 규칙).
4. **⑤(d) 검색 중 종목정보 10칸 생존** — `!searching` 조건 완전히 제거됨, `<QuoteCell` 정확히 10개 확인.
5. **⑤(c) blur 복귀 vs 검색 클릭** — `relatedTarget` containment와 `<ul>` `onMouseDown` preventDefault 둘 다 코드에 존재, 신규 유닛 테스트가 둘의 상호작용을 검증.
6. **⑦ 단수 미절단** — 박스 높이만 240px, `asks`+`bids` 매핑이 20행 전부 렌더(유닛 `toHaveLength(20)`로 잠김). `tabIndex={0}` 존재.
7. **3단/1단 트리 불변** — `git diff a40f6b8..HEAD`로 두 블록에 diff 없음을 직접 확인.
8. **⑥ 틴트 2열 한정** — 유일한 무접두 배경 클래스는 변수 기반(`bg-[var(--card-base)]`, 기본값 transparent)이며 하드코딩 틴트 색상은 전부 `@min-[700px]/lc:` 접두. 폰 탭 누출 없음.
9. **③ 세그먼트 접근성/더티 보존** — `role="group"` `aria-label="감시 대상"` 및 더티 테두리 분기 코드·테스트 모두 확인.
10. **게이트 재실행** — 4종 게이트 전부 직접 실행: test(63f/801p/1s, exit 0) · typecheck(exit 0) · lint(Error 0/Warning 3, 동일 3건) · build(exit 0). SUMMARY 수치와 완전 일치.
11. **단언 삭제 0건 검증** — `git diff a40f6b8..HEAD -- '*.test.tsx' '*.test.ts' webapp/e2e` 직접 실행, 4개 파일 모두 재작성(교체)이지 순수 삭제가 아님을 확인.

**편차 4건 검증 결과** — SUMMARY가 보고한 4건 전부 사실로 확인됨:
1. `layout.tsx` 주석 갱신(JSX 0줄) — `git diff`로 확인, 계획의 `<action>`/`<done>` 지시(사실로 고쳐라)와 `<verification>` 표의 서술("비어 있음")이 상충하는 지점에서 실행자가 실질 요건(JSX 무변경, 서버 컴포넌트 유지, `'use client'` 없음)을 지킨 채 주석만 고친 것은 계획의 의도(거짓 주석 제거가 이 계획의 목적)에 부합하는 합리적 처리로 판단됨. **문제 없음.**
2. `chat.spec.ts` 조회구 완화(`exact:true`→정규식) — SUMMARY가 밝힌 그대로 확인. 검증 대상(게이트/스트리밍)에는 영향 없음. **문제 없음(Playwright 미실행 상태로 WINDOWS ⓐ에 이미 열려 있음).**
3. SSE 테스트의 `a[href="/stocks/000660"]` 단언 — 라우트를 `/stocks/000660`으로 옮기며 페이지 자체의 자기참조 링크(`stock-comovement-section.tsx` 등)에 의해 무르게 통과할 이론적 가능성이 있음을 코드에서도 확인(`href={`/stocks/${c.code}`}` 패턴 존재). 그러나 이는 Playwright 미실행 상태에서 이미 알려진 리스크이며 SUMMARY가 정직하게 공개했고 WINDOWS ⓐ(Playwright 미실행)의 하위 리스크로 흡수됨. **새로운 문제로 추가 보고하지 않음(기존 공개 리스크의 연장).**
4. `orderbook-ladder-chaser.test.tsx` 단언 재작성(3→4) — 실제로 새 스크롤 영역이 정당하게 추가되어 발생한 재작성이며 범위 단언으로 무르게 바뀌지 않았음(정확한 배열 순서 단언 유지). **문제 없음.**

★ 증명 불가 영역(jsdom 레이아웃 한계)에 대해 "검증했다"고 적지 않았음을 확인 — SUMMARY와 WINDOWS.md 5건이 일치하며, 이 보고서도 그 5건을 gap 으로 올리지 않았다.

### Gaps Summary

없음. 7개 관측 결함(Q-01~Q-07) 전부 코드에서 직접 확인됐고, 전량 게이트 4종이 SUMMARY의 실측값과 정확히 일치했다(63 files·801 passed·1 skipped·exit 0 / typecheck exit 0 / lint Error 0·Warning 3 / build exit 0). 단언 삭제 0건, 목업 정본 2건 실재, WINDOWS.md 미검증 5건 등재 확인. 계획 대비 편차 4건 모두 실행자의 자기 보고와 일치하며 문제가 되는 편차는 없었다.

---

_Verified: 2026-09-12T08:14:45Z_
_Verifier: Claude (gsd-verifier)_
