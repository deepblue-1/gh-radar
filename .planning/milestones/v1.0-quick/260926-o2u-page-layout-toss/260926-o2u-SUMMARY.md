---
phase: quick-260926-o2u
plan: 01
subsystem: webapp-layout
status: complete
tags: [layout, sidebar, page-header, toss-grammar, webapp]
requires: []
provides:
  - "webapp/src/components/layout/page-layout.ts — PAGE_WRAP · CARD · SECTION_TITLE · SECTION_COUNT · ROW_DIVIDER"
  - "webapp/src/components/layout/page-header.tsx — PageHeader({ title, back?, actions?, description?, className? })"
  - "AppSidebar isSearchHubPath — 검색 허브 하위에서 「검색」 활성"
affects: [/, /me, /scanner, /themes, /watchlist, /search, 사이드바, error, not-found, surface-placeholder]
tech-stack:
  added: []
  patterns:
    - "지시문 없는 상수 모듈(page-layout.ts) — 서버 컴포넌트 page.tsx 도 실제 className 문자열로 import"
    - "useRouter 는 back 일 때만 마운트되는 BackButton 안에서만 호출"
    - "overflow-hidden 카드 안 행 포커스 링 = [--focus-outline-offset:-2px] (globals.css 무수정)"
key-files:
  created:
    - webapp/src/components/layout/page-layout.ts
    - webapp/src/components/layout/page-header.tsx
    - webapp/src/components/layout/__tests__/page-header.test.tsx
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/app/scanner/page.tsx
    - webapp/src/components/scanner/scanner-client.tsx
    - webapp/src/components/theme/themes-client.tsx
    - webapp/src/components/theme/theme-rank-row.tsx
    - webapp/src/components/theme/themes-skeleton.tsx
    - webapp/src/components/theme/__tests__/themes-client.test.tsx
    - webapp/src/components/watchlist/watchlist-client.tsx
    - webapp/src/app/themes/page.tsx
    - webapp/src/app/watchlist/page.tsx
    - webapp/src/app/page.tsx
    - webapp/src/components/home/home-client.tsx
    - webapp/src/components/home/home-header.tsx
    - webapp/src/components/home/__tests__/home-client.test.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/search/search-page-client.tsx
    - webapp/src/app/error.tsx
    - webapp/src/app/not-found.tsx
    - webapp/src/components/trading/surface-placeholder.tsx
    - webapp/e2e/specs/search-page.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
    - webapp/e2e/specs/auth-session.spec.ts
    - webapp/e2e/specs/home.spec.ts
    - webapp/e2e/specs/me.spec.ts
decisions:
  - "홈 섹션 머리↔첫 카드 간격은 D4 의 8px 이 아니라 20px(gap-5) — 카드 「복사됨」 말풍선(카드 위 17.5px)이 8px 이면 머리 행 「전체 복사」를 약 9px 가린다(390 실측, home.spec 불변식). 테마 페이지는 8px 그대로"
  - "/me 계좌 카드에 AccountPanel stack — 900 폭 2열이면 칸당 표 영역 약 419px < 미체결 439·잔고 444 최소폭(사용자 승인 결정)"
  - "테마 상세(/themes/{id})도 「검색」 활성(접두 일치) · /scanner/detail 등 다른 하위 경로는 정확 일치 유지"
metrics:
  duration: "약 15분 (2026-09-26 18:02 → 18:17 KST)"
  completed: 2026-09-26
  tasks: 3
  files: 28
estimate:
  tokens: 130000
  tasks: 3
actuals:
  tokens: 20900
  tasks: 3
  commits: 3
plan_head_before: aba7954367d5a3e6bf5dd29cde1bc263748f6e6f
commits: 3
---

# Quick 260926-o2u: 사이드바 종목검색 제거 · 공용 PageHeader/900 폭으로 페이지 레이아웃 토스 문법 통일 Summary

사이드바에서 「종목검색」 그룹(상승률 상위·테마·관심종목)을 걷어냈습니다. 세 페이지는 이제 `/search` 허브 타일로만 들어가고, 그 페이지들과 테마 상세에서는 사이드바 「검색」이 켜집니다. 공용 `PageHeader`(22px 제목·44px 줄·선택 뒤로가기)와 `PAGE_WRAP`(900 폭 가운데)을 6개 페이지에 적용했고, 테마 순위는 카드 한 장 안에 행 사이 hairline 으로 묶었습니다. 16px 로 떨어지던 미정의 `--t-2xl` h1 5곳은 22px 가 됐습니다.

## 커밋

