---
phase: quick-260923-dmb
plan: 01
subsystem: webapp/trading
status: complete
tags: [vi, relay-socket, sidebar, exchange-tag, ordering]
requirements: [DMB-01, DMB-02]
requires: []
provides:
  - sortViOrdersNewestFirst (use-relay-socket 리듀서 vi.list 72·73 공통 정렬기)
  - webapp/src/components/trading/exchange-tag.tsx (ExchangeTag 순수 원자)
  - 사이드바 VI 한 줄 (data-sidebar-item="vi")
affects:
  - webapp 작업대 VI 칩 줄 · VI 발동 표 순서
  - 사이드바 트레이딩 3단
tech-stack:
  added: []
  patterns: [리듀서 한 곳 정렬(표시층 재정렬 0), 순수 표시 원자 분리 + re-export]
key-files:
  created:
    - webapp/src/components/trading/exchange-tag.tsx
  modified:
    - webapp/src/lib/use-relay-socket.ts
    - webapp/src/lib/__tests__/relay-socket.test.ts
    - webapp/src/lib/__tests__/relay-provider.test.tsx
    - webapp/src/components/trading/workbench/vi-trigger-strip.tsx
    - webapp/src/components/trading/__tests__/vi-trigger-strip.test.tsx
    - webapp/src/components/trading/vi-order-list.tsx
    - webapp/src/components/layout/app-sidebar.tsx
    - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
decisions:
  - "VI 발동 목록 최신순은 리듀서 case vi.list 한 곳(sortViOrdersNewestFirst)에서 정한다. 키는 deadline110Ms ↓, 동률이면 주문번호 있는 행 먼저(주문번호 ↓), 시각 모름(≤0)은 맨 뒤다. relay 는 0줄 변경이다"
  - "사이드바 VI 는 한 줄이다. 가동 거래소 ExchangeTag 만 KRX → NXT 순으로 두고, 둘 다 꺼지면 줄을 그리지 않는다. VI·전략이 모두 없으면 빈 3단 ul 도 그리지 않는다"
  - "ExchangeTag 를 순수 원자 파일로 분리한다(사이드바 번들이 vi-order-list 를 끌고 오지 않게). vi-order-list 는 re-export 해서 기존 import 처 2곳은 무수정이다"
metrics:
  duration: ~12m
  completed: 2026-09-23
  tasks: 2
  files: 11
plan_head_before: b99a195d6a4f12fbcb0a24220a607be09a9ee23c
actuals:
  tokens: 13700
  tasks: 2
  commits: 2
---

# Quick 260923-dmb: 작업대 VI 발동 목록 최신순 + 사이드바 VI 한 줄 Summary

VI 발동 목록은 이제 최신 발동이 칩 맨 앞 · 표 맨 위에 온다. 리듀서 한 곳이 `deadline110Ms` 내림차순으로 정렬하므로, 73 갱신이 와도 행 자리가 바뀌지 않는다. 사이드바 「KRX VI」·「NXT VI」 두 줄은 「VI」 한 줄로 합쳤다. 오른쪽에는 가동 중인 거래소 태그만 두고, 둘 다 꺼지면 줄을 그리지 않는다.

## 근본 원인 (D2)

최신순 정렬을 하는 층이 하나도 없었다.
- (a) 게이트웨이 72 스냅샷(`VIOrderWatch::Snapshot`)은 `m_items` 를 생성 순으로 담는다. 오래된 것이 먼저다.
- (b) relay `#onViOrderList` 는 72·73 을 받은 그대로 팬아웃한다. 캐시 Map 도 삽입 순이다.
- (c) webapp `mergeViOrders` 는 Map 을 upsert 한다. 그래서 새 키와 접수 전→접수 재삽입 행이 끝에 붙는다.
- (d) 표시층 주석 두 곳은 「최신 위는 서버 몫」이라고 적었다. 그러나 사실이 아니었다. 이번에 정정했다.

## 정렬 규칙 (`sortViOrdersNewestFirst`)

