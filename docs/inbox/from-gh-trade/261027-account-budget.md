---
status: done
from: gh-trade
from_commit: 2aa8a459
from_branch: master
date: 2026-10-27
fbs_sync_marker: 75195b70
done_commit: 711d1a53
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-27

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어는 **세 테이블 말미 append 뿐**이다 — MsgType·Envelope 슬롯·AdminCode 무변경, 새 code 없음.

| 자리 | 필드 | vtable | 뜻 |
|---|---|---|---|
| 44 `AdminCommandReq` 말미 | `budget_krw: ulong` | 14 | op 6 전용 — 계좌 한도(원), 0 = 해제 |
| 87 `AdminAccount` 말미 | `budget_krw: ulong` | 18 | 계좌 한도(원), 0 = 미설정. 같은 account_no 전 행 같은 값 |
| 66/67 `AccountState` 말미 | `budget_krw: ulong` | 16 | 그 시점 계좌 한도(원), 0 = 미설정 |

**44 op 6 SetAccountBudget**

- 읽는 필드: `account.account_no`(서버가 NormalizeAccountNo 정규화 — 앞 0 원문도 같은 키) + `budget_krw`. `user_id`·`password` 는 읽지 않는다(공유 계좌 37728502101 도 값 하나).
- 그 서버에서 그 계좌를 가진 **모든 유저 행**에 같은 값을 쓴다(users.toml `budget_krw` 키, 0 이면 키 생략). 상한 검사 없음. **BUSY(9) 없음** · 54 INFO 없음.

| code | 언제 |
|---|---|
| 0 OK | 변경 — users_rev +1, 86 뒤 87 1회, 그 계좌 선언 세션 전부에 67 한도 델타 |
| 0 OK(「변경 없음」) | 멱등(모든 행이 이미 같은 값) — rev 불변 · 87 없음 · 67 없음 · 파일 안 씀 |
| 5 BAD_ACCOUNT_NO | account 없음 · 빈 값 · NUL · 정규화 뒤 12자 초과 |
| 8 NO_SUCH_ACCOUNT | 이 서버에 없는 계좌(message 「이 서버에 없는 계좌」) |
| 10 PERSIST_FAILED | users.toml 저장 실패 — 메모리 그대로 |
| 11 NOT_ADMIN | 사용자 세션 연결이 보냄(기존 관문) |

변경 성공 86 의 message 는 「한도 N원」 또는 「한도 해제」(표시용, 분기는 code). 감사 로그 `[Gateway] admin op=6 user=- account=<정규화> client=… req=… code=… rev=…` + `[Gateway] admin op=6 계좌 한도 account=… budget_krw=… rows=…`.

**op 3 SetAccount 와 한도(op 3 은 `account.budget_krw` 를 읽지 않는다)**

- 같은 행 갱신(name·priority·branch·trader·IP/MAC) = 한도 **보존**
- 이 서버 다른 유저가 이미 가진 계좌를 추가 = 그 한도 **복사**(op 1 신규 유저의 첫 계좌도 같은 규칙)
- 이 서버에 처음 생기는 계좌 = **0** → relay 가 op 3 성공 뒤 다른 서버 스냅샷의 한도로 op 6 을 이어 보낸다(IP/MAC 되싣기와 같은 방식)
- op 4 로 그 계좌의 마지막 유저 행이 사라지면 한도도 사라진다

**67 한도 전용 델타** — op 6 이 한도를 실제로 바꾸면 `holdings`·`unfilled`·`removed_order_nos` **빈 벡터**, `is_snapshot=false`, `budget_krw` 새 값. relay 는 67 을 항목 단위로 병합하므로 잔고·미체결은 그대로 두고 budget_krw 만 덮어쓴다(66·67 마지막 값).

**계산식(클라 WinForms 와 같은 식, 표시용 — 서버는 판정·차단하지 않는다)**

주문가능(원) = `budget_krw − Σ(HoldingState.avg_price × stock_qty) − Σ(UnfilledState side "B" 의 unfilled_qty × price)`

- 잔고는 **매입가(평단 × 수량)** 기준(현재가 아님)
- 매도 미체결은 빼지 않는다. 매수 미체결은 KRX·NXT 모두 포함, 예약 요약 행·접수대기 행도 매수면 포함, `pending_cancel_sent=true` 행은 제외
- 매수 미체결 `price` 가 0(시장가 등)이면 그 종목 현재가, 현재가가 없으면 0(상한가 쓰지 않음)
- `budget_krw = 0` 이면 주문가능 「—」, 경고 없음. 초과해도 **막지 않는다**(경고만)

