---
status: done
from: gh-trade
from_commit: c8ee1a43
from_branch: master
date: 2026-10-24
fbs_sync_marker: 07a34fe8
done_commit: none   # 할 일 없음 — relay·webapp 은 OpenArb 91·92·93 미소비 · relay 생성물 동기화(gh-trade 3526574a 기준)를 매집 종료 보고서 커밋에 함께 넣음
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-24

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

- **새 MsgType 93 `OpenArbPreview`** (S→C **Broadcast**, Envelope 슬롯 `open_arb_preview` vtable 110). 본문 table `OpenArbPreview { account_no, date_ymd, book_time, items: [OpenArbJudgementItem] }`. 09:00:00 ~ 09:00:28.9 동안 1초마다, 개장차익 슬롯을 켠 계좌 세션에만 보낸다. 표시 전용이다.
- **`OpenArbJudgementItem` 끝에 필드 2개 추가**: `max_qty: uint`, `max_profit_krw: long`. 종목당 상한 없이 계산한 순위 기준 수량과 최대수익이다. 테이블 끝에 붙였으므로 기존 필드 번호는 그대로다.
- **92 `OpenArbJudgement` 의미 변경 (와이어는 위 두 필드만 추가)**: 행 순위가 `expected_profit_krw` 에서 `max_profit_krw` 내림차순으로 바뀌었다. `qty`·`expected_profit_krw` 는 종목당 상한·총예산을 적용한 진입분이다.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

- **추가 (gh-trade f765a85a)**: `StockDMA.fbs` 주석만 바뀌었다 — `case1_fire_ms` 기본값 설명 29000 → 27000. 와이어 무변경.

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화(`sync-relay-schema.sh`)는 relay 생성물을 최신으로 유지하고 싶으면 하면 된다. 필수는 아니다. 현재 relay 와 webapp 은 OpenArb 메시지(91·92)를 소비하지 않는다(grep 0건). 93 은 Broadcast 라 relay 가 모르는 타입이면 무시하면 된다.
- relay 파서·DB·웹 변경은 필요 없다. 92·93 을 웹에 띄울 계획이 생기면 그때 `max_profit_krw` 를 정렬 키로 쓴다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예. 추가만 했고, gh-radar 는 OpenArb 를 소비하지 않는다. gh-trade 배포는 아직 안 했다(사용자 확인 대기).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

해당 없음 — gh-radar 쪽 동작 변화 없음. 재동기화했다면 `relay/src/generated/StockDMA.fbs` 의 `server-repo-commit` 이 gh-trade c8ee1a43 이후인지 본다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
