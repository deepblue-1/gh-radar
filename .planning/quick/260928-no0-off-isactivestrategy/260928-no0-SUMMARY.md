---
phase: quick-260928-no0
plan: 01
status: complete
subsystem: webapp/me (전략 현황 카드 · 상태줄)
tags: [isActiveStrategy, strategy-status-card, me-page, limit-chaser]
requires: ["webapp/src/lib/limit-chaser.ts isActiveStrategy (무변경)"]
provides: ["/me 전략 현황 카드·상태줄이 켜진 전략만 센다"]
affects: [webapp/src/components/trading/strategy-status-card.tsx, webapp/src/components/trading/me-client.tsx, webapp/e2e/specs/me.spec.ts]
tech-stack:
  added: []
  patterns: ["표시 계층에서만 isActiveStrategy 로 거르기 — 등록 정본(limitChasers 전수)은 리듀서·컨텍스트에 그대로"]
key-files:
  created: []
  modified:
    - webapp/src/components/trading/strategy-status-card.tsx
    - webapp/src/components/trading/__tests__/strategy-status-card.test.tsx
    - webapp/src/components/trading/me-client.tsx
    - webapp/src/components/trading/__tests__/me-client.test.tsx
    - webapp/e2e/specs/me.spec.ts
decisions:
  - "/me 전략 현황 카드와 상태줄 「상따 N건」은 isActiveStrategy(매수∨매도∨취소잔량) 로 거른 켜진 전략만 센다 — 사이드바 sidebarChasers·작업대 pruneInactiveCards 와 같은 한 함수"
  - "빈 상태 문구를 「켜진 상따 전략이 없어요」 / 「트레이딩 › 상따에서 매수·매도·취소 스위치를 켜면 여기에 표시돼요.」로 교체 (등록 ≠ 켜짐)"
metrics:
  duration: "약 3분 (08:10:58Z → 08:14:10Z, 실행 구간)"
  completed: 2026-09-28
  tasks: 2
  files: 5
plan_head_before: 70ff39ce201a5357ca6f829192a86aa7015fabdc
actuals:
  tokens: 5500
  tasks: 2
  commits: 2
---

# Quick 260928-no0: 전략 현황 카드·상태줄 켜진 전략(isActiveStrategy)만 표시 Summary

/me 「전략 현황」 카드와 상태줄이 `limitChasers.filter(isActiveStrategy)` 로 거른 켜진 전략만 행·「상따 N」·빈 상태·킬 스위치 판정·확인 다이얼로그 건수에 쓴다. 서버가 게이트만 내린 crud "C" + 세 스위치 OFF 전략은 더 이상 카드에 쌓이지 않는다.

## 완료한 작업

| Task | 이름 | 커밋 | 파일 |
| ---- | ---- | ---- | ---- |
| 1 | 카드 필터 + 빈 상태 문구 + 주석 ⑨/② + 상태줄 + RTL 계약 (TDD) | 16b4a01f | strategy-status-card.tsx, strategy-status-card.test.tsx, me-client.tsx, me-client.test.tsx |
| 2 | e2e me.spec 케이스 3·4 새 계약으로 갱신 + 실 relay 실행 | c8e0c38e | webapp/e2e/specs/me.spec.ts |

