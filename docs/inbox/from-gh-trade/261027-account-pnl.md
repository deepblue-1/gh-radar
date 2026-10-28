---
status: done
from: gh-trade
from_commit: 2b73d815
from_branch: master
date: 2026-10-27
fbs_sync_marker: 7824e51b
done_commit: 711d1a53
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-27

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

### A. 41-03 — 체결 손익·비용 한도 자동 조정 · 계좌 비용률(op 7)

- **와이어(append 만)**: `AdminCommandReq`(44) 말미 `fee_ppm: uint`(슬롯 16)·`sell_tax_ppm: uint`(슬롯 18), `AdminAccount`(87 의 계좌 행·44 의 account) 말미 같은 두 필드(슬롯 20·22). 단위 ppm(1 = 0.0001%). MsgType·Envelope 슬롯·AdminCode·`AccountState`(66/67) 무변경
- **44 op 7 SetAccountFee** (새 op)

  | 입력 | 결과 |
  |------|------|
  | 키 `account.account_no`(정규화), `user_id`·`password` 안 읽음 | 그 서버에서 그 계좌를 가진 **모든 유저 행**에 같은 두 값 |
  | `fee_ppm`·`sell_tax_ppm` 각 0 ~ 10000 밖 | code 1 BAD_OP — **제안**(새 code 없이 재사용) |
  | 빈/NUL/정규화 뒤 12자 초과 | code 5 |
  | 이 서버에 없는 계좌 | code 8 |
  | 저장 실패 | code 10 |
  | 사용자 세션이 보냄 | code 11 |
  | 두 값이 이미 같다(멱등) | code 0 · rev 불변 · 87 없음 · message 「변경 없음」 |
  | 변경 | code 0 · rev +1 · 86(message 「수수료 Nppm · 세금 Mppm」) → 87 |

  BUSY(9)·54 INFO·67 **없음**(비용률은 클라 화면 값이 아니다). (0, 0) = 해제(users.toml 키 삭제)
- **op 3 SetAccount 는 두 필드를 읽지 않는다**: 같은 행 갱신 = 보존 · 이 서버 다른 유저가 이미 가진 계좌 추가 = 그 비용률 복사 · 처음 생기는 계좌 = 0 (budget_krw 와 같은 규칙. op 1 신규 유저 첫 계좌도 복사)
- **체결 한도 자동 조정 시맨틱(서버가 체결마다 `budget_krw` 를 바꾼다)**
  - 매수 체결: 한도 −= floor(qty×px×fee_ppm/1e6) · 매도 체결: 한도 += round(qty×(px − 매도 직전 평단)) − floor(수수료) − floor(qty×px×sell_tax_ppm/1e6). 0 이하면 1원, 한도 0(미설정) 계좌는 안 바뀐다
  - **그 체결의 67(잔고 델타)은 조정 전 `budget_krw`** 를 싣고, ≤100ms 뒤 **한도 전용 67**(holdings·unfilled·removed_order_nos 빈 벡터, is_snapshot=false — op 6 과 같은 모양)이 조정된 현재 값을 싣는다. relay 는 67 의 `budget_krw` 를 **마지막 값으로 덮으면** 된다
  - **users_rev·87 은 체결로 바뀌지 않는다**(D-29 — 확인 요청). 다음 87(op 5 등)은 현재 값을 싣는다

### B. 41-04 — 저널 손익 4필드(일자별 매매손익 페이지 입력)

`JournalRecord`(JournalBatch 80 의 레코드) 말미에 **24~27번 필드 4개 append** — MsgType·Envelope 슬롯·기존 23 필드는 무변경(fbs 삭제 줄 0).

| # | 필드 | 타입 | vtable | 값 규칙 |
|---|------|------|--------|---------|
| 24 | `avg_price` | long | 50 | 매도 직전 평단(원) — 서버 잔고 가중평균을 원 단위 반올림. 매수·비체결·평단 모름 0 |
| 25 | `fee_krw` | long | 52 | 그 체결 수수료(원, 원 미만 버림) |
| 26 | `tax_krw` | long | 54 | 매도 세금(원, 원 미만 버림), 매수 0 |
| 27 | `realized_pnl_krw` | long | 56 | 매도 = qty×(px−평단) − 수수료 − 세금 · 매수 = −수수료 · 비체결·평단 모름 0 |

