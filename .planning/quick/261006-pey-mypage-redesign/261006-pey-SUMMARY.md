---
phase: quick-261006-pey
plan: 01
subsystem: webapp /me · 종목상세 탭 셸
status: complete
tags: [mypage, tabs, url-state, container-query, e2e]
requires: [sketch 013 변형 A · S1 (CONTEXT D-1 · D-2)]
provides:
  - "lib/use-url-tab.ts — ?tab= 탭 셸 정본(종목상세 3탭 · /me 4탭 공용)"
  - "/me 계정 카드 아래 4탭(현황 · 잔고 N · 주문 N · 설정)"
  - "설정 탭 상따 기본설정 S1 묶음 카드 4장(섹션 본문 ≥700 2열)"
affects: [webapp/src/components/stock/stock-detail-tabs.tsx, webapp/src/components/trading/me-client.tsx, webapp/src/components/trading/today-orders-card.tsx, webapp/src/components/me/limit-chaser-defaults.tsx]
tech-stack:
  added: []
  patterns: ["URL 단일 진실 탭 훅(useUrlTab) 공용화", "섹션 단위 named container query(@container/me)"]
key-files:
  created:
    - webapp/src/lib/use-url-tab.ts
  modified:
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/src/components/me/limit-chaser-defaults.tsx
    - webapp/src/components/me/__tests__/limit-chaser-defaults.test.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/e2e/specs/me.spec.ts
    - webapp/e2e/specs/a11y.spec.ts
    - webapp/e2e/specs/unfilled-progress.spec.ts
decisions:
  - "P-1 ?tab= 메커니즘을 lib/use-url-tab.ts 공용 훅으로 추출 — 종목상세 · /me 가 같은 코드(사본 없음)"
  - "P-4 설정 2열 판정은 섹션 루트 @container/me 700(뷰포트 아님 · 페이지 루트에 컨테이너 금지)"
  - "/me 탭 바는 공용 바 클래스의 좌우 bleed(-mx/px)를 끈다 — 900 열 안에서 기준선이 카드 밖으로 삐져나감(목업 A .tabs4 = 열 폭)"
metrics:
  duration: "약 35분"
  completed: 2026-10-06
actuals:
  tokens: 23600
  tasks: 3
  commits: 4
plan_head_before: 89928e335b07c0c70852f384e606ce16def3c540
plan_head_after: dbdaa7060e405fa396dc1bf6dd87867f163b16c2
---

# Quick 261006-pey: /me 마이페이지 4탭 + 설정 S1 묶음 카드 Summary

/me 를 계정 카드 아래 `?tab=` 4탭(현황 · 잔고 N · 주문 N · 설정)으로 나누고, 그 탭 메커니즘을 종목상세에서 `lib/use-url-tab.ts` 공용 훅으로 뽑아 두 화면이 같은 코드를 쓰게 했으며, 설정 탭의 상따 기본설정을 묶음 카드 4장(섹션 본문 ≥700 2열)으로 바꿨다.

## 커밋

| Task | 커밋 | 내용 |
|------|------|------|
| 1 (트레이서) | `7596a83e` | feat — `?tab=` 공용 훅 · 종목상세 훅 소비 · /me 4탭 셸(MeTabs · Suspense) · 잔고/주문 라벨 건수 · me-client B1~B6 |
| 2 | `e7b72a9e` | feat — 설정 탭 S1 묶음 카드 4장 · `@container/me` 700 2열 · 단위 S1-1~4 (RED 3건 확인 후 구현) |
| 3 | `7e602189` | test — me.spec 재배선 + PEY-1~5 · a11y 탭별 스캔 · unfilled-progress 딥링크 · onCountChange 단위 |
| 시각 결함 | `dbdaa706` | fix — /me 탭 바 기준선을 900 열에 맞춤 · 설정 카드 머리를 행 글자선에 정렬 |

push 0. 문서 산출물(SUMMARY · STATE 등)은 커밋하지 않음(오케스트레이터 몫).

