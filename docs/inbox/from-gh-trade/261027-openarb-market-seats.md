---
status: done
from: gh-trade
from_commit: cab966fa
from_branch: worktree-phase-42-openarb-live-quote
date: 2026-10-27
fbs_sync_marker: 7824e51b
done_commit: none   # 할 일 없음 — 2026-10-27 확인: relay·webapp·server 는 OpenArb 46/91·92·93 미소비(git grep = 생성물·인박스·planning 뿐). 생성물 재동기화는 gh-trade Phase 42 master 병합 뒤 별도 커밋
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-27

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

Phase 42 「시장별 1등 칸」(D-15·D-22·D-23) — **테이블 말미 append 뿐**이다. 새 MsgType·Envelope 슬롯은 없고 기존 필드 번호도 그대로다.

- **46/91 `SetOpenArb` 끝에 optional 필드 2개 추가**: `n_kospi: ushort = null`(vtable 24) · `n_kosdaq: ushort = null`(vtable 26). 계좌별 코스피·코스닥 종목 수(좌석) 각 0 ~ 10, 기본 5. 46 요청에 없으면(옛 클라) 서버는 그 계좌 저장값을 유지한다(없으면 5). 각 10 초과 또는 둘 다 0 이면 서버가 거부한다(54 ERROR source `SetOpenArb` + 저장본 91 에코). 91 에코는 두 값을 **늘** 싣는다(미등록 스텁도 5·5).
- **`SetOpenArb.n1`·`n2` 는 주석 deprecated** (속성 `(deprecated)` 아님 — 접근자 그대로 있다). 서버는 요청값을 읽지 않고 저장값을 에코한다. 옛 「n1 + n2 > 32」 거부는 없어졌다.
- **92/93 `OpenArbJudgementItem` 끝에 필드 2개 추가**: `market: ubyte`(vtable 32 — 'K'(75) 코스피 · 'Q'(81) 코스닥 · 0 = 옛 서버) · `tier: ubyte`(vtable 34 — 0 칸 없음 · 1 1등 칸 · 2 후순위). 이 커밋에서는 tier 가 늘 0 이고, 같은 페이즈의 선정 엔진(42-08)이 1·2 를 채운다.
- 정본 설명: gh-trade `server/docs/protocol.md` 46·91·92·93 행, `StockDMA.fbs` 말미 「Phase 38 변경 요약」 블록의 Phase 42 단락.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화(`sync-relay-schema.sh`)는 **선택**이다. 필수는 아니다 — relay·webapp 은 OpenArb 메시지(46/91·92·93)를 소비하지 않는다(2026-10-27 gh-radar `git grep -il openarb` = 생성물·인박스 노트뿐). 재동기화는 gh-radar 쪽 **별도 커밋**으로 하고, gh-trade 의 이 페이즈(42)가 master 에 병합된 뒤 그 기준으로 돌리는 것이 안전하다 — 미병합 페이즈 생성물을 덮어쓰는 함정이 있다(gh-trade 는 이 저장소에서 `sync-relay-schema.sh` 를 돌리지 않았다).
- relay 파서·DB·웹 변경은 필요 없다. 개장차익 판정을 웹에 띄울 계획이 생기면 그때 `market`·`tier` 로 시장·1등 칸을 표시한다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예. 말미 append 뿐이고 gh-radar 는 OpenArb 를 소비하지 않는다. gh-trade 배포는 Phase 42 전체(서버 120·119 + 클라 발행)를 함께, 사용자 지시 때 한다 — 아직 안 했다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

해당 없음 — gh-radar 쪽 동작 변화 없음. 재동기화했다면 `relay/src/generated/StockDMA.fbs` 의 `server-repo-commit` 이 이 노트의 from_commit 이후(Phase 42 병합본)인지, 생성 TS 에 `nKospi`·`nKosdaq`·`market`·`tier` 접근자가 있는지 본다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
