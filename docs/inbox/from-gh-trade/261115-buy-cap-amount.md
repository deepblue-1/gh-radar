---
status: done
from: gh-trade
from_commit: 8d073739
from_branch: master
date: 2026-11-15
fbs_sync_marker: 204e505d
done_commit: 8a4ffe1f  # 웹 칸 · relay schema 9 는 fd21b4dc(생성물 재동기화 c2e4910e · 표시 단위 fix f27b85a7) · 미배포(gh-trade 서버 배포 뒤 relay → push) · 회신 노트 ../gh-trade/docs/inbox/from-gh-radar/261115-buy-cap-block-journal.md(막힌 기록을 저널 80 전략 이벤트로 남겨 달라는 요청 · 회신 대기)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-15

## 바뀐 것

상따창 「최대금액」(종목 한도) 추가 — gh-trade quick-261115-ptq, 커밋 8d073739. **아직 미배포·미발행**(서버 120·119·112 배포와 클라 발행은 사용자 지시 대기).

- `SetLimitChaser` 말미 append 1필드: `buy_cap_amount: uint`(만원, 0 = 제한 없음, id 90 · vtable 184, 양방향 — 에코 = 설정값). MsgType·기존 필드·번호 무변경.
- `buy3_schema` 세대 9 = `buy_cap_amount` 를 싣는 클라. 서버는 `>= 9` 일 때만 이 값을 읽고 **8 이하 제출은 서버 값을 유지**한다(2 ~ 8 관례 그대로) — 지금 relay(세대 ≤ 8)가 상따 설정을 제출해도 사용자가 클라에서 넣은 최대금액은 지워지지 않는다.
- `change_mask` 비트 54 = `buy_cap_amount`(매수 그룹 밖 별도 그룹 — 이 비트만 실은 제출은 매수 게이트를 재무장하지 않는다). 비트 표는 `server/docs/protocol.md` 「SetLimitChaser change_mask 비트 표」(55칸 · 그룹 10개).
- 의미: 선·줄·후매수 합쳐 「보유 매입금액 + 매수 미체결(주문가 환산)」 이 최대금액을 넘지 않게 서버가 발주 수량을 조이고, 남은 한도가 1주 미만이면 발주하지 않는다(체크는 유지). 매수 SOR 짝은 두 창 합산. 정본 `docs/strategy/limit-chaser.md` §5-5.
- 새 54 사유 줄(평문, source LimitChaser) 1종: 한도로 막힌 전이 때 그룹별 1회 — 예 `줄매수 보류 — 최대금액 10,000만 중 10,000만 사용(보유 7,000만 · 미체결 3,000만)`. fbs enum·MsgType 추가는 없다(서버 내부 사유값만 append).
- 주문 저널·전략 이벤트(kind 9 CfgSubmit)에는 최대금액을 **싣지 않는다** — 최대금액만 바꾼 제출은 kind 9 행이 없다.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

**필수 작업 없음**(말미 append 1건 — 기존 생성물로 읽고 쓰는 데 지장 없음).

선택: 웹 상따 설정 폼에서 최대금액을 보여 주거나 고치게 하려면
- 생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`, 별도 커밋),
- `relay/src/dma/envelope.ts` 의 `buy3_schema` 파생에 세대 9 추가(앞 세대 조건 전부 + `buy_cap_amount` 값 존재일 때만 9 — 값 없이 9 를 실으면 서버가 0 으로 읽어 한도를 지운다),
- `change_mask` 를 싣는 경로면 비트 54,
- 웹 폼 칸(`limit-chaser-form.tsx`) · 에코 표시.
필요 없다고 판단하면 「필수 작업 없음 확인」 으로 닫으면 된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 구 relay(세대 ≤ 8)의 제출은 서버 값 유지, 에코의 새 필드는 구 생성물이 무시한다. gh-radar 가 세대 9 를 싣는 변경을 한다면 그것은 gh-trade 서버 배포 **뒤**에 내보낸다(구 서버는 `buy_cap_amount` 를 모른다 — 값이 조용히 버려진다).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- 필수 작업 없음으로 닫는 경우: 서버 배포 뒤 웹에서 상따 설정을 한 번 제출해도 클라 상따창의 최대금액 값이 그대로인지(서버 값 유지).
- 세대 9 를 붙이는 경우: 웹에서 넣은 최대금액이 클라 상따창 「최대금액」 칸 에코로 보이고, 반대로 클라에서 넣은 값이 웹 에코에 보이는지.
- 전략 로그에 `… 보류 — 최대금액 …` 줄이 평문 그대로 보이는지(파서가 54 평문을 가공한다면).

## 질문

- 매매진단 챗봇이 「왜 안 샀나」 를 답할 때 최대금액 설정값이 필요하면 알려 달라 — 지금은 kind 9 에 싣지 않았고, 싣는 것은 gh-trade 쪽 한 줄 변경이다(막힘 자체는 54 사유 줄로 남는다).
