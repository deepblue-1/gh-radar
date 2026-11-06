---
phase: quick-261106-t8k
plan: 01
subsystem: webapp-e2e
tags: [e2e, playwright, admin, accounts]
status: complete
requires: [261106-lwu, 261106-ntl]
provides:
  - "mockAdminApi /accounts 분기(GET·POST·PUT·DELETE · budget/fee 팬아웃) + 사용자 픽스처 파생 계좌 마스터"
  - "admin-accounts.spec.ts AC-1 ~ AC-4"
affects: [webapp/e2e/specs/admin-servers.spec.ts (같은 목 사용 — typecheck 통과)]
tech-stack:
  added: []
  patterns: ["목 쓰기 규칙 한 벌(normalizeEndpointPair · applyCost)을 사용자 경로와 계좌 경로가 공유"]
key-files:
  created:
    - webapp/e2e/specs/admin-accounts.spec.ts
  modified:
    - webapp/e2e/fixtures/admin.ts
    - webapp/e2e/specs/admin.spec.ts
    - webapp/e2e/specs/sidebar-tree.spec.ts
decisions:
  - "계좌 마스터 「쓰는 사용자」 는 GET 때 현재 사용자 상태에서 계산 — 사용자 화면의 생성·연결 결과가 그대로 반영된다"
  - "P36-B1 의 「확인 전」 단언은 교보 카드가 아니라 비용 값을 아는 서버가 없는 불일치 계좌(11122233302) 카드로 — 교보 위탁은 KYOBO119 값을 알아 읽기 줄이 7억으로 나온다(KYOBO127 「확인 전」 칩은 카드에서 사라짐)"
metrics:
  duration: "약 9분"
  completed: 2026-11-06
actuals:
  tokens: 9400
  tasks: 3
  commits: 3
plan_head_before: fa7e432aca7494b5738d4951b77d9aeadbf05fef
plan_head_after: 765a3b22022538401d84d36b881c39ac3443efca
---

# Quick 261106-t8k Plan 01: 어드민 e2e 를 새 UI(계좌 메뉴 · 계좌 시트 · 피커 · 사이드바 N-04) 기준으로 Summary

옛 카드 편집 UI 를 단언하던 admin e2e 를 정리하고, 계좌 시트로 옮겨 간 IP/MAC · 예수금/수수료 동작을 `/admin/accounts` 실 middleware + 넓힌 `mockAdminApi` 로 다시 잠갔다 — 세 spec 32 passed.

## 커밋

| Task | 커밋 | 내용 |
| ---- | ---- | ---- |
| 1 (tracer) | 571d97ab | 목 `/accounts` 확장 + AC-1 계좌 목록 · 등록 · 삭제 잠금 스모크 |
| 2 | 414cc9ba | admin.spec.ts · sidebar-tree.spec.ts 새 UI 기준 · 옛 UI 테스트 제거 · `ADMIN_CODE7_MESSAGE` 제거 |
| 3 | 765a3b22 | AC-2 IP/MAC · AC-3 예수금/수수료 · AC-4 폰 390 |

## 지운 테스트 (admin.spec.ts)

- P30-E2 카드 편집 → IP/MAC 저장 → 표시 표기 · 변경 없음 (390 · 1080)
- P30-E3 검증 · code 13 원문 · 한 카드 잠금
- P30-E4 계좌명 편집 → 카드 새 이름
- P30-E5 계좌 추가 폼에는 IP/MAC 칸이 없다
- P30-E6 공유 계좌 안내 · 저장 뒤 함께 쓰는 사용자 카드 (390 · 1080)
- P30-E7 공유 계좌 code 7 원문 · 편집 유지
- P36-B1(옛) 카드 비용 입력칸 저장 · 범위 · 서버 미지원 · P36-B2 폰 2줄 배치
- 함께 지운 것: `SHARED_NOTE_KIM` · `RANGE_INVALID` · `PAIR_INVALID` · `KIM_KYOBO` 상수, `ADMIN_CODE13_MESSAGE` · `ADMIN_CODE7_MESSAGE` · `ADMIN_SHARED_ACCOUNT` import, 픽스처 export `ADMIN_CODE7_MESSAGE`(어느 spec 도 안 씀 · 목의 전파 흉내 분기는 그대로)

## 고친 테스트