- **E(체결) 레코드에만 값**이 있다. A/C/M/R·로컬 거부·Gateway 즉시 회신은 넷 다 0. 필드가 없는 옛 레코드(재생분 포함)도 0.
- 계산은 41-03 의 계좌 한도 자동 조정과 **같은 한 함수**(`FillCost`)의 결과다 — 같은 체결에서 `realized_pnl_krw` == 그 계좌 한도 변화량. 한도 미설정(budget_krw 0) 계좌도 값은 싣는다. 비용률(fee_ppm·sell_tax_ppm) 미설정 계좌는 수수료·세금 0.
- 원 미만: 수수료·세금 각각 버림, 손익항 반올림. 식 정본 gh-trade `docs/features/account-budget.md` ⑦, 필드 정의 `docs/features/order-journal.md` 「JournalRecord 27 필드」.
- 계정 귀속은 기존 `dma_user_id`(공유 계좌도 발주 세션으로 구분), 일자는 기존 `trade_date`(KST). 재기동 뒤 원주문 세션을 모르는 체결은 `dma_user_id = ""`.

판정기가 걸린 파일:

- `server/src/protocol/StockDMA.fbs`
- `server/docs/protocol.md`
- `docs/features/order-journal.md`

(커밋 fa8a0482·7824e51b 외 — 이미 origin/master 에 push 돼 판정기 기본 기준으로는 0건이 나온다. 선행 노트: 261027-account-budget)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

### A. 41-03

- relay 생성물 재동기화 — gh-trade 가 `sync-relay-schema.sh` 로 gh-radar 작업 트리에 이미 반영해 두었다(미커밋, 고아 삭제 0, SYNC MARKER 7824e51b — 41-03 fa8a0482 포함) — `relay/src/generated/StockDMA.fbs`·`stock-dma/admin-account.ts`·`admin-command-req.ts`·`journal-record.ts` 4파일을 경로 지정으로 커밋하면 된다.
- relay: op 7 송신 + 87 `AdminAccount.fee_ppm`·`sell_tax_ppm` 파싱
- 어드민 계좌 카드에 「수수료(%)·세금(%)」 칸 — ppm ↔ % 변환(100 ppm = 0.01%), 서버별 칩·fan-out, op 3 뒤 op 7 되싣기(op 6 과 같이)
- 웹 주문가능은 67 `budget_krw` 를 그대로 쓴다(체결로 바뀐 값이 한도 전용 67 로 온다)

### B. 41-04

1. relay 생성물 재동기화 — gh-trade 가 `sync-relay-schema.sh` 로 gh-radar 작업 트리에 이미 반영해 두었다(미커밋, 고아 삭제 0, SYNC MARKER 7824e51b — 41-03 fa8a0482 포함) — `relay/src/generated/StockDMA.fbs`·`stock-dma/admin-account.ts`·`admin-command-req.ts`·`journal-record.ts` 4파일을 경로 지정으로 커밋하면 된다.
2. relay 저널 파서 — JournalRecord 4필드(`AvgPrice`·`FeeKrw`·`TaxKrw`·`RealizedPnlKrw`) 읽기, 이벤트 JSON 키는 필드 이름 그대로(`avg_price`·`fee_krw`·`tax_krw`·`realized_pnl_krw`).
3. DB — 주문 이벤트 컬럼 4개(bigint, 기본 0) 추가 마이그레이션.
4. 웹 「일자별 매매손익」 페이지 — 계정별(`dma_user_id`)·계좌별(`account_no`) 탭, 일자(`trade_date`) × 실현손익 합(`realized_pnl_krw`)·수수료 합(`fee_krw`)·세금 합(`tax_krw`)·매수 금액 합·매도 금액 합(`exec_qty × exec_price` 를 `side` B/S 로 나눠, `notice_type = 'E'` 만).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 41-03 — 예 — 구 relay 는 새 필드를 모르고 무시한다(append-only), op 7 을 보내지 않으면 비용률 0 = 차감 없음. 배포 때 users.toml 값: 교보 119 `fee_ppm = 500`·`sell_tax_ppm = 2000`, KB 120 김현중·정근형 계좌 `fee_ppm = 100`·`sell_tax_ppm = 2000`(op 7 준비 전이면 서버 정지 중 손편집).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

41-04 — **예** — 말미 append 라 구 relay 는 새 필드를 무시한다. gh-radar 쪽은 DB → relay → webapp.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

### A. 41-03

- 어드민에서 계좌 비용률 설정 → 86 code 0 · 87 의 그 계좌 모든 행 `fee_ppm`/`sell_tax_ppm` 값, 서버 로그 `[Gateway] admin op=7 계좌 비용률 account=… fee_ppm=… sell_tax_ppm=… rows=…`
- 한도 설정 계좌에서 소액 체결 → 67 `budget_krw` 변화(체결 67 은 이전 값, 곧 한도 전용 67 이 새 값), 서버 로그 `[Budget] 매수|매도 account=… budget A→B`

### B. 41-04

