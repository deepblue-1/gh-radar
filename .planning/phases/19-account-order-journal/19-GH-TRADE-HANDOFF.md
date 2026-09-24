# gh-radar Phase 19 → gh-trade 인계서: 관찰자(기록 전용) 연결 · 주문 저널

> **작성일:** 2026-09-24 · **작성:** gh-radar Phase 19 (19-01)
> **표지: 제안 — 확정은 gh-trade Phase 23 discuss 에서 한다.** 번호·필드·파일 경로·수치는 gh-radar 가 필요로 하는 **의미**를 적은 초안이다. gh-trade 가 다르게 정하면 gh-radar 는 G1(계약 고정) 게이트에서 따라간다.
> 이 문서에는 비밀 값 · 실계좌 번호 · 게이트웨이 주소를 적지 않는다.

---

## 1. 목적과 경계

### 배경
- gh-radar debug `mobile-bg-resume-gaps` 1번(2026-09-24 확정): relay 의 사용자별 DMA 세션은 마지막 wss 가 끊기고 5분 뒤 닫힌다. 게이트웨이는 **연결이 0 인 세션의 51(주문 통보)을 버린다**(gh-trade `Gateway::SendToSession` 의 D-05 폐기). 그래서 사용자가 앱을 닫은 동안 전략이 낸 자동주문이 gh-radar 기록(`dma_orders`)에 영구히 남지 않는다.
- 2026-09-23 실측: 같은 DMA 계정을 쓰는 두 gh-radar 사용자의 자동주문 기록이 43건 대 2건으로 갈렸다.
- 해법: relay 가 게이트웨이에 **관찰자(읽기 전용) 연결 1개**를 24시간 붙이고, 게이트웨이는 모든 DMA 사용자·계좌의 주문 통보를 **seq 가 붙은 저널 레코드**로 그 연결에 내보낸다. 연결 0 세션의 통보도 저널에는 들어간다.

### gh-radar 19 가 이미 결정한 것 중 게이트웨이 몫
| 결정 | 내용 | 게이트웨이에 요구하는 것 |
|------|------|--------------------------|
| D-02 | 게이트웨이 로컬 거부(브로커 전 거부, 주문번호 없음)도 기록한다 | 로컬 거부를 저널 레코드로 발행, `local_reject=true` · 빈 `order_no` |
| D-06 | 행 가시성은 계좌로 가른다. 매핑 원천은 관찰자다 | 관찰자 로그인 응답에 users.toml 의 **DMA 사용자 → 계좌 전체 매핑**(비밀번호 제외) |
| D-09 | 관찰자 자격은 users.toml 과 분리된 `[observer]` 설정 + 전용 로그인 메시지 | 관찰자 연결은 어떤 Session 에도 붙지 않음, 주문·전략·시세·계좌 요청은 **서버 측에서** 전부 거부 |
| D-10 | 인증은 비밀 하나. 출발지 IP 제한 없음(9100 은 원래 VPN/WireGuard 로만 닿는다) | 상수시간 비교, 평문을 로그·저장소에 남기지 않음 |
| D-12 | 게이트웨이는 저널을 seq 와 함께 디스크에 보관, 재시작해도 seq 가 이어짐. 정본은 Supabase | 디스크 저널 + `since_seq` 이어받기 + epoch |
| D-13 | 관찰자 연결은 24시간 상시. 비밀 거부면 relay 는 재접속을 멈춘다 | 거부는 **명확한 실패 응답**(연결만 끊고 침묵하지 말 것) |

### gh-radar 가 하지 않는 것
- gh-trade 저장소의 코드·설정·스크립트를 수정하지 않는다. 이 문서는 gh-radar phase 디렉터리에만 있다.
- gh-trade 쪽 계획·구현·배포는 gh-trade 저장소의 자체 GSD(권장: 신규 **Phase 23**)가 소유한다.
- 사용자별 DMA 세션 모델(gh-radar 15 D-13)은 바꾸지 않는다. 기존 로그인 · 51 팬아웃 · 전략 조작은 그대로다.

---

## 2. 와이어 계약 제안 (StockDMA.fbs)

