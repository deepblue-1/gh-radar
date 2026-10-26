---
status: done
from: gh-trade
from_commit: b76d2680
from_branch: master
date: 2026-10-26
fbs_sync_marker: d6071511
done_commit: none   # relay 생성물 동기화(2b86be0a — 88 day_cross_time 슬롯 102)를 같은 커밋에 포함 · relay 런타임 88 미해석이라 화면·DB 영향 없음
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-26

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

- **88 `AccumSignal` 말미 append 1필드** `day_cross_time: string` — vtable 슬롯 **102**(직전 마지막 `th_recent_sec` 100 다음).
  - 값: `"HHMMSS"` — 당일 순매수(`day_buy_krw − day_sell_krw`)가 `th_net_krw` 이상이 된 **가장 최근** 시각(A3 체결 KST).
  - 기록 자리: 팀 주문이 당일 순매수를 임계 위로 넘긴 순간 · 우리 매도 체결 제외로 당일 순매수가 임계 위로 넘은 순간(그 매칭된 팀 주문 시각). 미등록·숨김 포지션에서도 같이 기록한다.
  - 재돌파 = 새 시각. 1억 아래로 떨어져도 **지우지 않는다**(클라가 「돌파 시각 있음 ∧ 지금 미만」 으로 떨어진 행을 안다).
  - 비움: 06:00(숨김 전환·이월)·새 사이클(ResetCycle)·이월 만료 종료 프레임 직전·다른 날 기동 복원 — `day_*` 칸과 같은 자리.
  - 빈 문자열 = 오늘 아직 없음(서버는 빈 값도 늘 싣는다), **부재(nullptr) = 옛 서버**.
  - 89 `AccumSnapshot` 원소(88 테이블 재사용)도 같다.
- MsgType 번호·Envelope 슬롯·기존 필드 이름·순서·타입 **무변경**(append-only).
- kind 16 저널·하루 이벤트 JSON(`accum_events`)·accum_flow export **무변경**(D-07) — 돌파 시각은 88/89 와이어에만 실린다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 생성물 재동기화 대상 커밋: **`2b86be0a`**(fbs + 클라 생성물 같은 커밋, master 에 머지 커밋 b76d2680 로 병합 — 해시 그대로). 재동기화는 `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`.
- relay 가 88 을 직접 디코드하지 않으면 화면·DB 영향 없음(Phase 39 gh-radar-eb 답과 같음) — 재동기화는 생성물을 정본과 맞추는 것뿐이다.
- DB 마이그레이션·웹 변경 불필요.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 88 말미 append 라 구 relay·구 클라는 새 필드를 무시한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 재동기화 뒤 relay 빌드가 통과하고, 기존 88/89 소비(매집 이벤트·카운트)가 그대로인지 본다.
- (선택) 새 생성물로 88 을 디코드하면 `day_cross_time` 이 `"HHMMSS"` 또는 빈 문자열로 보인다 — 옛 서버 프레임은 nullptr.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