| Task | 내용 | 커밋 |
|------|------|------|
| 1 | 공용 페이지 헤더·본문 폭 900 도입 — 상승률 상위에 뒤로가기 | `782f55d` |
| 2 | 사이드바 종목검색 그룹 제거 · 테마·관심종목 헤더·폭·목록 통일 | `e27ff0d` |
| 3 | 홈·My page·검색 헤더·폭 통일 · 미정의 크기 토큰 제거 | `c7763e2` |

- 커밋 3건 모두 한글이고 공동 저자 트레일러가 없습니다(`git log | grep -ci co-authored` = 0). 이 플랜의 files_modified 28개만 명시적으로 add 했습니다.
- push 하지 않았습니다. master 는 origin 보다 3커밋 앞서 있습니다(`## master...origin/master [ahead 3]`).
- 금지 파일 6개(globals.css · app-shell.tsx · app/layout.tsx · app/me/page.tsx · app/search/page.tsx · account-panel.tsx)의 diff 는 0입니다.

## 검증 (실행한 명령과 결과)

| 명령 (webapp 패키지 기준) | 결과 |
|---|---|
| `pnpm --filter @gh-radar/webapp exec vitest --run src/components/layout/__tests__/page-header.test.tsx` | 구현 전 실패 확인(모듈 없음) → 구현 후 **6/6 통과** |
| `… vitest --run src/components/layout/__tests__/app-sidebar.test.tsx` | 수정 후 구현 전 **6 실패/38 통과** 확인 → 구현 후 **44/44 통과** |
| `… vitest --run src/components/theme/__tests__/themes-client.test.tsx` | 신규 2케이스 실패 확인 → **26/26 통과**(기존 케이스 무수정) |
| `… vitest --run src/components/home/__tests__/home-client.test.tsx` | 신규 2케이스 실패 확인(15px·22px 단언) → **6/6 통과** |
| `… vitest --run src/components/home src/components/search src/components/layout src/components/theme` | **13 파일 / 157 통과** |
| `pnpm --filter @gh-radar/webapp run test` (전체 vitest) | **122 파일 / 2329 통과 · 1 skipped**(선재 skip), 실패 0 |
| `pnpm --filter @gh-radar/webapp run typecheck` (tsc + e2e tsconfig) | 통과(태스크마다 실행) |
| `pnpm --filter @gh-radar/webapp exec eslint <변경 28개 파일>` | 0 errors · 0 warnings |
| `grep -rn -- '--t-2xl' webapp/src \| wc -l` | **0** |
| `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/search-page.spec.ts e2e/specs/auth-session.spec.ts e2e/specs/themes.spec.ts e2e/specs/sidebar-tree.spec.ts e2e/specs/home.spec.ts e2e/specs/me.spec.ts --project=chromium` | 최종 통합 실행 **41/41 통과**(setup 1 + search-page 6 + auth-session 3 + themes 3 + sidebar-tree 7 + home 11 + me 10) |

- Playwright 는 다른 세션의 :3100 dev 서버(PID 97752, cwd = 이 저장소 webapp)를 `reuseExistingServer` 로 재사용했습니다. 이 서버는 현재 트리를 HMR 로 서빙하고, 끄거나 재시작하지 않았습니다.
- sidebar-tree · me spec 은 `withLocalRelay()` 가 로컬 relay(8090)를 직접 띄워서 **실제로 실행했고 통과**했습니다. 미실행 spec 은 없습니다.
- 중간에 home.spec 「개별 급등 복사」가 한 번 실패했습니다(아래 편차 1). 수정한 뒤 home 12/12 와 통합 41/41 이 통과했습니다.
- 스크린샷 대조: 6페이지 × 1280/390 × 라이트/다크를 scratchpad 에 캡처했습니다. 홈·테마는 fixture 목 데이터를 쓰는 임시 spec 으로 찍었고, 그 spec 은 실행 직후 삭제해 트리에 남기지 않았습니다. 결과는 다음과 같습니다.
  - 헤더 폭은 1280 에서 900, 390 에서 374 입니다.
  - h1 은 모든 페이지에서 22px 입니다.
  - 뒤로가기는 /scanner · /themes · /watchlist 에만 있습니다.
  - 가로 스크롤은 없고, 줄바꿈·잘림·겹침도 보이지 않았습니다.
  - ThemeCard 말풍선과 「주도 테마 전체 복사」도 겹치지 않았습니다(hit:false).
  - 참고: dev 서버에 백엔드 API 가 없어서 실데이터 홈은 초기 오류 카드 상태로 떴습니다. 이 상태가 헤더를 그리지 않는 것은 기존 동작이라 목 데이터로 따로 확인했습니다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 홈 섹션 머리 8px 간격에서 카드 「복사됨」 말풍선이 「전체 복사」를 가림**
