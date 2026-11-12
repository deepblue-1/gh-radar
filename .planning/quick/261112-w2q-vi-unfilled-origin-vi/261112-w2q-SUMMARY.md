---
phase: quick-261112-w2q
plan: 01
subsystem: relay · shared · webapp(상따 작업대 미체결)
tags: [relay, flatbuffers, vi, unfilled, account-panel, workbench]
status: complete
requires:
  - gh-trade 204e505d StockDMA.fbs UnfilledState.origin
provides:
  - RelayUnfilled.origin?: JournalOrderOrigin | null
  - relay toUnfilledOrigin (무로그 null)
  - webapp unfilledOriginOf · 미체결 VI 배지/연주황 행
affects:
  - 상따 작업대 공용 패널 「미체결」 탭 · 전략 카드 「미체결」 탭
tech-stack:
  added: []
  patterns: [선택 키 계약(옛 relay = 키 없음), 출처 판정 순수 함수를 작업대에서 originOf 로 공급]
key-files:
  created: []
  modified:
    - relay/src/generated/StockDMA.fbs
    - relay/src/generated/stock-dma/unfilled-state.ts
    - relay/src/generated/stock-dma/user-settings.ts
    - packages/shared/src/relay.ts
    - relay/src/dma/envelope.ts
    - relay/tests/helpers/frames.ts
    - relay/src/dma/__tests__/envelope.test.ts
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/trading/workbench/trading-workbench.tsx
    - webapp/src/components/trading/card/card-tabs.tsx
decisions:
  - 미체결 origin 은 toOrderOrigin 대신 새 toUnfilledOrigin 으로 3종 외 전부 null · 로그 없음 (D-02)
  - VI 배지 굵기는 font-bold (목업 B 700 · tick-order-card 사용례와 동형)
  - 선택 행은 VI 배경을 조건으로 빼서 선택 강조 우선(tailwind-merge 순서 비의존) · 진행률 보조행도 같은 규칙
metrics:
  duration: 약 20분
  completed: 2026-11-12
actuals:
  tokens: 8566
  tasks: 2
  commits: 2
plan_head_before: c867774d
plan_head_after: 4e79fc1533d6e21c1911d1705fd817293322bc45
---

# Quick 261112-w2q: 상따 작업대 미체결 VI 자동주문 표시 Summary

gh-trade `UnfilledState.origin`(204e505d)을 relay 생성물 재동기화 → 파서 `toUnfilledOrigin`(VITrigger→vi, 그 밖 null · 무로그) → shared `RelayUnfilled.origin?` 로 실어 나르고, 작업대 공용 패널 · 전략 카드 「미체결」 탭에서 `origin === 'vi'` 행만 주황 「VI」 배지(title 「VI 자동주문」) + 연주황 행(목업 B)으로 표시한다.

> **Task 3(배포)은 실행하지 않았다 — 배포 대기 · 오케스트레이터(메인 세션) 몫.** 순서는 relay 먼저(`scripts/deploy-relay.sh` → 스모크) → 웹(`git push`). push 전 `git log --oneline origin/master..master` 로 Phase 42 미푸시분이 같이 나가도 되는지 사용자 확인이 필요하다(현재 master 는 origin 보다 66 커밋 앞섬 — 대부분 Phase 42 진행분).

## 재동기화 실측

- gh-trade `server/src/protocol/StockDMA.fbs` 마지막 변경 커밋: `204e505d` (2026-11-12)
- 실행: `cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh` (flatc 25.12.19 · 가드 3종 통과 · 84 개 .ts)
- 실행 전 `--check`: 「신규/변경 예정 : 2 개」 · 「.fbs 사본 : 갱신 예정」 (플래너 기준선과 동일)
- 실행 후 `--check`: 「신규/변경 예정  : 0 개」 · 「.fbs 사본       : 최신 (마커 7줄 제외 본문 동일)」
- 바뀐 생성물(`git status --short relay/src/generated` 실측): `StockDMA.fbs` · `stock-dma/unfilled-state.ts` · `stock-dma/user-settings.ts` — 계획과 동일, 범위 밖 파일 없음
- SYNC MARKER `server-repo-commit`: `a4e54275` → `204e505d`
- gh-trade 저장소: 실행 전후 `git status --short` 동일(기존 미추적 18줄 그대로) — 아무 것도 고치거나 커밋하지 않음
- `UserSettings.buy_group_companion_off_mask` 는 생성물에만 들어왔고 `buildSetUserSettingsReq` 는 손대지 않음

