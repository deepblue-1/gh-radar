---
phase: 16-trading-limit-chaser-vi-my-page
plan: 11
subsystem: ui
tags: [nextjs, app-router, react, tailwind, playwright, vitest, rtl, a11y, relay-wss]

# Dependency graph
requires:
  - phase: 16-09
    provides: "전역 relay 컨텍스트(`RelayProvider`/`useRelayContext`) — status · limitChasers · viTrigger · account"
  - phase: 16-07
    provides: "relay `unauthorized` 게이트와 인증 직후 전략 스냅샷 3프레임(lc.snap · vi · vi.list)"
  - phase: 06.2
    provides: "AppShell/AppSidebar · middleware 로그인 벽 · `data-nav-item` drawer 자동 닫힘 계약"
provides:
  - "사이드바 2단 그룹 트리 + 3단 전략 목록 + 조건부 숨김 (NAV-01)"
  - "`strategy-badge.tsx` — 상태 배지 6종 + 거래소 태그 2종의 단일 정의 지점 (순수 함수 3개)"
  - "`dma-gate.tsx` — 3표면 공용 게이트 + `useDmaGateReason()` 판정 훅"
  - "`surface-placeholder.tsx` — 후속 plan 이 걷어낼 자리표시 본문"
  - "라우트 5개: `/trading/limit-chaser{,/new,/[key]}` · `/trading/vi` · `/me`"
  - "자리표시 클라이언트 3개(`limit-chaser-client` · `vi-client` · `me-client`) — 16-13~16-15 가 내용을 채운다"
  - "「스캐너」 → 「상승률 상위」 전 표면 라벨 통일 (URL 불변)"
