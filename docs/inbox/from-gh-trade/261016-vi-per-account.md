---
status: open
from: gh-trade
from_commit: 8aaa9d01
from_branch: worktree-agent-a46f55ba18ffddcfe
date: 2026-10-16
fbs_sync_marker: acb8182d
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-16

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

gh-trade Phase 33 「VI 전략 계좌별 슬롯」 — gh-radar 요청 `docs/inbox/from-gh-radar/261013-vi-per-account.md` 의 답이다. MsgType 번호 무변경, `SetVITrigger` 말미 append 1필드.
gh-trade 커밋: 33-01 `acb8182d`(fbs·트레이서 — **fbs 최종 = 마커**) · `69bc88ef`(슬롯 벡터·계좌 키 Set·순서 발주·Gateway 거부/초집합) · `57b57e08`(거래소만 받는 조회 삭제·킬 스위치 2계좌) · `f415d0c8`(상태파일 'V' n 건), 문서 `8aaa9d01`.
`from_branch` 는 gh-trade 실행 worktree 브랜치다 — fbs 커밋 `acb8182d` 는 이미 gh-trade `origin/master` 에 있고, 문서 커밋은 페이즈 병합 때 master 로 들어간다(마커 해시는 바뀌지 않는다).

- **VI 슬롯 키가 (세션, 거래소) → (세션, `account_no`, 거래소)** — 같은 서버의 계좌 A·B 가 같은 거래소 VI 를 각자 켜 둘 수 있다(계좌당 거래소마다 1건).
- **`SetVITrigger.unregistered: bool` (vtable 16, 테이블 끝 append, S→C 전용, 기본 false = 등록됨)** — true = 그 (`account_no`, `exchange`)에 VI 설정이 없다는 **미등록 프레임**.
  미등록 프레임은 `account_no`·`exchange` 만 유효하고 금액 0·상승률 0·`run` false·`price_type` `'U'` 는 stub 값이라 **읽지 않는다**. 구 서버 61 은 필드가 없어 false(= 등록됨)로 읽힌다.
- **11 SetVITrigger 와이어 무변경** — 이미 싣던 `account_no` 가 슬롯 키가 됐다. 같은 거래소에 다른 계좌로 Set 하면 **새 슬롯**이다(갈아 끼움·「옮기기」 없음).
  빈 `account_no` 는 ERROR 54 「VI 전략 계좌번호가 없습니다 — 저장하지 않았습니다」 후 저장·에코 없음. 켜는 요청의 계좌가 세션 미선언이면 종전처럼 ERROR 뒤
  저장 없이 에코 — 그 슬롯 저장본이 있으면 저장본, 없으면 **미등록 프레임**(`unregistered=true`, run=false).
- **21 GetVITrigger(`key`=거래소) 응답 = 61 n 프레임** — 세션 **선언 계좌마다 1프레임**(선언 순서; 등록 = 설정 값, 미등록 = `unregistered=true`), 그 뒤에
  선언 밖 등록 슬롯(복원본·admin 선언 축소로 남은 것)을 1프레임씩 덧붙인다(초집합). `account_no`·`exchange` 는 **모든 프레임에 늘 실린다**.
  빈 Envelope 는 **선언 계좌 0 일 때만**이다(종전 「빈 Envelope = 그 거래소 미등록」 은 이제 미등록 프레임이 대신한다).
- **61 에코(Set·가드 거부·킬 스위치·장 마감 정리·일괄 비활성화)는 바뀐 슬롯만 1프레임**, 같은 user 의 모든 연결에 팬아웃(종전과 같은 경로).
- **발주 순서(D-03)**: 같은 종목 VI 발동 때 켜진 슬롯 **각각** 계좌별 금액·상승률로 1건씩 발주한다. 순서 = **먼저 켠 순서**(run false→true 시점) —
  ON→ON 재제출(값만 변경)은 순서 유지, OFF→ON 은 맨 뒤. 서버 로그 `[StrategyMgr] VITrigger 설정 … 슬롯=N`.
- **상태파일(D-10)**: `strategy_state.toml` 'V' 항목이 (owner, broker, `account_no`, exchange) 마다 1건, 파일 순서 = 발주 순서, 같은 키 중복은 마지막 승, 빈 계좌 항목은
  `[StrategyState]` WARN 뒤 버림. 기존 파일(계좌 1건)은 그대로 읽힌다 — 마이그레이션 없음. 끄기 = `run=false`(설정 남음, 삭제 없음).