## 검증 결과 (최종 트리에서 실제 실행)

- Task 1 grep 게이트(공용 훅 · Suspense · onCountChange · 종목상세/me-client 직접 pushState 0) — 통과
- `vitest run stock-detail stock-native-refresh me-client today-orders-card` — 6 파일 118 테스트 통과(Task 1 시점)
- `vitest run limit-chaser-defaults me-client` — 3 파일 48 통과(S1-1~3 RED → GREEN, S1-4 는 회귀 잠금이라 처음부터 통과)
- `typecheck`(tsc 앱 + e2e) — 0 오류
- `lint` — 오류 0 · 손댄 파일 경고 0(기존 경고는 타 파일 및 limit-chaser-defaults.test 146행 `_t/_p` 기존분)
- webapp 단위 전체 `run test` — **149 파일 · 3566 통과 · 1 skip**
- `a11y.spec -g "Phase 25 axe 매트릭스|/me — 위반 0"` — **3 passed**(axe 24 스캔 유지 · 폭 me=344/900 기록 그대로)
- `me.spec + unfilled-progress.spec + stock-detail-tabs.spec` — **45 passed**(me.spec 기존 21 + PEY 5 · unfilled 6 · 종목상세 14 · setup 1 등)
- 스크린샷 2장 생성 → Task 3 verify `TASK3 ALL OK`

## PEY-5 · K-1 sticky 관찰 (고치지 않음 — 사용자 결정 사항)

`[PEY-K1] tabbar top=66 (scroll 0 에서 237) scrollY=171 main.scrollTop=0` (390 · 설정 탭 · 창 끝까지 스크롤)

237 − 171 = 66 — 탭 바가 본문과 **같이 스크롤**됐다. 스크롤 주체는 창(window)이고 `main.scrollTop` 은 0 이다. 즉 AppShell `<main overflow-auto>` 때문에 sticky 가 실효 없다(종목상세 탭 바도 같은 구조). **sticky 는 셸 overflow 때문에 실효가 없어 보인다 — 고칠지 사용자 결정**(app-shell 변경은 전 페이지 영향이라 이 quick 범위 밖).

## 스크린샷 (사람 확인용 · 목업 A · S1 대조)

- 390 현황(4탭 바 · 잔고 2 · 주문 9): `webapp/test-results/me-tabs-390.png` → 보존 사본 `.planning/quick/261006-pey-mypage-redesign/shots/me-tabs-390.png`
- 1280 설정(2열 카드): `webapp/test-results/me-settings-1280.png` → 보존 사본 `.planning/quick/261006-pey-mypage-redesign/shots/me-settings-1280.png`

(`webapp/test-results/` 는 다음 Playwright 실행 때 지워지므로 shots/ 사본을 남겼다 — 미커밋.)

## 재량 결정 (플래너 P-1 ~ P-7 그대로 이행)

- **P-1** 공용 훅 `useUrlTab(values, default)` = 화이트리스트 파싱 · 방문 집합(keepMounted) · 실시간 URL 가드 → pushState → 탭 바 scrollIntoView. 종목상세는 T9 재클릭(가드보다 먼저 판정) · 옛 orderbook 딥링크 · 폰 CTA 만 남김. 종목상세 단위 테스트 무수정 통과 · e2e 14 통과.
- **P-2** 탭 바 배경만 호출부(종목상세 `--bg`, /me `--surface`), 목록 폭은 종목상세 `max-w-4xl` · /me 는 PAGE_WRAP.
- **P-3** Suspense 경계는 `MeTabs` 만(폴백 null) — me.spec 6 「서버 응답에 me-page」 통과.
- **P-4** 섹션 루트 `@container/me` + 격자 `@min-[700px]/me:grid-cols-2` — 1280 에서 2열, 390 에서 1열 실측 단언.
- **P-5** 잔고 숫자 = `unfilledCountOf(accounts, accountStates)` — 목록 밖 계좌 미집계.
- **P-6** 패널 `text-[length:var(--t-base)]` 로 TabsContent `text-sm` 대체.
- **P-7** 전환 시 탭 바 기준 스크롤 공용 동작 그대로.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 시각 결함] /me 탭 바 기준선이 본문 열 밖으로 삐져나감**
- **Found during:** Task 3 스크린샷 확인(1280)
- **Issue:** 공용 바 클래스의 좌우 bleed(`-mx-2 md:-mx-4 lg:-mx-6` + 같은 px)는 폭 제한 없는 종목상세에서 본문 패딩을 상쇄하려는 것인데, /me 는 PAGE_WRAP 900 열 안이라 기준선이 카드보다 좌우 24px(md 16 · 폰 8) 삐져나갔다. 목업 A `.tabs4` 는 열 폭 그대로.
- **Fix:** me-client 호출부에서만 `mx-0 px-0 md:… lg:…` 로 bleed 해제(공용 상수는 그대로 — 종목상세 무변경).
- **Files:** webapp/src/components/trading/me-client.tsx · **Commit:** `dbdaa706`

