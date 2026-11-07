---
phase: quick-261107-jhk
plan: 01
status: complete
subsystem: webapp/admin-launch
tags: [admin, launch, ui, rename, layout]
requires: [quick-261107-iep]
provides: ["러쉬 주문 개명", "상단 H1 순서(탭 → 서버 칩 → 컨트롤 줄)", "짧은 발사 세그먼트"]
affects: [webapp/src/components/admin, webapp/src/components/layout/app-sidebar.tsx, webapp/src/lib/launch-map.ts]
tech-stack:
  added: []
  patterns: ["보이는 글자는 짧게 + title · aria-label 은 전체 이름(Label in Name)"]
key-files:
  created: []
  modified:
    - webapp/src/components/admin/launch-client.tsx
    - webapp/src/components/admin/launch-orders-tab.tsx
    - webapp/src/components/admin/launch-map-tab.tsx
    - webapp/src/components/admin/launch-server-chips.tsx
    - webapp/src/lib/launch-map.ts
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/admin/__tests__/launch-client.test.tsx
    - webapp/src/components/admin/__tests__/launch-orders-tab.test.tsx
    - webapp/src/components/admin/__tests__/launch-map-tab.test.tsx
    - webapp/src/lib/__tests__/launch-map.test.ts
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/admin-launch.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
decisions:
  - "launchRangeOf 는 범위 글 삭제 뒤 소비처 0 이라 함수 · 단위 테스트를 함께 지웠다(launchDateLabelOf · launchRangeParamOf 는 유지)"
  - "세그먼트 접근성 이름은 aria-label = 전체 이름(「16:00 예약」 · 「09:00:30 개장차익」) — 기존 getByRole name 테스트 무수정 통과"
  - "간격: Tabs gap-2.5 + TabsList mb-1 → 탭 줄-칩 14px · 칩-컨트롤 줄 10px"
metrics:
  duration: "약 15분"
  completed: 2026-11-07
commits: 2
plan_head_before: e5812d86b787797e48eca075f2874964b4bb4b60
plan_head_after: c0a96bf01e20f9857deae8ca3261d2e1cd45d303
actuals:
  tokens: 13000   # chars/4 over the realized diff (git diff e5812d86 -- webapp ≈ 51.8K chars)
  tasks: 2
  commits: 2
---

# Phase quick-261107-jhk Plan 01: 어드민 발사 화면 상단 정리 · 「러쉬 주문」 개명 Summary

`/admin/launch` 상단을 제목 「러쉬 주문」(설명 없음) → 탭 줄 → 서버 칩(두 탭 공용 한 벌) → [날짜 알약 | 범위 칩] + 바로 오른쪽 짧은 발사 세그먼트(「16:00」 · 「09:00:30」) 순서로 정리하고, 출처 배지 · 범위 글을 지웠다. 경로 · 쿼리 키 · API · 서버 칩 동작은 그대로다.

## 무엇을 바꿨나

- **이름(CONTEXT 「이름」)** — 사이드바 `NAV_ADMIN_LAUNCH` 라벨 · PageHeader h1 · 문서 제목(`러쉬 주문 · Admin` / `· MM/DD`)만 「러쉬 주문」. 본문 「발사」 용어(표 머리 · 「오프셋 (발사 기준)」 · 빈 상태 문구 · radiogroup 「발사 서버」 · 묶음 「발사 기준」)는 그대로.
- **상단 순서 H1** — `LaunchServerChips` 를 `<Tabs>` 안 `</TabsList>` 바로 다음 · 첫 `TabsContent` 앞으로 옮김(DOM 한 벌). Tabs `gap-3.5 → gap-2.5`, TabsList `mb-1` 추가.
- **컨트롤 줄** — `FIRE_SEGMENTS` = `{ value, label, full }`(label 짧은 글자 · full 전체 이름), 버튼에 `title` · `aria-label` = full. 주문 내역 출처 배지 span · `seg` 계산 삭제, 경계 지도 범위 글 span · `rangeText` · `ml-auto` 래퍼 삭제 → 두 탭 컨트롤 줄 자식이 정확히 [왼쪽 컨트롤, 발사 세그먼트].
- **정리** — `launchRangeOf` 함수 · 구획 주석 · 단위 테스트 삭제(소비처 0). 주석의 「제목 아래 · 탭 위」 · 「출처 칩」 · 「범위 글」 언급을 새 배치에 맞게 고침.

## 실행한 검증 명령과 결과

