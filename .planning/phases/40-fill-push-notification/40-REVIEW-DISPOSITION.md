---
phase: 40
review: 40-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "판정 RPC 응답 유실 뒤 재시도가 그 묶음의 푸시를 영구히 잃는다"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "종료 때 정착 큐 · 판정을 마친 송신이 버려진다 — 커서가 이미 전진해 재기동이 되살리지 못한다"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "판정 RPC · 송신에 시간 상한이 없어 게이트웨이 큐가 멈춘다(SC-1 「3초 안 도착」 위협)"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "FCM 404 · `NOT_FOUND` 를 무조건 토큰 폐기로 분류 — 프로젝트 설정 오류 하나로 Android 기기 행이 전부 지워진다"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "자동매도 완료의 평균가 · 손익이 두 기록기 순서 경합에 놓여 있다(단발 rank 3 라 다시 계산되지 않는다)"
  - id: WR-06
    severity: warning
    disposition: fixed
    title: "토스트 숨김이 「배너가 실제로 온다」 를 확인하지 않는다 — 끈 계좌 · 송신기 꺼짐 · 비상 끄기에서 알림 공백"
  - id: WR-07
    severity: warning
    disposition: fixed
    title: "로그아웃 정리(DELETE)가 실패하면 앞 사용자 체결이 같은 폰의 다음 사용자에게 계속 간다"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "짝 대기 폴백이 자동매도(그룹 9) 주문의 접수 · 취소 푸시를 낼 수 있다"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "네이티브에서 주문로그 창이 마운트 직후 한 번 버려지고 다시 마운트된다"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "탭한 알림의 날짜가 오늘이 아니면 계좌 없이 열려 그 주문이 보이지 않는다"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "APNs 비밀 두 개 중 하나만 갱신되면 짝이 맞지 않는 키 · Key ID 가 남는다"
  - id: IN-05
    severity: info
    disposition: fixed
    title: "시작 갱신 PUT 이 방금 다른 기기에서 끈 이 기기를 다시 켤 수 있다"
  - id: IN-06
    severity: info
    disposition: fixed
    title: "Generality without instantiation — 플랫폼당 송신기 중복 제거 분기"
open: 0
total: 13
recorded: 2026-11-09T05:30:00.000Z
---

# Phase 40: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 40-REVIEW-FIX.md |
| WR-02 | warning | fixed | 40-REVIEW-FIX.md |
| WR-03 | warning | fixed | 40-REVIEW-FIX.md |
| WR-04 | warning | fixed | 40-REVIEW-FIX.md |
| WR-05 | warning | fixed | 40-REVIEW-FIX.md |
| WR-06 | warning | fixed | 40-REVIEW-FIX.md (부분 — relay 송신기 꺼짐은 남김) |
| WR-07 | warning | fixed | 40-REVIEW-FIX.md |
| IN-01 | info | fixed | 40-REVIEW-FIX.md |
| IN-02 | info | fixed | 40-REVIEW-FIX.md |
| IN-03 | info | fixed | 40-REVIEW-FIX.md |
| IN-04 | info | fixed | 40-REVIEW-FIX.md |
| IN-05 | info | fixed | 40-REVIEW-FIX.md |
| IN-06 | info | fixed | 40-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
