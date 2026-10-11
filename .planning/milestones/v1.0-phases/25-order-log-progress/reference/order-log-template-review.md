# 주문로그 문장 템플릿 v0 대조 (gh-radar, 2026-09-29)

대조 기준: `supabase/migrations/20260924200100_dma_journal_rpcs.sql` `dma_journal_project` · `webapp/src/lib/order-notices.ts` · `relay/src/dma/envelope.ts parseJournalBatch`.
어긋나거나 확인이 필요한 행만 적는다. 표 형식·숫자 표기·예약 Q-ID 접두는 이의 없음.

## 질문 ① A×Modify / A×Cancel — 닫힘

gh-trade 확인(KBBroker.cpp 1690~1693): KB 접수 A 는 신규뿐, 정정확인=M · 취소확인=C 로 바로 온다. 아래 A×Modify 캡 우회 우려는 KB 에서는 성립하지 않는다. 교보(KYOBO) 게이트웨이도 같은 규칙인지만 남는다.

- 투영은 notice_type 만 본다. A 는 request_kind 와 무관하게 `accepted` 이고 order_type 만 request_kind 로 정한다(New→N · Modify→M · Cancel→C · ''→N).
- webapp `orderActionWord` 는 notice_type 이 C/M 이 아니면 request_kind 로 「취소」·「정정」 을 내므로 A×Cancel · A×Modify 가 와도 화면은 깨지지 않는다. 오는지 여부는 그쪽 확인대로.
- **주의(DB 쪽 잠재 결함):** A×Modify 가 M 확인보다 먼저 오면 qty 가 이벤트 order_qty **원문 그대로** 들어간다(A 분기는 `NULLIF(order_qty,0)`). 뒤에 오는 M 은 `qty = coalesce(기존 qty, …)` 라 기존 값을 유지하므로 260923-m23 의 이동 수량 캡(원주문 잔량 이하)이 적용되지 않는다. A×Modify 가 실제로 온다면 gh-radar 가 투영을 고쳐야 한다. 안 온다면 그대로.
- A×Cancel 의 `{qty}` 는 이벤트 order_qty 다. 그 값이 취소 수량(=잔량 전부)인지 원주문 수량인지 그쪽에서 확정해 주면 문장 단어(「취소 접수 N주」 vs 「잔량 N주」)를 맞춘다.

## 질문 ② E 누적 filled 를 클라가 DB filled_qty 로 계산

- 반은 맞고 반은 아니다. `filled_qty` 는 **주문 행**(dma_account_orders)의 누적이지 이벤트별 값이 아니다. 행 단위 표시(오늘 주문 표)에는 그대로 쓰면 된다.
- 이벤트 1건 = 1문장 구조라면 문장 N 의 「누적」 은 그 주문의 E 이벤트를 seq 순으로 더한 **running sum** 이어야 한다. 마지막 문장만 행 filled_qty 와 같다. 중간 문장에 행 filled_qty 를 쓰면 모든 조각이 최종 누적으로 보인다.
- 「전량」 판정은 DB 규칙과 같게 `filled + modified_qty >= qty` 다. modified_qty 를 빼면 정정으로 옮겨간 뒤 남은 조각이 영원히 「부분」 이다.
- qty 가 NULL 인 행(E 가 A 보다 먼저 온 경우)은 분모 없이 「체결 N주」 만.
- 체결가는 exec_price. 행의 price 는 주문가 그대로다(E 는 price 를 건드리지 않음).

## 구조 전제 — 이벤트 문장을 보여줄 읽기 경로가 지금은 없다

- webapp 은 주문 행(JournalOrderRow, 25 공개 컬럼)만 받는다. `dma_journal_events` 는 service_role 전용이고 RPC · 푸시 어느 쪽도 이벤트를 내보내지 않는다.
- 「행 펼침에서 이벤트 시간순」 을 하려면 RPC 1개(주문 행 id 또는 gateway+trade_date+account+order_no 로 이벤트 목록, 공개 컬럼만) + server 라우트 + 클릭 시 1회 조회가 필요하다. 사용자 클릭 1회 = RPC 1회라 허용 범위. 라이브 갱신까지 원하면 relay 푸시 타입이 하나 더 필요하다(비용 큼 — 기획서 보고 결정).
- 대안: 행 단위 로그만 유지하고 상태·누적·잔량을 한 줄에 그리는 것. 이러면 읽기 경로 변경 0.

## 합의 결과 (2026-09-29, gh-trade-6d 회신)

