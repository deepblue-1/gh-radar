---
status: testing
phase: 18-gh-trade-ui-nxt-vi
round: R4
source: [18-VERIFICATION-R4.md]
supersedes_pending_of: 18-UAT-R3.md
started: 2026-09-22T12:35:56Z
updated: 2026-09-22T12:35:56Z
---

## Current Test

number: 1
name: 정정(order.modify) 실 게이트웨이 왕복 — 접수 → 서버 정정 통지(M) → 카드/공용 패널 반영
expected: |
  정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다
awaiting: user response

## Tests

### 1. 정정(order.modify) 실 게이트웨이 왕복 — 접수 → 서버 정정 통지(M) → 카드/공용 패널 반영
expected: 정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다
result: [pending]

### 2. 예약(장전) 발주·시간외종가(G2/G3) 실발주
expected: 예약 주문이 09:00(NXT 08:00) 정시에 접수되고, 시간외종가 주문이 참고 종가로 체결된다
result: [pending]

### 3. 알림음 자동재생 차단 → 「클릭해 활성화」 → resume() 후 재생
expected: 차단 상태 아이콘 표시 → 클릭 → 오디오 컨텍스트 resume → 이후 알림음 정상 재생
result: [pending]

### 4. VI 확인 체크(ConfirmVIOrderReq 33) 거부/타임아웃 실 왕복
expected: 거부/타임아웃 시 체크 잠금 해제 + 기존 vi-order-list 오류 문구 인라인 표시
result: [pending]

### 5. 정본 목업(워크벤치 7차·호가탭 6차 + R3 gap mockup)과 구현 화면 육안 대조 — 라이트/다크·4밴드, R4 가 바꾼 결과 모름 ✕ 확인 다이얼로그 새 본문과 종목상세 호가 탭 잠금 문구 포함
expected: 레이아웃·색·문구가 목업과 일치하고, R4 가 바꾼 문구·상태 표시도 목업 톤과 맞는다
result: [pending]

### 6. CR-01 실계좌 — relay 배포 뒤 close_price_mode="zero" 시간외종가 원주문 취소
expected: 가격 0 취소 프레임이 close(4400) 없이 게이트웨이까지 나가고 취소확인으로 정산된다
result: [pending]

### 7. CR-02 2계좌 — 계좌 B 로 가동 중인 VI 를 상태줄 A 에서 「수정」
expected: 「수정」 뒤에도 서버 전략 계좌가 유지되고, 상태줄과 다르면 줄 아래 고지가 보인다
result: [pending]

### 8. 2계좌 환경 VI 중지 상태 이동(R3 · GC-WR-04) — 계좌 B 로 등록된 중지 KRX VI → 상태줄 계좌 A → 「상태줄 계좌(A)로 옮겨 시작」 → 확인 요약 「B → A」 → 확정 → 서버 에코 accountNo 가 A 인지
expected: 옮기기 확정 뒤 서버 전략 계좌가 실제로 A 로 바뀌고, 같은 줄을 가동 중으로 두면 버튼이 사라진다
result: [pending]

### 9. relay 배포 뒤 콜드 세션 ?focus=·0건 사용자 오래된 포커스 키(R3 · GC-IN-02)
expected: 새 브라우저(콜드 세션)로 /trading?focus=<등록 전략 키> 진입 시 해당 카드가 펼쳐지고, 등록 전략 0건 계정의 오래된 ?focus= 는 무한 대기 없이 버려진다
result: [pending]

### 10. relay 배포 뒤 정정 → 체결(E) 선착 → 정정확인(M) 지연 순서의 정산(R3·R4 · GC-WR-01 · R3-WR-01 · UAT-R3 #11)
expected: dma_orders 정정 행이 filled(원주문 행은 partially_filled)로 남고, relay 로그에 막힌 갱신 warn(column·status·noticeType) 1줄이 선다
result: [pending]

### 11. [ESCALATION] R4-WR-01 — 종목상세 호가 탭에서 상태줄과 다른 거래소의 미체결 원주문을 정정하다 timeout 이 났을 때, 결과 모름 배너가 뜬 채로 4버튼이 다시 열려 같은 원주문을 즉시 재정정할 수 있는지 실 브라우저로 재현하고, 폼 키 ∪ 선택 행 키로 잠금 판정을 넓히는 수정(18-REVIEW-R4 제시안)을 Round 5 로 등록할지 또는 위험을 받아들일지 결정
expected: 재현되면 Round 5 갭 클로징 항목으로 등록하거나, 위험을 받아들인다는 결정과 완화책(예: 호가 탭 미체결을 거래소로도 거르기)이 명시적으로 기록된다 — 현재는 어느 쪽도 기록돼 있지 않다
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
