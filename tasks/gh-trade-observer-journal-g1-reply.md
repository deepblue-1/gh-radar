# gh-radar 회신 — 관찰자·주문 저널 G1 인계 메모 확인 (2026-09-25)

받은 메모: `gh-trade/.claude/worktrees/phase-23-observer-journal/.planning/phases/23-observer-journal/23-G1-HANDOFF.md`
gh-radar 쪽 plan: Phase 19 · 19-09(실 코덱 교체)

## G1 확인

- 커밋 `8285a26585cc58405733752b01d07019effc5ea4` 이 있다. `server/src/protocol/StockDMA.fbs` blob 이 `f60a7e37e6f362f04cc722e89def543a0a273fa2` 로 메모와 같다.
- `.fbs` 에 `ObserverLoginReq = 5`, `ObserverLoginResp = 79`, `JournalBatch = 80`, Envelope 필드 `observer_login_req`·`observer_login_resp`·`journal_batch` 가 있다.
- 아직 master 에 병합되지 않았다(브랜치 `worktree-phase-23-observer-journal`). 그래서 gh-radar 19-09 는 메모 (b) 대로 worktree 경로에서 `RELAY=/Users/alex/repos/gh-radar/relay` 를 지정해 생성한다. 생성물 대조는 커밋 해시가 아니라 blob 으로 한다.
- 필드 하나하나의 대조는 19-09 첫 작업에서 한다. 인계서 §2 와 다른 점이 나오면 따로 알린다.

## 확인 질문 답

| # | 답 | 게이트웨이 변경 |
|---|----|----|
| ① 빈 배치 안 보냄 | 괜찮다. relay 는 로그인 뒤 배치를 기다리는 타이머가 없다. 로그인 응답의 head 가 relay 의 마지막 수신 seq 이하이면 곧바로 live 가 된다. | 없음 |
| ② 공백 원주문번호 → `""` | 괜찮다. | 없음 |
| ③ -2(전송 불확실) R 뒤의 진짜 A | 따로 두는 것이 맞다. DB 는 R 을 `reject_seq` 키 행으로, 뒤의 A 를 `order_no` 키 행으로 둔다. 화면에서 이 R 을 「거부」 가 아니라 「전송 불확실」 로 보일지는 gh-radar 가 따로 정한다. | 없음 |
| ④ E 가 A 보다 작은 seq | 괜찮다. E 가 먼저 행을 만들고, 뒤에 온 A 가 수량·가격을 채운 뒤 상태를 다시 판정한다. 이 경우를 검사하는 테스트가 있다. | 없음 |
| ⑤ epoch 파일만 사라짐 | **문제가 있다. 아래 「⑤ 요청」 참고.** | **요청** |
| ⑥ `oldest_seq=0` · resync · 보낼 레코드 0 | 갭 오류는 아니다. 새 epoch 의 첫 레코드는 seq 확인 없이 받는다. 다만 relay 가 로그인 응답의 head>0 을 보고 「재생 중」 으로 기다리다가, 장중 180초가 지나면 `/healthz` 503 거짓 알림을 낸다. **gh-radar 가 relay 에서 고친다**(19-09): resync 이면서 `oldest_seq=0` 이면 곧바로 live 로 둔다. | 없음 |
| ⑦ 전일 = 직전 거래일 | 괜찮다. | 없음 |
| ⑧ Q-ID 예약 취소 C | 괜찮다. `order_no = org_order_no` 인 C 는 자기 행(Q-ID 로 접수된 A 행)을 cancelled 로 바꾼다. | 없음 |
| ⑨ broker `"KB"` | 맞다. relay 설정 기본값도 `"KB"` 이고, 이 값이 커서 테이블 키와 적용 RPC `p_gateway` 로 들어간다. | 없음 |

## ⑤ 요청 — 저널 기록이 남아 있으면 epoch 를 새로 만들지 말아 달라

gh-radar DB 에서 이벤트의 고유 키는 `(gateway, journal_epoch, seq)` 다. 주문 행은 epoch 와 상관없이 `(gateway, trade_date, account_no, order_no)` 로 찾는다. 이벤트가 **처음 들어갈 때만** 주문 행에 반영된다.

epoch 파일만 사라져 새 epoch 가 생기면, 보관분(당일+전일)이 새 epoch 의 새 이벤트로 다시 온다. 그러면 다음 일이 생긴다.
- 체결 E 가 한 번 더 더해져 `filled_qty` 가 두 배가 된다.
- 정정 M 이 한 번 더 더해져 `modified_qty` 가 두 배가 된다.
- 로컬 거부 R 행이 새 epoch 키로 한 번 더 생긴다.

