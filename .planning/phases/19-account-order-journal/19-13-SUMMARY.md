---
phase: 19-account-order-journal
plan: 13
subsystem: verification
tags: [reconciliation, journal, observer, D-01, D-02, D-06, D-11, D-12, D-14]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-12 프로덕션 전환 43d4d0c (relay · server · webapp)"
provides:
  - "19-RECONCILIATION.md — 첫 거래일(2026-09-28) 계좌별 대조표 + 09-29 ~ 10-02 요약 · 판정 종결"
affects: []

actuals:
  tokens: 15000
  tasks: 2
  commits: 0

key-files:
  created:
    - .planning/phases/19-account-order-journal/19-RECONCILIATION.md
  modified: []

key-decisions:
  - "사용자 판정(2026-10-03): 실서버 주문 실사용으로 확인됨 — 종결. 브로커 체결내역 · 게이트웨이 기록 건별 숫자 대조는 생략"
  - "relay 로그 조회는 권한 거부로 못 함 — 끊김 확인은 이벤트 seq 연속성(1 ~ 5062, 빠진 번호 0)과 커서 last_seq 일치로 갈음"
---

# Phase 19 Plan 13: 첫 거래일 실장 대조 Summary

전환 뒤 첫 거래일(2026-09-28)과 이후 4거래일의 DB 기록을 계좌별로 모아 대조했다. 이상은 0건이고, 사용자 실사용 판정으로 종결했다.

## Task 1: DB 쪽 사실 수집

- **seq 연속성:** KB epoch `20260925-f337…` 의 이벤트가 seq 1 ~ 5062 로 빠짐없이 이어진다. `dma_journal_cursor` KB `last_seq` 5062 와 맞고, 모든 이벤트에 `applied_at` 이 있다. relay 가 끊겼다 붙은 구간이 있었더라도 이어받기로 메워졌다(D-11 · D-12).
- **apply_error:** 09-28 ~ 10-02 전부 0.
- **공유 계정(D-06):** 같은 DMA 계정을 쓰는 두 사용자의 `dma_journal_orders_for_user` 결과가 09-28 203 = 203 으로 같고 id 집합도 같다. 이후 4거래일도 전부 같다. 09-23 의 43 vs 2 는 재현되지 않았다.
- **동결(D-01):** `dma_orders` 최신 `updated_at` 은 2026-09-23 10:51 UTC(전환 전)다.
- **로컬 거부(D-02):** 거래일 · 계좌마다 `local_reject` 이벤트 수와 `reject_seq` 주문 행 수가 같다.
- **마스킹:** 문서에 계좌는 앞 4자 + `****`, 사용자 id 는 앞 4자 + `…` 로만 적었다. 8자리 이상 숫자는 epoch 의 날짜(20260925)뿐이다.

## Task 2: 사람 대조 (checkpoint)

사용자 판정은 「실서버 주문으로 다 테스트됨 — 완료 처리」(2026-10-03)다. 대조표의 브로커 · 게이트웨이 칸에는 「건별 대조 생략(사용자)」 로 적었다. 판정은 **종결**, 갭은 0건이다.

## Deviations from Plan

- relay 컨테이너 로그(⑥)는 프로덕션 로그 조회 권한이 거부돼 수집하지 못했다. 대신 seq 연속성으로 같은 질문(끊김 구간 주문 누락 여부)에 답했다.
- 브로커 체결내역 건별 대조는 사용자 결정으로 생략했다.
