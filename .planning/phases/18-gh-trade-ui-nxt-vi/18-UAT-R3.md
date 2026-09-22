---
status: complete
phase: 18-gh-trade-ui-nxt-vi
superseded_by: 18-UAT-R4.md
round: R3
source: [18-VERIFICATION-R3.md]
supersedes_pending_of: 18-UAT.md
started: 2026-09-22T11:10:00Z
updated: 2026-09-23T00:00:00Z
---

## Current Test

[testing complete — superseded by 18-UAT-R4.md]

## Tests

### 1. 정정(order.modify) 실 게이트웨이 왕복 — 접수 → 서버 정정 통지(M) → 카드/공용 패널 반영
expected: 정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다
result: pass
resolved_by: "18-UAT-R4.md #1 에서 재실행 pass (2026-09-23)"

### 2. 예약(장전) 발주·시간외종가(G2/G3) 실발주
expected: 예약 주문이 09:00(NXT 08:00) 정시에 접수되고, 시간외종가 주문이 참고 종가로 체결된다
result: pass
resolved_by: "18-UAT-R4.md #2 에서 재실행 pass (2026-09-23)"

### 3. 알림음 자동재생 차단 → 「클릭해 활성화」 → resume() 후 재생
expected: 차단 상태 아이콘 표시 → 클릭 → 오디오 컨텍스트 resume → 이후 알림음 정상 재생
result: pass
resolved_by: "18-UAT-R4.md #3 에서 재실행 pass (2026-09-23)"

### 4. VI 확인 체크(ConfirmVIOrderReq 33) 거부/타임아웃 실 왕복
expected: 거부/타임아웃 시 체크 잠금 해제 + 기존 vi-order-list 오류 문구 인라인 표시
result: pass
resolved_by: "18-UAT-R4.md #4 에서 재실행 pass (2026-09-23)"

### 5. 정본 목업(워크벤치 7차·호가탭 6차 + R3 gap mockup)과 구현 화면 육안 대조 — 라이트/다크·4밴드, R3 신규 요소(VI 「상태줄 계좌로 옮겨 시작」 버튼, 결과 모름 ✕ 확인 다이얼로그, 재추가 카드 잠금 문구) 포함
expected: 레이아웃·색·문구가 목업과 일치하고, R3 가 추가한 문구·상태 표시도 목업 톤과 맞는다
result: pass
resolved_by: "18-UAT-R4.md #5 에서 재실행 pass (2026-09-23)"

### 6. CR-01 실계좌 — relay 배포 뒤 close_price_mode=\"zero\" 시간외종가 원주문 취소
expected: 가격 0 취소 프레임이 close(4400) 없이 게이트웨이까지 나가고 취소확인으로 정산된다
result: pass
resolved_by: "18-UAT-R4.md #6 에서 재실행 pass (2026-09-23)"

### 7. CR-02 2계좌 — 계좌 B 로 가동 중인 VI 를 상태줄 A 에서 「수정」
expected: 「수정」 뒤에도 서버 전략 계좌가 유지되고, 상태줄과 다르면 줄 아래 고지가 보인다
result: pass
resolved_by: "18-UAT-R4.md #7 에서 재실행 pass (2026-09-23)"

### 8. 2계좌 환경 VI 중지 상태 이동(R3 · GC-WR-04) — 계좌 B 로 등록된 중지 KRX VI → 상태줄 계좌 A → 「상태줄 계좌(A)로 옮겨 시작」 → 확인 요약 「B → A」 → 확정 → 서버 에코 accountNo 가 A 인지
expected: 옮기기 확정 뒤 서버 전략 계좌가 실제로 A 로 바뀌고, 같은 줄을 가동 중으로 두면 버튼이 사라진다
result: pass
resolved_by: "18-UAT-R4.md #8 에서 재실행 pass (2026-09-23)"

### 9. relay 배포 뒤 콜드 세션 ?focus=·0건 사용자 오래된 포커스 키(R3 · GC-IN-02)
expected: 새 브라우저(콜드 세션)로 /trading?focus=<등록 전략 키> 진입 시 해당 카드가 펼쳐지고, 등록 전략 0건 계정의 오래된 ?focus= 는 무한 대기 없이 버려진다
result: pass
resolved_by: "18-UAT-R4.md #9 에서 재실행 pass (2026-09-23)"

### 10. 실 게이트웨이 정정 뒤 체결(E)이 정정확인(M)보다 먼저 오는 통보 순서의 정산(R3 · GC-WR-01)
expected: order.result 가 정정 요청에 붙고 dma_orders 정정 행이 timeout 이 아니라 체결 상태로 남는다
result: pass
resolved_by: "18-UAT-R4.md #10 에서 재실행 pass (2026-09-23)"

### 11. [ESCALATION] R3-WR-01 — 정정 정산 뒤 늦게 온 정정확인(M)이 감사 행 상태를 filled→accepted 로 되돌리는지 실 게이트웨이 순서(E 먼저·M 지연)로 재현·확인, 필요 시 상태 단조성 가드 도입 여부를 결정
expected: 재현되면 Round 4 갭 클로징 항목으로 등록하거나, 위험을 받아들인다는 결정과 완화책이 명시적으로 기록된다 — 현재는 어느 쪽도 기록돼 있지 않다
result: pass
resolved_by: "18-UAT-R4.md #10 에서 재실행 pass (R3-WR-01 = UAT-R3 #11 명시 승계) · 18-33 상태 단조성 조건부 UPDATE 로 닫힘 (2026-09-23)"

### 12. [ESCALATION] R3-WR-02 — 결과 모름 잠금이 /trading 언마운트에 풀리는 설계(18-30 must_haves 그대로)와 종목상세 호가 탭이 잠금을 읽지 않는 것이, 「미체결을 확인하세요」 안내가 유도하는 /me 이동 동선과 실제로 충돌해 중복 체결 위험을 남기는지 검토하고, 잠금을 RelayProvider(앱 수명)로 올릴지 결정
expected: 위험이 실사용에서 확인되면 잠금 범위를 앱 수명으로 올리는 후속 플랜을 잡거나, 현재 설계(페이지 수명)를 명시적으로 승인한 기록을 남긴다
result: pass
resolved_by: "18-34/18-35 로 닫힘(잠금 RelayProvider 앱 수명 · 18-VALIDATION §Gap Closure R4 #2) · 18-UAT-R4.md #5·#11 에서 잠금 문구·잠금 동작 pass (2026-09-23)"

## Summary

total: 12
passed: 12
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
