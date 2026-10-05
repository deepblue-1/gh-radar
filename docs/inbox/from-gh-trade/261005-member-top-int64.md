---
status: done
from: gh-trade
from_commit: f483d409
from_branch: master
date: 2026-10-05
fbs_sync_marker: 2404509b
done_commit: 303d3a9f
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-05

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

와이어·스키마 무변경. tickana `facts.member_top` 의 창구 가중을 float64 곱으로 고쳤다(f483d409) — `d_value × 겹친 길이(ns)` 가 int64 를 넘어 감기던 것(gh-radar Phase 28 세션 보고 그대로). 같은 함수를 쓰는 값이 모두 바뀐다: export `entries.entry_buy_member/share1~3`, `facts` 의 창구 문장(member_entry_buy·member_prebreak_sell), 119 보고서 C 지문표, research 지문.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 골든 스크립트의 `member_top_f64` 보정을 걷어 낸다(이제 원본과 같아야 한다).
- 119 export 9/29~10/2 는 수정 코드로 `--force` 재생성했다(2026-10-05 휴장일) — files_sig 가 바뀌니 워커가 네 날짜를 다시 적재하면 된다.
- relay 동기화·DB 마이그레이션·웹 변경 없음.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — stock-dma 무관, 119 분석기만 바뀌었고 이미 반영됐다(version f483d409).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

make-golden.py 를 보정 없이 돌려 stderr 의 「갈리는 창구」 가 0 줄인지, 재적재한 4일 entries 창구 비중이 워커 derive(float64)와 같은지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.

## gh-radar 답 — 2026-10-05

- 골든 보정을 걷어 냈다(`303d3a9f`). `make-golden.py` 를 gh-trade f483d409 함수 그대로 돌리면 갈리는 창구 0곳이고, `expected-derive.json` 은 한 바이트도 바뀌지 않았다. 워커 테스트 73 passed.
- 재적재는 아직이다. 운영 버킷에는 맥 로컬 사본(수정 전 export)으로 시드한 4일이 들어 있다. radar-gw 운반기가 119 의 재생성본을 가져오면 files_sig 가 바뀌어 워커가 네 날짜를 다시 적재한다. 운반기는 119 `radar-gw-pull` 키 등록(`261005-limitup-feature-85.md` 「radar-gw pull 공개키」 절) 뒤에 켠다.
- 재적재 뒤 entries 창구 비중과 워커 derive 대조를 확인하고 이 노트를 done 처리한다.
- **재적재 확인(2026-10-05 21:45 KST).** radar-gw 운반기가 119 재생성본을 올린 뒤 워커가 4일을 다시 적재했다(files_sig 변경 4/4). gh-trade f483d409 `fingerprint_agg` 를 119 재생성본에 돌린 값과 운영 `limitup_member_daily` 가 4일 모두 창구 0곳 차이(9·16·18·19곳 전부 일치). 운영 `limitup_entries` 창구 열 = 재생성본(99/99행). done.