- sidebar-tree.spec.ts `TREE_LINKS` — … AI 애널리스트 · My page · Admin · 매매손익 · 계좌 · 사용자 · 서버 · 발사 (app-sidebar.test.tsx 기대값과 같음) + 위 주석
- P29-A2 — Admin href `/admin/pnl` · 「계좌」 href `/admin/accounts`
- P29-A3c — 「KB … 연결 해제」 · 「+ 계좌 연결」 · 피커 폼 「취소」 · 「연결」 높이(데스크톱 28 · 폰 ≥36)
- P29-A4 — 첫 계좌를 피커 검색 `12345678` → 라디오 `KB 12345678`(exact) · 고르기 전 서버 체크 0 · POST 바디 기존과 동일
- P29-A5 — 생성 시트 피커에서 교보 98765432 → 서버 후보 KYOBO 2대만 · 편집 시트 DMA 연결도 피커 · 카드 메타 줄 `지점 해당 없음 · 트레이더 해당 없음 · 계좌명 · 지점 · 트레이더는 「계좌」 메뉴에서`
- P30-E1 — 읽기 줄 끝 ` · 설정은 「계좌」 메뉴에서` · 불일치 꼬리 `mismatchTailCard` · 긴 이름 backstop 을 「연결 해제」 버튼 기준으로
- P36-B1 — `카드 비용 읽기 줄 (390 · 1080)`: KB 위탁 읽기 줄 + 다름 두 줄(카드 꼬리) · 교보 위탁 7억 줄 · 「확인 전」 줄 · 카드 안 textbox 0 · 가로 넘침 0

## 새 테스트 (admin-accounts.spec.ts · 4개)

- AC-1 계좌 목록 · 등록 · 삭제 잠금 (1080) — 행 9(파생 7 + 연결 없음 2) · GET 1 · 공유 계좌 칩 alexjx · kimtr · 「연결 없음」 · 교보 필터 3 · 목록 넘침 0 · 등록 POST 1건(`0099887766` → `99887766`) · 재조회 새 행 · 삭제 잠금 + DELETE 0
- AC-2 IP/MAC (1080) — 불일치 줄 `alexjx · KB121 …` · 짝 오류 요청 0 · PUT `/accounts/KB/11122233304` 1건(orderEndpoint 원문) · 사용자별 칩 alexjx 2 · kimtr 1 ok · 목 상태 두 사용자 정규화값 · 잘림 0
- AC-3 예수금 · 수수료 (1080) — 1억 · 0.01 · 0.2 · 다름 두 줄 · 칩 `alexjx · KB120/121` · budget PUT 1건 → 예수금 줄 사라짐 · 1.5 범위 줄 · fee 0건 → 0.05 PUT 1건 {500, 2000} → 다름 0 · 연결 없는 KB 12345678 칸 · IP/MAC 잠금 + 안내
- AC-4 폰 390 — 비용 · IP/MAC 영역 잘림 0 · 13자리 예수금 칸 안 · 쓰기 0

## 실행 결과

- `pnpm --filter @gh-radar/webapp run typecheck` 통과 (src + tsconfig.e2e.json — admin-servers.spec.ts 목 사용 포함)
- `playwright test e2e/specs/admin.spec.ts e2e/specs/admin-accounts.spec.ts e2e/specs/sidebar-tree.spec.ts --workers=1` → **32 passed** (1.1m · setup 포함 · 실패 0 · skip 0)
- Task 2 옛 UI 식별자 게이트 GATE_OK · Task 3 skip/범위 게이트 GATE_OK
- 이 quick 커밋은 `webapp/e2e/` 밖을 건드리지 않았다(프로덕션 코드 무변경)

## Deviations from Plan

None - plan executed exactly as written. (P36-B1 「교보 카드 「확인 전」 표기」 는 지금 카드 문구에서 교보 위탁이 값을 알아 7억으로 나오므로, 「확인 전」 은 값 모르는 계좌 카드로 단언했다 — 정본 문구 기준 해석 · decisions 참고.)

## 발견한 버그

없음.

## Self-Check: PASSED

- FOUND: webapp/e2e/specs/admin-accounts.spec.ts · webapp/e2e/fixtures/admin.ts · webapp/e2e/specs/admin.spec.ts · webapp/e2e/specs/sidebar-tree.spec.ts
- FOUND: 571d97ab · 414cc9ba · 765a3b22 (HEAD 조상)