affects: [16-12, 16-13, 16-14, 16-15, 16-16, 16-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "조건부 숨김 래치(`everReady`) — 숨긴 채로 시작하고 재접속으로는 내리지 않는다"
    - "게이트 판정 훅을 한 곳에(`useDmaGateReason`) — 확정 신호(`unauthorized`)에만 반응"
    - "배지 매핑을 순수 함수로 분리(`strategyBadgesOf`/`viBadgeOf`/`exchangeBadgeOf`)"
    - "E2E 에서 Radix 개폐는 `data-state` 로 단언 — `toBeVisible` 은 exit 애니메이션 중 헛통과"

key-files:
  created:
    - webapp/src/components/trading/strategy-badge.tsx
    - webapp/src/components/trading/dma-gate.tsx
    - webapp/src/components/trading/surface-placeholder.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/vi-client.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/app/trading/limit-chaser/page.tsx
    - webapp/src/app/trading/limit-chaser/new/page.tsx
    - webapp/src/app/trading/limit-chaser/[key]/page.tsx
    - webapp/src/app/trading/vi/page.tsx
    - webapp/src/app/me/page.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/components/trading/__tests__/strategy-badge.test.tsx
    - webapp/e2e/specs/sidebar-tree.spec.ts
  modified:
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/e2e/specs/auth-guards.spec.ts

key-decisions:
  - "조건부 숨김에 `everReady` 래치를 둔다 — 재접속 중에 이미 뜬 트레이딩 그룹을 내리지 않는다. `use-relay-socket.ts` 가 close 시 데이터를 지우지 않고 `isStale` 만 세우는 규율(「데이터를 지우지 않는다」)과 짝을 맞춘 것이고, 목록은 남아 있는데 메뉴만 사라지는 상태를 만들지 않는다."
  - "게이트는 확정 신호(`status === \"unauthorized\"`)에만 선다 — 연결 중(`connecting`/`logging_in`/`declaring`)에는 세우지 않아 게이트가 떴다 사라지지 않는다."
  - "사이드바 3단 종목명은 잔고·미체결·VI 주문에 실린 relay 역매핑 이름에서만 얻고 없으면 ISIN 을 보여준다 — 이름 하나 때문에 별도 조회 경로를 만들지 않는다(T-16-02)."
  - "UI-SPEC 게이트 본문 템플릿의 `{...}은` 을 은/는 자동 선택으로 바꿨다 — 원문 그대로면 「VI 자동매수은」이 나간다."
  - "「로그인 + 매핑 없음」 E2E 는 `auth-guards.spec.ts` 가 아니라 relay 를 이미 소유한 `sidebar-tree.spec.ts` 에 뒀다 — auth-guards 는 파일 전체에 쿠키 없는 context 를 강제하고, describe-레벨 override 는 그 파일 주석이 기록한 워커 재사용 경합을 되살린다."

patterns-established:
  - "그룹 소제목은 `<li>` + 시각 스타일만 — `A`/`BUTTON[data-nav-item]` 이 아니어야 drawer 가 오작동으로 닫히지 않는다"
  - "활성 판정은 정확 일치 + 인코딩 흡수(`samePath`) — 접두 일치는 3단 항목과 2단 항목의 활성 표시를 겹치게 한다"
  - "테스트가 첫 실행에 전부 green 이면 변이를 주입해 실효성을 실측한다(이 plan 에서 9종 주입, 9종 전부 검출)"

requirements-completed: [NAV-01, TRADE-01, TRADE-02, MYPAGE-01]

# Metrics
duration: 40min
completed: 2026-09-08
---

# Phase 16 Plan 11: 사이드바 트리 · 공용 컴포넌트 · 라우트 셸 Summary

**전역 relay 상태로 여닫히는 2단/3단 사이드바 트리와, 세 트레이딩 표면이 공유할 배지·게이트 컴포넌트 + 라우트 5개 셸을 세웠다 — 트리·조건부 숨김·drawer 동작을 RTL 28케이스와 E2E 7케이스로 잠갔다.**

## Performance

- **Duration:** 약 40분
- **Tasks:** 3
- **Files created:** 14 · **modified:** 20 (라벨 통일 포함)

## Accomplishments

- **사이드바 트리 재편** — 홈 · [종목검색] 상승률 상위/테마/관심종목 · [트레이딩] 상따(+전략 3단)/VI · My page · AI 애널리스트. 그룹 소제목은 `<li>` 라 클릭 대상이 아니고, 전략 3단은 종목명 + 매수/매도 원 아이콘 2개뿐이다(N3a).
- **조건부 숨김** — 비로그인 · `unauthorized` · 판정 전에는 트레이딩 그룹과 My page 를 **렌더하지 않는다**. 재접속 중에는 이미 뜬 그룹을 내리지 않아 양방향 깜빡임이 없다.
- **공용 컴포넌트 2개** — `strategy-badge`(배지 6종 + 거래소 태그, 순수 함수 3개 export), `dma-gate`(매핑 없음/비로그인 + `useDmaGateReason`).
- **라우트 5개** — 빌드 로그에 `/me` · `/trading/vi` · `/trading/limit-chaser{,/new,/[key]}` 전부 등장. `/trading/limit-chaser` 는 서버 `redirect`.
- **라벨 통일** — `webapp/src` 전역에서 「스캐너」 0건. URL 은 그대로다.

## Task Commits

1. **Task 1: 사이드바 트리 + 3단 전략 목록 + 조건부 숨김** — `2c77139` (feat)
2. **Task 2: strategy-badge · dma-gate + 라우트 셸 5개** — `f6f3bec` (feat)
3. **Task 3: sidebar-tree E2E 신규 + auth-guards 확장** — `2b2ffa7` (test)

## Files Created/Modified

- `webapp/src/components/layout/app-sidebar.tsx` — 트리·3단 목록·조건부 숨김·활성 판정
- `webapp/src/components/trading/strategy-badge.tsx` — 배지 6종 + 거래소 태그 단일 정의 지점
- `webapp/src/components/trading/dma-gate.tsx` — 3표면 공용 게이트 + 판정 훅
- `webapp/src/components/trading/surface-placeholder.tsx` — 자리표시 본문(후속 plan 이 걷어낸다)
- `webapp/src/components/trading/{limit-chaser,vi,me}-client.tsx` — 게이트 분기 + 제목/부제만
- `webapp/src/app/trading/limit-chaser/{page,new/page,[key]/page}.tsx`, `webapp/src/app/trading/vi/page.tsx`, `webapp/src/app/me/page.tsx` — 라우트 셸
- `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` — 14케이스
- `webapp/src/components/trading/__tests__/strategy-badge.test.tsx` — 14케이스
- `webapp/e2e/specs/sidebar-tree.spec.ts` — 7케이스
- `webapp/e2e/specs/auth-guards.spec.ts` — 트레이딩 3라우트 + `/trading/limit-chaser` 미인증 리다이렉트 4케이스 추가

## Decisions Made

위 frontmatter `key-decisions` 참조. 요지 3가지:

1. **깜빡임은 양방향으로 막는다.** UI-SPEC 은 「판정 전 숨김」만 명시했지만, 그대로 두면 재접속 때 메뉴가 사라진다. relay 가 close 시 전략 목록을 지우지 않으므로(「데이터를 지우지 않는다 — isStale 만 세운다」) 목록이 살아 있는데 메뉴만 없어지는 모순이 생긴다. `everReady` 래치로 해소하고, 로그아웃·`unauthorized` 는 래치를 되돌린다(권한 상실은 깜빡임이 아니다).
2. **게이트는 확정 신호에만.** `unauthorized` 만 게이트 사유로 쓴다. 연결 중 상태를 게이트로 읽으면 사이드바와 정반대 방향으로 깜빡인다.
3. **종목명은 이미 받은 프레임에서만.** `RelayLimitChaser` 에 종목명이 없다. 별도 API 를 만들지 않고 잔고·미체결·VI 주문의 relay 역매핑 이름을 훑어 쓰며, 없으면 ISIN 을 보여준다(`account-panel` 의 `name ?? isin` 규약과 동형).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] 조건부 숨김에 재접속 래치 추가**
- **Found during:** Task 1
- **Issue:** 계약을 문자 그대로 구현하면(`user != null && status === "ready"`) 재접속 중 트레이딩 그룹과 My page 가 사라진다. `use-relay-socket.ts` 는 같은 순간 전략 목록을 **지우지 않는데**(주석: 「데이터를 지우지 않는다 — isStale 만 세운다(UI-SPEC 깜빡임 금지)」) 메뉴만 사라져 두 규율이 어긋난다.
- **Fix:** `everReady` 래치 도입. 한 번 `ready` 를 본 뒤에는 로그아웃·`unauthorized` 전까지 유지한다.
- **Files modified:** `webapp/src/components/layout/app-sidebar.tsx`
- **Verification:** RTL `③-d 한 번 ready 였다면 재접속 중에도 내려가지 않는다`, 그리고 `③-a/b/c` 가 미렌더 3경로를 그대로 지킨다.
- **Committed in:** `2c77139`

