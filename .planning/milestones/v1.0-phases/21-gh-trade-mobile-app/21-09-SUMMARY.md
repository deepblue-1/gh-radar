---
phase: 21-gh-trade-mobile-app
plan: 09
subsystem: webapp-brand-me-account
tags: [nextjs, react, brand, me, account, theme, next-themes, playwright]
status: complete

requires:
  - phase: 21-05
    provides: "e2e 픽스처 installNativeApp (앱 모드 재현)"
  - phase: 21-06
    provides: "앱 본문 safe-area · 하단 108 (AppShell 경유 자동 적용)"
  - phase: 21-07
    provides: "MeClient useNativeRefresh(probeNow) — 무변경 유지"
provides:
  - "브랜드 표시명 GH Trade — 문서 title · 헤더 로고 텍스트 · 로고 링크 aria-label 「GH Trade 홈」 · 로그인 카드 제목 「GH Trade에 로그인」 · /design 카탈로그 (D-21)"
  - "webapp/src/components/me/account-card.tsx — AccountCard (/me 계정 카드 A · data-slot=\"account-card\")"
  - "MeClient — 제목 아래 계정 카드(정상 경로) · DMA 게이트 경로에도 카드 표시"
  - "e2e/specs/brand-account.spec.ts (MOBILE-01i · MOBILE-01h)"
affects: [21-16]

actuals:
  tokens: 6200
  tasks: 3
  commits: 5
plan_head_before: c1fab176a570f221598c163785735936570a8f68

tech-stack:
  added: []
  patterns:
    - "계정 카드 버튼은 카드(--card) 안 컨트롤이라 --muted 면을 그대로 쓴다 — 21-08 의 라이트 --muted = --surface 소실 함정은 본문면 위 컨트롤에만 해당"
    - "테마 아이콘은 「누르면 갈 곳」(다크=Sun · 라이트=Moon, D-08a) — 사이드바 ThemeToggle(현재 상태 아이콘)과 의미가 다르며 각자 계약대로 둔다"

key-files:
  created:
    - webapp/src/components/me/account-card.tsx
    - webapp/src/components/me/__tests__/account-card.test.tsx
    - webapp/e2e/specs/brand-account.spec.ts
  modified:
    - webapp/src/app/layout.tsx
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/app/login/page.tsx
    - webapp/src/app/design/page.tsx
    - webapp/src/app/design/_sections/layouts.tsx
    - webapp/src/components/layout/__tests__/app-shell-chrome.test.tsx
    - webapp/src/components/trading/me-client.tsx

key-decisions:
  - "D-21 은 노출 문자열만 — gh-radar: localStorage 키 · [gh-radar] 로그 접두 · @gh-radar/* 패키지 · e2e@gh-radar.local · google-client-ids.ts 주석의 GCP 프로젝트명 `gh-radar`(실제 리소스 이름)는 그대로"
  - "계정 카드 아래 16 여백 = me-page 컨테이너 gap 12(--s-3) + 래퍼 mb-1 4. 게이트 경로는 gap-4 래퍼로 카드 + DmaGate"
  - "e2e 는 로그아웃 버튼을 누르지 않는다 — storageState 세션이 서버에서 폐기돼 이후 spec 이 깨진다. 클릭 → signOut 은 단위 테스트가 잠근다"

patterns-established:
  - "D-21 grep 게이트: `grep -rn gh-radar webapp/src` 결과가 저장 키 · 로그 접두 · 패키지 import · 테스트 픽스처 · 인프라 식별자 주석뿐인지 확인"

requirements-completed: []

duration: 25min
completed: 2026-09-26
---

# Phase 21 Plan 09: 브랜드 GH Trade · `/me` 계정 카드 A Summary

**사용자에게 보이는 이름을 전부 「GH Trade」로 바꿨다(저장 키·패키지명은 그대로). `/me` 제목 아래에는 아바타·이름·이메일과 테마/로그아웃 아이콘 버튼이 있는 72px 계정 카드 A 를 올렸고, 이 카드는 DMA 게이트 화면에서도 보인다.**

## Performance

- **Duration:** 약 25분
- **Completed:** 2026-09-26
- **Tasks:** 3/3
- **Files modified:** 10 (신규 3 · 수정 7)

## Accomplishments

- **D-21 브랜드:** 교체한 곳은 `layout.tsx` title · `app-header.tsx` 로고 텍스트, `aria-label`, 머리 주석 · `login/page.tsx` 카드 제목 · `design/page.tsx` title과 본문 · `design/_sections/layouts.tsx` 2곳. `app-shell-chrome.test.tsx` ③ 이 헤더 로고와 링크 이름을 단언한다.
- **D-08 · D-08a 계정 카드 `AccountCard`:** 수치는 `--card` radius 16 · padding 14/16 · min-h 72 · 아바타 44 · 이름 16/700 · 이메일 12.5 muted · 40×40 radius 12 `--muted` 버튼 2개(테마 · `--up` 로그아웃). 아바타 폴백 체인(avatar_url → 이메일 이니셜, 실패 시 이니셜 고정)은 `UserSection` 과 같고, 테마 해석(mounted 가드)은 `ThemeToggle` 과 같다.
- **MeClient 배치:** 정상 경로에서는 header 바로 다음에 카드가 오고, 게이트 경로에서는 카드 다음에 DmaGate 가 온다. 상태줄 → 전략 현황 → 계좌 카드 → 오늘 주문 순서와 `useNativeRefresh(probeNow)` 는 바꾸지 않았다. 사이드바 `UserSection` · `ThemeToggle` 도 무변경이다.
- **e2e `brand-account.spec.ts`:** 3케이스 모두 통과한다. 내용은 title · 로고 · 링크 이름 · 저장 키 접두 / `/me` 카드 이메일 · 테마 두 번 토글 · 로그아웃 버튼 존재 / 앱 모드 390 에서 사이드바 없이 카드가 뷰포트 안에 들어오는지.

