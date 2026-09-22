---
status: testing
phase: 18-gh-trade-ui-nxt-vi
source: [18-VERIFICATION-R2.md]
started: 2026-09-22T08:30:00Z
updated: 2026-09-22T08:30:00Z
---

## Current Test

number: 1
name: 실 게이트웨이 정정(order.modify) 왕복
expected: |
  정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다
awaiting: user response

## Tests

### 1. 실 게이트웨이 정정(order.modify) 왕복 — 접수 → 서버 정정 통지(M) → 카드/공용 패널 반영
expected: 정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다
result: [pending]

### 2. 예약(장전) 발주 · 시간외종가(G2/G3) 실발주
expected: 예약 주문이 09:00(NXT 08:00) 정시에 접수되고, 시간외종가 주문이 참고 종가로 체결된다
result: [pending]

### 3. 알림음 자동재생 차단 → 「클릭해 활성화」 → resume() 후 재생
expected: 차단 상태 아이콘 표시 → 클릭 → 오디오 컨텍스트 resume → 이후 알림음 정상 재생
result: [pending]

### 4. VI 확인 체크(ConfirmVIOrderReq 33) 거부/타임아웃 실 왕복
expected: 거부/타임아웃 시 체크 잠금 해제 + 기존 vi-order-list 오류 문구 인라인 표시
result: [pending]

### 5. 정본 목업(워크벤치 7차 · 호가탭 6차)과 구현 화면 육안 대조 (라이트/다크 · 4밴드 · 갭 클로징 신규 표시 포함)
expected: 레이아웃·색·문구가 목업과 일치하고, 갭 클로징이 추가한 문구·상태 표시도 목업 톤과 맞는다
result: [pending]

### 6. CR-01 실계좌 — relay 배포 뒤 close_price_mode="zero" 시간외종가 원주문 취소
expected: 가격 0 취소 프레임이 close(4400) 없이 게이트웨이까지 나가고 취소확인으로 정산된다
result: [pending]

### 7. CR-02 2계좌 — 계좌 B 로 가동 중인 VI 를 상태줄 A 에서 「수정」
expected: 「수정」 뒤에도 서버 전략 계좌가 유지되고, 상태줄과 다르면 줄 아래 고지가 보인다
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
