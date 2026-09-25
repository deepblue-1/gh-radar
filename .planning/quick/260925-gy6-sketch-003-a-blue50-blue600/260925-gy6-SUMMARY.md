---
phase: quick-260925-gy6
plan: 01
subsystem: webapp/theme
tags: [theme, toss-b, light, tokens, sketch-003]
status: complete
requires: [sketch 003-A 결정(2026-09-25), 260925-0pf TDS 토큰, 260924-vj1 토스 B]
provides: [--nav-on-bg, --nav-on-fg, --nav-on-line, --spec-dot-bg, --spec-dot-ring, 라이트 pill-on/side-bg 003-A 값]
affects: [사이드바, 종목상세 탭, 내 테마 칩, 가격 스펙트럼, 작업대 알약·거래소 토글 9곳]
tech-stack:
  added: []
  patterns: ["테마별 선택 토큰 — 라이트 값만 새로 두고 다크 값은 종전 참조의 literal 해석값(동치 테스트로 고정)"]
key-files:
  created: []
  modified:
    - webapp/src/styles/globals.css
    - webapp/src/styles/__tests__/tds-tokens.test.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx
    - webapp/src/components/theme/theme-chips.tsx
    - webapp/src/components/theme/__tests__/themes-client.test.tsx
    - webapp/src/components/stock/stock-stats-grid.tsx
    - webapp/src/components/stock/__tests__/stock-stats-grid.test.tsx
decisions:
  - "선택·활성 축 새 토큰 5개(--nav-on-bg/-fg/-line · --spec-dot-bg/-ring) — --accent 는 다크 값이 달라 재사용 불가"
  - "세그먼트 선택 --seg-on-* 는 두 테마 모두 무변경(Phase 20 D-02 중립 선택색)"
  - "내 테마 칩 다크 링만 dark: 유틸로 유지(oklch color-mix 라 토큰 계약 밖 · 라이트 대응값 없음)"
  - "목업 .v-a --line #f2f4f6 미적용(결정 목록 밖 · TDS 공식값 유지)"
metrics:
  duration: "약 15분"
  completed: 2026-09-25
estimate:
  tokens: 45000
  tasks: 3
actuals:
  tokens: 4500
  tasks: 3
  commits: 0
plan_head_before: ac4d657
---

# Phase quick-260925-gy6 Plan 01: sketch 003-A 라이트 선택·활성 blue50/blue600 Summary