**2. [Rule 1 - Bug] UI-SPEC 게이트 본문의 조사 오류 교정**
- **Found during:** Task 2
- **Issue:** UI-SPEC 템플릿이 `{상따 전략 / VI 자동매수 / 전략·잔고·미체결}은` 으로 조사를 고정해 **「VI 자동매수은」** 이라는 비문이 화면에 나간다.
- **Fix:** 한글 완성형 종성 계산(`(code - 0xAC00) % 28`)으로 은/는 선택. 한글이 아닌 끝문자는 「는」.
- **Files modified:** `webapp/src/components/trading/dma-gate.tsx`
- **Verification:** E2E `2b` 가 3라우트에서 게이트 본문을 실제로 읽는다.
- **Committed in:** `f6f3bec`

**3. [Rule 3 - Blocking] 라벨 통일의 소비자(E2E·RTL) 동반 수정**
- **Found during:** Task 1·3
- **Issue:** `grep -rn "스캐너" webapp/src` 0건 요구를 만족시키면 그 문구를 단언하던 spec 5개(`auth-session` · `watchlist` · `stock-detail` · `home`, RTL `not-found.test.tsx`)가 즉시 깨진다.
- **Fix:** 사용자 대면 문구를 「상승률 상위」 계열로 바꾸고 단언·주석을 같이 갱신. `layout.tsx` 의 메타 설명은 「상한가 근접 스캐너」 → 「상한가 근접 종목 탐색」(라벨을 그대로 끼우면 비문이 된다).
- **Files modified:** 위 spec 5개 + `mock-api.ts` 주석
- **Verification:** E2E 전량에서 해당 5개 spec 통과.
- **Committed in:** `2c77139`, `2b2ffa7`