- **56/72/73/33 무변경** — 이미 계좌·거래소를 싣는다(56 은 발주된 계좌마다 1건, 72/73 은 두 계좌 항목이 함께 나열).
- **요청 노트 질문 답:**
  1. 한 서버 안 두 계좌 동시 VI 발주 — **허용, 제한 없음**(사용자 결정 2026-10-13). 같은 계좌를 두 사용자가 켜는 것도 허용(D-04).
  2. 21 응답 모양 — **61 n 프레임(선언 계좌당 1)** 쪽이다. `key` 는 종전대로 거래소만.
  3. 일정 — 서버 배포는 **relay 배포 완료 회신을 받은 날** 장 마감 뒤에 한다(아래 「배포 순서 제약」). 이 노트가 그 신호다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs — 판정기 기본 기준(merge-base HEAD origin/master)에는 안 잡힌다(fbs 커밋 `acb8182d` 가 이미 origin/master). 페이즈 시작 전 `c1a39c7b` 기준으로 `=> gh-radar 계약 변경 2파일`

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **생성물은 이미 실었다**: gh-trade 가 이 노트와 같은 시점에 `RELAY=/Users/alex/repos/gh-radar/relay server/scripts/sync-relay-schema.sh` 로 재생성해
  **gh-radar 커밋 `ecd62f33`(master, push 안 함)** 로 실었다 — `relay/src/generated/` 2파일(`StockDMA.fbs` 사본 · `stock-dma/set-vitrigger.ts`),
  마커 `server-repo-commit: 8d56ea53 → acb8182d`. 재생성 전 `8d56ea53` 이 gh-trade HEAD 조상임을 확인했다(남의 미병합 변경 없음).
- **relay 캐시 키를 (소유키, 계좌, 거래소)로** — 61 을 거래소 칸 하나에 덮어쓰면 n 프레임 중 마지막 계좌만 남는다. 프레임의 `account_no` 를 키에 넣는다.
  구 서버 61 은 계좌 1개 사용자라 같은 바이트(`unregistered` 부재 = false)로 와 그대로 호환된다.
- **`unregistered=true` 프레임 = 그 (소유키, 계좌, 거래소) 캐시 삭제 또는 빈 행** — 설정 필드(금액·상승률·run·price_type)는 읽지 않는다.
  선언 계좌 0 의 빈 Envelope 는 종전처럼 「그 거래소 미등록」 으로 처리하면 된다.
- **서버 간 1건 가드 해제**(요청 노트의 gh-radar 몫): `fanout.ts` `#stopViElsewhere`(다른 서버의 같은 거래소 VI 를 먼저 끔) · `VI_BROKER="KB"` / `#viSourceOwners`
  (교보 세션 61/72/73/56 버림) — 서버가 계좌별 슬롯이 됐으니 KB·교보 동시 가동을 막을 이유가 없다.
- **웹 계좌별 VI 행** — 작업대에서 고른 계좌의 VI 행(KRX/NXT)을 그 계좌 키 캐시로 그린다. 켜기/끄기는 11 Set 에 그 계좌 `account_no` 를 실으면 된다(옮기기 불필요).
- DB 마이그레이션은 relay 가 61 을 저장한다면 키에 계좌를 더하는 것뿐 — gh-radar 판단.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 아니오 — 61 이 계좌별 n 프레임이 되면 지금 relay 는 거래소 칸 하나에 덮어써 마지막 계좌 건만 남는다(요청 노트 (b)). 순서: gh-radar relay(20:00 KST 뒤) → gh-trade 서버(KB120·121·교보119, 같은 날 C# 클라 발행 — 구 클라도 n 프레임을 거래소 칸에 덮어쓴다) → webapp. **relay 배포 완료를 이 노트 회신(또는 SendMessage)으로 알려 달라 — 그 뒤 서버를 배포한다.**

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

요청 노트 「확인 방법」 그대로:

- 같은 서버 계좌 A · B 에 KRX VI 를 각각 켜면 21 응답(61)이 두 건이고 둘 다 `run=true` · 서버 로그에 슬롯 2건.
- VI 발동 종목에서 A · B 각각 56 통보 · 72/73 항목에 두 계좌.
- 한쪽을 끄면 다른 쪽은 그대로(갈아 끼움 없음).
- WinForms VI 창에서 두 계좌가 각자 켜짐으로 보인다.
- 웹(relay 반영 뒤): 작업대에서 계좌 A 를 고르면 A 의 VI 행, B 를 고르면 B 의 VI 행.

추가:

- 선언 계좌 A·B 중 A 만 켠 세션의 21 응답 = A(설정, run) · B(`unregistered=true`) 2프레임, 둘 다 `account_no`·`exchange` 실림.
- gh-trade 서버 doctest(`TEST_FILTER='*계좌별 슬롯*' server/scripts/cloud-verify.sh` — 신규 5종, 33-01 전체 게이트 통과): `Gateway fan-out: VI 계좌별 슬롯 — 선언 계좌 A·B 중 A 만 켜면 …` ·
  `Gateway fan-out: VI 계좌별 슬롯 — B Set 이 A 를 덮지 않고 …` · `VI 자동주문 계좌별 슬롯: …` · `상태 저장 — VI 항목 계좌별 슬롯 n 건 …` · `기동 복원 — 계좌별 슬롯: …`.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

1. relay 배포 예정일 — 그날 장 마감 뒤 gh-trade 서버 3대 배포·C# 클라 발행을 묶는다.
2. 웹에서 미등록(`unregistered=true`) 계좌의 VI 행을 빈 행으로 보일지 숨길지 — gh-trade C# 은 VI 창에서 체크 OFF·입력값 유지, 메인폼 대시보드에서는 행 없음이다.