- **발견:** Task 3 의 home.spec 「개별 급등 복사 — … (quick-260923-cre)」가 실패했습니다: `'복사됨' 말풍선이 제목 행 '전체 복사'를 가린다`.
- **원인(390 실측):** 머리 행 「전체 복사」의 bottom 은 714.75, 첫 카드의 top 은 723 입니다(간격 8). 카드 복사 아이콘의 말풍선(`bottom-full mb-1`)은 카드 위 17.5px(top 705.5)까지 떠서 약 9px 겹쳤습니다. 예전에는 머리↔카드 간격 16px 에 h2 18px 이라 비켜 갔습니다.
- **수정:** 홈 두 섹션만 머리↔카드 간격을 `gap-5`(20px)로 했습니다. 이유는 주석으로 남겼습니다. 말풍선을 옮기는 다른 방법은 모두 기존 계약에 막힙니다. 왼쪽에 두면 등락%를, 아래에 두면 ThemeCard 「평균 등락」을 가리는데, 둘 다 기존 테스트가 금지합니다. copy-text-button 은 공유 컴포넌트이기도 합니다. 테마 페이지는 말풍선이 없어서 D4 의 8px 그대로입니다.
- **확인:** 개별 급등은 home.spec 통과로, 주도 테마(ThemeCard)는 임시 측정 spec 에서 겹침 없음(hit:false, 5.25px 여유)으로 확인했습니다.
- **D4 와의 차이:** must_haves 의 「제목 행과 내용 사이가 8px」은 테마 페이지에서만 그대로 지켜집니다. 홈은 20px 입니다. 목업 수치로 되돌리고 싶으면 말풍선 위치(copy-text-button)부터 다시 설계해야 합니다.
- **파일:** webapp/src/components/home/home-client.tsx
- **커밋:** `c7763e2`

그 밖에 추가 판단한 사항입니다.
- `/scanner` 래퍼의 `md:gap-6` 과 테마 루트의 `gap-6` 은 PAGE_WRAP(gap-4)로 통일했습니다. 플랜에서 지정한 교체 그대로입니다.
- 테마 「내 테마」 개수는 로그인 상태이고 목록이 있을 때만, 시스템 개수는 로딩이 끝나고 목록이 있을 때만 보입니다. 빈 상태나 오류일 때 「0」 을 보이지 않으려는 것입니다.

## 파생 결정 한 줄 — /me stack
/me 는 900 폭이라 ≥1280 에서 계좌 카드를 2열로 두면 칸마다 표 영역이 약 419px 입니다. 미체결(439)·잔고(444) 최소폭보다 좁아 가로 스크롤이 생기므로 `AccountPanel stack` 으로 미체결 위·잔고 아래로 쌓았습니다. me.spec 케이스 7 에서 세로 배치와 두 표의 `scrollWidth ≤ clientWidth + 1` 을 확인해 통과했습니다.

## 범위 밖 선재 사항
- 실패는 없었습니다. 전체 vitest 의 skipped 1건은 원래 있던 것입니다.
- 다른 세션의 미커밋 파일(.planning/ROADMAP.md · STATE.md · state.json · phase 21 PLAN 초안 · tasks/lessons.md)은 건드리지도 stage 하지도 않았습니다.

## 후속 메모
- `webapp/src/components/orderbook/account-panel.tsx` 의 `stack` props 주석에 있는 「기본(false)은 My page 규율인 2열(477/477)이다」는 이제 맞지 않습니다. My page 가 stack 을 넘기기 때문입니다. 파일 소유 범위 밖이라 이번에는 고치지 않았습니다.
- 홈 1280 라이트 스크린샷에서 시점 슬라이더 트랙이 옅게 보입니다. 이번에 손대지 않은 슬라이더 행의 기존 모습이라 변경하지 않았습니다.

## Known Stubs
없습니다.

## Threat Flags
없습니다. 뒤로가기 fallback 은 파일 상수 `'/search'` 하나이고(T-o2u-01), page-header 단위 테스트 4 가 `push('/search')` 로 고정합니다. 새 네트워크나 인증 표면은 없습니다.

## Self-Check: PASSED
- FOUND: webapp/src/components/layout/page-layout.ts · page-header.tsx · __tests__/page-header.test.tsx
- FOUND commits: 782f55d · e27ff0d · c7763e2 (`git rev-list --count aba7954..HEAD` = 3)