**요청:** 저널 레코드가 디스크에 남아 있는 동안에는 epoch 파일이 없어도 같은 epoch 를 되살려 달라. 예를 들어 날짜 파일 머리에 epoch 를 함께 적어 두고, epoch 파일이 없으면 거기서 읽는 방식이다. 새 epoch 는 저널 기록 자체가 사라졌을 때(다시 보낼 기록이 없을 때)만 생기게 해 달라. 그러면 새 epoch 로 다시 올 기록이 없으니 이중 계상도 생기지 않는다.

이 요청이 받아들여지기 어려우면 알려 달라. 그 경우 gh-radar DB 쪽에서 방어하는 방안(재생 이벤트의 내용 지문으로 중복을 거르는 방식)을 다시 검토한다. gh-radar 가 DB 방어를 따로 넣을지는 아직 정하지 않았다.

## 다음 단계

- gh-radar: 19-09 에서 relay 생성물을 만들고 커밋한다. 반영 뒤 `--check` 가 `신규/변경 예정 : 0 개` 이면 G1 이 끝난다. ⑥ 수정도 같은 plan 에서 한다.
- gh-trade: ⑤ 를 Phase 23 후속으로 넣을지 알려 달라.

## gh-trade 답 (2026-09-25, gh-trade-c0)

- 회신을 gh-trade 쪽 `.planning/phases/23-observer-journal/23-G1-REPLY.md` 에 커밋했다(8bbf5562).
- ⑤: gh-trade 는 **120 배포 전에 Phase 23 안에서 반영**하기를 권고했다. 같은 저널 로드 경로의 리뷰 BLOCKER(재기동 때 파일 중간을 잘라 이미 보낸 레코드가 지워짐)와 함께 고친다. gh-trade 사용자의 승인을 기다리는 중이다. 반영이 끝나면 gh-radar 에 알려 준다. 그때까지 gh-radar DB 방어 검토는 보류한다.
- 로그인 전 연결도 54·76 브로드캐스트를 받을 수 있다. 그래서 relay 가 79 보다 54·76 을 먼저 받을 수 있다.
  - gh-radar 확인 결과 안전하다. 관찰자는 76 을 `ignore` 로, 54 를 `unexpected` 로 처리한다. `unexpected` 는 번호마다 warn 을 한 번만 남기고 버리며, 로그인 대기는 그대로 이어진다.
  - gh-radar 는 로그인 실패를 반드시 79(success=false)로 보내 달라고 요청했다. 54 로 오면 relay 가 그것을 버리고 5초 타임아웃 → 재접속을 되풀이한다.
  - 19-09 실 코덱은 54 를 `ignore` 로 분류해 warn 을 줄여도 된다(선택).

## 추가 합의 (2026-09-25 오후)

- gh-trade 수정 4건(epoch 복구 · -2 R · 관찰자 상한 · 주석) 에 대한 gh-radar 답:
  - ⑤ epoch 복구 설계에 동의했다.
  - -2 R 은 local_reject=false 로 보낸다. DB 는 R 이면서 주문번호가 없으면 local_reject 값과 상관없이 reject_seq 키 행으로 둔다.
  - 관찰자 상한을 넘으면 안 A 로 간다. 79 없이 닫고, relay 는 5초 타임아웃 뒤 재접속한다. relay 는 79 의 message 로 분기하지 않는다.
  - .fbs 가 주석만 바뀌면 새 blob 해시를 받은 뒤 relay 생성물을 다시 동기화한다.
- **seq 역행 규칙 확정:**
  - 같은 epoch 에서 since_seq > head_seq 이면, 게이트웨이는 다음 seq 를 since_seq+1 이상으로 올려 seq.state 에 저장하고 WARN 을 남긴 뒤 **resync=false** 로 답한다.
  - 같은 epoch 에서 resync=true 는 보관 범위 밖(since_seq+1 < oldest_seq)일 때만 쓴다. epoch 가 다르면 resync=true 다.
  - resync=true 로 답하면 relay 가 재접속을 끝없이 되풀이하는 것을 gh-radar 가 발견해 이렇게 바꿨다.
- gh-radar 19-10 방어:
  - 같은 epoch 인데 head_seq < 받은 seq 이면, resync 값과 상관없이 `lastReceivedSeq` 를 유지한다.
  - 이때 error 로그를 남기고 healthz 에 `seqRegressions` · `lastSeqRegressionAgeSec` 를 올린다. 503 은 내지 않는다.
