---
status: done
from: gh-trade
from_commit: 66ba53d4
from_branch: master
date: 2026-11-12
fbs_sync_marker: a4e54275
done_commit: —  # 필수 작업 없음 확인(2026-11-12) — 코드 변경 없음. gh-trade 204e505d 에서 두 필드가 테이블 말미 append 임을 확인. relay 생성물은 a4e54275 그대로(재동기화 안 함) · relay 가 42 를 만들 때 새 칸을 싣지 않으므로 서버 저장값 유지. 웹에서 미체결 발주 주체 표시 · 같이 켜기 설정 저장을 하게 되면 그때 sync-relay-schema.sh 재동기화.
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-12

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

StockDMA.fbs 두 테이블 **말미 append** 두 건 (gh-trade 204e505d, quick-261112-v68). MsgType 번호·기존 슬롯 무변경.

- `UnfilledState.origin: string` (vtable 32) — 미체결 행의 발주 주체 `Manual`/`LimitChaser`/`VITrigger`, 모르면 `""`(늘 싣는다). 66/67/68 공용 단일 빌더. 상따창이 VI 자동주문 미체결을 구분해 표시하려고 넣었다.
- `UserSettings.buy_group_companion_off_mask: uint = null` (vtable 38) — 상따창에서 ☐선매수·☐줄매수를 켤 때 같이 켜지는 8항목 중 사용자가 끈 항목 비트(0 = 전부 켬). 84 는 늘 싣고, 42 에서 부재면 서버 저장값 유지, 0~255 밖이면 42 전체 거부(54 ERROR). 서버는 보관·에코만 한다(클라 동작).

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs
- server/docs/protocol.md

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

필수 작업 없음 — 둘 다 말미 append 이고 optional/빈 문자열 기본이라 옛 생성물로 읽어도 깨지지 않는다.
웹에서 미체결 발주 주체를 보이거나 사용자 설정을 웹에서 저장(42)하려면 그때 `sync-relay-schema.sh` 로 재동기화하면 된다. 웹이 42 를 보낼 때 새 필드를 빼면 서버 저장값이 유지된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 순서 무관(필드 추가만)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

gh-radar 무작업이면 확인할 것 없음. 재동기화했다면 relay 가 66/67 미체결에서 `origin` 을 읽는지(VI 주문 행 = "VITrigger").

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
