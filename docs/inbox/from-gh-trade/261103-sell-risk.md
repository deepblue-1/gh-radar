---
status: open
from: gh-trade
from_commit: e96aef6e
from_branch: master
date: 2026-11-03
fbs_sync_marker: 681fb854
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-03

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

상따 매도 ☐위험도 [N]% (gh-trade quick-261103-l41) — MsgType 번호 무변경, 테이블 말미 append 만.

- `SetLimitChaser` 말미 `sell_risk_enabled: bool`(id 88 · vtable 180) · `sell_risk_pct: ushort`(id 89 · vtable 182) — 양방향.
  서버는 **`buy3_schema` ≥ 8** 일 때만 두 필드를 읽고, 7 이하는 서버 값 유지(웹 lc.set 재제출이 위험도를 지우지 않는다).
  에코 `sell_risk_enabled` = 서버 런타임 값(발동·매도 송신·상한가 미만 체결·매도 OFF·일괄매도·재기동이 OFF 로 내린다, 켜는 것은 사람뿐) · `sell_risk_pct` = 설정값(1~999, 기본 80).
  변경 마스크 비트 **52 `sell_risk_enabled` · 53 `sell_risk_pct`**(새 그룹 `kMaskGroupSellRisk` — 매도 그룹 밖, 매도 SOR 미러 범위 안). 54~63 예약.
  범위 밖(0·1000+) ON 요청은 위험도만 끄고 54 ERROR 「위험도는 1~999%여야 합니다(받은 값 N)」.
- `UserSettings`(42/84) 말미 `sell_risk_pct: ushort = null`(vtable 36, 1~999, 기본 80) — optional, 42 부재 = 저장값 유지, 84 는 늘 싣는다. 0·1000+ 는 54 ERROR(SetUserSettings) 「위험도 기준은 1~999%여야 합니다(받은 값 N)」.
- 54 사유 줄 새 `OrderReason::SellRisk`: 매도 `매도 1,000주 @70,000 — 위험도(상한가거래량 8,000 ÷ 상한가매수잔량 10,000 = 80% ≥ 80%)`(합산이면 ` · KRX+NXT 합산`) · 취소만 `취소 … — 위험도 — 매수 미체결 전부 취소(매도가능 0)`.
- 전략 이벤트(80/82, 새 kind 없음): 매도 kind 6 `reason_code` `SellRisk` · group 4(SellQuote) · `cond_metric` 0 · `cond_threshold` N · `cond_actual` 위험도 %(내림) / 취소 kind 7 `cancel_reason` 2(ExitSell).
- 정본 설명: `server/docs/protocol.md` 「SetLimitChaser ☐위험도 (quick-261103-l41)」 절 · 비트 표 52·53 행.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 생성물 재동기화: `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`(필요 — fbs append 2테이블). 미병합 페이즈 생성물을 지우지 않게 생성 기준 먼저 확인.
- relay 파서: 에코 `sell_risk_enabled`·`sell_risk_pct`·84 `sell_risk_pct` 를 통과시킬지(없어도 동작은 안전 — schema 7 웹 재제출은 서버 값 유지).
- 웹 lc.set: 급하지 않음(schema 7 이면 서버 값 유지). 웹에 ☐위험도를 두려면 `lcBuy3SchemaOf` 단조성대로 **앞 일곱 조건 + sellRisk 존재**일 때만 8 을 파생하고 마스크 비트 52·53 을 실어야 한다.
- 웹 상따 화면·기본설정에 「위험도」 칸 추가 여부는 아래 질문.
- DB 마이그레이션: 없음(kind·칸 추가 없음, reason_code 문자열 `SellRisk` 하나 늘어남).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — append·optional 만이라 구 relay·구 웹은 새 필드를 모른 채 그대로 동작한다(schema ≤ 7 재제출은 위험도 값 유지). 서버 → (클라 발행) → relay 재동기화 순.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 클라에서 ☐위험도를 켠 상따의 에코(60)에 `sell_risk_enabled=true`·`sell_risk_pct=N` 이 실리는지, 웹 lc.set 재제출 뒤에도 유지되는지.
- 서버 로그 `[LimitChaser] 위험도 발동 isin= 상한가거래량= 상한가매수잔량= 위험도=Z% 기준=N% 합산= 경로=B6|A3 매도가능=` · `[LimitChaser] 위험도 꺼짐 — {발동|매도 송신|상한가 깨짐|일괄매도|…}`.
- 84 에 `sell_risk_pct`(기본 80) 가 실리는지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

웹 상따 화면·기본설정에도 ☐위험도 [N]% 를 둘지(둔다면 schema 8 파생·비트 52·53 규약 위와 같다).
