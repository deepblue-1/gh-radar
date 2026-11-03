---
status: done
from: gh-trade
from_commit: 4e9de34b
from_branch: master
date: 2026-11-04
fbs_sync_marker: e96aef6e
done_commit: eb224aa9
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-04 · 119 tick-indexer 재배포 2회 + 261104 질문 1 답(skipped_records)

## 바뀐 것

`.fbs` 와이어·relay 무변경. 바뀐 것은 119 `tick-indexer --query`(tickpull 강제 명령) 의 종료 코드·stderr JSON 이다. 요청 노트 `261104-tickgw-redeploy-review-fix.md`(tickgw `a6cc71e0` 교체 알림)는 읽고 `done` 처리했다.

119 가동본: `4e9de34b` (11/4 05:31 KST 설치, 장 전 · 기록기 무접촉 · drops 0). 그 직전 `4f474b1f`(04:59, Phase 46 코드 리뷰 11건 수정)를 거쳤다.

1. **stderr JSON 끝에 `skipped_records`(정수) 추가 — 질문 1 답: 예.** 질의 범위 안인데 응답에 싣지 못한 레코드 수다 — 파일표에 없는 file_id · 레코드 헤더/본문 읽기 실패 · UDP 페이로드 없음. 이해한 그대로 지금까지는 경고 로그만 남기고 세지 않았다. **0 보다 크면 그 응답은 완결이 아니다.** 압축(20:00 뒤 `.pcap.zst`)으로 빠진 파일은 여기 세지 않고 `compressed_files_skipped` 로만 센다. 기존 키 순서·꼴 무변경, 맨 끝에만 붙는다:
   `{"fmt":"pcapns-rec/1","records":1,…,"next_from_ns":"0","compressed_files_skipped":0,"skipped_records":0}` (119 실측)
2. **75 의 뜻이 넓어졌다(4f474b1f, 코드 리뷰 WR-02).** 기존 「동시 1 초과」 에 더해 「색인 준비 안 됨 — 다시」: 오늘 `files.tsv` 없음(serve 꺼짐·날짜 막 바뀜) · 읽기/파싱 실패 · serve 가 따라잡는 중(기동·재색인·날짜 전환 직후 — 보통 수 초, 처음부터 재색인이면 수십 분). 전엔 이 경우 0건 `exit 0` 으로 답해 불완전한 응답이 완결처럼 보였다. tickgw 의 「75 = 실패로 세지 않고 다시」 처리 그대로 맞는다.
3. **원본 파일 열기 실패 중 ENOENT 가 아닌 것(EACCES·EMFILE …)은 `exit 1`** — 전엔 `compressed_files_skipped` 로 셌다. ENOENT 만 압축됨으로 센다.
4. **질의 전체 시간 한도 60초** — stdout 이 막혀도 `.query.lock` 을 무기한 쥐지 않는다(넘으면 SIGALRM 으로 종료, 비정상 종료 코드).
5. 그 밖(색인 내부): 파일 순서 `-N` 재기동 파일 정렬·부분 쓰기 되돌림·라벨 거래소 폴백·fsync 체크포인트 — 응답 계약 무변경.

정본: gh-trade `server/tools/indexer/README.md` 「조회 계약」.

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

스키마 재동기화·relay·DB·웹 작업 없음.

- (선택) tickgw complete 판정에 `skipped_records > 0` 이면 승격하지 않음을 추가 — 필드가 없는 옛 응답은 0 으로 읽으면 된다.
- (확인만) `exit 1` 이 늘어나는지 — 원본 열기 일시 오류가 이제 1 로 나온다. 평소엔 0 이 정상.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 이미 배포했다(키 추가·종료 코드 확장뿐, 옛 tickgw 와도 호환).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

- tickgw 로그 `indexer` 줄의 JSON 에 `skipped_records` 가 보인다(평소 0).
- 119: `journalctl -u tick-indexer | grep '\[query\]'` 끝에 `skipped_records=` · `[stats]` 에 `역행=0`·`거래소폴백=0`.

## 질문

없음.
