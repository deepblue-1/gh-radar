---
status: complete
phase: 25-order-log-progress
source: [25-VERIFICATION-R2.md, 25-VERIFICATION.md]
started: 2026-09-29T16:35:27Z
updated: 2026-10-03T11:40:27Z
---

## Current Test

[testing complete]

## Tests

### 1. 첫 거래일 UAT (a): 상따 매수 1건 발생 시 주문로그 탭에 BuyOrder 줄(조건 · 근거 · 상한가 매수잔량 · 접수 +ms)이 게이트웨이 로그의 전송 시각 · 조건값과 일치하는지 로그인 세션에서 대조
expected: 실이벤트 필드값이 게이트웨이 원본과 일치
result: pass

### 2. 첫 거래일 UAT (b): 그 주문 행을 펼쳐 통보(접수·체결) 조각과 전략 줄이 같은 ms 규칙(통보 먼저)으로 보이는지 확인
expected: 타임라인이 gw_time_ms 순 · 동시각은 통보 우선으로 정렬
result: pass

### 3. 첫 거래일 UAT (c): 공용 패널 배지 · 카드 배지 · 창 분리 「오늘」 이어붙임이 실이벤트 도착 시 실제로 갱신되는지
expected: 탭이 안 보이는 동안 배지 카운트 증가, 탭 열면 0
result: pass

### 4. 첫 거래일 UAT (d): 대기 · 첫 체결 · 취소 · 매도 · 상한가 노출/진입 줄(상따 origin 주문)이 실제로 그려지는지
expected: 각 kind 별 문장이 D-09/D-10 규칙대로 보임
result: pass

### 5. 첫 거래일 UAT (e): 83 QueueProgress 로 미체결 진행률 막대가 실제로 갱신되는지(수동·VI 대기 포함, 단일가/VI 구간 정지 포함)
expected: 대기 행 아래 보조행 「{그룹} · N주」 막대·퍼센트가 실시간으로 움직이고(100% = 「· 0주」) 단일가/VI 구간에서 멈춤 · 첫 체결 뒤엔 「{그룹} · 체결 시작」 으로 그 순간 % 에서 고정(first_filled · quick-260930-fi4) · 수동/VI 대기는 그룹명 「수동」/「VI」
result: pass

### 6. 첫 거래일 UAT (f)/(g): 수동·VI 주문도 전략 이벤트(group 7/8)로 남는지 · healthz journal.strategy.lastSeq 가 null→값으로 전이하고 lagSeq 가 0 근처를 유지하는지
expected: 수동/VI 주문 줄이 구분 「수동」/「VI」 · 조건 자리 「수동 주문」/「VI 자동주문」 으로 보이고 구분 필터 「수동」·「VI」 칩으로 걸러짐(9/30 계약 변경 · quick-260930-e73 · gh-trade 서버 배포 후) · lastSeq 전이 정상 · lagSeq≈0 · dbError:false · paused:null 유지
result: pass

### 7. 운영 웹 로그인 세션 육안 확인: 작업대 공용 패널 「주문로그」 탭 · 카드 「주문로그」/「전략로그」 버튼(한 종목 팝업 · quick-260930-lq5) · /trading/order-log 창 · 마이페이지 오늘 주문 행 ▶ 펼침 · DevTools WS 인증 직후 unf.progress snap 1프레임
expected: 다섯 표면 모두 정상 렌더 · 새로고침 후 최신 프로덕션 번들 반영 · 창 분리 버튼을 다시 누르면 새 창이 쌓이지 않고 같은 창 재사용(WR-04) · 기록 없는 오늘 주문 펼침은 「주문 기록 없음」
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