## Task Commits

1. **Task 1: 브랜드 표시명 GH Trade (D-21)**
   - `ab365db` test — 헤더 단언 실패 테스트(RED, 단언 실패)
   - `76d6bff` feat — 6곳 교체(GREEN)
2. **Task 2: `/me` 계정 카드 A (D-08 · D-08a)**
   - `818ed5a` test — AccountCard 실패 테스트(RED)
   - `cf4cce1` feat — AccountCard + MeClient 배치(GREEN)
3. **Task 3: e2e brand-account.spec.ts** — `55b1fa7` test

## Verification

- 단위: `app-shell-chrome.test.tsx` 4/4 · `account-card.test.tsx` 9/9 · `me-client.test.tsx` 7/7
- 전체 webapp 단위: **118 files · 2228 passed · 1 skipped**
- typecheck(`tsc --noEmit && tsc -p tsconfig.e2e.json`): 0 errors · eslint(`src/components/me`, `me-client.tsx`): clean
- e2e: `brand-account.spec.ts` 3/3. 회귀 확인용으로 `me` · `native-shell` · `auth-guards` · `a11y` · `smoke` · `sidebar-tree` · `auth-session` 을 돌렸고 53/53 통과했다(`/me` a11y 스캔에 새 카드도 포함된다).
- 브랜드 grep: `webapp/src` 와 `webapp/e2e` 에서 노출용 `gh-radar` 는 0건이다. 남은 것은 저장 키 · 로그 접두 · 패키지 import · 픽스처 이메일 · `google-client-ids.ts` 주석의 GCP 프로젝트명(인프라 식별자)뿐이다.
- 시각 확인: `/me` 를 360 · 390(앱 모드) · 1280 × 라이트/다크 로 스크린샷을 찍었다. 카드 한 줄 정렬 · 이메일 truncate 여유 · 버튼 면 대비 · 카드 아래 16 여백 모두 정상이었고, 고칠 결함은 없었다.

## TDD Gate Compliance

- Task 1: RED `ab365db` 는 단언 실패(`expected … to contain 'GH Trade'`, 1 failed / 3 passed)다 → GREEN `76d6bff`.
- Task 2: RED `818ed5a` 시점의 실패 원인은 모듈 부재(import 해석 실패)였다. 단언 수준 RED 증거를 사후에 따로 확보했다 — `AccountCard` 를 `return null` 스텁으로 잠시 바꿔 돌리자 **8 failed / 1 passed**(user 부재 null 케이스만 통과)였다. 이후 파일을 원복했고 커밋하지 않았다. GREEN 은 `cf4cce1` 이다.
- REFACTOR: 필요 없음.

## Deviations from Plan

None - plan executed exactly as written.

(참고 1: 플랜에 없던 것을 두 가지 더했다. `me-client.tsx` 머리 주석 ① 에 「계정 카드는 세로 순서 위에 얹힌 것」 한 줄, 그리고 테스트 식별용 `data-slot="account-avatar-initial"` 이다. 둘 다 동작 변화는 없다.)

(참고 2: 사이드바 `ThemeToggle` 은 **현재** 테마 아이콘(라이트=Sun)을 보이고, 계정 카드는 D-08a 대로 **전환될** 테마 아이콘(라이트=Moon)을 보인다. 데스크톱에서는 두 아이콘이 한 화면에 반대로 보인다. 두 컴포넌트 모두 각자의 계약대로 동작하는 것이고 이 플랜의 범위는 카드뿐이라 사이드바는 손대지 않았다. 통일 여부는 21-16 UAT 에서 판단하면 된다.)

## Known Stubs

None.

## Threat Flags

None. 새 네트워크 경로는 없다. 로그아웃은 기존 `signOut` 을 재사용하고, 아바타는 `UserSection` 과 같은 외부 이미지 경로(T-21-34 accept)다. T-21-21 은 저장 키를 유지하고 e2e 에서 `gh-trade:` 접두 키가 없음을 단언하는 것으로 완화했다.

## Next Phase Readiness

- 브랜드와 계정 카드는 웹·앱 공통이라 push 하는 즉시 브라우저 사용자에게도 보인다. push 는 21-16 게이트에서 한다(이 플랜에서는 push 하지 않았다).

## Self-Check: PASSED

- 파일 3개(account-card.tsx · account-card.test.tsx · brand-account.spec.ts) 존재
- 커밋 5개(ab365db · 76d6bff · 818ed5a · cf4cce1 · 55b1fa7) 존재 · plan_head_before..HEAD = 5
