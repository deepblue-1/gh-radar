# 주문로그 문장 템플릿 초안 v0 (기획서 도착 전 — 필드 기반 골격)

작성 gh-trade-6d 2026-09-29. 정본 필드는 journal-record-fields.md. 기획서를 보고 다듬는다.

## 원칙
- 한 행 = 저널 이벤트 1건(dma_journal_events). 「오늘 주문」 표는 주문 1행 투영을 유지하되, 행 펼침(또는 상세)에서 이벤트 문장을 시간순으로 보여준다.
- 문장 키 = notice_type × request_kind × origin (+ board, local_reject). message 는 판정에 쓰지 않고 「사유 꼬리」(" — {message}")로만 붙인다.
- 방향(매수/매도)은 side_trusted=true 일 때만 쓴다. false 면 「주문」으로 쓴다. 취소·정정도 같은 규칙(방향은 원주문에서 찾았을 때만).
- 숫자 표기: 수량 `1,200주`, 가격 `@12,300`. 시각은 gw_time_ms 의 KST HH:mm:ss.
- 출처 태그는 문장 앞 배지: 수동 / 상따 / VI. origin 이 빈 값이면 배지 없음.
- board G2/G3 는 앞말 「시간외종가 」. order_no 가 Q… 형식이면 「예약 」.

## 템플릿 (행위 단어)
| notice | request_kind | 문장 |
|---|---|---|
| A | New | `{방향} {qty}주 @{price} 접수` (예약: `{방향} {qty}주 @{price} 예약 접수 Q…`) |
| E | * | `{방향} 체결 {exec_qty}주 @{exec_price}` + 누적 `(누적 {filled}/{qty})`, 전량이면 `전량 체결 {qty}주 @{exec_price}` (누적은 DB filled_qty 로 클라 계산) |
| C | (KB: modCancel=3 이 곧 C, A×Cancel 은 없음) | `취소 확인 잔량 {qty}주` — requester=Manual 이면 「사용자 취소」, origin=LimitChaser 면 「상따 자동취소」, VITrigger 면 「VI 자동취소」 |
| M | (KB: modCancel=2 가 곧 M, A×Modify 는 없음) | `정정 확인 {qty}주 @{price}` (새 주문번호, 원주문 org_order_no 표시) |
| R | New, local_reject=false | `{방향} {qty}주 @{price} 거부 — {message}` |
| R | New, local_reject=true | `{방향} {qty}주 @{price} 서버 거부(미전송) — {message}` |
| R | Modify | `정정 거부 — {message}` (804 는 서버 친화 문구 그대로) |
| R | Cancel | `취소 거부 — {message}` |
| R | 접수불명(-2) | `접수 불명 — {message}` (order_no 빈 값, local_reject=false) |

## 예시(사람이 읽는 형태)
```
09:01:03  삼성전자      [상따]  매수 100주 @72,300 접수                           #0001234
09:01:05  삼성전자      [상따]  매수 체결 40주 @72,300 (누적 40/100)               #0001234
09:01:09  삼성전자      [상따]  상따 자동취소 — 취소 확인 잔량 60주                 #0001234
09:03:41  현대차        [수동]  시간외종가 매도 50주 @251,000 접수                  #0001240
15:31:10  카카오        [수동]  매수 300주 @45,000 예약 접수 Q000000012            Q000000012
09:00:00  카카오        [VI]    매수 200주 @45,000 거부 — 주문거부 가격범위초과     (번호 없음)
```

## 열린 질문 (기획서에서 확인)
0. (확인됨) KB 는 접수 A 가 신규뿐이다 — 정정확인=M·취소확인=C 로 바로 온다(KBBroker.cpp:1690~1693). 거부 R 만 request_kind 로 신규/정정/취소를 가른다.
1. 행 단위 — 주문 1행 접힘 + 펼침에서 이벤트, 아니면 이벤트 1행 평면?
2. 누적 체결·잔량 표기 자리(문장 안 vs 별도 열).
3. 상따 발주 사유(조건 문구) 요구 여부 — 서버 저널에 없음, wire 계약 변경 필요.