**확정 권한은 gh-trade 에 있다.** 아래는 현재 `StockDMA.fbs` 할당표에서 비어 있는 번호로 잡은 제안이다.

### 번호
| 이름 | 번호 | 방향 | 비고 |
|------|------|------|------|
| `ObserverLoginReq` | **5** | C→S | 요청 대역 5~9 가 비어 있다 |
| `ObserverLoginResp` | **79** | S→C | 응답 대역은 78(`RateCrossSnapshot`) 다음 79 이상이 비어 있다. 요청 연결에만 보낸다 |
| `JournalBatch` | **80** | S→C | 관찰자 연결에만. 레코드는 seq 오름차순 |

- **재사용 금지 번호:** 12 · 13 · 22 · 23 · 62 · 63 · 30 · 31 · 70 (fbs 주석의 예약·봉인 번호).
- `enum MsgType : byte` 라 상한은 127 이다.
- **Envelope 는 끝에만 append 한다**(기존 마지막 `rate_cross_snapshot` 슬롯 뒤). 가운데 삽입 금지 — vtable 슬롯이 밀리면 relay·C# 클라이언트가 전부 깨진다. `observer_login_req` · `observer_login_resp` · `journal_batch` 세 필드를 그 순서로 붙이는 것을 제안한다.

### 테이블
```fbs
table ObserverLoginReq {
  secret: string;          // [observer] 비밀 — 어떤 로그에도 남기지 않는다
  since_seq: ulong;        // 이 seq **초과**부터 보낸다. 0 = 보관분 처음부터
  journal_epoch: string;   // relay 가 마지막으로 본 epoch ("" = 모름)
  client: string;          // "gh-radar-relay" (로그 표시용)
}
table ObserverAccount {    // users.toml 평탄화 1행
  dma_user_id: string;     // users.toml user_id (비밀번호는 절대 싣지 않는다)
  account_no: string;      // LoadUsers 정규화값 그대로
  name: string;
  priority: int;
}
table ObserverLoginResp {
  success: bool;
  message: string;         // 거부 = 단일 문구 (gh-trade 17 D-04 동형)
  broker: string;          // "KB" — gh-radar 행의 gateway 식별자 원천
  journal_epoch: string;   // 저널 저장소 신원 (생성 시 1회, 파일에 영속)
  head_seq: ulong;         // 로그인 시점 마지막 seq
  oldest_seq: ulong;       // 보관 중 가장 오래된 seq (0 = 없음)
  resync: bool;            // true 면 oldest 부터 다시 보낸다 (§3 조건)
  accounts: [ObserverAccount];
}
table JournalRecord {      // 23 필드
  seq: ulong;
  trade_date: string;      // "YYYY-MM-DD" (KST, 레코드 발생 시각 기준)
  gw_time_ms: ulong;       // 게이트웨이 벽시계 epoch ms
  dma_user_id: string;     // 발주 세션 user. 모르면 "" (재시작 뒤 termId=0)
  account_no: string;
  isin: string;
  side: string;            // "B"/"S"/""
  side_trusted: bool;
  order_no: string;        // 로컬 거부는 ""
  org_order_no: string;
  notice_type: string;     // A/E/C/M/R (ExecutionReport.noticeType 그대로)
  request_kind: string;    // New/Modify/Cancel/"" (RequestKindWireText)
  requester: string;       // "Manual"/"" (manualRequest)
  origin: string;          // Manual/LimitChaser/VITrigger/"" (OriginName)
  exchange: string;        // KRX/NXT
  board: string;           // "G2"/"G3"/"" (BoardWireText)
  order_price: int;        // ExecutionReport.orderPrice
  order_qty: int;          // ExecutionReport.orderQty
  exec_price: int;         // ExecutionReport.executedPrice
  exec_qty: int;           // ExecutionReport.executedQty
  result_code: int;
  message: string;         // 51 과 같은 조립 문구
  local_reject: bool;      // localSynthetic 또는 Gateway 즉시 실패 회신
}
table JournalBatch {
  records: [JournalRecord];
  head_seq: ulong;         // 이 프레임 조립 시점의 게이트웨이 head
  caught_up: bool;         // records 마지막 seq == head_seq
}
```

