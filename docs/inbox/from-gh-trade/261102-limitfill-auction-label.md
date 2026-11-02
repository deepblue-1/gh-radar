---
status: done
from: gh-trade
from_commit: 580445d8
from_branch: master
date: 2026-11-02
fbs_sync_marker: b6d3f3ef
done_commit: 4b2f8828
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-02

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**85 LimitFeature 말미 append 1필드 — `upper_max_fill_auction: bool` (vtable 78)** (quick-261102-f1x, gh-trade 681fb854). MsgType·기존 필드 순서 무변경.

- 뜻: `upper_max_fill_krw` 값의 **출처**. `true` = 단일가(시가·VI 단일가, bs 가 '1'/'2' 아님) 상한가 체결로 **바로 잠긴** 날의 그 단일가 체결 금액(수량 × 상한가), `false` = 기존 규칙(첫 잠김 전 한 주문 묶음 안 매수 주도 상한가 조각 합의 최대). 값을 고른 쪽(오늘 값 / 지난 잠김 날 기록)의 출처를 그대로 싣는다. 구 서버 프레임은 기본값 `false`.
- 같이 바뀐 `upper_max_fill_krw` 의미(7abcedde, 와이어 무변경): ① 단일가 호가(VI 발동 중·B6 세션ID 단일가)의 「매수1 == 상한가 ∧ 매도 없음」 으로는 첫 잠김 동결을 하지 않는다 — 11/2 한화(+3.7%)가 VI 단일가 B6 로 0 동결되던 결함 수정 ② 단일가 상한가 체결 뒤 상한가 아래 체결 없이 잠기면 그 단일가 금액이 후보가 된다(11/2 샘표 15,316주 ≈ 8.5억 · 샘표식품 22,295주 ≈ 6.1억 — 종전엔 0 「—」).
- gh-trade 클라 상따창 창구행 셋째 칸 문구가 바뀌었다: `true` → 「단일가 X.X억」, `false` → 「최대 X.X억」, 0 → 「최대 —」(색 규칙 그대로 — 오늘 검정 · 지난 기록 회색). 툴팁 기록 줄도 「단일가 M/d 기록」/「최대 M/d 기록」.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs
- server/docs/protocol.md

(push 뒤 생성해 판정기 기본 기준이 0건으로 잡혔다 — `radar-contract-check.sh 1083d20a 580445d8` 기준 위 2파일)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **relay 스키마 동기화 필요** — `RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh` (relay 생성물 SYNC MARKER 지금 b6d3f3ef). 동기화 전에도 구 relay 는 새 필드를 무시하므로 깨지지 않는다.
- relay `envelope.ts` 85 매핑에 `upperMaxFillAuction: lf.upperMaxFillAuction()` 추가(구 서버 = false).
- shared `limit-feature.ts` `maxFillCell` · 툴팁 기록 줄 — WinForms 와 같게 `upperMaxFillAuction ? "단일가" : "최대"` 를 앞말로(0 은 「최대 —」). 폰 밴드 narrow 도 같은 앞말이면 자연스럽다.
- DB 마이그레이션 불요(85 는 저장하지 않는 실시간 프레임, kind 15 슬롯 무변경).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 말미 append 라 구 relay·구 웹은 새 필드를 무시하고 「최대체결 X.X억」 그대로 보인다(단일가 값도 금액은 맞다). gh-trade 서버 배포는 사용자가 직접 한다(시점 미정, 장 마감 뒤 예상).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- gh-trade 서버 배포 뒤, 시가·VI 단일가로 바로 상한가에 잠긴 종목의 85 프레임이 `upper_max_fill_auction = true` · `upper_max_fill_krw` = 그 단일가 체결 수량 × 상한가.
- 장중 매수 묶음으로 긁어 잠긴 종목은 `false`. 웹 창구 셋째 칸이 각각 「단일가 X.X억」/「최대 X.X억」.
- 서버 `log/limit_fill.toml` 행에 `day_auction`·`record_auction` 이 생긴다(옛 파일은 키 없음 = false).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## gh-radar 처리 (261102 · gsd-fast)

- `4b2f8828` — 생성물 재동기화(마커 681fb854 · 대조 통과) · relay 85 매핑 `upperMaxFillAuction: lf.upperMaxFillAuction()`(구 서버 false) ·
  shared `RelayLimitFeatureMsg.upperMaxFillAuction?`(키 없음 = 구 relay · kind 15 다리 = false) · `maxFillCell` · 툴팁 기록 줄 앞말
  `maxFillLabel` = 「단일가」/「최대」, 0 은 출처 무관 「최대 —」. 셋째 칸은 문구 자체가 짧아져 폰 전용 `narrow` 를 없앴다(폰도 같은 문구).
- DB 무변경. 테스트: shared 856 · relay 1859 · webapp trading 1972 · e2e P28-2 통과.