## 커밋

| Task | 커밋 | 파일 |
|------|------|------|
| 1 relay 재동기화 · 파서 · shared 타입 · 헬퍼 · 테스트 | `c27667a1` | relay/src/generated/StockDMA.fbs · relay/src/generated/stock-dma/unfilled-state.ts · relay/src/generated/stock-dma/user-settings.ts · packages/shared/src/relay.ts · relay/src/dma/envelope.ts · relay/tests/helpers/frames.ts · relay/src/dma/__tests__/envelope.test.ts |
| 2 webapp 배지 · 행 배경 · 작업대 공급 · 테스트 | `4e79fc15` | webapp/src/components/orderbook/account-panel.tsx · webapp/src/components/orderbook/__tests__/account-panel.test.tsx · webapp/src/components/trading/workbench/trading-workbench.tsx · webapp/src/components/trading/card/card-tabs.tsx |

두 커밋 모두 경로 지정(`git add <경로>` → `git commit -- <경로>`) · 한글 메시지 · Co-Authored-By 없음 · 삭제 파일 없음.

## 검증 (실제 실행 결과)

**Task 1**
- RED: 새 it ③-4 · ③-5 가 파서 구현 전 2건 실패(`toUnfilledOrigin is not a function` · origin 전부 undefined) 확인
- `--check` grep 카운트 = 2 (통과)
- `pnpm --filter @gh-radar/shared typecheck` · `build` 통과
- `pnpm --filter @gh-radar/relay typecheck` exit 0
- `pnpm --filter @gh-radar/relay exec vitest run src/dma/__tests__/envelope.test.ts tests/account-state.test.ts --maxWorkers=2` → 2 파일 **311 통과**(기준선 309 + 새 2)
- `tsc -p tsconfig.tests.json`: 오류 4건(기준선과 같은 기존 오류 · 다른 파일) · envelope.test.ts · helpers/frames.ts 오류 **0**
- envelope.ts diff 는 추가만(삭제 줄 0) — `toOrderOrigin` 무변경 · `journal.ts` 무변경

**Task 2**
- RED: 새 it 7개 중 6개가 구현 전 실패(상따 회색 회귀 it 는 기존 동작이라 통과) 확인
- `pnpm --filter @gh-radar/webapp exec vitest run src/components/orderbook/__tests__/account-panel.test.tsx --maxWorkers=2` → **92 통과**(기준선 85 + 새 7)
- `grep -c 'originOf={unfilledOriginOf}' trading-workbench.tsx` = 2
- eslint 대상 4파일: 오류 0 · 경고 1(기존 `dirtyCardCount` · 범위 밖)
- `pnpm --filter @gh-radar/webapp exec tsc --noEmit`: `error TS` **0건(전체)** — 범위 밖 오류도 없었음
- account-panel `var(--vi-bg)` 3회 · `VI 자동주문` 존재 · card-tabs `unfilledOriginOf` 1회
- globals.css · shared-panels.tsx · strategy-card.tsx diff 없음

**플랜 전체**
- 커밋 범위 `git diff --name-only c27667a1^..4e79fc15` = frontmatter `files_modified` 11개와 정확히 일치
- 하류 통과 확인(고치지 않음): `use-relay-socket.ts:1628 unfilled.set(u.orderNo, u)` · `subscription-hub.ts:3787 { ...row, name, code }` — 행을 통째로 옮겨 origin 이 그대로 지나간다

## Deviations from Plan

- 줄 번호 소폭 이동(account-panel 배지 · 보조행 · 작업대 호출부 등) — 앵커(`data-slot` · 함수 이름)로 찾아 계획 의도대로 적용. 내용상 변경 없음.
- 테스트에서 `rowOf(orderNo)` 헬퍼로 행을 주문번호로 찾는다(목록 정렬 순서에 기대지 않기 위해) — 계획의 `rows()` 복제 대신. 단언 내용은 behavior 그대로.

그 밖에는 계획대로 실행했다.

## 미실행 항목

- **Task 3 배포(relay → push) — 오케스트레이터 대기.** 실행자는 `deploy-relay.sh` · `git push` · `vercel` · gcloud 쓰기를 실행하지 않았다.
- 화면 확인(장중 VI 자동주문 미체결 발생 시 trade.jx1.io 상따 작업대) — 배포 후 사용자 확인.

## Known Stubs

없음.

## Self-Check: PASSED

- 수정 파일 11개 모두 존재 · 커밋 `c27667a1` · `4e79fc15` 가 HEAD 조상(master)