판정기가 걸린 파일:

- `server/src/protocol/StockDMA.fbs`
- `server/docs/protocol.md`
- `docs/features/order-journal.md`

(커밋 75195b70·3d5ba832·b2590369 — 이미 origin/master 에 push 돼 판정기 기본 기준으로는 0건이 나온다)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. relay 생성물 재동기화 — 대상 커밋 **75195b70**(gh-trade `feat(41-01): 계좌 한도 — fbs budget_krw 3곳 append…`). gh-trade 가 `sync-relay-schema.sh` 로 gh-radar 작업 트리에 이미 반영해 두었다(미커밋, 고아 삭제 0) — `relay/src/generated/StockDMA.fbs`·`stock-dma/account-state.ts`·`admin-account.ts`·`admin-command-req.ts` 4파일을 경로 지정으로 커밋하면 된다(ulong = bigint, SYNC MARKER 75195b70).
2. relay: 44 op 6 송신(account_no + budget_krw) · 87 `AdminAccount.budget_krw` 파싱 · 66/67 `AccountState.budget_krw` 반영(67 은 항목 병합, 한도는 마지막 값으로 덮어쓰기).
3. 어드민 계좌 카드 「한도(만원)」 칸 — useFieldSave · 서버별 칩 · 계좌당 값 하나를 전 서버에 fan-out · op 3 뒤 op 6 되싣기.
4. 웹 주문 화면(호가창 계좌 패널 · /me)에 주문가능 표시 — 위 계산식 그대로(alex 결정).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 세 필드 모두 말미 append 라 구 relay 는 슬롯을 읽지 않고, 구 서버는 op 6 을 code 1(BAD_OP)로 돌려준다(relay 는 1 이면 「서버 미지원」 으로 표시하면 된다). users.toml 은 선택 키라 재기동만으로 충분.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 어드민에서 계좌 한도 설정 → 86 code 0 · 87 의 그 계좌 전 행 `budget_krw` 새 값
- 서버 `config/users.toml` 의 그 계좌 항목에 `budget_krw = <원>` (0 이면 키 없음)
- 서버 로그 `[Gateway] admin op=6 user=- account=… code=0` · `[Server] 67 한도 델타 account=… 선언세션=N 전달=N`
- 그 계좌를 선언한 relay·클라 세션이 67(빈 벡터 · is_snapshot=false · budget_krw 새 값)을 받는다
- 같은 값 재전송 → 86 code 0 「변경 없음」, 87·67 없음

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## 회신

(2026-10-28) gh-radar Phase 36 반영: DB `20261028210000` · `20261028210100`(02:49 KST) · relay `relay:711d1a53`(smoke 11/11) · server `gh-radar-server-00069-qwg`(smoke 15/15) · webapp push `2f26aea4..711d1a53`(02:54 KST, Vercel Ready).

- relay: 66/67 `budget_krw` 는 계좌별 마지막 값으로 덮는다(0 = 해제도 그대로). 44 op 6 은 그 계좌가 active 로 등록된 서버마다 1건씩 fan-out 하고, 결과는 서버별 칩으로만 보이며 `dma_admin_results` · 의도 표에는 남기지 않는다. 87 `budget_krw` 를 어드민 카드 현재값으로 쓰되 67 live 값이 있으면 그것이 먼저다.
- op 3 으로 계좌를 새로 추가하면 같은 계좌의 다른 등록 서버 값을 op 6 · op 7 로 되싣는다(서버 쪽 복사 규칙과 별개로 gh-radar 가 맞춘다).
- 웹: 계좌 패널 「주문가능 / 예수금」 줄 · 수동주문 「주문가능」 행과 초과 줄 · 상따 카드 합산 경고(비차단).
- 라이브 UAT: 어드민 저장 · 웹 즉시 갱신 · 「변경 없음」 · 비용률 · 주문가능 표시 · 체결 뒤 예수금 조정 — 사용자 「1-6 pass」(2026-10-28).
- 남은 질문: 없음. 두 서버 동시 운영 시 예수금이 서버마다 따로 조정되는 갈림은 gh-radar 「켜기 전 결정」 목록에 올린다(Phase 36 D-03).
