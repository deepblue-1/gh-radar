---
phase: quick-260913-v2e
plan: 01
subsystem: webapp
tags: [stock-detail, tabs, pushState, vercel, region]
status: complete
requires: []
provides:
  - 종목상세 탭 전환 RSC 왕복 제거 (V2E-01)
  - webapp 함수 리전 icn1 고정 (V2E-02)
affects:
  - webapp/src/components/stock/stock-detail-tabs.tsx
  - webapp/vercel.json
tech-stack:
  added: []
  patterns:
    - "Next 15 네이티브 window.history.pushState + useSearchParams 동기화"
    - "Radix onValueChange 이중 호출을 실시간 window.location 으로 거르는 중복 가드"
key-files:
  created:
    - webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx
  modified:
    - webapp/src/components/stock/stock-detail-tabs.tsx
    - webapp/e2e/specs/stock-detail-tabs.spec.ts
    - webapp/vercel.json
decisions:
  - "탭 전환은 라우터 내비게이션이 아니라 네이티브 pushState — 서버가 ?tab= 을 읽지 않아 RSC 왕복이 잃는 것 없이 지연만 만들었다"
  - "중복 가드의 비교 대상은 렌더 클로저 active 가 아니라 실시간 window.location (Next 라우터 상태 반영은 transition 이라 낡아 있음)"
  - "webapp vercel.json regions = [icn1] — 백엔드 Cloud Run asia-northeast3·Supabase 서울과 같은 곳"
metrics:
  started: 2026-09-13T13:36:12Z
  completed: 2026-09-13T13:39:34Z
  duration: 4m
  tasks: 3
  files: 4
actuals:
  tokens: 3042
  tasks: 3
  commits: 3
plan_head_before: 8a82ab8c8a22c13a4276356d344fc8d215332d1e
---

# Quick 260913-v2e: 종목상세 탭 pushState 전환 + Vercel 함수 리전 icn1 Summary

종목상세 탭 전환을 `router.push`(RSC 서버 왕복)에서 네이티브 `window.history.pushState` 로 바꿨고, Radix 의 mousedown+focus 이중 호출은 실시간 URL 가드로 막아 한 클릭이 기록 1개만 남는다. webapp 함수 리전은 `regions: ["icn1"]` 로 고정했다.

## 커밋

| 태스크 | 커밋 | 메시지 | 파일 |
|--------|------|--------|------|
| 1 | `56db7f3` | feat(quick-260913-v2e): 종목상세 탭 전환을 네이티브 pushState 로 — RSC 왕복 제거 · 한 클릭 한 기록 가드 | stock-detail-tabs.tsx, `__tests__/stock-detail-tabs.test.tsx` |
| 2 | `5c45239` | test(quick-260913-v2e): 탭 e2e 를 pushState 계약으로 — 뒤로가기 한 번·RSC 요청 0건 단언 | e2e/specs/stock-detail-tabs.spec.ts |
| 3 | `58c2919` | chore(quick-260913-v2e): Vercel 함수 리전을 icn1(서울)로 고정 | webapp/vercel.json |

`git rev-list --count 8a82ab8..HEAD` = 3. 푸시하지 않았다.

## TDD 기록 (Task 1)

- **RED ①** — 새 테스트 파일의 `next/navigation` 목은 `useSearchParams` 하나만 내보낸다. 원래 컴포넌트에 돌리니 **4/4 실패**했고 메시지는 `[vitest] No "useRouter" export is defined on the "next/navigation" mock` (`stock-detail-tabs.tsx:69`) 였다.
- **GREEN, 가드 없음** — `useRouter` 를 지우고 `pushState` 로 바꿨다. 결과는 **2 실패 · 2 통과**:
  - Test 1 (user-event 로 3번 클릭): **pushState 6회** (기대 3회). 클릭마다 두 번 불렸다.
  - Test 2 (`fireEvent.mouseDown` → `act(() => trigger.focus())`): **pushState 2회** (기대 1회). `trigger.focus()` 만으로 React onFocus 가 불려 이중 호출이 재현됐다. `fireEvent.focus` 로 바꿀 필요는 없었다. 따라서 Test 2 는 가드가 없으면 실제로 실패하는 잠금이다.
  - Test 3·4 는 통과.
- **GREEN, 가드 추가** — `handleValueChange` 맨 앞에서, 실시간 `window.location.search` 를 정규화한 값이 새 값과 같으면 바로 return 한다. 결과는 **4/4 통과**, 기존 `stock-detail-client.test.tsx` 12건도 통과(두 파일 합계 16건).

## 검증

