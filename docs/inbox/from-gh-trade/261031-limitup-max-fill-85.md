---
status: done
from: gh-trade
from_commit: bac82294
from_branch: master
date: 2026-10-31
fbs_sync_marker: 55e62638
done_commit: d59f7ed8
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-31

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

85 LimitFeature 말미에 필드 2개 append (quick-261031-nbu, 코드 커밋 bac82294). 기존 필드 순서·번호, MsgType, Envelope 는 바뀌지 않았다. 저널 kind 15 슬롯과 `feature_schema`(1)도 그대로다.

- `upper_max_fill_krw: ulong` — 필드 id 35 · vtable 슬롯 74 (`limit_vol_qty` 바로 뒤). TS 접근자 `upperMaxFillKrw()`(bigint).
- `upper_max_fill_date: uint` — 필드 id 36 · vtable 슬롯 76. TS 접근자 `upperMaxFillDate()`(number, KST yyyymmdd).
- 의미: 상한가 최대 체결금액(원) — 한 주문 묶음(상따 선매수 체결량과 같은 묶음 규칙: KRX 는 0/0 조각 이어짐, NXT 는 msg_seq 같은 방향 런) 안의 **상한가 가격 매수 체결 금액 합**의 오늘 최대.
  - 그날 **첫 잠김**(상한가 = 매수1) 순간 동결된다. 그 뒤 풀렸다 다시 가도 바뀌지 않는다.
  - 오늘 값이 > 0 이면 (오늘 값, 오늘 날짜)를 싣는다. 아니면 그 키가 **마지막으로 잠긴 날의 확정 기록**(값, 그날)을 싣고, 기록이 없으면 0/0 이다. 매도잔량 체결 없이 바로 잠긴 날은 기록이 (0, 그날)로 덮인다.
  - 기록은 서버 `log/limit_fill.toml` 로 재기동·날짜를 넘는다. 06:00 리셋은 오늘 몫만 비운다.
  - 85 송신 대상 조건은 그대로다 — 추적 중인 키에만 실린다.
  - 구 서버 프레임은 두 필드가 없어 0 이다(FlatBuffers 기본값 0 은 싣지 않으므로 「없음」 과 「0」 은 가를 수 없다).
- gh-trade 상따창: 창구행 셋째 칸(옛 깨짐확률)을 「최대체결 X.X억」 으로 바꿨다. 날짜가 오늘이면 검정, 아니면 회색이고 툴팁에 「최대체결 M/d 기록」 을 띄운다. 확률 필드(`model_state`·`p_break_bp` 등)는 85 에 그대로 남는다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

1. relay 스키마 재생성: `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`. 신규/변경은 limit-feature.ts 하나로 예상한다. 261031-risk-limit-vol(nd7) 인계와 한 번에 처리해도 된다 — 생성 기준은 이 커밋(bac82294) 이후로 잡으면 두 인계가 함께 들어간다.
2. 85 를 읽는 화면이 있고 쓰고 싶을 때만 두 필드를 디코드한다. 필수는 아니다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 말미 append 라 구 relay·구 클라는 두 필드를 무시한다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

relay 생성물 `limit-feature.ts` 에 `upperMaxFillKrw()`·`upperMaxFillDate()` 접근자가 있고, SYNC MARKER 의 `server-repo-commit` 이 bac82294 이후인지 본다. 서버 배포 뒤 상한가에 가는 종목의 85 프레임에서 `upperMaxFillDate()` 가 오늘 날짜로 나오면 맞다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음

## gh-radar 처리 기록

- `d59f7ed8` — relay 생성물 재동기화. `limit-feature.ts` 에 `upperMaxFillKrw()` · `upperMaxFillDate()` 접근자 존재 · SYNC MARKER `server-repo-commit` bac82294.
- 이번 범위는 스키마 동기화까지 — relay 디코드 · 웹 표시는 하지 않았다(필요해지면 별도 작업).
