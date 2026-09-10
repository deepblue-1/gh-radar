---
phase: quick-260910-kql
plan: 01
subsystem: webapp-trading-ui
tags: [relay-02, my-page, today-orders, isin-labels, mobile-390]
status: complete

requires:
  - "useIsinLabels() (Phase 16 Plan 23 / WR-08) — ISIN → 종목명·단축코드 단일 정본"
  - "relay `acct` 프레임의 hold·unf `name`·`code` (16-41 이 상따까지 확장)"
provides:
  - "「오늘 주문」 카드 종목 칸의 이름+식별자 병기 (데스크톱 표 · 모바일 카드 행 양쪽)"
  - "3단 폴백(이름 → 코드 → ISIN) 을 잠그는 컴포넌트 테스트 3건"
  - "me.spec 케이스 1(이름+코드 병기) · 케이스 8(390px 넘치는 잎 0) 단언"
affects:
  - webapp/src/components/trading/today-orders-card.tsx
  - webapp/e2e/specs/me.spec.ts

tech-stack:
  added: []
  patterns:
    - "표시 표면이 늘어도 조회 경로는 늘리지 않는다 (T-16-02) — 라벨은 이미 받은 wss 스냅샷에서만"
    - "이름 칸이 이미 코드/ISIN 인 행은 같은 값을 두 번 쓰지 않는다 (StrategyRow 선례)"
    - "flex 행의 신축 항목은 하나뿐 — 식별자 span 은 flex:none 이어야 조용한 잘림이 안 생긴다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx
    - webapp/e2e/specs/me.spec.ts

decisions:
  - "코드 칸 폴백 순서는 row.stockCode → label.code → row.isin — 이력의 식별자는 **기록된 값**이 우선한다"
  - "이름을 모르면 코드를 이름 자리로 올리고 코드 칸은 null — 같은 값 중복 표기 금지"
  - "긴 종목명은 말줄임으로 자르고 코드는 온전히 남긴다. 코드를 ②줄로 내리지 않는다(②줄은 전부 flex:none)"
  - "useIsinLabels 를 테스트에서 mock 하지 않는다 — 실물 훅이 mockRelay 를 읽어야 훅↔컴포넌트 연결까지 잠긴다"

metrics:
  duration: "~25분"
  completed: "2026-09-10"

actuals:
  tokens: 9000
  tasks: 2
  commits: 2

plan_head_before: 11072e4fb53a66a8826f1303b57e44255d8625cc
---

# quick-260910-kql: 「오늘 주문」 종목 칸에 종목명 붙이기 Summary

`/me` 「오늘 주문」 카드의 종목 칸이 단축코드만 보여주던 것을 **이름+식별자 병기**로 바꿨다 —
없는 것을 만든 게 아니라 Phase 16 이 만들어 둔 `useIsinLabels()` 단일 정본을 이 표면에 연결했다.

## 무엇을 했는가

### Task 1 — 종목 칸에 이름을 붙인다 (커밋 `3661774`)

- `today-orders-card.tsx` 가 `useIsinLabels()` 를 한 번 호출해 `labels` 를 받는다.
  **늘어난 import 는 이것 하나뿐**이고 `fetch`·Supabase 클라이언트·`orders-api` 확장은 0건이다.
- `stockLabel(row)` → `stockLabel(row, label)` 로 바꿔 `{ name, code }` 를 돌려준다.
  - 코드 칸: `row.stockCode` → `label?.code` → `row.isin` (언제나 값이 있다)
  - 이름 칸: `label?.name` 이 있으면 그것, 없으면 **코드 칸 값을 이름 자리로 올리고 코드는 `null`**
- 데스크톱 표 셀은 `flex items-center gap-1.5 whitespace-nowrap` 안에 이름·코드 span 을 나란히 둔다.
  `truncate` 를 쓰지 않는다 — 표 셀에는 폭 제약이 없어 동작하지 않고, `.tbl-wrap overflow-x-auto` 의
  가로 스크롤이 설계된 동작이다(me.spec 헤더 ④).
- 모바일 ①줄은 `min-w-0 flex-1 truncate` 를 **이름 span 에만** 남기고, 새 코드 span 은 `flex-none`.
  신축 항목은 여전히 종목명 하나뿐이다.
- 이름 자리에 코드/ISIN 이 올라온 행에서만 `mono` 를 붙인다 — 한글 종목명에 mono 를 씌우지 않기 위해서다.
- 파일 헤더 주석에 ⑥ 항목을 더했다(원천 단일 · 3단 폴백 · 신축 항목 불변).

### Task 2 — E2E 회귀 단언 (커밋 `86fa150`)

- 케이스 1: 오늘 주문 카드에 `삼성전자`+`005930`, `한국제7호기업인수목적우선주식회사`+`000660` 을
  **함께** 단언한다. 이름만 보면 식별자가 사라진 회귀를 통과시킨다.
- 케이스 8(모바일 390): `0000900002` 로 좁힌 긴 종목명 행의 **잎 요소** `right` 를
  `[data-slot="today-orders-list"]` 오른쪽 끝과 대조해 넘치는 잎이 0 임을 잰다.
  기존 `.rlist` 블록과 같은 방식·같은 1px 여유다.
- 새 `page.route` 스텁을 **추가하지 않았다.** 플래너 실측대로 `isin-labels.ts` 의 import 는
  `useMemo` + `useRelayContext` 뿐이라 라벨용 네트워크 경로가 존재하지 않는다. 이 사실을
  spec 주석으로 남겨 다음 사람이 없는 스텁을 찾지 않게 했다.
