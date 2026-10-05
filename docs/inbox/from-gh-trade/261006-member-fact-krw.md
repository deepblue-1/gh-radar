---
status: done
from: gh-trade
from_commit: d8e35018
from_branch: master
date: 2026-10-06
fbs_sync_marker: none
done_commit: f22e5fde
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-06

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어 무변경(fbs 무관). tickana `facts` 의 창구 문장 두 종류(`member_entry_buy` · `member_prebreak_sell`)의 `values` 에 키 4개를 **가산**했다(d8e35018):

| 키 | 단위 | 뜻 | 빈 자리 |
|---|---|---|---|
| `v1`·`v2`·`v3` | 원(정수) | 그 창구의 추정 금액 = Σ d_value × 겹친 길이 ÷ 구간 길이 (`s{k}` 와 같은 가중 — `s{k}` = v{k} ÷ vtot × 100) | `null` (창구가 셋보다 적을 때. `s{k}` 는 기존대로 `"—"`) |
| `vtot` | 원(정수) | 창 안 전체 추정 금액(비중 분모, 상위 3 밖 창구 포함) | 늘 정수(문장이 있으면 > 0) |

- 기존 키(`m1~m3` · `m1_code~` · `s1~s3`)와 `text` 템플릿은 **그대로**다. text 를 바꿀 계획 없음.
- 금액은 B9 분 단위 스윕 증분을 시간 비율로 나눈 **추정**이다(source 기존대로 minute).
- `entries.entry_buy_*` 는 무변경.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 웹: values 의 `v{k}`·`vtot` 를 읽어 「키움증권 90.1% · 약 3.2억」 처럼 붙인다. 키가 없는 옛 날짜는 비율만.
- DB·RPC·relay 변경 없음(values 는 jsonb 그대로).
- **119 반영 시점:** 119 tickana 는 이미 d8e35018(2026-10-06 08:1x KST 파일 교체). 오늘(10/6) 20:30 밤 배치부터 새 키가 export 에 실린다.
- **과거 날짜 재export:** 가능 — GCS 가 아니라 119 로컬 원본(보관 90일, 9/29~ 전부 있음)으로 `--force` 재실행하면 된다. 범위는 export 가 있는 9/29·9/30·10/1·10/2 4일. 장중에는 실거래 호스트 코어 0 을 쓰므로 **오늘 밤 20:30 배치 뒤** 돌린다(약 7분). 끝나면 files_sig 가 바뀌어 워커가 자동 재적재한다. GCS 원본은 119 보관 90일을 넘긴 날짜를 다시 만들 때만 필요하다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 키 가산이라 옛 웹은 새 키를 무시한다. stock-dma 무관.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

10/6 export(또는 재export 한 9/29~10/2)의 facts.ndjson.gz 에서 template_id member_entry_buy 행의 values 에 v1·vtot 가 있고, v1 ÷ vtot × 100 ≈ s1 (소수 첫째 자리 반올림 차이만).

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
