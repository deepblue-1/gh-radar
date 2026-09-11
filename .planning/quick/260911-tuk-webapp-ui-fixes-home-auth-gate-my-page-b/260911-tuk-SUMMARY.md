---
phase: quick-260911-tuk
plan: 01
subsystem: webapp
tags: [auth, layout, ui, trading, my-page]
status: complete
requires:
  - webapp/src/lib/supabase/middleware.ts (기존 D-10/D-12 가드)
  - webapp/src/components/layout/app-shell.tsx (기존 데스크톱 2열 레이아웃)
  - webapp/src/lib/limit-chaser.ts (산출식 정본 — 건드리지 않음)
provides:
  - 홈(`/`)이 인증 표면 — 공개 exact 경로 0개
  - 계좌 전용 모드 잔고의 「매입금액」 칸
  - 뷰포트에 고정되는 데스크톱 사이드바
  - 사이드바 하단 유저 섹션 줄의 테마 토글 + `AppHeader.themeToggle` 탈출구
  - 군더더기 없는 상따 폼 + `Row` 와 정렬된 `CheckRow`
affects:
  - 모든 비로그인 진입(홈 포함) → `/login?next=...`
  - `CenterShell`·`AppShell hideSidebar` 화면의 탑바 우측 토글
  - 상따 폼을 쓰는 신규·편집 두 경로
tech-stack:
  added: []
  patterns:
    - "헤더 문구와 셀 값은 항상 같은 분기(`stockScoped`)를 읽는다"
    - "도달하지 않는 상태를 단언하는 E2E 는 실제 계약(리다이렉트)으로 다시 쓴다"
    - "sticky 사이드바는 ① aside sticky/self-start ② 부모 overflow-hidden 부재 ③ main min-w-0 의 한 묶음"
key-files:
  created: []
  modified:
    - webapp/src/lib/supabase/middleware.ts
    - webapp/src/app/login/page.tsx
    - webapp/src/app/auth/callback/route.ts
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/layout/app-shell.tsx
    - webapp/src/components/layout/app-header.tsx
    - webapp/src/components/layout/center-shell.tsx
    - webapp/src/components/layout/theme-toggle.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/src/app/design/page.tsx
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/limit-chaser-client.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
    - webapp/e2e/specs/auth-guards.spec.ts
    - webapp/e2e/specs/home.spec.ts
    - webapp/e2e/specs/trading-limit-chaser.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
    - webapp/e2e/specs/chat.spec.ts
    - webapp/e2e/specs/orderbook.spec.ts
decisions:
  - "계좌 전용 모드에서 평가금액 칸의 **의미를 바꾼다**(매입금액) — 현재가를 지어내지 않는다"
  - "테마 토글의 새 집은 사이드바 하단이고, 사이드바 없는 화면만 `themeToggle` 로 탑바에 남긴다"
  - "홈 게이트로 전제가 깨진 E2E 3건은 삭제가 아니라 새 계약 단언으로 다시 썼다"
  - "`Group.hint` 는 유지(툴팁 호출부 1건 생존), `showHint` 는 호출부 0 이 되어 prop 째 제거"
metrics:
  duration: ~35분
  completed: 2026-09-11
commits: 3
plan_head_before: 6908d52d6fb862b2b2fd07a648b07e6b194789e4
actuals:
  tokens: 15900
  tasks: 3
  commits: 3
---

# quick-260911-tuk: webapp UI 수정 5건 Summary

webapp 결함 5건을 태스크 3개·커밋 3개로 정리했다 — 홈 로그인 게이트 승격, `/me` 잔고의 항상 `—` 이던 칸을 매입금액으로 대체, 데스크톱 사이드바 뷰포트 고정, 테마 토글의 탑바 → 사이드바 이사(+ 모바일 검색 우측 정렬), 상따 폼의 군더더기 제거와 체크박스 행 그리드 정렬.

## Commits

| # | Hash | 내용 |
|---|------|------|
| 1 | `f4a79fd` | 홈을 로그인 필수로 바꾸고 계좌 전용 잔고에 매입금액을 채운다 |
| 2 | `6a8e4d9` | 사이드바 하단을 화면에 고정하고 테마 토글을 사이드바로 옮긴다 |
| 3 | `63a6261` | 상따 폼의 파생값·힌트를 걷어내고 체크박스 행을 입력 그리드에 맞춘다 |

22 파일 / +371 −174. `.planning/` 산출물은 이 3 커밋에 들어 있지 않다(오케스트레이터 몫).