- **`ulong` 은 relay 생성 코드에서 `bigint`** 다(flatc TS 생성물). relay 파서 경계에서 number 로 내린다. seq 를 `uint`(32비트)로 두는 선택도 가능하다(하루 1만 건이면 42만 일) — gh-trade 재량.
- `ExecutionReport` 에 market 이 없으므로 레코드에 market 을 두지 않는다(gh-radar 행에도 없다).

### `JournalRecord` 필드 ↔ gh-radar 이벤트 JSON 키 대응표

relay 기록기(gh-radar 19-05)는 `JournalRecord` 를 아래 JSON 키로 **그대로** 옮겨 Supabase RPC `dma_journal_apply(p_gateway, p_epoch, p_events)` 에 넣는다(`supabase/migrations/20260924200100_dma_journal_rpcs.sql`). 게이트웨이가 값의 의미를 바꾸면 DB 투영이 틀린다.

| # | JournalRecord 필드 | 이벤트 JSON 키 | DB 에서의 쓰임 |
|---|--------------------|----------------|----------------|
| 1 | `seq` | `seq` | 이벤트 PK `(gateway, journal_epoch, seq)` — 재생 멱등의 유일한 근거. 로컬 거부 행의 `reject_seq` |
| 2 | `trade_date` | `trade_date` | 주문 행 키의 거래일. **필수** |
| 3 | `gw_time_ms` | `gw_time_ms` | 행 `created_at`(첫 이벤트) · `updated_at`(마지막 이벤트). **필수** — DB `now()` 로 대체하지 않는다 |
| 4 | `dma_user_id` | `dma_user_id` | 감사용 저장만. 화면·푸시로 나가지 않는다 |
| 5 | `account_no` | `account_no` | 주문 행 키 · 매핑 조인 키. **재정규화하지 않는다** |
| 6 | `isin` | `isin` | 12자가 아니면 투영 실패(원문은 남고 `apply_error` 기록) |
| 7 | `side` | `side` | `side_trusted` 일 때만 행에 반영 |
| 8 | `side_trusted` | `side_trusted` | false 면 행 side 는 NULL(모름) |
| 9 | `order_no` | `order_no` | 주문 행 키 `(gateway, trade_date, account_no, order_no)`. "" 이면 로컬 거부 갈래 |
| 10 | `org_order_no` | `org_order_no` | C/M 의 원주문 연결 |
| 11 | `notice_type` | `notice_type` | 투영 갈래(A/E/C/M/R) |
| 12 | `request_kind` | `request_kind` | 행 `order_type`(New→N · Modify→M · Cancel→C · ""→N). 그 밖의 값은 투영 실패로 드러난다 |
| 13 | `requester` | `requester` | 저장만(「· 수동」 꼬리 표시는 폐지) |
| 14 | `origin` | `origin` | 출처 칩(Manual→manual · LimitChaser→limit_chaser · VITrigger→vi · 그 밖·"" → 칩 생략) |
| 15 | `exchange` | `exchange` | "NXT" 면 NXT, 아니면 KRX |
| 16 | `board` | `board` | 저장("" → NULL) |
| 17 | `order_price` | `order_price` | 행 `price` |
| 18 | `order_qty` | `order_qty` | 행 `qty`(0 → NULL) |
| 19 | `exec_price` | `exec_price` | 체결 갈래(19-03) |
| 20 | `exec_qty` | `exec_qty` | 체결 갈래 `filled_qty` 누적(19-03) — 멱등이 아니라 PK 게이트가 필수인 이유 |
| 21 | `result_code` | `result_code` | 마지막 통보 코드 |
| 22 | `message` | `message` | 마지막 통보 문구(파싱하지 않는다) |
| 23 | `local_reject` | `local_reject` | true 면 `reject_seq = seq` 키 새 행(D-02) |

`JournalBatch.head_seq` · `caught_up` 과 `ObserverLoginResp` 의 필드는 relay 상태기계만 쓰고 DB 이벤트 키가 아니다. `broker` 는 RPC 의 `p_gateway`, `journal_epoch` 은 `p_epoch` 으로 들어간다.

---