**4. [Rule 3 - Blocking] 워크트리에 `@gh-radar/shared` dist 부재**
- **Found during:** Task 1 (첫 RTL 실행)
- **Issue:** `Failed to resolve entry for package "@gh-radar/shared"` — 워크트리에 `packages/shared/dist` 가 없어 vitest 가 수집 단계에서 죽었다.
- **Fix:** `pnpm --filter @gh-radar/shared build`. 산출물은 gitignore 대상이라 커밋되지 않는다.
- **Verification:** 이후 전 테스트 정상 수집.

### 계획 대비 작업 배치 변경 (스코프 변화 없음)

- **`strategy-badge.tsx` 를 Task 2 가 아니라 Task 1 커밋에 넣었다.** 사이드바 VI 항목 배지(N7)가 이 컴포넌트의 소비자다. Task 1 에서 배지 시각을 임시로 복제했다가 Task 2 에서 지우면, 이 파일이 존재하는 이유인 「단일 정의 지점」을 잠깐이나마 두 벌로 만드는 셈이라 순서를 당겼다. 단위 테스트는 Task 2 커밋에 있다.
- **자리표시 클라이언트 4개를 추가로 만들었다** (`surface-placeholder` + `{limit-chaser,vi,me}-client`). 플랜 `files_modified` 에는 page.tsx 만 있으나, 본문에 「자리표시 클라이언트를 두고 다음 plan 이 교체한다」가 명시돼 있고 16-13/16-14/16-15 의 `files_modified` 가 정확히 이 파일명을 예약해 두었다.
- **「로그인 + 매핑 없음」 게이트 E2E 의 배치처를 바꿨다.** 플랜은 `auth-guards.spec.ts` 확장을 지시했으나, 그 파일은 **파일-레벨 `storageState` 로 쿠키 없는 context 를 강제**하고 그 이유(워커 재사용 경합)가 파일 주석에 남아 있다. 게이트 케이스는 로그인 세션 + 로컬 relay 가 둘 다 필요하므로 relay 를 이미 소유한 `sidebar-tree.spec.ts` 에 `2b` 로 넣고, `auth-guards` 에는 그 파일의 목적에 맞는 **미인증 리다이렉트 4케이스**를 넣었다. 두 spec 모두 exit 0.

---

**Total deviations:** 4 auto-fixed (1 missing critical, 1 bug, 2 blocking) + 작업 배치 변경 3건
**Impact on plan:** 스코프 확대 없음. 4건 모두 계약 준수 또는 진행 차단 해소이며, 배치 변경 3건은 파일 총량·최종 상태가 플랜과 같다.

## Issues Encountered

**테스트가 첫 실행에 전부 통과했다 — 변이 9종을 주입해 실효성을 실측했다.**

| # | 주입한 변이 | 검출 |
|---|-------------|------|
| 1 | `encodeURIComponent` 제거 | RTL ④ 실패 |
| 2 | 그룹 소제목을 `<button data-nav-item>` 으로 | RTL ① 실패 |
| 3 | `samePath` 를 접두 일치로 | RTL `/scanner` 하위 경로 케이스 실패 |
| 4 | 「상따」 활성을 `/trading/limit-chaser` 접두 일치로 | RTL ⑤ 실패 |
| 5 | 조건부 숨김 제거(항상 노출) | RTL ③-a/b/c 3건 실패 |
| 6 | 개별 원 아이콘에 `aria-label` 부여 | RTL ④ 실패 |
| 7 | `hadOrder` 무시(항상 「발주됨」) | 배지 6건 실패 |
| 8 | 매도 배지 우선순위 뒤집기 | 배지 1건 실패 |
| 9 | 소제목을 `data-nav-item` 버튼으로 (E2E) | sidebar-tree 4 실패 |

추가로 middleware `PUBLIC_EXACT` 에 트레이딩 3라우트를 넣는 변이로 auth-guards 신규 3케이스가 전부 실패함을 확인했다(모든 변이는 확인 후 원복, `git diff` 무변화 검증).