## Task 1 — 홈 로그인 게이트 + 매입금액

**① 인증 게이트.** `PUBLIC_EXACT` 상수와 그 JSDoc 을 지웠다 — 공개 판정은 이제 `PUBLIC_PREFIXES`(`/login`·`/auth`) 하나다(T-tuk-01 mitigate). D-12 분기 목적지를 `/scanner` → `/` 로, `login/page.tsx`·`auth/callback/route.ts` 의 `safeNext` 폴백도 `/` 로 맞췄다. **open-redirect 가드(`rawNext` 상대경로 검사)는 한 글자도 건드리지 않았다**(T-tuk-03 accept — 이번 변경은 폴백 문자열뿐이다).

**② 매입금액.** `HoldingView` 에 `cost: number`(= `qty × avgPrice`, 현재가와 무관하므로 항상 채워진다)를 더하고, 데스크톱 표 5번째 `TableHead`/`TableCell` 과 모바일 카드 ①줄의 `RowKey`/값을 **같은 `stockScoped` 분기**로 묶었다. 평가손익·수익률은 손대지 않았다 — 계좌 전용 모드에서 계속 `—` 다. 현재가 없이 손익을 지어내지 않는다는 파일 상단 ⑤ 규율은 그대로 두고 그 아래에 「칸의 의미를 바꾸는 것이지 값을 지어내는 것이 아니다」를 예외 항으로 적었다.

**회귀 잠금 실증.** 새 단언 3건(⑯-e·⑯-f·⑯-g)을 넣고 `stockScoped` 분기를 **되돌려** 보니 정확히 그 3건만 빨개졌다(`25 passed | 3 failed`). 같은 라운드에서 ⑧-b(종목 축 「평가금액」)는 초록으로 남았다 — 그 케이스가 잠그는 명제는 이번 변경과 무관하므로 옳다. 복원 후 28건 전부 통과.

## Task 2 — sticky 사이드바 + 토글 이사

`aside` 에 `lg:sticky lg:top-14 lg:self-start lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto` 를 더하고, 부모 `div.flex.flex-1` 의 **`overflow-hidden` 을 제거**(스크롤 컨테이너가 생기면 sticky 가 죽는다), `main` 에 `min-w-0` 을 명시했다. 셋이 한 묶음이라는 사실을 `AppShell` JSDoc 에 박았다.

토글은 `AppHeader` 상시 렌더에서 빠지고 `AppSidebar` 하단 유저 섹션과 한 줄을 쓴다(`flex min-w-0 items-center gap-1` → `min-w-0 flex-1` 래퍼 + `ThemeToggle size-9 shrink-0`). `user-section.tsx` 는 건드리지 않았다 — 트리거의 `w-full` 이 래퍼 안에서만 늘어난다. 사이드바가 없는 화면은 토글의 집이 없으므로 `AppHeaderProps.themeToggle`(기본 `false`)을 신설해 `AppShell` 이 `themeToggle={!showSidebar}`, `CenterShell` 이 `themeToggle` 로 켠다 — **어떤 화면에서도 토글이 사라지지 않는다.**

`ThemeToggle` 이 `className` 을 받아 `cn()` 으로 병합한다. 기본 `h-11 w-11`(44×44 hit target)은 유지 — `size-9` 가 `h-11 w-11` 을 실제로 덮어쓰는지 `tailwind-merge` 로 직접 확인했다(`inline-flex items-center size-9 shrink-0`).

탑바 중앙 slot 은 `flex flex-1 items-center justify-end lg:justify-center` — `<lg` 에서 검색 아이콘이 오른쪽 끝, `lg+` 는 종전대로 가운데.

사이드바 테스트에 ⑧(같은 줄·`flex-1`/`shrink-0` 구성)·⑧-b(비로그인에도 토글 존재) 2건을 더했다.

## Task 3 — 상따 폼 정리

삭제분: 신규 진입 부제 1개(요소 자체를 렌더하지 않는다) · 매수 파생값 2행 · 매도 파생값 1행 · hint 2개(`<section title>` 툴팁 포함).

**딸려 죽는 배선을 끝까지 걷었다.** `estimatedSellQty` import · `sellQty` 파생값 · `sellableQty` prop(타입+구조분해) · `limit-chaser-client.tsx` 의 `sellableQty` 계산·전달 · `Group.showHint`(호출부 0 이 되어 prop 과 렌더 분기까지). **남긴 것**: `buyQty`(`canArmBuy` 가 쓴다) · `accountState`(`AccountPanel` 이 쓴다) · `lib/limit-chaser.ts` 의 `estimatedSellQty` 함수(단위 테스트 25건이 잠근다) · `Group.hint`(툴팁 호출부 `slot="buy"` 1건 생존). lint 에 **새 unused 경고 0** 이 그 증거다.