## 3. 의미 규칙 (relay · DB 가 기대하는 것)

- **seq 는 게이트웨이 전역 단조 · 조밀하다.** 저널에 들어가는 모든 레코드가 seq 를 1씩 소비한다. **필터링은 seq 부여 전에** 한다(예: 예열 주문 제외). seq 를 먼저 올리고 레코드를 버리면 relay 의 갭 검사가 매번 「누락」 으로 보고 재접속을 반복한다.
- **seq 는 재시작 · 자정을 넘어 이어진다.** 거래일마다 1 로 돌아가지 않는다(거래일은 `trade_date` 필드가 담는다).
- **`journal_epoch` 은 저널 저장소의 신원이다.** 저장소를 처음 만들 때 1회 생성해 파일에 영속한다. 저널 디렉터리가 초기화되면(새 호스트 · 수동 삭제) 새 epoch 이 생긴다 — relay 커서가 옛 seq 를 들고 와도 조용히 빈 기록이 되지 않게 하는 장치다.
- **`resync=true` 조건:** ① 요청 epoch 가 비어 있지 않은데 현재 epoch 와 다름 ② `since_seq < oldest_seq − 1`(보관 범위 밖) ③ `since_seq > head_seq`(미래 seq). 이때는 `oldest_seq` 부터 다시 보낸다. 그 밖에는 **`since_seq` 초과**부터 보낸다(since_seq 자체는 이미 받은 것).
- **예열(warm-up) 주문은 저널에서 제외한다**(seq 부여 전 필터). 51 억제(`IsWarmupOrderNo`)와 같은 근거 — 카드에 뜨면 사용자가 취소·재발주한다.
- **예약 Q-ID 접수(A)·취소(C) 회신은 저널에 포함한다.** `order_no` = Q-ID(`^Q[0-9]{9}$` 10자). 이 회신은 현재 요청 연결에만 가지만 저널에는 들어가야 한다. 발사 뒤 실제 주문번호 조각은 따로 통보되며, Q-ID 행과의 연결은 이번 범위 밖이다.
- **로컬 거부(D-02) 발행 지점 4곳** — 모두 `local_reject=true` · `order_no=""`:
  1. `Server::WireExecutionCallback` 의 `NotifyLocalReject` 합성 거부(`broker::IsLocalReject(report)`).
  2. `Gateway::ProcessDirectOrderReq` 즉시 실패(`BuildDirectOrderResp(..., "R", "", ...)` → 현재 요청 연결에만 회신).
  3. 예약 회신 경로의 실패 회신.
  4. 전략 사전 거부(`LimitChaser`·`StrategyManager` 의 `NotifyLocalReject` — 1번 콜백으로 합류).
- **C/M 의 side** 는 원주문 메타로 채울 수 있으면 채우고 그때만 `side_trusted=true` 로 알린다(현 51 은 C/M 에서 side 가 부정확할 수 있다).
- **origin 은 원문 값**(`Manual`/`LimitChaser`/`VITrigger`/빈 값). 게이트웨이 재시작 뒤 `termId=0` 이라 모르면 **빈 값이 정상**이다 — gh-radar 는 그 행의 출처 칩을 생략한다(「수동」 으로 표시하면 거짓일 수 있어서).
- **`order_price`/`order_qty` 와 `exec_price`/`exec_qty` 를 섞지 않는다.** 51 조립의 `useExecuted` 처럼 한 칸에 체결값을 덮어쓰지 말 것 — DB 는 주문 수량과 체결 수량을 별도로 누적한다.
- **`trade_date`** 는 KST 기준 레코드 발생일, **`gw_time_ms`** 는 게이트웨이 벽시계(재생 시각이 아니라 발생 시각).
- **`message`** 는 51 과 같은 조립(804 친화 문구 교체 후 문자열). gh-radar 는 문구를 파싱하지 않는다.
- **계좌번호는 `NormalizeAccountNo` 결과 그대로** 싣는다. users.toml 매핑(로그인 응답 `accounts`)과 저널 레코드가 **같은 함수의 출력**이어야 DB 조인이 맞는다. relay · DB 는 재정규화하지 않는다.

---

## 4. 관찰자 연결 요구 (D-09 — 서버 측 강제)

