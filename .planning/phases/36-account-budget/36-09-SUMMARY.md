---
phase: 36-account-budget
plan: 09
subsystem: deploy
tags: [deploy, uat, inbox]
requires: [36-04, 36-05, 36-06, 36-07, 36-08]
provides: [phase-36-production]
affects: [supabase-remote, relay, server, webapp]
key-files:
  created: []
  modified:
    - docs/inbox/from-gh-trade/261027-account-budget.md
    - docs/inbox/from-gh-trade/261027-account-pnl.md
key-decisions:
  - "배포는 Phase 35 종료(대기 상태) 뒤 master 병합과 함께 — 사용자 결정"
  - "원격에 Phase 35 의 20261028200000·200100 이 먼저 있어 36 마이그레이션 시각을 20261028210000·210100 으로 옮김 — 사용자 결정 「시각 뒤로 바꾸기」"
duration: ~25min (배포) + UAT
completed: 2026-10-28
---

# Phase 36 Plan 09: 배포 · 라이브 UAT · 인박스 닫기 Summary

**Phase 36 을 DB → relay → server → webapp 순서로 프로덕션에 올렸고, 사용자 라이브 UAT A~F 가 모두 통과했으며, gh-trade 인박스 두 노트를 닫았다.**

## 병합 (배포 전)

- 사용자 결정(2026-10-28 01시): 「35 끝난 뒤 함께」. 02:40 KST 에 Phase 35 세션이 대기 상태이고 master 가 origin 과 같아(2f26aea4) 진행했다.
- 전용 브랜치 `gsd/phase-36-account-budget` 에 master 를 병합 — `f92b5da8`. 충돌 12개(STATE · state.json · shared admin · relay admin-api/types/envelope · 생성물 2 · 테스트 4)를 합집합으로 풀었다. op 6·7 = Phase 36, op 8·9 = Phase 35 로 의미 충돌 없음. 생성물은 master 의 Phase 43 SYNC(f156cb6f)를 썼고, Phase 36 필드(44 budget/fee/tax · 87 3필드 · 66/67 budget · JournalRecord 4필드)가 모두 들어 있음을 확인했다.
- 병합 뒤 확인: shared 816 · relay 1771 · server 667 전체 통과, webapp admin/pnl/orderbook/lib 2182 통과, 타입체크 전부 통과.
- 마이그레이션 시각 이동 `711d1a53`, master fast-forward, 브랜치 · worktree 삭제.

## Task 1 — 배포

| 단계 | 시각(KST) | 결과 |
|---|---|---|
| pgTAP | — | ok (36-05 · 36-07 · 36-08 SUMMARY) |
| `supabase migration list --linked` | 02:45 | 원격 최신 20261028200100 → 사용자 결정으로 시각 이동 |
| `supabase db push --linked --yes` | 02:49 | `20261028210000_dma_journal_pnl` · `20261028210100_dma_pnl_rpcs` 적용 |
| relay | 02:51 | `relay:711d1a53` (직전 `2f26aea4`) · detached worktree 에서 배포 · smoke 11/11 PASS · healthz journal live lag 0 |
| server | 02:53 | `gh-radar-server-00069-qwg` (직전 00068) · smoke 15/15 PASS · 무인증 `GET /api/pnl` · `GET /api/admin/pnl` · `PUT …/budget` 모두 401 |
| webapp | 02:54 | `git push` `2f26aea4..711d1a53`(Phase 36 커밋만) · Vercel Production Ready(02:54:23 생성) |

relay 로그: 기동 직후 `[DMA] 프레임 드롭`(msgType 89 unknown) 5건 — 직전 배포(2f26aea4) 기동 때도 같은 5건이라 무관. 저널 적용 실패 줄 없음.

## Task 2 — 라이브 UAT

사용자 답 원문: **「1-6 pass」** (2026-10-28) — A~E OK · F OK.

G(두 서버 동시 운영 「켜기 전 결정」 에 예수금 갈림 기록): Phase 36 완료 처리 때(2026-10-28) STATE.md Blockers 의 Phase 29 「켜기 전 결정」 줄에 반영. Phase 35 종료 뒤 STATE.md Blockers 에 「예수금 갈림 — 체결 조정이 서버마다 따로 가므로 두 서버 동시 운영 전 서버 간 예수금 동기화 결정 필요(Phase 36 D-03)」 한 줄을 넣는다.

## Task 3 — 인박스 닫기

`3cab9d60` — 261027-account-budget · 261027-account-pnl 두 노트 `status: done` · `done_commit: 711d1a53` · `## 회신`(배포 · UAT · 질문 답). 커밋 파일은 정확히 두 노트.

## Deviations

- 마이그레이션 파일명 변경(20261027210000·210100 → 20261028210000·210100) — 플랜 Task 1 step 2(b) ① 경로, 사용자 승인.
- 배포는 메인 트리가 아니라 `711d1a53` detached worktree 에서 했다(동시 세션 미커밋 파일 회피).

## Self-Check: PASSED