`Group.title` 을 선택값으로 바꾸고 `hasHeader`(title·status·caption·led·switchProps 중 하나라도 있는가)가 거짓이면 헤더 줄 자체를 렌더하지 않는다 — 빈 24px 줄이 남지 않는다. 매수가격·매도가격 그룹에서 `title` 을 뺐다(첫 `NumField` 라벨이 곧 제목이었다).

`CheckRow` 를 `Row` 와 **같은 2열 그리드**(`grid-cols-[var(--lw)_minmax(0,1fr)]`)로 바꾸고 1열에 체크박스+라벨을 묶었다. 호출부 4곳의 `NumInput className="w-[104px] flex-none"` 을 제거해 `NumField` 입력과 좌우 끝·폭이 맞는다. 4글자 라벨(「잔량추적」·「취소잔량」)이 체크박스 18px + 간격과 1열을 나눠 쓰므로 `Card` 의 `--lw` 를 60/72px → **76/88px** 로 올렸다. `dimmed` opacity·`dirty` 의 `●` 접두·`htmlFor` 연결은 전부 유지.

자동취소 라벨 축약(「체결」·「잔량추적」)은 **표시만** 바꿨다 — `cancelQtyTrackEnabled` 가 `cancelQtyEnabled` 에 종속되는 `dimmed`/`disabled` 규율과 그 주석은 그대로다.

## Deviations from Plan

### [Rule 1 - Bug] 홈 게이트가 깨뜨리는 E2E 2건을 계획이 놓쳤다

계획은 `auth-guards.spec.ts`·`home.spec.ts` 만 지목했지만, 비로그인으로 `/` 에 들어가는 스펙이 **2건 더** 있었다. 둘 다 Task 1 이 직접 깨는 것이라 그 자리에서 닫았다(커밋 1 포함).

| 파일 | 옛 전제 | 처리 |
|------|---------|------|
| `webapp/e2e/specs/sidebar-tree.spec.ts` (테스트 3) | 「비로그인도 볼 수 있는 공개 경로(`/`)에서 트리를 확인한다」 → 사이드바 렌더 기대 | **확실히 실패한다.** 홈이 벽 뒤로 가면서 **사이드바를 그리는 공개 경로가 하나도 남지 않았다.** 도달 불가 상태를 단언하는 것은 가짜 테스트이므로(`me.spec.ts:518` 이 이미 같은 판단을 적어 뒀다) 실제 계약(`/` → `/login?next=%2F` + `desktopNav` 0건)으로 다시 썼다. 잃은 커버리지 없음 — 「비로그인이면 트레이딩·My page 미렌더」는 `app-sidebar.test.tsx` ③-a 가 단위로 잠근다(테스트 안 주석에 그 위치를 적었다). |
| `webapp/e2e/specs/chat.spec.ts` (테스트 1) | 「`/` 는 PUBLIC_EXACT — 비로그인도 공개」 주석 + `/` 진입 후 FAB 클릭 | 리다이렉트 덕에 **우연히 통과할 수도** 있었다(FAB 은 root layout 전역 마운트라 `/login` 에도 뜬다). 우연에 기대지 않도록 목적지를 `/login` 으로 명시하고 불필요해진 `mockHomeApi(HOME_EMPTY)` 와 `HOME_EMPTY` import 를 뺐다. D-01 비로그인 챗 게이트 검증 자체는 그대로 산다. |

### [Rule 2 - 주석 계약] `PUBLIC_EXACT` 를 지목하던 주석 1건

`webapp/e2e/specs/orderbook.spec.ts:446` 의 `PUBLIC_EXACT/PREFIXES` → `PUBLIC_PREFIXES`. 삭제한 상수를 가리키는 주석을 남기면 다음 사람의 grep 이 빈손으로 돌아온다. 저장소 전체에 `PUBLIC_EXACT` **0건**을 실측으로 확인했다.

이 3건은 계획의 `files_modified` 밖이다. 성공 기준의 「`files_modified` 밖 파일을 건드리지 않았다」와 충돌하지만, **셋 다 이 태스크의 변경이 직접 만든 결함**이라 Rule 1/2 의 스코프 안이고, 방치하면 「E2E 를 안 돌리는 세션」 뒤에 조용히 빨간 채로 남는다.