소액 매수·매도 체결 뒤 relay 이벤트(또는 DB 행)에서 그 E 레코드 4값을 본다 — 매수는 `avg_price 0 · tax_krw 0 · realized_pnl_krw = −fee_krw`, 매도는 `avg_price` = 매도 직전 평단(원), `realized_pnl_krw` 가 같은 시각 gh-trade 서버 로그 `[Budget] 매도 … pnl=N` 의 N 과 같다(한도 설정 계좌는 67 의 budget_krw 변화량과도 같다).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

### A. 41-03

- D-28 이름(`fee_ppm`·`sell_tax_ppm`, op 7 `SetAccountFee`)과 범위 밖 code 1 재사용 — 괜찮은지(gh-radar-85 합의 대상)
- D-29: 체결 조정은 users_rev 를 올리지 않고 87 을 다시 보내지 않는다 — relay 가 67 의 budget_krw 를 현재 값으로 보면 되는지

### B. 41-04

- D-37 필드 이름 4개와 `long` 타입 — 이대로 합의인가? (append 뒤에는 이름을 못 바꾼다. 바꾸려면 append-only 로 새 필드를 더한다)
- `dma_user_id = ""` 체결(재기동 뒤 세션 모름)의 페이지 표시 — 「미상」 한 묶음으로 둘지, 계좌별 탭에만 넣을지.

## 추가 — gh-trade 코드 리뷰 수정 뒤 동작 변화 (2026-10-27, gh-trade a017ddd9, 와이어·fbs 무변경)

1. **한도 전용 67 재전송:** 한도가 바뀔 때마다(체결 조정·op 6) 1 ~ 2초 뒤 같은 계좌에 같은 모양의 한도 전용 67 이 한 번 더 온다(늦게 도착한 옛 한도 67 을 덮는 보정). 그대로 마지막 값으로 덮으면 된다.
2. **op 6 상한:** INT64_MAX 초과는 code 1, message 「한도 범위 밖(0~9223372036854775807원)」.
3. **op 7 범위 밖 문구(요청 반영):** code 1, message 「비용률 범위 밖(0~10000ppm)」. 구 서버의 code 1 은 「알 수 없는 명령입니다」 — message 로 구별.
4. **저널 손익 — 평단 모르는 매도:** `avg_price` 0 인 매도 E 레코드는 `realized_pnl_krw = −(fee_krw + tax_krw)`(종전 0). 한도도 그만큼 줄어든다. fbs 의 `JournalRecord` 주석 「평단 모름 0」 은 낡았고 정본은 gh-trade `docs/features/order-journal.md` 27행이다.
5. **한도 전용 67 도달 범위:** 계좌번호 앞자리 0 원문으로 선언한 세션도 받는다(정규화 비교).

## 회신

(2026-10-28) gh-radar Phase 36 반영: DB `20261028210000`(저널 4열 · apply 재정의) · `20261028210100`(매매손익 RPC 2종) · relay `relay:711d1a53` · server `gh-radar-server-00069-qwg` · webapp push `2f26aea4..711d1a53`(Vercel Ready). 생성물(SYNC 7824e51b)은 aaf2d154 로 커밋했고, 이후 master 의 Phase 43 SYNC(f156cb6f)가 같은 필드를 그대로 포함한다.

- A(41-03): 어드민 계좌 카드 「수수료 · 매도세(%)」 칸 → 44 op 7(서버별 칩 · fan-out) · 87 `fee_ppm` · `sell_tax_ppm` 파싱 · op 3 뒤 op 7 되싣기. code 1 은 「서버 미지원 · <message 원문>」 으로 보인다.
- B(41-04): relay 저널 파서 → 이벤트 키 `avg_price` · `fee_krw` · `tax_krw` · `realized_pnl_krw` → `dma_journal_events` bigint 4열(NOT NULL DEFAULT 0, 백필 없음). 일자별 매매손익은 `/admin/pnl`(계정별 · 계좌별) · `/me` 「손익」 탭.
- 질문 답: D-28 이름과 범위 밖 code 1 재사용 — 좋다. D-29 — relay 는 67 `budget_krw` 를 마지막 값으로 덮어 현재값으로 쓴다(87 은 체결로 안 바뀌어도 된다). D-37 4필드 이름 · `long` — 합의(gh-radar 사용자 승인, 열 이름도 같다). `dma_user_id = ""` 체결은 계정별 탭에 「미상」 한 묶음으로 맨 뒤에 두고, 계좌별 탭에는 그 계좌에 그대로 합산한다.
- 「추가」 1~5 확인: 한도 전용 67 재전송 · 정규화 도달은 마지막 값 덮기로 흡수, 평단 모르는 매도 −(fee+tax) 는 DB 열 주석에 반영.
- 라이브 UAT: 비용률 저장 · 체결 뒤 저널 4값 → `/admin/pnl` · `/me` 손익 탭 당일 행 · 체결 조정 예수금 반영 — 사용자 「1-6 pass」(2026-10-28).
