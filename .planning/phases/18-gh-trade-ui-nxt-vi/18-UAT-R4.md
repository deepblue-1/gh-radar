---
status: complete
phase: 18-gh-trade-ui-nxt-vi
round: R4
source: [18-VERIFICATION-R4.md]
supersedes_pending_of: 18-UAT-R3.md
started: 2026-09-22T12:35:56Z
updated: 2026-09-22T23:09:17Z
---

## Current Test

[testing complete]

## Tests

### 1. 정정(order.modify) 실 게이트웨이 왕복 — 접수 → 서버 정정 통지(M) → 카드/공용 패널 반영
expected: 정정이 실제로 체결소에 전달되고 통지가 카드에 정확히 반영된다
result: pass

### 2. 예약(장전) 발주·시간외종가(G2/G3) 실발주
expected: 예약 주문이 09:00(NXT 08:00) 정시에 접수되고, 시간외종가 주문이 참고 종가로 체결된다
result: pass

### 3. 알림음 자동재생 차단 → 「클릭해 활성화」 → resume() 후 재생
expected: 차단 상태 아이콘 표시 → 클릭 → 오디오 컨텍스트 resume → 이후 알림음 정상 재생
result: pass

### 4. VI 확인 체크(ConfirmVIOrderReq 33) 거부/타임아웃 실 왕복
expected: 거부/타임아웃 시 체크 잠금 해제 + 기존 vi-order-list 오류 문구 인라인 표시
result: pass

### 5. 정본 목업(워크벤치 7차·호가탭 6차 + R3 gap mockup)과 구현 화면 육안 대조 — 라이트/다크·4밴드, R4 가 바꾼 결과 모름 ✕ 확인 다이얼로그 새 본문과 종목상세 호가 탭 잠금 문구 포함
expected: 레이아웃·색·문구가 목업과 일치하고, R4 가 바꾼 문구·상태 표시도 목업 톤과 맞는다
result: pass

### 6. CR-01 실계좌 — relay 배포 뒤 close_price_mode="zero" 시간외종가 원주문 취소
expected: 가격 0 취소 프레임이 close(4400) 없이 게이트웨이까지 나가고 취소확인으로 정산된다
result: pass

### 7. CR-02 2계좌 — 계좌 B 로 가동 중인 VI 를 상태줄 A 에서 「수정」
expected: 「수정」 뒤에도 서버 전략 계좌가 유지되고, 상태줄과 다르면 줄 아래 고지가 보인다
result: pass

### 8. 2계좌 환경 VI 중지 상태 이동(R3 · GC-WR-04) — 계좌 B 로 등록된 중지 KRX VI → 상태줄 계좌 A → 「상태줄 계좌(A)로 옮겨 시작」 → 확인 요약 「B → A」 → 확정 → 서버 에코 accountNo 가 A 인지
expected: 옮기기 확정 뒤 서버 전략 계좌가 실제로 A 로 바뀌고, 같은 줄을 가동 중으로 두면 버튼이 사라진다
result: pass

### 9. relay 배포 뒤 콜드 세션 ?focus=·0건 사용자 오래된 포커스 키(R3 · GC-IN-02)
expected: 새 브라우저(콜드 세션)로 /trading?focus=<등록 전략 키> 진입 시 해당 카드가 펼쳐지고, 등록 전략 0건 계정의 오래된 ?focus= 는 무한 대기 없이 버려진다
result: pass

### 10. relay 배포 뒤 정정 → 체결(E) 선착 → 정정확인(M) 지연 순서의 정산(R3·R4 · GC-WR-01 · R3-WR-01 · UAT-R3 #11)
expected: dma_orders 정정 행이 filled(원주문 행은 partially_filled)로 남고, relay 로그에 막힌 갱신 warn(column·status·noticeType) 1줄이 선다
result: pass

### 11. R4-WR-01 수정 확인(quick-260922-uhw 로 닫힘) — 종목상세 호가 탭(상태줄 KRX)에서 NXT 미체결 원주문을 정정하다 timeout 이 나면 4버튼이 잠긴 채로 남는지
expected: 결과 모름 배너가 뜬 동안 수동주문 4버튼(신규/정정/취소 포함)이 잠겨 같은 원주문을 곧바로 다시 정정할 수 없고, 원주문 선택을 풀어도 잠금이 유지된다(다른 종목·계좌 폼은 영향 없음)
result: pass
note: "원래 [ESCALATION] 항목(Round 5 등록 vs 위험 수용 결정)은 quick-260922-uhw(3e48360 · d2b75cb)로 수정·종결되어 18-VALIDATION §Gap Closure R4 에 기록됨 — 실 브라우저 재현 부재 확인으로 전환"

## Summary

total: 11
passed: 11
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