**2. [Rule 1 - 시각 결함] 설정 카드 머리가 행 라벨보다 6px 들여 써짐**
- **Found during:** Task 3 스크린샷 확인(1280)
- **Issue:** 플랜은 카드 머리 패딩 「현행 px-1.5 유지」 였지만, 카드 폭(≈440)은 `@container/lc` 좁은 밴드라 행(ROW_BOX)이 `px-0` 이다 → 머리만 6px 들여 써짐.
- **Fix:** 카드 머리를 행 목록 `@container/lc` 안으로 옮기고 행과 같은 밴드 패딩(`px-0 @min-[685px]/lc:px-1`). data-slot · 문구 · 13px/600 muted 그대로, 단위 테스트(S1-2 「카드마다 @container/lc 하나」 포함) 통과.
- **Files:** webapp/src/components/me/limit-chaser-defaults.tsx · **Commit:** `dbdaa706`

**3. [기록] 커밋 수 3 → 4** — 위 두 결함은 Task 1 · 2 커밋 이후 Task 3 스크린샷에서 발견돼 별도 fix 커밋으로 남겼다(파일은 frontmatter files_modified 11개 안).

**4. [기록] PEY-5 관찰값 보강** — 플랜은 스크롤 끝 top 하나만 남기라 했으나 그 값만으로는 「고정됨/같이 스크롤됨」 을 구별할 수 없어 scroll 0 의 top · scrollY · main.scrollTop 을 함께 남겼다(여전히 단언 없음). 390 스크린샷은 라벨 숫자가 보이도록 계좌 상태 push + 주문 탭 1회 방문 뒤 현황으로 돌아와 찍었다.

## 참고 (행 밴드)

설정 카드 폭이 ≈440 이라 행은 `@container/lc` 좁은 밴드(쉐브런 › 숨김 · 좌우 0)로 그려진다 — 목업 S1 데스크톱은 › 가 보인다. 이는 D-2 「행은 SettingRow·ChoiceRow 그대로 · 카드마다 LC_CONTAINER_CLASS」 의 귀결이라 바꾸지 않았다(행 컴포넌트 내부 변경 = 범위 밖). 원하면 사용자 결정.

## push 전 메인 세션 확인

- [ ] `pnpm --filter @gh-radar/webapp run build` 1회 — P-3 Suspense 경계(정적 라우트 `/me` 의 `useSearchParams`) 확인. **dev 서버를 멈춘 뒤** 실행(`.next` 공유).
- [ ] 스크린샷 2장(shots/) 목업 A · S1 대조
- [ ] K-1 sticky 실효 없음 — 고칠지 결정(app-shell 범위)
- [ ] push = webapp 프로덕션 배포(Vercel) — 위 확인 뒤

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: webapp/src/lib/use-url-tab.ts · webapp/test-results/me-tabs-390.png · webapp/test-results/me-settings-1280.png · shots/ 사본 2장
- FOUND commits: 7596a83e · e7b72a9e · 7e602189 · dbdaa706 (HEAD 조상)