**E2E 잘림 단언의 함정을 하나 실측했다.** drawer 가 소제목 클릭으로 닫히지 않는지 보는 단언을 처음에 `toBeVisible()` 로 썼는데, 변이 실험에서 **그 줄이 통과하고 다음 줄이 30초 타임아웃**으로 터졌다 — Radix 는 닫히는 동안 exit 애니메이션 때문에 노드를 남긴다. `data-state="open"` 단언으로 바꾸니 같은 변이가 6초 만에 명확한 assertion 실패로 잡힌다.

**선행 실패 3건은 손대지 않았다.** `a11y`(일봉 차트 스켈레톤의 `aria-prohibited-attr`) · `news`(목록 상한) · `search`(⌘K 다이얼로그 미출현). `app-sidebar.tsx` 를 `a43cabfd` 버전으로 되돌린 상태에서 **동일하게 재현**해 16-11 무관임을 확인하고 `deferred-items.md` 에 기록했다.

## Known Stubs

의도된 자리표시다. 16-13~16-15 가 각 클라이언트를 채우며 걷어낸다.

| 파일 | 내용 | 해소 plan |
|------|------|-----------|
| `webapp/src/components/trading/surface-placeholder.tsx` | 「이 화면은 준비 중이에요.」(`data-slot="surface-placeholder"`) | 16-13/14/15 |
| `webapp/src/components/trading/limit-chaser-client.tsx` | 게이트 분기 + 제목/부제만. 편집 제목이 `{종목명} · {거래소}` 가 아니라 `상따 · {거래소}` — 종목명 결선은 16-13 소관 | 16-13 |
| `webapp/src/components/trading/vi-client.tsx` | 게이트 분기 + 제목/부제만 | 16-14 |
| `webapp/src/components/trading/me-client.tsx` | 게이트 분기 + 제목/부제만 | 16-15 |

「불러오는 중」으로 위장하지 않았다 — 끝나지 않는 로딩은 새로고침을 유발하는 거짓말이라, 준비 중임을 명시하고 `data-slot` 표식으로 grep 가능하게 뒀다.

## Threat Flags

없음. 이 plan 이 만든 표면은 전부 읽기 전용 내비게이션·게이트이고, 새 네트워크 엔드포인트·인증 경로·스키마 변경이 없다. 전략 목록의 원천은 전역 wss 스냅샷 하나뿐이다(T-16-02 계획대로).

## User Setup Required

None.

## Next Phase Readiness

- **16-12~16-15 가 바로 쓸 수 있는 것:** `strategyBadgesOf`/`viBadgeOf`/`exchangeBadgeOf` · `<StrategyBadge>` · `<DmaGate>` + `useDmaGateReason()` · `limitChaserHref()`/`strategyIoLabel()` · 라우트 5개와 클라이언트 3개의 파일 자리.
- **16-13 이 이어받을 결선:** 편집 화면 제목의 종목명. `RelayLimitChaser` 에 종목명이 없어 사이드바는 잔고·미체결·VI 주문의 relay 역매핑 이름을 훑고 없으면 ISIN 으로 폴백한다. 같은 판단이 필요하면 `app-sidebar.tsx` 의 `useIsinNames()` 를 참고하거나 승격하면 된다.
- **주의:** `dma-gate` 는 권한 장치가 아니다. 실제 차단은 relay `unauthorized` 와 middleware 로그인 벽이고, 이 둘은 각각 sidebar-tree `2b` 와 auth-guards 가 잠갔다.

## Self-Check: PASSED

- 생성 주장 파일 16개 전부 디스크에 존재(라우트 5 · 컴포넌트 6 · 테스트 3 · 문서 2).
- 커밋 3개 전부 `git log` 에 존재: `2c77139` · `f6f3bec` · `2b2ffa7`.
- `pnpm typecheck` (13 workspace) exit 0 · `webapp` 단위 48파일 442통과/1스킵 · E2E `sidebar-tree`(7) + `auth-guards`(13) + `smoke` 20통과.
- `grep -rn "스캐너" webapp/src` 0건 · `grep -c "비활성" strategy-badge.tsx` 0 · `next build` 로 라우트 5개 생성 확인.
- 16-10 소관 파일(`relay-provider.tsx` · `order-panel.tsx` · `account-panel.tsx` · 그 테스트 · `orderbook.spec.ts`) **미수정** — `git diff --name-only a43cabfd HEAD` 로 확인.

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-08*