라이트 테마의 선택 표현(작은 알약 · 사이드바 활성 · 종목상세 탭 · 내 테마 칩 · 스펙트럼 현재가 점)을 토스식 파란 선택(blue50 #e8f3ff 면 + blue600 #1b64da 글자, 밑줄·점 blue500 #3182f6)으로 옮기고 사이드바 바탕을 흰색으로 바꿨다. 새 선택 토큰 5개의 다크 값은 종전 참조값과 같아 다크 렌더는 바뀌지 않으며, 테스트가 그 동치를 고정한다.

**커밋 0건.** 사용자 전역 규칙(커밋 전 메시지 확인 · 한 번에 커밋)에 따라 변경은 전부 working tree 에만 있다. `commits: 0` 은 누락이 아니라 의도다.

## 변경 파일 (정확히 10개 · `git status --porcelain` 의 ` M`)

| 파일 | 변경 |
|------|------|
| `webapp/src/styles/globals.css` | `:root` pill-on-bg/fg · side-bg 003-A 값 + 새 토큰 5개(라이트) · `.dark` 새 토큰 5개(다크, 추가 줄만) · 주석 |
| `webapp/src/styles/__tests__/tds-tokens.test.ts` | 라이트 기대값 갱신 · 새 토큰 기대값(라이트/다크) · THEME_COLOR_TOKENS 등록 · 다크 동치 가드 `it` |
| `webapp/src/components/layout/app-sidebar.tsx` | `LINK_ACTIVE` → `bg-[var(--nav-on-bg)] text-[var(--nav-on-fg)] font-semibold` |
| `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` | 활성/비활성 링크 클래스 단언 `it` 1개 |
| `webapp/src/components/stock/stock-detail-tabs.tsx` | 탭 선택 글자 `--nav-on-fg` · 밑줄 `--nav-on-line` |
| `webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx` | 탭 선택 유틸 단언 `describe`/`it` 1개 |
| `webapp/src/components/theme/theme-chips.tsx` | 내 테마 칩 `bg-[var(--nav-on-bg)] text-[var(--nav-on-fg)] dark:border-[color-mix(...)]` · JSDoc 갱신 |
| `webapp/src/components/theme/__tests__/themes-client.test.tsx` | 내 테마/시스템 칩 badge 클래스 단언 `it` 1개 |
| `webapp/src/components/stock/stock-stats-grid.tsx` | 현재가 점 `data-slot="spectrum-dot"` · `bg-[var(--spec-dot-bg)]` · `shadow-[0_0_0_4px_var(--spec-dot-ring)]` · JSDoc |
| `webapp/src/components/stock/__tests__/stock-stats-grid.test.tsx` | 현재가 점 토큰 단언 `it` 1개 |

`webapp/e2e/specs/zz-theme-gallery.spec.ts` 는 손대지 않았다(여전히 `??`).

## (a) 토큰 값

| 토큰 | 라이트 | 다크 | 다크 = 종전 참조 |
|------|--------|------|------------------|
| `--pill-on-bg` | #191f28 → **#e8f3ff** | #4d4d59 (무변경) | — |
| `--pill-on-fg` | #ffffff → **#1b64da** | #ffffff (무변경) | — |
| `--side-bg` | #f9fafb → **#ffffff** | #101013 (무변경) | — |
| `--nav-on-bg` (신규) | #e8f3ff | #2c2c35 | `--muted` |
| `--nav-on-fg` (신규) | #1b64da | #ffffff | `--fg` |
| `--nav-on-line` (신규) | #3182f6 | #ffffff | `--fg` |
| `--spec-dot-bg` (신규) | #3182f6 | #9e9ea4 | `--muted-fg` |
| `--spec-dot-ring` (신규) | rgba(49, 130, 246, 0.18) | rgba(255, 255, 255, 0.08) | `color-mix(in oklch, --fg 8%, transparent)` 의 다크 해석값 |

소비처 매핑: `--nav-on-bg/-fg` = 사이드바 활성 · 내 테마 칩 / `--nav-on-fg` + `--nav-on-line` = 종목상세 탭 선택 / `--spec-dot-*` = 스펙트럼 현재가 점·링. `--pill-on-*` 소비처 9곳(card-tabs · shared-panels · stock-info-modal · exchange-tag · card-header · workbench-status-bar · stock-orderbook-section 등)은 모두 bg·fg 를 짝으로 쓰므로 값 변경만으로 따라온다(grep 확인).

## (b) 세그먼트 선택 제외 근거

003-A 결정 3의 「세그먼트 선택 글자 blue600」은 적용하지 않았다. `--seg-on-*` 는 감시대상 매도잔량/매수잔량 세그먼트를 포함한 전역 토큰이고, Phase 20 D-02 가 이 선택색을 중립으로 잠갔다. 파랑은 하락/매도 방향색으로 읽혀 선택 오판 = 오발주 위험(T-gy6-01). `:root`·`.dark` 모두 무변경이며, globals.css 주석에 이 근거를 남겼다.

## (c) 내 테마 칩 다크 링 `dark:` 예외 근거

종전 링 색 `color-mix(in_oklch,var(--primary)_45%,var(--border))` 는 oklch 보간이라 테마 색 토큰 계약(oklch 금지 · tds-tokens.test 가드)에 담을 수 없다. 003-A 는 라이트에서 링을 없애므로 라이트 쪽 대응 값도 없다. 그래서 이 링 하나만 `dark:border-[...]` 유틸로 남겼다. 라이트는 Badge outline 기본값 `border-transparent` 가 적용되고, 다크는 종전과 문자 그대로 같은 링이다. 면과 글자는 tailwind-merge 가 outline 기본값 `bg-[var(--muted)] text-[var(--muted-fg)]` 를 새 토큰 유틸로 덮어쓴다(테스트가 `bg-[var(--muted)]` 부재를 단언).

## (d) 목업 `--line` 미적용 근거

목업 `.v-a` 의 `--line: #f2f4f6` 는 README 결정 목록에 없다. 또 「팔레트 값은 TDS 공식값 유지」와도 충돌하므로 적용하지 않았다(`--border-subtle` #e5e8eb 유지).

## (e) 시각 확인 권장 지점

- **라이트:** 데스크톱 사이드바(흰 바탕 + 활성 항목 파란 면/글자) · 모바일 사이드바 시트 · 종목상세 상단 탭(선택 파란 글자 + 파란 밑줄) · 종목상세 「이 종목의 테마」 내 테마 칩(파란 면 · 링 없음, 시스템 칩은 회색 그대로) · 가격 스펙트럼 현재가 점(파란 점 + 옅은 파란 링) · 작업대 카드 탭/공용 패널 탭/종목정보 모달 탭의 알약 · KRX/NXT 거래소 토글(카드 헤더 · 상태바 · 호가 섹션) · NXT exchange-tag.
- **다크:** 같은 자리 모두 종전과 같아야 한다(토큰 동치 테스트로 고정).
- 감시대상 매도잔량/매수잔량 세그먼트는 두 테마 모두 종전 중립색이어야 한다.

## 검증 (실행 명령과 결과)

| 명령 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/webapp exec vitest --run src/styles/__tests__/tds-tokens.test.ts src/components/layout/__tests__/app-sidebar.test.tsx` (Task 1 RED) | 17 failed (의도한 RED) |
| 같은 명령 (Task 1 GREEN) | 2 files · **96 passed** |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/stock/__tests__/stock-detail-tabs.test.tsx src/components/theme/__tests__/themes-client.test.tsx` (Task 2 RED → GREEN) | 2 failed → 2 files · **33 passed** |
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/stock/__tests__/stock-stats-grid.test.tsx` (Task 3 RED) | 1 failed (의도한 RED) |
| 대상 5개 파일 통합 실행 | 5 files · **136 passed** |
| `pnpm --filter @gh-radar/webapp run test` (전체) | **99 files passed · 1748 passed · 1 skipped** (실패 0) |
| `pnpm --filter @gh-radar/webapp run typecheck` (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | **통과**(오류 0 — zz-theme-gallery.spec.ts 기인 오류도 없음) |
| `git diff webapp/src/styles/globals.css` | `.dark` 블록은 추가 줄·주석만(기존 값 변경 0) |

추가 확인: Tailwind v4.2.2 `compile()` 로 새 유틸을 직접 빌드했다. 그 결과 `shadow-[0_0_0_4px_var(--spec-dot-ring)]` → `--tw-shadow: 0 0 0 4px var(--tw-shadow-color, var(--spec-dot-ring))` 로 링 색이 토큰이 되고, `data-[state=active]:text-[var(--nav-on-fg)]` 가 `hover:text-[var(--fg)]` 뒤에 출력된다. 따라서 선택 탭은 hover 중에도 파란 글자를 유지한다.

## Deviations from Plan

없음 — 플랜대로 실행했다. 지시에 따라 태스크별 커밋·SUMMARY 커밋만 생략했다(오버라이드 제약).

## Known Stubs

없음.

## Threat Flags

없음. 표시 계층 CSS 토큰·className 만 바뀌었다. T-gy6-01(세그먼트 중립 유지)과 T-gy6-03(다크 동치 가드)은 반영했다.

## Self-Check: PASSED

- 수정 파일 10개 모두 존재하고 `git status` 에 ` M` 으로 표시된다.
- 커밋 없음(의도) — HEAD 는 계획 시점과 같은 `ac4d657`.