- **비밀 설정:** users.toml 과 분리된 git 미추적 `config/observer.toml`(chmod 600)의 `[observer]` 표 `secret` 키. users.toml 처럼 **수동 배치**한다(`deploy-config.sh` 는 git 추적 `server.toml` 만 옮긴다). `server.toml` 에 두지 않는다. relay 쪽 같은 값은 gh-radar Secret Manager 새 시크릿으로 공급된다.
- **비교는 상수시간.**
- **거부는 단일 문구**로만 응답한다(`success=false`, `message` 고정). 사유(비밀 불일치 · 설정 없음 등)는 게이트웨이 로그에만 남긴다(gh-trade 17 D-04 동형). 비밀 값 자체는 어떤 로그에도 남기지 않는다.
- **관찰자 연결은 어떤 Session 에도 붙지 않는다**(`ClientConn.session == nullptr` 유지, 관찰자 표식 별도).
- **`ProcessPacket` 단일 관문:** 관찰자 연결에서 온 요청은 `ObserverLoginReq(5)` · `LivePing(4)` 외 **전부 거부**한다(주문 · 전략 · 시세 구독 · 계좌 요청). 이미 사용자 Session 이 붙은 연결의 `ObserverLoginReq` 도 거부한다.
- **브로드캐스트 제외:** 76 `RateCrossAlert` 등 로그인 전 연결에도 가는 브로드캐스트 대상에서 관찰자 연결을 뺀다(relay 는 76 이 와도 조용히 무시하지만 대역 낭비다).
- **유휴 스윕 대상에 포함:** 현재 스윕은 세션 없는 연결을 건너뛴다. 관찰자도 스윕해야 반개방 relay 연결이 남지 않는다. relay 는 30초마다 LivePing 을 보낸다.
- **복수 관찰자 허용:** relay 재시작 직후 옛 연결이 남아 있을 수 있으므로 「이미 관찰자 있음」 으로 거부하지 않는다. 연결별 독립 펌프, 상한 2~4.
- **계좌 0건 기동 거부 규칙과 무관**하다. 관찰자는 계좌를 소유하지 않는다.

---

## 5. 펌프 · 보관 (D-12)

- **로그인 시 일괄 enqueue 금지.** 체결 조각이 많은 날(상따 1주문 ≈ 90 체결) 재생이 수천 프레임이 되고, 송신 큐 상한(1,024프레임 · 4MB)을 넘으면 게이트웨이가 연결을 끊는다 → 재접속 → 같은 재생 → 무한 루프.
- **연결별 `nextSeq` 펌프:** 관찰자 연결마다 커서를 두고, **큐 깊이가 여유일 때만**(예: 64프레임 미만) 다음 배치를 넣는다.
- **배치 ≤ 100건 / ≈ 32KB.** 16KB 이상 프레임은 송신 상한이 5초로 늘어나는 범위라 안전하다.
- **따라잡으면(`caught_up`) append 마다 즉시 1건 배치.**
- **디스크 저장:** `OrderRecorder` 선례(길이 프리픽스 · 1초 flush 스레드 · 자정 롤오버 · pending 상한). 날짜별 파일, `seq.state`(seq 영속), `epoch` 파일(1회 생성). 메모리에는 재생 소스로 당일(+전일) 레코드. **보관 일수는 gh-trade 재량.**
- **핫패스 규율:** 로컬 거부는 MarketFeed 시세 수신 스레드에서 콜백을 직접 부른다. 여기서 **락 · 파일 I/O 금지** — 저널 append 는 사전 할당 링버퍼/MPSC push 만 하고, 직렬화·파일 쓰기는 기록 스레드가 한다(SPSC/MPSC 선택은 gh-trade).

---

## 6. relay 쪽 수신 계약 (참고)

