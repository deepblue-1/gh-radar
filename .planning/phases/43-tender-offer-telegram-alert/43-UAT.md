---
status: testing
phase: 43-tender-offer-telegram-alert
source: [43-VERIFICATION.md, 43-08-PLAN.md Task 3]
started: 2026-11-13T01:40:00Z
updated: 2026-11-13T02:35:00Z
---

## Current Test

number: 1
name: 첫 실제 알림의 모양 · 링크 · 지연 (SC-1 · SC-7)
expected: |
  단체방에 온 실제 알림이 두 줄이다 — 첫 줄 「📢 보고서 이름 — 회사(종목코드)」(공개매수면 제출인도) · 둘째 줄 「DART 원문 · 금융감독원 전자공시」.
  「DART 원문」 을 누르면 그 공시 원문이 열린다. 소리 나는 일반 알림이고 링크 미리보기 카드는 붙지 않는다.
  「DART 표기 시각 → 알림 도착」 지연이 30초 안이다(RESEARCH 「리서치 확인 6」 SQL 로 뽑아 43-VALIDATION Manual-Only 표에 적는다).
awaiting: 첫 실제 공시 알림(2026-11-13 10:10 배포 뒤 아직 0건)

## Tests

### 1. 첫 실제 알림의 모양 · 링크 · 지연 (SC-1 · SC-7)
expected: 두 줄 문구 · DART 원문 링크가 열림 · 미리보기 카드 없음 · 소리 나는 일반 알림 · 지연 30초 안. 장전 · 공개매수 · 주요사항보고서 유형별로 각 첫 건의 지연을 기록
result: [pending]
note: 2026-11-13 10:10 단체방 확인 글(🔔 시험 알림)은 도착 — 사용자 「단체방으로 잘 왔어」. 실제 공시 알림은 아직 0건.

### 2. 다음 평일 07:00 ~ 07:10 — 가짜 「멈췄습니다」 없음 (SC-6 · D-17)
expected: 단체방에 「⚠ 공시 알림이 멈췄습니다」 글이 없고 `SUPABASE_URL=… bash scripts/dart-alert-report.sh stats 1` 의 장애 상태가 없음 · 임대 보유자 있음. 정상 아침 시작에 「(늦은 알림)」 도 붙지 않음
result: [pending]

### 3. 배포 당일 20:00 뒤 하루 OpenDART 호출 수 (SC-4)
expected: `stats 1` 의 오늘 호출 수 ≤ 15,000 · 한도 의심 0 · 늦은 알림 0건 또는 이유 설명됨(2026-11-13 은 10:10 시작이라 설계값 10,800 보다 적게 나온다)
result: [pending]

### 4. error 로그 알림 정책이 실제 error 에 걸려 운영자 메일이 오는지 (SC-6)
expected: error 이상 로그가 생기면 `gh-radar-dart-alert-error-log` 정책이 운영자 이메일을 보냄
result: [pending]
note: 아직 error 로그가 한 번도 없다 — 첫 error 때 확인(일부러 만들지는 않는다).

### 5. 유무상증자결정 · 회사분할합병결정 실제 표기 관찰 (D-03 · D-04)
expected: 처음 올라온 해당 공시가 허용 목록 완전 일치로 알림이 나감. 다르면 `b001 near-miss kind` warn 이 남는다
result: [pending]
note: 30일 조사에서 두 종류 모두 0건이라 표기를 대조하지 못했다.

### 6. (결정) 리뷰 치명 CR-50 과 경고 처분
expected: CR-50(5분 깨움 예약이 멈춤 · 삭제 · 권한 유실이면 어느 알림에도 안 걸리고, `--scheduler-paused` 가 운영 중 예약도 멈춤)을 phase 닫기 전에 고칠지 사용자가 정한다. WR-01 · WR-02 · WR-03 · WR-04 · WR-05 도 같이 처분
result: pass
note: 2026-11-13 사용자 「코드 리뷰사항 전부 수정하자」 → 27건 수정 · IN-05(빌드 이미지 · pnpm 버전 고정)는 저장소 Dockerfile 전체 관례라 건너뜀. 11:28 재배포(dart-alert:d523e2ac) · 스모크 15/15 · 11:30 새 코드가 임대 인계. 이제 `--scheduler-paused` 는 돌던 예약에 쓰면 거부된다. IN-03 「(늦은 알림)」 표시 기준 변경은 사용자 확인 대기(첫 실제 알림 때 같이 본다).

## Summary

total: 6
passed: 1
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
