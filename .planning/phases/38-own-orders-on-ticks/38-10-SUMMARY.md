---
phase: 38-own-orders-on-ticks
plan: 10
subsystem: ticks
tags: [deploy, uat, supabase, cloud-run, vercel, tick-viewer, own-orders]

requires:
  - phase: 38-03
    provides: "tick_own_for_user RPC · GET /api/ticks/own 잠금(pgTAP 52 · supertest)"
  - phase: 38-09
    provides: "e2e 「틱뷰어 우리 주문 · 체결 (Phase 38)」 절"
provides:
  - "원격 마이그레이션 20261104100000_tick_own_for_user (Local | Remote)"
  - "server 리비전 gh-radar-server-00072-44q — /api/ticks/own"
  - "webapp 프로덕션 — Phase 38 + UAT 반영(966bce0b)"
affects: []

estimate:
  tokens: 35000
  tasks: 3
actuals:
  tasks: 3
  commits: 3

key-files:
  created:
    - .planning/sketches/026-tick-side-own-tab/index.html
    - .planning/sketches/026-tick-side-own-tab/README.md
  modified:
    - webapp/src/lib/ticks/use-own-nav.ts
    - webapp/src/components/ticks/tick-header.tsx
    - webapp/src/components/ticks/tick-viewer.tsx
    - webapp/src/components/ticks/tick-own-section.tsx
    - webapp/src/components/ticks/tick-order-card.tsx
    - webapp/e2e/specs/ticks-viewer.spec.ts

key-decisions:
  - "사용자 지시로 장중(17:08 KST) DB push — 계획의 「20:00 뒤」 를 사용자가 위험(부분 인덱스 2개 생성 중 저널 쓰기 잠깐 잠김)을 보고 뒤집었다. push 는 오류 없이 끝남"
  - "배포는 전용 worktree 브랜치(phase-38-own-orders)에서 origin master 로 fast-forward push — 메인 트리 로컬 master 에 relay 선배포가 필요한 다른 세션 커밋(상따 매도 위험도)이 있어 master 를 통째로 push 하지 않았다"
  - "UAT: [ ] 탐색 대상에 조건 근거 행 · 주문 줄 추가 — 알약 「◆ 우리 k/n · 주문 m」"
  - "UAT: D-07 뒤집기 — 그날 「우리 주문」 표를 오른쪽 열 「이 주문 · 팀 | 우리 주문 n」 둘째 탭으로(스케치 026 A · 거르기 칩 · 탭 유지 · 고른 행 자동 스크롤). 「◆ 우리 주문 #…」 섹션은 카드 그대로"
  - "UAT: 호가 잔량 표시 기본 = 금액"

requirements-completed: []

duration: ~1h30m
completed: 2026-11-03
---

# Phase 38 Plan 10: 배포 · 프로덕션 UAT Summary

**DB · server · webapp 을 순서대로 프로덕션에 올리고, 사용자 UAT 에서 나온 세 가지(탐색 대상 확장 · 「우리 주문」 탭 분리 · 호가 기본 금액)를 반영해 다시 배포했다. 사용자 UAT 「OK」.**

## Task 1 — 전체 회귀 게이트 (master 병합 후)

| 명령 | 결과 |
|---|---|
| shared vitest | 1074 passed · 2 skipped(기존 선택 블록) |
| relay typecheck · typecheck:tests | 통과 |
| server typecheck · ticks / ticks-live | 44 passed |
| webapp typecheck(앱 + e2e) · src/lib/ticks · src/components/ticks | 350 passed |
| playwright ticks-viewer `--workers=1` | 24 passed |
| pgTAP tick_own | 1..52 PASS |
| pgTAP tick_viewer | 1..109 PASS |

배포 전 브랜치에 master(스케치 024 · Shift+] [ · sell-risk 인계)를 병합했다(79111c5f · 충돌 3곳 양쪽 합침).

## Task 2 — 배포

| 단계 | 결과 |
|---|---|
| `supabase db push --linked --yes` | 17:08 KST · 20261104100000 Local \| Remote (원격 미적용은 이것 하나뿐이었다) |
| server | gh-radar-server-00072-44q · 라이브 env 그대로(CORS · RELAY_INTERNAL_URL · TICKGW_URL · DISCUSSION_CLASSIFY_ENABLED=false 등) · 스모크 15/15 |
| 무인증 | /api/ticks/own 401 · /api/ticks/live 401 (스모크 INV-8 직후 잠깐 429 → 창 지난 뒤 401) |
| git push | 17:11 KST · origin master 483500a9..79111c5f (fast-forward) |
| Vercel | 17:11:14 프로덕션 Ready |

## Task 3 — UAT

- 사용자 답(1차): 「1. 우리팀 주문 [] 로 이동하는거, 체결만 이동해? 주문이나 근거도 포함해줘. 2. 오른쪽에 우리주문 패널을 탭으로 분리할까? 나머지는 ok야」
- 반영: [ ] 대상 확장 · 스케치 026(A/B/C → 「A」) · 사용자 추가 요청 「오더북 잔량표시 기본을 금액으로」
- 재배포: 966bce0b(UAT 반영) · 71333d5c(그 사이 origin 에 들어온 상따 매도 위험도 · 1호 매도 열 병합) → 18:22 KST push babf1eef..71333d5c · Vercel 18:22:10 Ready · 단위 353 · e2e 24
- 사용자 답(2차): 「ok」

## Deviations

1. **[사용자 결정] 장중 DB push** — 계획은 20:00 KST 뒤. 사용자 「지금 배포하자」.
2. **[UAT] D-07 뒤집기** — 그날 표를 탭으로 분리(스케치 026 A).
3. **스케치 번호 026** — 다른 세션이 같은 시간에 025(msg-book-total-ratio)를 먼저 push 해 내 스케치를 026 으로 바꿨다(push 전 커밋 수정).
4. **cross-session 알림 미전달** — phase 37 세션에 origin 이동 알림을 보냈으나 권한 모드 차이로 승인 없이 만료.

## Known follow-ups (UAT 에서 사용자가 문제 삼지 않음)

- 차트 가격 판 밖 우리 점은 그리지 않는다(판 끝 붙이기 없음).
- 차트 ◆ 클릭은 고른 우리 줄을 풀지 않는다(알약 k 표시).
- 추정 꼬리말 「{d}ms 안 후보 k개」 의 k 는 매칭 창 전체 후보 수.

## Self-Check: PASSED
