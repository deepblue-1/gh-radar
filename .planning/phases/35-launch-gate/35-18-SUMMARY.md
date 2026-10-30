---
phase: 35-launch-gate
plan: 18
subsystem: ops
tags: [deploy, relay, server, webapp, uat, launch-plan, gh-trade-43, inbox]
status: complete

requires:
  - phase: 35-19
    provides: "범위 7 전체 회귀 green · 머리 카드 「다음 발사 계획 첫 조각」 · fix 노트 대조"
  - phase: 35-17
    provides: "relay GET/PUT /internal/admin/launch-plan"
  - phase: 35-12
    provides: "launch_plan_changes 이력 표"
provides:
  - "범위 7(발사 계획 어드민) 프로덕션 — DB · relay 2f26aea4 · server 00068-5fj · webapp push 2f26aea4"
  - "라이브 UAT A~E 통과(16:00 10-28·29 · 09:00:30 10-28~30)"
  - "인박스 261027-launch-plan-admin · 261028-launch-plan-fix 닫음(done_commit 9f51eb45)"
affects: [35-11]
---

# 35-18 SUMMARY — 범위 7 배포 · 라이브 UAT · 인박스 닫기

**발사 계획 어드민이 프로덕션에서 동작한다 — 어드민에서 저장한 16:00 · 09:00:30 발사 시각이 서버 재기동 없이 다음 회차 kind 17 첫 조각에 실렸다.**

## Task 1 — 배포 (10-28 02:27~02:34 KST)

정본 `35-18-TASK1-RESULT.md`. gh-trade 43 은 배포 전(사용자 결정 「gh-radar 먼저 배포」 — D-30 순서 예외, 구 서버는 「서버 미지원」 으로 안전하게 실패) · DB 이미 적용(35-11 Task 1 의 db push) · relay `2f26aea4` smoke PASS 11 · server `gh-radar-server-00068-5fj` 스모크 15/15 · 무인증 401×2 · push `5a81f174..2f26aea4` → Vercel Ready. gh-trade 43 은 02:31(KB120) · 02:32(KYOBO119)에 배포됐다.

## Task 2 — 라이브 UAT

| 항목 | 결과 |
|---|---|
| A 서버 계획 조회 | 4패널 표시 — 사용자 「보인다」 |
| B·C 저장 | 10-28 02:41~02:50 q16 4건 · n0930 2건 outcome ok · 결과 문구 · 서버 로그 · 마지막 변경 · 새로고침 — 사용자 「저장됨」 · 「1번 다 확인」 |
| D 16:00 | 10-28 · 10-29 네 칸 모두 첫 조각 `sent_rel_us` = 그 회차 직전 저장 계획 첫 값(KB120 코스닥 −348 → −350 등) · 조각 묶음이 계획 목록 근처 · kind 18 `next_offset_us` = 계획 첫 조각 |
| E 09:00:30 | 43-07 포함 — 10-28 ~ 10-30 N `offset_used_us` = 직전 저장 값(KB120 −248 → −249 · KYOBO119 −200 → −180 → −130), 발사 뒤 저장은 다음 회차부터 |
| 화면 | 사용자 답 원문 「맞다」(10-30) |

계획 이력 30건 전부 outcome ok(plan_rev 단조 증가). fix 노트 ④(재전송 조각 rc)도 라이브 확인 — KYOBO119 N `E127` · KB120 N `0515`.

## Task 3 — 인박스 닫기

- `261027-launch-plan-admin.md` → `status: done` · `done_commit: 9f51eb45` · 회신(구현 · 배포 · UAT).
- `261028-launch-plan-fix.md` → 같은 해시로 닫음(35-19 SUMMARY 권고 — 플랜 밖 추가 1건).
- 정식 노트 `261028-launch-plan-contract.md` → 회신 두 줄(범위 7 적용 · 범위 6 보류 사유 + 역질문 답) · 프런트매터 무변경(35-11 몫).

## 발견 — 35-11 로 넘김

KYOBO119 A 재확인 재발사(`expected_cum 090029000`, wire 0 부터)가 `launch_pieces` · `launch_heads` 키(fire_base 없음)에서 09:00:27 회차를 덮는다. 웹도 A 를 09:00:27 만 받는다. 원문은 남아 키 수정 뒤 reproject 로 복구된다. 사용자 결정 「고칠 때까지 노트 보류」 — 35-11 Task 3 은 수정 quick 뒤.

## Deviations

- Task 3 커밋에 fix 노트를 더했다(acceptance 「두 노트 경로만」 → 세 노트). 35-19 SUMMARY 가 같은 해시로 닫으라고 권고했고 내용이 범위 7 이다.
- 정식 노트(untracked 였음)는 이 커밋으로 처음 추적된다.