### Task 1 (tracer · tdd)
- RED: 픽스처 `CHASER_OFF`·`CHASER_CANCEL_ONLY` 추가, 새 describe 「켜진 전략만 나열」 T-a~T-f, ⑦·⑦-a 문구 갱신, me-client.test 에 상태줄 케이스(T-g) 추가 → 8건 실패 확인 (T-c 는 필터가 없을 때도 통과하는 게 정상 — 매수∨매도 판정으로 바뀌는 회귀를 잠그는 케이스).
- GREEN: `import { isActiveStrategy } from "@/lib/limit-chaser"`, `activeChasers = limitChasers.filter(isActiveStrategy)` → `chaserCount = activeChasers.length`, 행 `.map` 대상 `activeChasers`, 빈 상태 두 문구 교체, `nothingToDisable` JSDoc 갱신, `useSnapshotSeen` JSDoc 인용 교체, 상단 ② 「켜진 전략의 상태를 전부 보여준다」, ⑨ 항목 신설.
- **상태줄도 켜진 수로 맞췄다**: me-client.tsx `MeStatusBar` 의 「상따 N건」이 `limitChasers.filter(isActiveStrategy).length` 를 센다 (주석 한 줄 포함). 카드·상태줄·사이드바가 같은 isActiveStrategy 기준이다.
- tracer 게이트: verify 재실행 green (vitest 2파일 38건 통과 · typecheck(앱+e2e) green · grep 게이트 전부 통과 · lib/layout/server/relay/shared diff 0).

### Task 2
- 케이스 3: 새 빈 상태 두 문구 단언.
- 케이스 4: 제목을 「…꺼진 전략이 카드·사이드바에서 빠진다 (D-09)」로 변경. 에코 뒤 「상따 0 · VI 중지」, 행 0, 「켜진 상따 전략이 없어요」, VI 요약 「—」, 사이드바 buyDots 0, 「전체 비활성화」 disabled, 상태줄 「상따 0건」을 단언. 옛 배지 부재·행 3 단언 제거.

## 검증

- `vitest` 대상 2파일: 38/38 통과.
- `pnpm --filter @gh-radar/webapp run test` 전체: 125 파일 · 2764 통과 · 1 skipped (skip 은 기존 `src/lib/__tests__/watchlist-api.test.ts` 것, 이번 변경과 무관).
- `typecheck` (tsc --noEmit + tsconfig.e2e.json): green.
- **e2e `me.spec.ts --project=chromium`: 실제 로컬 relay(withLocalRelay)로 실행해 12/12 통과** (setup 1 + 케이스 11). 실행 전 :3100·:8090 리스너 없음 확인, .next 캐시 삭제 불필요했다.
- 옛 빈 상태 문구(`등록된 상따 전략이 없어요` · `종목을 고르면 여기에 표시돼요`) webapp/src · webapp/e2e 0건.
- `git diff 70ff39ce..HEAD -- webapp/src/lib webapp/src/components/layout server relay packages/shared` 0.

## TDD Gate Compliance

- RED: 테스트 추가 후 8건 실패 확인 (구현 전). 테스트와 구현을 한 커밋(16b4a01f)으로 묶었다 — 오케스트레이터 지시가 「태스크당 원자 커밋」이라 RED 전용 커밋은 두지 않았다.
- GREEN: 구현 후 38/38 통과.
- REFACTOR: 불필요.

## Deviations from Plan

None - plan executed exactly as written.

(참고: 플랜 Task 1 action 의 「두 파일만 add」 문구와 달리 me-client.tsx·me-client.test.tsx 도 같은 커밋에 포함했다 — `<files>` 와 T-g 가 요구하는 범위이고 오케스트레이터 제약도 T-g 를 Task 1 에 포함시켰다.)

## Threat Flags

없음 — 새 입력·송신 경로 없음. T-no0-01(표시 무결성)은 T-c 로, T-no0-02(킬 스위치 봉쇄)는 T-d·T-e·e2e 케이스 4 로 잠갔다.

## Known Stubs

없음.

## Self-Check: PASSED

- FOUND: webapp/src/components/trading/strategy-status-card.tsx (limitChasers.filter(isActiveStrategy) 포함)
- FOUND: webapp/src/components/trading/__tests__/strategy-status-card.test.tsx (「켜진 상따 전략이 없어요」 포함)
- FOUND: webapp/e2e/specs/me.spec.ts (「켜진 상따 전략이 없어요」 포함)
- FOUND: 커밋 16b4a01f, c8e0c38e
