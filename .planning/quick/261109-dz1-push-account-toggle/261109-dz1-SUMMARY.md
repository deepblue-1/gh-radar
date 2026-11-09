---
phase: quick-261109-dz1
plan: 01
subsystem: push
status: complete
tags: [push, dma_push_claim, supabase, server, webapp, quick]
requires:
  - dma_push_claim(20261107100100) · dma_push_devices(20261107100000)
  - /api/push-devices 라우터 · PushDevicesPanel(quick-261107-fbj)
provides:
  - dma_push_account_mutes 표 · RPC dma_push_account_mutes_for_user · dma_push_account_mute_set
  - dma_push_claim 끈 계좌 사용자 기기 제외(CREATE OR REPLACE · 조건 1개)
  - GET /api/push-devices/accounts · PUT /api/push-devices/accounts/:accountNo
  - 「매매 알림」 패널 「받을 계좌」 섹션(스케치 031 A)
affects: [relay 판정 결과(코드 무변경) · webapp 매매 알림 시트/팝오버]
tech-stack:
  added: []
  patterns: [use-push-devices 동형 모듈 저장소 · 낙관적 갱신 + 되돌림]
key-files:
  created:
    - supabase/migrations/20261109100000_dma_push_account_mutes.sql
    - supabase/tests/dma_push_account_mutes.test.sql
    - webapp/src/lib/push/use-push-account-mutes.ts
  modified:
    - supabase/tests/dma_push_devices.test.sql
    - server/src/schemas/push-devices.ts
    - server/src/services/push-devices.ts
    - server/src/routes/push-devices.ts
    - server/tests/routes/push-devices.test.ts
    - webapp/src/lib/push/push-devices-api.ts
    - webapp/src/components/me/push-devices-panel.tsx
    - webapp/src/components/me/__tests__/push-devices-panel.test.tsx
decisions:
  - "계좌별 끄기 판정은 dma_push_claim 기기 SELECT 의 NOT EXISTS 1개 — relay 무변경(D-05)"
  - "dma_push_devices.test.sql 의 dma_push_% 접두사 RLS 열거 기대값에 새 표를 넣었다(모든 push 표 RLS 불변식 유지)"
metrics:
  duration: "약 25분"
  completed: 2026-11-09
actuals:
  tokens: 37000
  tasks: 3
  commits: 3
plan_head_before: 65656b4ad4d1dba029dc7d24f16e6fe5108d69f0
plan_head_after: 843a0140f9dd15d144360eac24b00f087ac9fd13
---

# Quick 261109-dz1: 매매 알림 계좌별 켜고 끄기 Summary

매매 알림(앱 푸시)을 사용자 × 계좌 단위로 끈다 — 새 표 `dma_push_account_mutes` 와 판정 RPC `dma_push_claim` 기기 고르기 조건 1개(relay 무변경), server GET/PUT `/api/push-devices/accounts`, 「매매 알림」 패널 「받을 계좌」 스위치(낙관적 갱신 · 실패 시 되돌림).

pgTAP 은 실제로 실행했다(로컬 일회용 컨테이너 · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 를 pull 한 뒤 실행). 원격 적용 · 배포 · push 는 하지 않았다.

## 커밋

| Task | 내용 | 커밋 |
|------|------|------|
| 1 | DB — 끈 계좌 표 · RPC 2개 · dma_push_claim 끈 계좌 조건 + pgTAP | 77c2561e |
| 2 | server — GET /accounts · PUT /accounts/:accountNo | 4d3c1e64 |
| 3 | webapp — 끈 계좌 저장소 + 「받을 계좌」 섹션 | 843a0140 |

## 검증

- pgTAP `dma_push_account_mutes.test.sql` 29/29 ok (잠금 · 멱등 · D-04 · 거부 5종 · claim 통합 9 · CASCADE)
- pgTAP 회귀 `dma_push_claim.test.sql` 90/90 ok · `dma_push_devices.test.sql` 48/48 ok(아래 편차 1 반영 뒤)
- claim 본문 diff 게이트: 원본 쪽 1줄(CREATE 줄) · 새 쪽 4줄(CREATE OR REPLACE + 주석 1 + 조건 2) · 원본 20261107100100 무변경
- server `tests/routes/push-devices.test.ts` 31/31 (기존 21 + 새 10) · server typecheck 통과
- webapp `push-devices-panel.test.tsx` 25/25 (기존 17 + 새 8) · `push-alert-bell.test.tsx` 10/10 · webapp typecheck(tsc + e2e tsconfig) · eslint 4파일 통과
- 추가 회귀(패널을 품는 화면): account-card · src/app 6파일 40/40 · me-client · trading-workbench · theme-toggle 195/195
- 범위 게이트: 이 quick 커밋에 relay/ · packages/ · app-shell.tsx · push-alert-bell.tsx 없음
- vitest 전부 `--maxWorkers=2` · e2e 미실행(범위 상한)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 기존 pgTAP `dma_push_devices.test.sql` 47번이 새 표 때문에 실패**
- **발견:** Task 1 회귀 실행
- **문제:** 47번 단언이 `relname LIKE 'dma\_push\_%' AND relrowsecurity` 로 RLS 표를 열거하고 기대값을 4개 표로 고정해 둬서, RLS 가 켜진 새 표 `dma_push_account_mutes` 가 열거에 들어와 not ok.
- **수정:** 기대 배열에 `dma_push_account_mutes` 를 넣고 설명을 「dma_push_* 표 전부 RLS 켜짐(새 표 4개 + quick-261109-dz1 끈 계좌 표)」 로 바꿨다. 「모든 push 표가 RLS 켜짐」 이라는 불변식은 그대로 두고 대상을 넓혔다. 이 파일은 플랜 files 밖이라 Task 1 커밋에 함께 넣었다.
- **커밋:** 77c2561e

**2. [절차] Task 1 TDD 순서**
- 마이그레이션과 pgTAP 을 같이 쓴 뒤 처음 돌렸다. 마이그레이션 없이 pgTAP 을 먼저 실패시키는 RED 실행은 따로 하지 않았다. Task 2 · 3 은 테스트를 먼저 써서 RED(server 10 실패 · webapp 모듈 없음)를 확인한 뒤 구현했다.

**3. [참고] master 직접 커밋**
- 오케스트레이터가 순차 실행(`<sequential_execution>`)으로 main tree master 에 커밋하라고 지시했다(config `branching_strategy: none`). 명시 경로만 stage 했고, 옆 세션 파일(app-shell.tsx · .planning/sketches/*)은 stage 하지 않았다.

## 배포 순서 (메인 세션 몫)

`supabase db push --linked --yes`(새 표 + claim 교체) → `scripts/deploy-server.sh` → git push(webapp). relay 는 바뀌지 않는다.
webapp 이 server 보다 먼저 나가면 GET /accounts 가 404 → 섹션에 「받을 계좌 설정을 읽지 못했어요」 · 스위치 disabled 로 남는다(깨지지 않음).

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 존재: 마이그레이션 · pgTAP · use-push-account-mutes.ts 모두 FOUND
- 커밋 존재: 77c2561e · 4d3c1e64 · 843a0140 모두 HEAD 의 조상
