# StrategyEvent 필드 초안 v0 — gh-radar 대조 (2026-09-29)

전체 구조(별도 seq 공간 · JournalBatch append · 시세 이벤트 같은 레코드 · enum 코드)는 수용. 아래는 relay 적재·Supabase 조회·웹 표시 관점에서 고쳐야 하거나 정해야 할 것만.

## 1. 용어 — 사용자 결정 항목 (제 쪽 사실)

- Phase 24 웹 라벨은 선매수 / 추가매수 / 후매수 이고, 의미는 서버 매핑과 같다(추가매수 = Add 매수잔량 최소~최대 구간, 후매수 = Post 하한잔량·반등·발동잔량). 즉 기획서 「줄서기매수」 = 웹 「후매수」.
- 기획서 각주(추가매수→후매수, 줄서기매수→반등매수)를 채택하면 웹의 「후매수」 라벨이 「반등매수」 로, 「추가매수」 가 「후매수」 로 바뀐다 — 라벨 문자열은 `lib/limit-chaser.ts` 외 10여 파일에 흩어져 있어 이름 바꾸기 quick 1건. enum 은 영향 없음.
- 어느 쪽이든 로그 kind/group 표시명 매핑은 웹 한 곳(`@gh-radar/shared` 라벨 표)에 둔다.

## 2. 와이어 · relay

- 별도 seq 공간이면 relay 기록기는 스트림 2개를 각각 추적한다(lastReceivedSeq · gap · resync · 커서). `dma_journal_cursor` 에 `strategy_last_seq` 컬럼 추가(같은 epoch) 또는 별도 커서 행. 적용 RPC 는 `dma_strategy_apply` 별도(한 트랜잭션에 두 스트림을 섞지 않음 — 한쪽 포이즌이 다른 쪽 커서를 막지 않게).
- `strategy_caught_up` 과 기존 `caught_up` 이 둘 다 true 여야 live 전이. 로그인 응답의 `strategy_oldest_seq = 0` 도 기존 WR-07 규칙과 같게.
- 이벤트 JSON 키는 fbs 필드명 snake_case 1:1(저널 23필드 규약 그대로). `time_ms` 는 저널의 `gw_time_ms` 와 이름이 다른데, 뜻이 같으면 `gw_time_ms` 로 통일 요청(코덱·RPC 가 한 어휘).
- `snap_qty[3]` · `snap_cum[3]`: FlatBuffers 테이블은 고정 배열을 못 갖는다(struct 전용). 벡터 `[int64]` 또는 스칼라 6개(snap_qty_0/1/2 …)로. 벡터면 `snap_count` 는 length 로 대체 가능.
- `cum_volume` 등 uint64 는 relay `toNum` 이 2^53 검사하므로 문제없음.
- `dma_user_id` 는 저널과 같이 감사 컬럼만, 공개 컬럼·푸시에서 제외(T-19-08).

## 3. 가시성 · 조인

- 주문 이벤트(account_no 있음)는 저널과 같은 계좌 조인(dma_account_access)으로 가른다.
- **시세 이벤트(상한가노출·진입, account_no 빈 값)는 누가 보는가** — 결정 필요. 제안: 그 게이트웨이에 자격증명이 있는 사용자 전원(계좌 무관). relay 푸시도 같은 규칙.
- 오늘 주문 행 펼침 조인 키 = (gateway, trade_date, account_no, order_no) — `dma_account_orders` 유니크 인덱스와 일치. 단 **Rejected(8) 이벤트는 order_no 가 빈 값이라 주문 행과 못 잇는다.** 저널 쪽 로컬 거부 행도 reject_seq 키라 서로 연결 고리가 없다. 선택지: (a) 거부 이벤트는 작업대 평면 목록에만 보이고 오늘 주문 펼침엔 없음(단순), (b) 서버가 거부 이벤트에 저널 seq(`journal_seq`)를 실어 relay 가 reject_seq 로 잇기. (a) 로 시작 제안.
- Queued(4)·FirstFill(5)·Cancelled(7) 은 order_no 조인으로 오늘 주문 행에 붙는다. 상한가진입은 종목 축이라 펼침엔 없고 평면 목록·종목상세에만.

## 4. 테이블 · 조회 (gh-radar 몫, 참고)

- `dma_strategy_events` PK (gateway, journal_epoch, seq). 인덱스 (gateway, trade_date, isin, exchange) · (gateway, trade_date, account_no, order_no). 원문 보존 칸이라 값 CHECK 없음, 투영 없음(이벤트 = 표시 단위).
- 조회 RPC 2개: 사용자 기준 하루치 평면 목록(작업대 주문로그, 계좌 조인 + 시세 이벤트 공개 규칙) · 주문 1건 이벤트 목록(펼침). 둘 다 service_role 전용.
- 푸시 `journal.events`(가칭) — 저널 행 푸시와 같은 계좌 필터.

## 5. 진행률(2부)

- `QueueProgress` 브로드캐스트 권장안 수용 가능. 단 **항목마다 `account_no` 가 필요하다** — relay 는 사용자별 계좌 권한으로만 흘리며(T-19-02) order_no 만으로는 계좌를 모른다(미체결 맵 역조회는 경쟁 조건).
- 의미를 명시해 달라: 한 메시지 = 그 (isin, exchange) 의 대기 주문 **전체 스냅샷**(빈 배열 허용). 첫 체결·취소 뒤 「빠진 스냅샷」 을 한 번 더 보낸다는 규칙이 그것이다. relay·웹은 키(isin, exchange) 단위 전량 교체.
- Broadcast 등급이라 드롭 가능(Pitfall 19) — 1초 스로틀이면 다음 프레임이 메꾼다. 다만 마지막 「빠진 스냅샷」 이 드롭되면 줄이 안 지워지므로, 웹은 미체결 행이 사라지면(66/67) 진행률 줄도 같이 지운다(이중 안전).
- progress_bp(만분율) 좋음. remaining_volume 음수(초과) 도 올 수 있으니 웹은 0 으로 접는다.
- 슬림 대안(67 append + 클라 계산)은 마이페이지처럼 시세를 구독하지 않는 표면에서 현재 누적을 모르므로 gh-radar 는 권장안 쪽.

## 6. 그 밖

- `accept_latency_us`: BuyOrder 이벤트를 접수 시점에 쓰되 time_ms 는 전송 시각 — 오늘 주문 행 created_at(저널 gw_time)과 몇 ms 차이가 생긴다. 펼침 정렬은 이벤트 time_ms 기준이므로 문제없음.
- `cancel_reason` enum 은 오늘 주문 취소 행의 사유 표시에도 쓴다(저널엔 없던 값). 표시명은 웹 매핑.
- `has_remaining` 규칙 좋음. FirstFill 의 error_volume 은 항상 있음으로 이해.