1. `deadline110Ms` 내림차순. 0 이하(시각 모름)는 시각을 아는 모든 행 뒤에 둔다.
2. 동률이면 주문번호가 있는 행이 먼저이고, 그 안에서는 주문번호 내림차순이다. 접수 전(`""`) 행은 그 뒤다.
3. 그래도 같으면 `viOrderKey` 내림차순이다. 병합 뒤 키는 유일하므로 여기서 전순서가 된다.
- 문자열은 코드 단위로 비교한다(`localeCompare` 는 쓰지 않는다). 입력 배열은 복사한 뒤 정렬하므로 제자리에서 바뀌지 않는다.
- 72 교체와 73 병합 두 갈래가 모두 이 함수를 지난다. 표시층(칩 · 작업대 표)은 받은 순서 그대로 그린다.

## Commits

| Task | Commit | 내용 |
|------|--------|------|
| 1 | e322119 | fix: VI 발동 목록 최신순. 리듀서 정렬기와 훅 테스트 4건, e2e GC7, 표시층 주석 정정, relay-provider ⑥-c 갱신 |
| 2 | a46131f | feat: 사이드바 VI 한 줄. ExchangeTag 원자 분리, 단위 테스트 새 계약, e2e sidebar-tree 1b, 작업대 20·22 단언 |

push 하지 않았다(지시대로).

## 테스트 수치

- **RED 관측(Task 1):** 리듀서 호출을 항등 함수로 바꿔 정렬을 뺐을 때 새 describe 4/4 가 실패했다(①②③④ 모두). 원복한 뒤에는 4/4 GREEN 이다.
- Task 1 대상 vitest 5파일: 214 passed.
- Task 2 대상 vitest 4파일: 158 passed. app-sidebar 31 passed.
- **webapp 전체 vitest: 92 files, 1487 passed / 1 skipped.** 기준선 1467 + 신규 이상이고 회귀는 0이다.
- typecheck(src + e2e tsconfig): exit 0. eslint(app-sidebar · exchange-tag · vi-order-list): exit 0.
- 음성 grep: `「최신 위」는 서버` 가 src 에 0건이다. `StrategyBadge|viBadgeOf` 도 app-sidebar 에 0건이다. `vi-(KRX|NXT)` 는 layout · e2e/specs 에 0건이다.
- Playwright 결과:
  - Task 1 `trading-workbench a11y`: 46 passed(GC7 포함).
  - Task 2 `sidebar-tree trading-workbench a11y`: 53 passed(1b · GC7 포함), 0 failed.
- D3 불변 확인: e2e 24·25·26 과 vi-order-list.test 는 수정 없이 통과했다.

## Deviations from Plan

**1. [명명] e2e 새 케이스 번호 GC2 → GC7**
- **발견 시점:** Task 1
- **문제:** trading-workbench.spec.ts 에는 이미 「GC2 카드를 접었다 펴도 미전송 값과 더티 바가 남는다」가 있다. 같은 파일에 GC2 가 둘이면 케이스를 가리킬 때 헷갈린다.
- **조치:** 새 케이스 제목을 「GC7 VI 발동 목록은 가장 최신 발동이 맨 앞(칩)·맨 위(표) — 73 신규는 맨 앞, 73 갱신은 자리 유지 (quick-260923-dmb)」로 했다(GC1~GC6 다음 번호). 위치는 계획대로 GC1 바로 뒤다. 내용도 계획과 같다.
- **커밋:** e322119

**2. [보강] GC7 의 73 갱신 단계에 확인 체크 단언 추가**
- 「A 가 끝자리를 지킨다」를 단언하기 전에 표 마지막 행의 확인 체크가 checked 인지 먼저 기다린다. 73 이 실제로 반영된 뒤에 자리를 보려는 것이다(경주 방지).

그 밖에는 계획대로 실행했다. relay 코드 변경 0줄, ROADMAP/STATE 미수정.

## Known Stubs

없음.

## Threat Flags

없음. 새 입력·송신·권한 경로가 없고, 표시 순서와 표시 형태만 바뀌었다.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/exchange-tag.tsx
- FOUND: e322119, a46131f (git log)
