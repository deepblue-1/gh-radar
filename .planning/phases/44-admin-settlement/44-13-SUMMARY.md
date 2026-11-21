---
phase: 44-admin-settlement
plan: 13
subsystem: deploy
tags: [deploy, supabase, cloud-run, vercel, settlement]

requires:
  - phase: 44-04
    provides: 시드 마이그레이션 20261120130000_settlement_seed.sql
  - phase: 44-12
    provides: 정산 e2e
provides:
  - 원격 Supabase 에 정산 스키마 · 거래 RPC · 정산 RPC · 시드 적용
  - server revision gh-radar-server-00099-5bd (APP_VERSION 287c3fe5)
  - webapp 프로덕션 (Vercel · 287c3fe5)
affects: []

actuals:
  tasks: 3
  commits: 0
plan_head_before: ff4979e0
plan_head_after: 287c3fe5

key-files:
  created: []
  modified: []

key-decisions:
  - "T1 게이트의 두 어긋남은 배포를 막지 않는다고 판단 — server 뉴스 테스트 V-news-cursor-a(날짜 시한폭탄 · phase 밖 기존 실패) · OUT-OF-SCOPE 3e4c635a(discuss 커밋이 tasks/lessons*.md 를 함께 바꿈 · 배포 표면 아님)"
  - "push 범위에 옆 세션 커밋 287c3fe5(iOS 사이드바 수정)가 섞임 — 사용자에게 물어 「전부 배포 + push」 답을 받고 진행"
  - "사람 카드 큰 숫자는 지금처럼 totalKrw(내 수익 몫) 유지 — 사용자 답 2026-11-21 (44-06 열린 질문 닫힘)"
---

# 44-13 배포 · 운영 확인 SUMMARY

## T1 배포 전 게이트 (전용 worktree `p44-gate` @ ff4979e0 · 메인 트리에 옆 세션 미커밋이 있어 분리)

| 단계 | 결과 |
|---|---|
| shared build · vitest | 1458 통과 · 2 skip |
| server vitest | 1136 통과 · **1 실패** — `tests/routes/news.test.ts` V-news-cursor-a (phase 밖 기존 날짜 시한폭탄) |
| server · webapp typecheck | 통과 |
| webapp vitest | 6494 통과 · 1 skip |
| webapp build | 통과 |
| pgTAP settlement · settlement_seed · dart_alert | 192 · 27 · 183 — 모두 PASS |
| Playwright admin-settlement | 9 통과 |
| RPC 이름 대조 | RPC-COUNT 7 · MISSING-RPC 0 |
| 마이그레이션 불변 | MIGRATION-UNCHANGED (네 파일 각자 처음 더한 커밋 하나뿐 · 구분 표지 6개 커밋본에 있음) |
| D-02 · 플랜별 커밋 | 통과 (44-01 ~ 44-12 모두 커밋 있음) |
| phase 커밋 범위 | 72 커밋 · relay 변경 0 · OUT-OF-SCOPE 1건 = `3e4c635a docs(44)` 가 `tasks/lessons.md` · `tasks/lessons-archive.md` 를 함께 바꿈(배포 표면 아님 · 통과로 판단) |

## T2 배포 (메인 세션)

1. 범위: 메인 트리 server · packages/shared · supabase 미커밋 0. push 대상 중 이 phase 밖 커밋은 옆 세션 `287c3fe5 fix(webapp): iOS 앱 복귀 뒤 사이드바 …` 1건 — 사용자 답 「전부 배포 + push」.
2. push 대기 목록: Local 전용 = 이 phase 네 파일뿐 (`20261120100000_settlement` · `20261120110000_settlement_ledger_rpc` · `20261120120000_settlement_settle_rpc` · `20261120130000_settlement_seed`). 원격 머리 `20261119170000` — 개명 없음.
3. `supabase db push --linked --yes` — 네 파일 적용 · 시드 실패 없음.
4. **SCHEMA-PUSHED · REMOTE-SCHEMA-OK** — 함수 7 + `settlement_ledger_json` · `settlement_seed` · 표 5 · 구분 표지 6개 원격 덤프에 있음. 메움 마이그레이션 없음.
5. 44-04 답 (가) — 대시보드 수동 실행 없음.
6. server: 라이브 이미지 `cbd1a991` 이 HEAD 의 조상 확인 → env 4개(SUPABASE_URL · CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL · TICKGW_URL)를 라이브 서비스에서 비출력 추출 · GCP_PROJECT_ID=gh-radar → `scripts/deploy-server.sh` → revision `gh-radar-server-00099-5bd` · env 23개 대조 · 스모크 15/15. 이번 배포로 이미 push 돼 있던 server 수정 3건(launch 2 · order-log 1)도 함께 실림.
7. **SERVER-LIVE 287c3fe5**.
8. `git push` `43d22363..287c3fe5` → Vercel Production Ready.

## T3 운영 확인 (2026-11-20 ~ 21)

1. 예수금: 네 계좌 모두 설정됨 — KB 정근형 8억 4,725만 · 교보 김현중 6억 8,435만 · 교보 정근형 2,001만 · KB 김현중 3억 7,592만.
2. 등록 서버 수: 교보 김현중이 서버마다 예수금이 달라 화면에 「주문 서버 값으로 계산」 경고가 떴다 → 사용자가 서버별 예수금을 맞춤(「맞췄어」).
3. 검산 대조: 계좌 수익 +10억 6,725만 · −1,564만 · +1만 · −2,407만 (검산 +10억 6,500만 · −1,600만 · 0 · −2,800만 — 차이는 예수금이 11-19 잔액과 다른 만큼: +225만 · +35만 · +1만 · +392만). 지금 몫 전체 9억 2,580만 · 9억 2,580만 · 7,592만. 「김현중 → 정근형 5,854만원이면 맞음」(검산 5,950만 — 예수금 차이). 계좌이체 4억 · 7억 · 법인 용역 3억 — 검산과 정확히 같음. 계좌 거래 9건 표시.
4. 소액 반영 · 되돌림: 사용자 pass.
5. 폭 눈 확인(360 · 390 · 데스크톱): 사용자 pass.

D-30(거래 지우기 · 정산 취소에서 되돌릴 수 없을 때 미리 막고 안내 · 보내기만 실패하면 창을 닫지 않고 문장 표시 · 확정 잠금)의 동작은 server 통합 테스트(44-05 · 44-08)와 webapp 컴포넌트 테스트(44-10 · 44-11)가 잠갔고, e2e(44-12)는 이 확인 창 동작을 다루지 않는다.

## Self-Check: PASSED