- 기존 단언은 하나도 지우지 않았다.

## 검증 결과

| # | 검증 | 결과 |
|---|------|------|
| 1 | `pnpm --filter @gh-radar/webapp run test` | ✅ exit 0 — 61 파일 **701 passed** / 1 skipped. `today-orders-card.test.tsx` 케이스 **5 → 8**, 기존 5 케이스 무손상 |
| 2 | `pnpm --filter @gh-radar/webapp run typecheck` | ✅ exit 0 (`tsc --noEmit` + `tsconfig.e2e.json`) |
| 3 | `playwright test specs/me.spec.ts` | ⛔ **미실행** — 아래 「검증 게이트」 참조 |
| 4 | `today-orders-card.tsx` 의 import 증가분 | ✅ `useIsinLabels`(+ 타입 `IsinLabel`) **하나뿐**. 새 조회 경로 0 |

TDD 사이클도 지켰다: 세 케이스를 **먼저** 넣고 RED 를 실측했다 —
`expected '005930▲ 매수접수…' to contain '삼성전자'` 로, 컴포넌트가 라벨을 읽지 않는다는
**의도한 이유**로 실패했고(나머지 7건은 통과) 구현 후 8/8 GREEN 이 됐다.

## ⛔ 검증 게이트 — me.spec 미실행 (사람 확인 필요)

**막힌 것:** 이 worktree 에는 `webapp/` 아래 로컬 시크릿 env 파일(개인 override + E2E 테스트 계정)이
없다. gitignored 라 worktree 생성 시 복사되지 않았고, 그래서 Playwright 의 `webServer` 가
`Your project's URL and Key are required to create a Supabase client!` 로 부팅에 실패한 뒤
`Timed out waiting 120000ms from config.webServer` 로 끝났다. **spec 자체는 한 줄도 실행되지 않았다.**

**왜 실행자가 해결하지 않았나:** 해당 파일을 worktree 로 복사하려면 시크릿 경로를 읽어야 하는데,
하네스의 secret-read guard 가 그 Bash 명령을 거부한다. 보안 가드를 우회하지 않았다.

**해야 할 일 (merge 후 main tree 에서, 1회):**

```
pnpm --filter @gh-radar/webapp exec playwright test specs/me.spec.ts
```

main tree 에는 필요한 파일이 이미 있으므로 그대로 통과 여부가 나온다. 이것이 PLAN 의
`<verify>` 가 애초에 `cd /Users/alex/repos/gh-radar` 로 적혀 있던 이유이기도 하다.

**미확인으로 남는 명제 2개** (코드·타입은 검증됐고, 브라우저 실측만 미확인):
- 케이스 1 — 오늘 주문 카드의 이름+코드 병기가 실제 relay 왕복에서 보인다
- 케이스 8 — 390px 에서 긴 종목명 주문 행의 넘치는 잎이 0 이다

⚠️ 이 단언들을 약화시켜 통과시키지 않았다. 케이스 8 의 잎 실측은 이 작업의 레이아웃 규율을
잠그는 핵심이므로 텍스트 grep 으로 대체하지도 않았다.

## Deviations from Plan

**1. [Rule 3 - 차단 이슈] `@gh-radar/shared` 를 worktree 에서 빌드했다**
- **발견 시점:** Task 1 RED 실행
- **문제:** `packages/shared/dist` 가 없어 vitest 가
  `Failed to resolve entry for package "@gh-radar/shared"` 로 수집 자체를 못 했다.
- **조치:** `pnpm --filter @gh-radar/shared run build` 1회. `dist` 는 gitignored 라 커밋에 없다.
- **커밋:** 해당 없음 (빌드 산출물)

**2. [Rule 3 - 차단 이슈, 미해결] E2E 실행 환경 부재**
- 위 「검증 게이트」와 동일. 실행자 권한으로 해결 불가라 밀어붙이지 않고 보고한다.

## Known Stubs

없음. 이번 변경에 하드코딩 빈 값·placeholder·미배선 컴포넌트가 없다.

## 범위 밖 발견 (고치지 않음 — 이관)

`pnpm --filter @gh-radar/webapp run lint` 에 **기존** 경고 3건이 있다. 이번에 손댄 파일이
아니므로 손대지 않았다.

| 파일 | 경고 |
|------|------|
| `webapp/src/components/theme/theme-detail-client.tsx:9` | `'ScannerEmpty' is defined but never used` |
| `webapp/src/components/trading/__tests__/strategy-status-card.test.tsx:329` | `'_msg' is defined but never used` |
| `webapp/src/lib/use-relay-socket.ts:808` | `react-hooks/exhaustive-deps` — `wireSubsRef.current` cleanup 경고 |

## Threat Flags

없음. `<threat_model>` 의 T-kql-01(이름을 JSX 텍스트 노드로만 렌더 — `dangerouslySetInnerHTML`
미사용) · T-kql-03(새 조회 경로 0) 은 그대로 지켜졌다. 새 의존성 0 건.

## Self-Check: PASSED

- 수정 파일 3건 · SUMMARY 1건 전부 디스크에 존재
- 커밋 `3661774`(Task 1) · `86fa150`(Task 2) 전부 `worktree-agent-af342896efc59ef1e` 히스토리에 존재
- `git rev-list --count 11072e4..HEAD` = **2** — frontmatter `commits: 2` 와 일치(측정값)
- ⚠️ 단, 검증 4항목 중 3번(`playwright test specs/me.spec.ts`)은 **미실행**이다.
  위 「검증 게이트」가 닫히기 전까지 이 플랜은 **완전 검증 상태가 아니다.**