gh-trade 구현이 알아야 할 relay 의 반응(gh-radar 19-05 · 19-07 소관):
- **로그인 거부(`success=false`)를 받으면 relay 는 재접속을 멈춘다**(D-13). healthz · 운영 알림으로 드러내고 재시작 전에는 다시 시도하지 않는다. 그러니 일시 장애(저널 로드 중 등)를 거부 응답으로 알리지 말고 연결을 끊거나 지연하라.
- **seq 갭이면 relay 는 연결을 끊고 `since_seq = 마지막 수신 seq` 로 다시 붙는다.**
- **relay 적용 큐가 5,000건을 넘으면 relay 가 스스로 끊고**, 적용이 따라잡은 뒤 이어받는다(게이트웨이 펌프 스로틀과 이중 방어).
- **매핑은 로그인 응답 `accounts` 스냅샷으로 원자 교체**한다(`dma_journal_sync_access`). users.toml 이 바뀌면(게이트웨이 재시작) 다음 관찰자 로그인에서 반영된다.
- relay 커서(`dma_journal_cursor`)는 DB 적용과 같은 트랜잭션에서만 전진한다. 같은 레코드가 두 번 와도 DB 가 이벤트 PK 로 흡수한다 — 게이트웨이는 「정확히 한 번」 을 보장할 필요 없이 「빠짐없이, seq 순서로」 만 보장하면 된다.

---

## 7. 동기화 · 배포 게이트

### G1 — 계약 고정
- gh-trade `.fbs` 확정 커밋 해시를 gh-radar 에 알린다.
- gh-radar 쪽 생성물은 다음 명령으로 만든다(스크립트 소유 = gh-trade, flatc 25.12.19 고정, `RELAY=` 필수):
  ```bash
  cd /Users/alex/repos/gh-trade/server && RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh
  ```
  `--check` 차이 0 이 확인되면 생성물 커밋은 **gh-radar 19-09** 가 한다.
- C# 클라이언트 `sync-client-schema.sh` 실행과 `scripts/expected-vtable.txt --update-expected` 갱신은 **gh-trade 몫**이다.

### G2 — 배포 준비
- 바이너리 빌드 게이트(cloud-verify) 통과.
- `config/observer.toml` 배치 절차 합의(값은 gh-radar Secret Manager 시크릿과 같아야 한다 — 값 생성 · 주입은 비출력 파이프로).
- **동반 배포 목록 확인:** gh-trade master 에 「120 미배포」 로 쌓인 서버 변경(gh-trade STATE 의 quick 표 — PRICE 100ms · VI 참조가 영속 · vi_released · 정정 수량 캡 · 상따 M 캡 · created_ms 슬롯 · 발사 오프셋 등)이 Phase 23 배포에 **함께 실린다**. 목록을 명시하고 사용자 확인 체크포인트를 두거나 사전 분리 배포한다.
- **게이트웨이 재시작은 20:00 KST 이후만** 한다(전략 무인 복원 동반 — gh-radar D-14). 전환 창 순서: DB → gh-trade 게이트웨이 → relay → 검증 → webapp push.

---

## 8. gh-radar 쪽 대응 plan

| gh-radar plan | 내용 | 이 인계서와의 접점 |
|---------------|------|--------------------|
| 19-01 | DB 뼈대: 테이블 4 · 적용/매핑/조회 RPC · 권한 pgTAP · 이 인계서 | §2 이벤트 JSON 키 계약의 정본(`dma_journal_apply`) |
| 19-03 | 투영 규칙 완성: E 누적 · C/M/R · 로컬 거부 `reject_seq` · Q-ID · epoch | §3 의미 규칙(order/exec 분리 · 로컬 거부 · Q-ID) |
| 19-05 | relay 기록기 · 매핑 동기화 · 계좌 권한 푸시 · 갭 · 큐 상한 · epoch | §6 수신 계약 |
| 19-07 | relay 관찰자 상태기계 · 거부 정지 · healthz · 비밀 설정 | §4 로그인 · 거부 문구, §6 |
| 19-09 | G1: 스키마 동기화 · 실 코덱 · 실 TCP 통합 | §2 번호 · 테이블, §7 G1 |
| 19-11 · 19-12 | 전환 창: 원격 DB · 비밀 주입 · gh-trade 배포(G2) · relay · server · webapp | §7 G2 |
| 19-13 | 첫 거래일 실장 대조(브로커 체결내역 · 게이트웨이 저널 · 새 테이블) | 저널 파일 · seq 로 대조 |