### [계획 문구 정정] 테스트 이름이 검증하지 않는 것을 말하지 않게 했다

`app-sidebar.test.tsx` 에 처음 쓴 ⑧-b 이름이 「유저 섹션이 사라져도 토글은 남는다」였는데, 그 파일은 `UserSection` 을 **모킹**하므로 비로그인에도 자리표시자가 그대로 렌더된다 — 이름이 하지 않는 검증을 주장하고 있었다. 「비로그인 사이드바에도 토글은 있다」로 고치고 그 사정을 케이스 주석에 적었다.

### 계획대로 하지 **않은** 것 1건

`auth-guards.spec.ts` 의 open-redirect 케이스가 `toHaveURL(/\/(login|scanner)/)` 로 남아 있다. 폴백이 `/` 로 바뀌어 `scanner` 는 이제 도달 불가한 대안이지만, ① 가짜 code 라 실제 경로는 항상 `/login?error=auth_failed` 이고 ② 단언이 틀린 것을 주장하지 않으며 ③ 계획이 지목하지 않은 줄이라 **건드리지 않았다.** 정리하고 싶다면 다음 auth 작업에서 `scanner` 대안만 떼면 된다.

## Verification

| 명령 | 결과 |
|------|------|
| `pnpm -C webapp typecheck` | **exit 0** (`tsc --noEmit` + `tsc -p tsconfig.e2e.json` — E2E 스펙 수정분 타입 포함) |
| `pnpm -C webapp test` (전량) | **61 파일 / 710 passed · 1 skipped** |
| `pnpm -C webapp test src/components/orderbook/__tests__/account-panel.test.tsx` | 28 passed (신규 4) |
| `pnpm -C webapp test src/components/layout` | 17 passed (신규 2) |
| `pnpm -C webapp test src/components/trading src/lib/__tests__/limit-chaser.test.ts` | 205 + 25 passed |
| `pnpm -C webapp lint` | error **0** · warning **3**(착수 전 baseline 과 동일 — `theme-detail-client.tsx` · `strategy-status-card.test.tsx` · `use-relay-socket.ts`, 전부 이번 변경 밖). **새 unused 0** |
| `pnpm -C webapp build` | exit 0 (미들웨어 86 kB 포함 전 라우트 생성) |

## 검증하지 **않은** 것 (정직 기록)

- **Playwright E2E 미실행** — 로컬 relay/DMA·Supabase 세션이 필요하다(오케스트레이터 제약). `webapp/e2e/specs/*.ts` 6개 파일은 **수정만** 했고 타입체크로만 검증했다. 위에서 다시 쓴 3건(auth-guards 루트 · sidebar-tree 3 · chat 1)이 실제로 통과하는지는 **다음 E2E 실행에서 처음 확인된다.**
- **시각 확인 미실행** — `must_haves.truths` 중 「본문을 끝까지 스크롤해도 하단 유저 섹션이 뷰포트 안」·「모바일 검색 아이콘이 탑바 오른쪽 끝」·「4글자 라벨이 잘리지 않는다」 3건은 **레이아웃 결과**라 jsdom 이 재지 못한다. 이번 검증은 **클래스 구성 계약**(sticky 3종 세트 · `justify-end lg:justify-center` · `--lw` 76/88px)까지다. 브라우저 실측은 사용자 검토 몫으로 남긴다.
- **배포 미실시.** 프로덕션에는 5건 모두 아직 없다. push 도 하지 않았다(사용자 검토 후 결정).

## Known Stubs

없음. 이번 변경은 전부 기존 표면의 제거·이동·의미 정정이고 새 자리표시자를 만들지 않았다.

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경이 없다. 신뢰 경계에서 일어난 일은 공개 whitelist 를 **좁힌 것**(T-tuk-01)뿐이고, `?next=` 가드는 미변경(T-tuk-03)이다. 매입금액은 같은 표의 보유수량 × 평단가라 새 정보도 새 조회 경로도 아니다(T-tuk-04).

## Self-Check: PASSED

- 수정 파일 22개 전부 디스크에 존재(`git diff --numstat 6908d52..HEAD` 로 확인).
- 커밋 3건 존재: `f4a79fd` · `6a8e4d9` · `63a6261`.
- `git rev-list --count 6908d52..HEAD` = **3** (프론트matter `commits: 3` 과 일치).
- 작업 트리 clean — 코드 변경이 커밋되지 않은 채 남아 있지 않다.