- 교보 게이트웨이도 접수 A 는 신규뿐(KyoboBroker.cpp 1109~1112). ① 완전히 닫힘.
- side_trusted = 정정·취소 계열이 아니고 side 가 비어 있지 않으면 true(JournalFormat.cpp:152). A·E(New) 방향 NULL 문제 없음. 단 KB 거부 R(New) 의 side 는 틀릴 수 있어 R 행 방향은 참고 표기만.
- 지적 5건 전부 수용: 방향 미상 「주문」 통일 · C 는 「취소」+출처 칩+「수동」 메타, 거래소 자동취소는 「거래소 취소」 별도 · M 은 행 qty(DB 캡) · R -2 는 「접수 불명」 으로 상태 칸까지 가름(webapp 변경 항목) · board 앞말은 D-15 규칙.
- 미결(기획서 항목): 행 펼침 이벤트 목록 읽기 경로(RPC+라우트 / 이벤트 평면 / relay 푸시) · 자동 출처 조각 접기.
- gh-radar 쪽 예정 변경: `orderActionWord` 방향 미상 「주문」 · `orderDisplayStatus` 에 result_code -2 「접수 불명」 상태 추가(투영 status 는 rejected 유지, 화면에서 result_code 로 가름) · R 행 방향 참고 표기.

## 방향(매수/매도) — side_trusted 의미 확인 필요 (닫힘, 위 합의 참고)

- 투영: `side = side_trusted AND side IN ('B','S') ? side : NULL`. fbs 주석은 「C/M 에서 원주문 메타로 side 를 채웠을 때만 true」 로 읽힌다. **A·E(New) 에서 side_trusted 가 false 로 오면 모든 신규 주문 행의 side 가 NULL 이 되어 방향이 사라진다.** New/E 에서는 true 로 실리는지 확정해 달라.
- 방향을 모를 때 webapp 은 빈 문자열(「」)이고 초안은 「주문」 이다. 하나로 통일하자 — 로그 문장은 「주문」 이 읽기 좋으니 webapp 을 맞추는 쪽 제안.

## C(취소 확인)

- 투영은 두 갈래다. (a) org_order_no 가 비었거나 자기 번호와 같으면 **거래소 자동취소** — 원주문 행 자체가 cancelled 로 바뀌고 이벤트의 order_qty 는 행에 쓰지 않는다. (b) 별도 원주문이 있으면 취소 요청 행(order_type C, qty = order_qty) + 원주문 행 cancelled.
- 초안 「취소 확인 잔량 {qty}주」 는 (b) 만 맞다. (a) 는 「거래소 취소」 로 문장을 따로 두자(IOC 잔량·시간외 미체결 자동취소 등).
- 「상따 자동취소 / VI 자동취소 / 사용자 취소」 를 행위 단어에 넣으면 앞 배지(출처)와 중복이다. webapp 은 행위 단어 「취소」 + 출처 칩 + requester=Manual 이면 「수동」 메타로 분리한다. 문장도 「취소 확인 N주」 + 배지로 두는 게 한 규칙이다.

## M(정정 확인)

- 새 주문번호 행의 qty 는 DB 가 `min(order_qty, 원주문 잔량)` 으로 캡한다. 이벤트 원문 order_qty 는 요청 에코라 유령 잔량이 섞일 수 있다(m23). 이벤트별 문장이면 캡 값이 이벤트에 없으므로 원문을 그대로 찍게 된다 — 행 qty 를 쓰거나 「요청 N주」 로 단어를 바꿔야 한다.
- 원주문 행 status 는 전량 이동일 때만 `modified`, 부분 이동은 그대로다. 원주문 쪽 문장(「N주 정정으로 이동」)은 이벤트가 아니라 파생이다.

## R

- 로컬 거부 · 주문번호 없는 R · C/M 거부(order_no == org_order_no) 는 전부 reject_seq 키의 `rejected` 행이다. 초안 분기와 일치.
- **접수불명(result_code -2, order_no 빈 값, local_reject=false)** 도 같은 분기라 DB 상태는 `rejected`, webapp 상태 칸은 「거부」 로 보인다. 초안의 「접수 불명 — 결과 모름」 을 살리려면 result_code == -2 를 문장 규칙에 넣고, 상태 칸도 「확인 필요」 류로 갈라야 한다(webapp 변경). WR-01 취지상 갈라야 한다고 본다 — 「거부」 로 보이면 재주문 유도.

## board G2/G3

- webapp 은 접수·체결·거부(방향 있는 행)에만 「시간외종가 매수」 처럼 붙이고, 취소·정정 확인에는 「시간외종가」 만 붙인다(D-15). 초안은 전 문장 앞말이라 「시간외종가 취소 확인」 이 생긴다. 사용자 결정(2026-09-17)이 있으니 초안을 webapp 규칙에 맞추자.

## 묶기(merge)

- webapp 은 origin 이 limit_chaser/vi 이고 requester ≠ Manual 인 행만 E 조각과 자동 매도 접수를 시간창으로 접는다(조각 매도로 표가 넘치는 문제 · quick-260916-fq3). 이벤트 1건 = 1문장이면 이 문제가 그대로 돌아온다. 펼침 안에서도 같은 접기를 쓸지, 펼침은 원문 전부인지 기획서에서 정할 항목.