| 명령 | 결과 |
| --- | --- |
| (RED) `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-orders-tab.test.tsx src/components/admin/__tests__/launch-map-tab.test.tsx src/lib/__tests__/launch-map.test.ts src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` | 코드 수정 전 11 failed / 218 passed (229) — 새 기대에서 의도대로 실패 |
| (GREEN) `pnpm --filter @gh-radar/webapp exec vitest run src/components/admin/__tests__/launch-client.test.tsx src/components/admin/__tests__/launch-orders-tab.test.tsx src/components/admin/__tests__/launch-map-tab.test.tsx src/components/admin/__tests__/launch-server-chips.test.tsx src/lib/__tests__/launch-map.test.ts src/components/layout/__tests__/app-sidebar.test.tsx --maxWorkers=2` | Test Files 6 passed (6) · Tests 236 passed (236) |
| `pnpm --filter @gh-radar/webapp run typecheck` (`tsc --noEmit && tsc -p tsconfig.e2e.json`) | 통과(오류 0) — Task 1 뒤 · Task 2 뒤 두 번 |
| `grep -c 'label: "러쉬 주문"' webapp/src/components/layout/app-sidebar.tsx` | 1 |
| `grep -c 'title="러쉬 주문"' webapp/src/components/admin/launch-client.tsx` | 1 |
| `pnpm --filter @gh-radar/webapp exec playwright test admin-launch.spec.ts sidebar-tree.spec.ts --workers=1` | 32 passed (1.1m) — setup 1 + admin-launch 20 + sidebar-tree 11 |
| `git diff e5812d86 --stat -- server packages workers` | 비어 있음(API · shared · server 무변경) |
| `grep -c '<th className={TH}>발사</th>' launch-orders-tab.tsx` · `grep -c 'aria-label="발사 기준"' launch-orders-tab.tsx` | 1 · 1(기준선 그대로) |

e2e 가 새로 증명하는 것: h1 「러쉬 주문」 · 설명 문단 0 · 출처 배지 0 · 범위 글 0, 탭 → 서버 칩 → 컨트롤 순서와 간격(탭-칩 > 칩-컨트롤, 칩-컨트롤 6~14px), 세그먼트가 날짜 알약(1280 · 390) · 범위 칩(1280) 바로 오른쪽 같은 줄 6~14px, 세그먼트 글자 「16:00」 · 「09:00:30」 + title, 390 지도 탭 세그먼트 오른쪽 끝 ≤ 390, 두 탭 페이지 가로 넘침 0(기존 단언 유지). 390 주문 내역 스크린샷에서 날짜 알약 + 「16:00 | 09:00:30」 한 줄을 눈으로도 확인했다.

## 커밋

- `44b7393d` feat(quick-261107-jhk): 러쉬 주문 개명 · 상단 탭→서버 칩→날짜+발사 한 줄 · 출처·범위·설명 글 삭제 (11파일)
- `c0a96bf0` test(quick-261107-jhk): e2e 러쉬 주문 제목 · 탭→서버 칩→컨트롤 순서 · 세그먼트 날짜 옆 · 지운 글 · 사이드바 트리 (2파일)

## Deviations from Plan

- **[Rule 1 - 주석 정합] launch-map-tab.tsx 문서 주석 3곳 추가 수정** — 계획은 60행 주석만 지목했지만 62 · 63 · 66행에도 「제목 아래 서버 칩」 · 「범위 글 · 적재 이력 없음 은 응답 전체 기준」 · 「범위 글은 응답 days 기준」 이 남아 있어 새 배치(탭 줄 아래 · 범위 글 없음)에 맞게 고쳤다. 코드 동작 무관. (커밋 44b7393d)
- **[Rule 1 - 테스트 정합] e2e P35-L2 의 교보119 전환 뒤 출처 배지 단언(옛 167행)도 삭제** — 계획은 142행만 지목했으나 같은 테스트 안 두 번째 `launch-source` 단언이 있어 함께 지웠다. (커밋 c0a96bf0)
- 단위 테스트 launch-map-tab 의 KYOBO112 테스트 이름에서 「· 범위 글은 응답 전체 그대로」 꼬리를 뺐다(단언 줄 삭제와 짝).

그 밖에는 계획대로 실행했다.

## 배포 메모

웹 전용(webapp) 변경이라 배포 = 메인 세션의 git push 한 번(server · relay · DB 불필요). 이 실행에서는 push · 배포하지 않았다.

## Known Stubs

없음.

## Self-Check: PASSED

- 수정 파일 13개 존재 · 커밋 `44b7393d` · `c0a96bf0` 모두 HEAD 조상(확인 완료).
