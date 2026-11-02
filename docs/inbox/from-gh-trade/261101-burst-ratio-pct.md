---
status: done
from: gh-trade
from_commit: 619dd7a5
from_branch: master
date: 2026-11-01
fbs_sync_marker: 21d692a1
done_commit: a441b9be
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-01

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

StockDMA.fbs 말미에 필드 2개 append (MsgType 번호·기존 필드 무변경, quick-261101-t7c, 커밋 b6d3f3ef).

- `QuoteState.burst_ratio_pct: ubyte` (58/59, vtable 68) — 버스트 상한가 **비율 판정**값 1~100. 0 = 판정 없음(또는 구 서버). 상한 매도벽을 다 먹은 순간, 그 상한가 창의 유효 버스트(한 가격 2조각 이상) 상한가 수량 ÷ 창 안 상한가 매수 전체 × 100. KRX·NXT 둘 다.
- `UserSettings.burst_ratio_pct: ubyte = null` (42/84, vtable 34) — 사용자별 판정 기준 1~100, 기본 70. 42 에 필드가 없으면 서버는 **저장값을 유지**한다(부재 ≠ 0). 84 에는 서버가 항상 싣는다.
- 의미 변화: ☐버스트 취소(줄매수 해제 + 매수 미체결 전부 취소)가 이제 `burst_ratio_pct ≥ 사용자 기준` 일 때 판정당 1회 동작한다. 54 'B' 문구는 「줄매수 해제 — 버스트 상한가 NN%」.
- 무변경: `burst_upper_limit`(엄격 판정, 종전 그대로) · kind 10 BurstLimit 이벤트 · 85 위험도.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화(`sync-relay-schema.sh`) 필요 — 새 필드를 relay 가 읽으려면. 읽지 않아도 append 라 기존 파싱은 깨지지 않는다.
- **웹 lc/사용자 설정 저장(42)이 UserSettings 를 재조립해 보낸다면** 이 필드를 모르고 보내도 서버가 저장값을 유지하니 안전하다. 0 을 명시적으로 넣어 보내면 범위 밖(1~100)이라 거부/무시되는지 확인 필요 — 부재로 두는 쪽이 안전.
- 선택: 웹 호가/상따 화면에 「버스트 NN%」 표시, 웹 기본설정에 판정 비율 칸.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — append 전용, 필드 부재 = 저장값 유지. 서버 120·119 를 2026-11-01 밤 배포 예정.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

84 응답에 `burst_ratio_pct` 70(기본) · gh-trade 서버 로그 `[MarketPublisher] 버스트 비율 판정 … 비율=NN%` · 59 의 burst_ratio_pct 가 판정 뒤 1~100.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

웹 기본설정에 판정 비율 칸을 둘지(두면 42 에 burst_ratio_pct 1~100 을 싣는다). 웹이 42 를 보낼 때 이 필드를 0 으로 채워 보내는 경로가 있는지.

## gh-radar 처리 (261102 · quick-261102-epl)

커밋:

- `994ae31b` feat(relay,webapp): 59 `brp` — 생성물 재동기화(마커 b6d3f3ef) 커밋 · `parseQuote` 가 `QuoteState.burst_ratio_pct` 를
  거래소별 그대로(부재 0) · hub `samePriceSection` 에 `brp` 비교(비율만 바뀐 59 도 PRICE 소켓에 간다) · 상따 호가 사다리 표식 4갈래.
- `f4a27153` feat(relay,shared,webapp): 84/42 `burstRatioPct` — 84 파서(vtable 34 · 부재 0) · 42 조립기는 값이 있을 때만 슬롯 ·
  zod 1~100 선택 필드 · `/me` 42 조립은 84 값이 1~100 일 때만 싣는다.
- `a441b9be` feat(webapp): `/me` 상따 기본설정 「버스트 상한가 · 판정 비율」 칸 · 호가 사다리 기준을 카드 계좌 서버 84 로.

질문 답:

1. **예, 판정 비율 칸을 뒀다** — `/me` 상따 기본설정 「버스트 상한가 · 판정 비율」(1~100 · 오른쪽 열 매도 다음 · 자동매도 앞 ·
   84 가 0 이면 내장 70 표시). 범위 밖(0 · 101)은 「1~100% 사이여야 해요」 로 막고 보내지 않는다.
2. **42 에 0 을 채우는 경로는 없다** — 웹은 84 값이 1~100 일 때만 `burst_ratio_pct` 를 싣고 0(구 서버 · 모름)이면 부재로 보낸다
   (서버 저장값 유지). 다른 칸을 고칠 때도 같다. 사용자가 이 칸을 확정하면 1~100 만 나간다. relay zod 도 1~100 밖이면 소켓을 닫아 막는다(4400).
   남은 한 가지: 구 서버(84 에 슬롯 없음)에서 70 을 확정하면 42 는 나가지만 84 가 그 값을 싣지 않으므로 웹은 3초 뒤 「반영되지 않았어요」 를
   띄운다 — 정직한 결과로 둔다(서버 120·119 배포 뒤엔 해소).

표시: 상따 카드 호가 사다리(세 트리) — WinForms OrderBookPanel 동형 4갈래. `brp > 0 ∧ brp ≥ 기준` 빨간 「버스트 NN%」 ·
`0 < brp < 기준` 회색 「NN%」 · `brp 0 ∧ burst_upper_limit` 종전 「버스트」(구 서버) · 그 밖 없음. 기준 = 그 카드 계좌 서버의 84
`burstRatioPct`(0 · 미수신이면 70 · 다른 서버 값으로 대신 쓰지 않는다).

배포: relay 먼저 → webapp(push = 프로덕션) 순서는 메인 세션이 한다. DB 마이그레이션 없음.
이 quick 은 push · 배포를 하지 않았다 — 위 「확인 방법」 은 배포 뒤 메인 세션이 본다.
