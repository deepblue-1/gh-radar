---
phase: 34-accum
plan: 11
status: complete
subsystem: ops
tags: [deploy, supabase, cloud-run, backfill, accum]

requires:
  - phase: 34-10
    provides: "전 워크스페이스 회귀 green · pgTAP 4파일 ok"
  - phase: 34-02
    provides: "scripts/export-accum-backfill.sh"
provides:
  - "원격 스키마 20261020200000 · 20261020200100 적용"
  - "limitup-sync Job 이미지 b35c0494"
  - "10/19 · 10/20 accum_flow 적재(files_sig) · 스모크 INV-9 db = manifest"
  - "server 리비전 gh-radar-server-00066-dp2"
affects: [34-12]

actuals:
  tasks: 3
  commits: 0
---

# 34-11 백엔드 배포 런북 SUMMARY

**원격 DB 스키마 · limitup-sync 워커 · server 가 Phase 34 코드로 올라갔고, 소급한 10/19 · 10/20 의 매집감지 행(37 · 48)이 프로덕션 표에 실렸다. webapp push 는 34-12 몫이라 하지 않았다.**

전 단계를 메인 세션이 실행했다(executor 배포 금지 규칙). 모든 단계는 23:43~23:55 KST 로, 장 시간 08:00~20:00 과 20:20~20:50 창 밖이다.

## Task 1 — 스키마 적용

- pgTAP 상태: **ok** — 34-10 회귀에서 limitup_load 271/271 · accum_report 52/52 · teamflow_report 28/28 · limitup_report 54/54. 「미실행」 승인 질문은 필요 없었다.
- 0b 사이클 배지 기준 — 사용자 답 원문: **「지금대로(사이클 번호) (Recommended)」**. 목록 배지는 평평한 열 `cycle` 그대로다.
- 사전 점검: master · 미커밋 `supabase/` 없음 · Phase 시작 뒤 다른 세션 커밋 없음 · Remote 에 더 늦은 버전 없음.
- `supabase db push --linked --yes` (23:43) → migration list:

```
   20261020200000 | 20261020200000 | 2026-10-20 20:00:00
   20261020200100 | 20261020200100 | 2026-10-20 20:01:00
```

- db push 와 워커 재배포 사이 20:30: 해당 없음.

## Task 2 — 워커 재배포 · 소급 · 핸드오프

| 항목 | 값 |
|---|---|
| Job 기존 이미지 | `limitup-sync:df038c32` · `LIMITUP_SKIP_DATES` 없음 |
| Job 새 이미지 | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/limitup-sync:b35c0494` (23:43 KST) |
| CRON | `30 20 * * 1-5` Asia/Seoul 그대로 |
| 소급 20261019 | `/Users/alex/ticks/accum-backfill/20261019.jsonl` · 미리보기 2884 = 행 2884 · isin 37 · since 결측 0 · reg 결측 0 |
| 소급 20261020 | `/Users/alex/ticks/accum-backfill/20261020.jsonl` · 미리보기 3353 = 행 3353 · isin 48 · since 결측 0 · reg 결측 0 |
| 핸드오프 노트 | `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/261020-accum-backfill-1019-1020.md` |
| SendMessage | gh-trade-f4 |

gh-trade 회신(노트 status done · done_commit 9c063eef):
- 20261019 `stage=accum_flow reason=backfill dir=/home/smok95/ticks/export/20261019 isins=37` · bad 0 · manifest accum_flow 37
- 20261020 `stage=accum_flow reason=backfill dir=/home/smok95/ticks/export/20261020 isins=48` · bad 0 · manifest accum_flow 48
- 첫 밤 배치 finished_at 20:13:16 — D-09 10분 미루기는 불필요하다(gh-trade 판단).

## Task 3 — 운반 · 적재 · 스모크 · server

- dry-run: 받을 날짜 `20261019 20261020`.
- 운반(transient 유닛, 23:48): `[limitup-pull] dates=14 latest=20261020 rsync=ok upload=ok` · `Finished with result: success`.
- 버킷: `export/20261019/accum_flow.ndjson.gz` · `export/20261020/accum_flow.ndjson.gz` 존재.
- Job 실행 `gh-radar-limitup-sync-s7kxq` 완료. 날짜별 결과는 다음과 같다.
  - 20261019 = `files_sig` (accum_flow 37)
  - 20261020 = `files_sig` (accum_flow 48)
  - 나머지 12개 날짜 = unchanged
- 스모크:

| 날짜 | 결과 | INV-9 |
|---|---|---|
| 20261019 | PASS 14 · FAIL 0 | `limitup_accum_flow db=37 manifest=37` |
| 20261020 | PASS 14 · FAIL 0 | `limitup_accum_flow db=48 manifest=48` |

- server: 라이브 `CORS_ALLOWED_ORIGINS` · `RELAY_INTERNAL_URL` 을 그대로 넘겨 `deploy-server.sh` → 리비전 `gh-radar-server-00066-dp2`(이전 00065-4ct), 배포 스모크 PASS 15 · FAIL 0.
- 무인증 401 확인: 아래 「401 확인」 절.

## 401 확인

무인증 GET 은 23:54:40 에 두 경로 모두 429(스모크 rate limit 창)였고, 23:55:10 에 401 로 바뀌었다. 404 가 아니므로 두 라우트가 있다.

| 경로 | 23:55:10 KST |
|---|---|
| `/api/accum/report` | 401 |
| `/api/accum/report/20261019/KR7000650002` | 401 |

## Deviations

- 첫 로그 질의(`--format value`)에서 20261020 줄이 빠져 보였다. 실행 이름으로 다시 조회하니 `limitup day committed 20261020 files_sig` 가 있었다. 로그 수집 지연이었고 동작 문제는 아니다.
- 배포 직후 401 확인이 server 스모크의 rate limit 창(INV-8) 때문에 429 로 나왔다. 플랜이 예상한 경우라 창이 풀린 뒤 다시 확인했다.

## Next

34-12 — webapp push(프로덕션 배포)와 라이브 UAT, 인박스 노트 `261020-accum-flow-export.md` 닫기.