| 항목 | 결과 |
|------|------|
| `vitest run` stock-detail-tabs + stock-detail-client | 16/16 통과 |
| `pnpm -C webapp test` (전체) | 68 파일, **842 통과 · 1 skip · 0 실패**. 기준선 838 에 새 테스트 4건이 더해졌다 |
| `pnpm -C webapp typecheck` (`tsconfig.e2e.json` 포함) | exit 0 |
| `pnpm --filter @gh-radar/webapp lint` | exit 0. 경고 3건은 종전과 같고(theme-detail-client · strategy-status-card.test · use-relay-socket) 바뀐 파일에서 나온 경고는 없다 |
| Task 1 grep 게이트 (`useSearchParams` import 단독 1줄 · 코드 속 pushState 호출 1건 · `window.location.search` ≥1) | 통과 |
| Task 2 grep 게이트 (test 8 제목 · `next-router-prefetch` · test 10 제목) | 통과 |
| Task 3 node 검사 (`regions` = `["icn1"]`, 나머지 키가 `8a82ab8` 판본과 같음, 1 insertion) | 통과 |

### e2e (Playwright) — 미실행

`stock-detail-tabs.spec.ts` 는 돌리지 않았다. 이 spec 의 webServer 가 `PORT=3100 pnpm dev` 를 띄우는데, 오케스트레이터가 "로컬 서버를 띄우지 않고 가볍게 끝나는 경우에만 e2e 를 돌린다" 고 제한했기 때문이다. 그래서 test 8 · test 10 통과 여부와 test 10 이 옛 컴포넌트에서 실제로 실패하는지도 **확인하지 못했다**. 미실행을 통과로 적지 않는다. 권장 확인 절차: `pnpm -C webapp exec playwright test e2e/specs/stock-detail-tabs.spec.ts` 를 돌리고, `git show 56db7f3^:webapp/src/components/stock/stock-detail-tabs.tsx` 로 옛 컴포넌트를 잠시 되돌려 test 10 이 실패하는지 본 뒤 `git checkout -- webapp/src/components/stock/stock-detail-tabs.tsx` 로 원복한다.

### 푸시 후 확인 (오케스트레이터 몫 — 아직 안 함)

- `curl -s -o /dev/null -D - 'https://trade.jx1.io/auth/callback?code=x' | grep -i x-vercel-id` 결과가 `icn1::icn1::` 로 시작하는지 (종전 `icn1::iad1::`)
- `time_starttransfer` 를 3~5회 재서 종전 0.34–1.16s 와 비교

## 계획과 달라진 점

### 자동 수정

**1. [Rule 1 - Bug] 단위 테스트의 `getByRole` 에서 `exact: true` 옵션 제거**
- **발견 시점:** Task 1 typecheck
- **문제:** behavior 는 `getByRole('tab', { name, exact: true })` 를 지시했지만 `exact` 는 Playwright 옵션이다. RTL 의 `ByRoleOptions` 에는 없어서 `TS2769` 오류가 났다(vitest 는 타입을 검사하지 않아 통과했다).
- **수정:** `{ name }` 만 넘긴다. RTL 은 문자열 name 을 기본으로 정확 일치 비교하고, 이 테스트는 네 패널이 단순 `<div>` 라 부분 일치로 겹칠 탭도 없다. 이유는 헬퍼 위 주석에 적었다.
- **파일:** `webapp/src/components/stock/__tests__/stock-detail-tabs.test.tsx`
- **커밋:** `56db7f3`

**2. 프로젝트 규칙에 따른 조정** — 실행 규칙에 적힌 트레일러와 보호 브랜치 검사를 적용하지 않았다. 사용자 전역 규칙과 오케스트레이터 지시가 이렇게 정했다: 한글 커밋, Co-Authored-By 없음, 메인 체크아웃(master)에서 순차 실행, 푸시 없음. 그에 따라 master 에 바로 커밋했다.

## Known Stubs

없음.

## Threat Flags

없음. T-v2e-01 은 pushState 에 넣는 값을 `toTabValue` 화이트리스트로 거르고 쿼리만 쓰는 상대 URL 을 써서 막았다. T-v2e-02 는 실시간 URL 가드와 단위 Test 1·2 로 막았다. T-v2e-03 은 계획대로 accept 다. 새 엔드포인트·인증 경로는 없다.

## Self-Check: PASSED

- 파일 5개 모두 있음: 테스트 · 컴포넌트 · e2e spec · vercel.json · SUMMARY
- 커밋 `56db7f3` · `5c45239` · `58c2919` 모두 있음, Co-Authored-By 트레일러 0건
