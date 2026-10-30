---
phase: 35-launch-gate
plan: 11
subsystem: ops
tags: [deploy, db, reproject, uat, launch-gate, inbox]
status: complete

requires:
  - phase: 35-10
    provides: "kind 17·18 정식 매핑 launch_project_event(20261028200000)"
  - phase: 35-09
    provides: "백필 적재(첨부 196/33 · 전체 254/51)"
provides:
  - "원격 매핑 · reproject · 라이브 UAT(16:00 10-28·29 · 09:00:30 10-28~30)"
  - "A 재확인 회차 키 결함 수정 원격 적용(quick 261030-d7b) · reproject 복구"
  - "인박스 261027-launch-gate-admin(done 2a81523f) · 261028-launch-plan-contract(done 6622b444) 닫음"
affects: []
---

# 35-11 SUMMARY — Wave B 배포 · 라이브 UAT · 인박스 닫기

**라이브 kind 17·18 이 어드민 발사 화면까지 실물로 확인됐다 — 중간에 찾은 A 재확인 회차 키 결함은 quick 261030-d7b 로 고쳐 원격에 적용하고 원문 재해석으로 복구했다.**

## Task 1 — Wave B 적용 (10-28 01:33 KST)

정본 `35-11-TASK1-RESULT.md`. 매핑 `20261028200000` · 이력 표 `20261028200100` db push · `--reproject` 원문 0 → projected 0 errors 0(gh-trade 43 미배포라 원문 없음) · 전체 백필 35-09 적재(254/51) · push 는 35-18 로 넘김(`5a81f174..2f26aea4`).

## Task 2 — 라이브 UAT

- 적재: q16 10-28 · 10-29, n0930 10-28 ~ 10-30 — 당일 조각 · 머리 전부 source journal · 계좌 · 주문번호 · rc 원문 채워짐 · kind 18 `next_offset_us` = 계획 첫 조각.
- 사용자 답 원문(10-30): 16:00 · 09:00:30 화면 「맞다」.
- **이슈 → 수정:** KYOBO119 A 재확인 재발사(expected_cum 090029000 · wire 0 부터)가 옛 PK(fire_base 없음)에서 09:00:27 조각 · 머리를 덮음. 사용자 결정 「고칠 때까지 노트 보류」 → quick 261030-d7b(`301280e6` PK 에 fire_base · `2a81523f` 주문 내역 A KRX 09:00:00~09:00:30 회차 표시). 10-30 09:50 KST 원격 적용(사용자 지시 「지금 다 진행해」 — 장중이나 발사 시각 밖 · 표 수백 행): `supabase db push` 20261030120000(gh-radar-30 체결 join) + 20261030200000 → `--reproject --from 20261028` dry-run 182 → `--apply` projected 182 errors 0 → 덮였던 seq 3160182 · 3160185 · 3372361 · 3372364 · 3372365 ~ 3372367 복구 · 10-29 Q · 10-30 K/Q 에 09:00:27 · 09:00:29 두 회차 · 10-28 ~ 10-30 전부 source journal.
- webapp push `221ab3ea..d0a50e17`(1ce901e1 · 301280e6 · 2a81523f · d0a50e17) → Vercel Ready · 사용자 답 「A 09:00:29 KRX→」 행 「보인다」(10-30).

## Task 3 — 인박스 닫기

- `261027-launch-gate-admin.md` → `status: done` · `done_commit: 2a81523f`(Phase 35 마지막 코드 커밋) · 회신(매핑 · reproject · 백필 · UAT · 키 수정).
- `261028-launch-plan-contract.md` → `status: done` · `done_commit: 6622b444`(35-10 매핑 GREEN) · 회신(키 수정 · 복구 · 질문 답 반영 · fbs 마커 f156cb6f).

## Deviations

- 원격 적용을 20:00 KST 뒤가 아니라 10-30 09:50 에 했다 — 사용자 지시. 발사(09:00:30 · 16:00) 사이 시각이라 kind 17·18 적재와 겹치지 않는다.
- 플랜 밖 quick 261030-d7b 가 UAT 이슈를 고쳤다(별도 quick 후보 규칙대로).
