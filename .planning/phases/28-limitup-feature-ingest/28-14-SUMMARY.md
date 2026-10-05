---
phase: 28-limitup-feature-ingest
plan: 14
subsystem: 배포 · Supabase · GCS · Cloud Run Job · radar-gw
tags: [deploy, gate, supabase-db-push, pgtap, gcs, iam, cloud-run-job, scheduler, radar-gw, limitup-pull, rollback]
status: complete

requires:
  - phase: 28-01
    provides: "85 LimitFeature 중계 트레이서 · 카드 탭 「상한가」"
  - phase: 28-02
    provides: "마이그레이션 20261006090000 — kind 15 가시성 · jsonb 래퍼 · purge RPC · server ?lf=1"
  - phase: 28-03
    provides: "마이그레이션 20261006090100 · 20261006090200 — limitup 표 10 · 날짜 원자 commit RPC · 워커 핵심 경로"
  - phase: 28-04
    provides: "infra/relay/limitup-pull — 운반 스크립트 · 유닛 · 설치기(키 radar-gw-pull · 타이머 disabled)"
  - phase: 28-06
    provides: "마이그레이션 20261006090300 — limitup_purge_old · 버킷 limitup-grid · 파생 2표 · 격자 업로드"
  - phase: 28-08
    provides: "scripts/setup-limitup-sync-iam.sh · deploy-limitup-sync.sh · smoke-limitup-sync.sh · Dockerfile"
  - phase: 28-10
    provides: "마이그레이션 20261006090400 — limitup_report_for_user · limitup_grid_isins_for_user"
  - phase: 28-16
    provides: "적재 규칙 — 바뀐 날짜만 · skip 기록 · 3연속 skip 알림"
provides:
  - "배포 준비 게이트 green @ 5c78dab3 — typecheck 5종 · 단위 shared 376 · relay 1007 · webapp 3501(1 skipped) · server 308 · limitup-sync 71 · pgTAP 4파일 PASS · e2e 6 spec 130 passed · 워커 dry-run 4일 합계 = 인박스 · 이미지 amd64 빌드 + 컨테이너 dry-run"
  - "원격 DB 마이그레이션 5개 적용(20261006090000~090400) · RPC smoke a~e 통과"
  - "GCS gs://gh-radar-limitup-export · 워커 SA · Job gh-radar-limitup-sync(이미지 d4a044dd) · Scheduler 21:20 평일 · 알림 gh-radar-limitup-sync-failure · 4일 시드 적재 smoke PASS 12 ×4"
  - "radar-gw 운반기 설치(타이머 disabled) · 키 지문 SHA256:qLovMlHsTyP2f3sR7MqbrkTi41Bhkc02uD0iELuqGak · 119 지문 SHA256:7s4iOpsEMcJkjLHD9KpGv7TIDXxJj2ip5Na+hU4aiJY"
  - "Task 2 명령(마이그레이션 5개 · push · RPC smoke a~e) · Task 3 명령(IAM → 배포 → 시드 → smoke 날짜별 기대 숫자 → radar-gw 복사 · 설치 · 공개키) · 되돌리기(수동 DROP 순서)"
affects: [28-15, 28-verification]

# Actuals (#2632 · #3968) — commits 는 측정값(rev-list plan_head_before..HEAD, 이 초안 docs 커밋 전).
# 준비 게이트는 코드 변경 없음 — docs 전용이라 0 이 정상. tokens = 이 SUMMARY chars/4.
actuals:
  tokens: 6200
  tasks: 3
  commits: 1   # Task 3 직전 메인 세션 fix(28-16) d4a044dd — 연속 skip 수 리셋(사용자 「다 반영」)
plan_head_before: 5c78dab3d5ccd2e3ab26f45cea257990b2b92b10

tech-stack:
  added: []
  patterns:
    - "준비 게이트에서 워커 이미지를 로컬 amd64 로 빌드하고 실 export 를 ro 마운트해 컨테이너 안 dry-run 까지 확인(배포 전 이미지 = 배포 이미지 동형)"

key-files:
  created:
    - .planning/phases/28-limitup-feature-ingest/28-14-SUMMARY.md
  modified: []

key-decisions:
  - "smoke 기대치 정정 — 4 날짜(20260929~20261002)는 모두 KST 오늘(10-05/06) − 30일 안이므로 member_alloc 도 INV-4 대조 대상이다(SKIP · 0 이 아니라 manifest 행 수와 같아야 한다). 플랜 Task 3 의 「보존 창 밖이면 0 이 정상」은 이번 시드에는 해당 없음"
  - "smoke 를 날짜마다 돌리면 INV-1 이 Job 을 매번 실행한다 — 두 번째부터는 files_sig 불변이라 unchanged skip(멱등) · 무해. 시간이 아까우면 첫 1회만 smoke 전체, 나머지 세 날짜는 같은 스크립트를 그대로 돌려도 된다"
  - "밀릴 67건에 Phase 27 코드 리뷰 수정(fix(27) WR-01~05 · IN-01~06, relay · webapp · shared 코드)이 섞여 있다 — 이 플랜은 push · relay 배포를 하지 않으므로 무관하지만, 28-15(relay → server → webapp push)가 Phase 27 수정도 함께 배포하게 된다"

requirements-completed: []

coverage:
  - id: D1
    description: "배포 준비 게이트 — typecheck · 단위 5 패키지 · pgTAP 4파일 · e2e 6 spec · 워커 dry-run · 이미지 빌드 green @ 5c78dab3"
    verification:
      - kind: unit
        ref: "shared 376 · relay 1007 · webapp 3501(1 skipped) · server 308 · limitup-sync 71"
        status: pass
      - kind: other
        ref: "pgTAP dma_strategy_limit_feature · dma_strategy_read · limitup_load · limitup_report → # RESULT: PASS ×4"
        status: pass
      - kind: e2e
        ref: "playwright 6 spec → 130 passed · 0 failed · 0 flaky (5.6m)"
        status: pass
      - kind: other
        ref: "limitup-sync --dry-run (호스트 + 컨테이너) totals entries 99 · locks 39 · jumps 40626 · member_alloc 253247 · facts 542 · touches 216 · grid_summary 99"
        status: pass
    human_judgment: false
  - id: D2
    description: "Task 2 [BLOCKING] supabase db push(마이그레이션 5개) + RPC smoke a~e"
    verification:
      - kind: manual
        ref: "메인 세션 2026-10-05 20:52 KST — supabase db push 5파일 적용 · smoke a [] · b {access:false} · c anon 401 42501 · d public:false · e limitup_ 표 10"
        status: pass
    human_judgment: true
    rationale: "원격 DB 쓰기 · Secret 읽기는 메인 세션이 사용자 확인 뒤 한다(서브에이전트 배포 분류기 차단)"
  - id: D3
    description: "Task 3 GCS · IAM · 워커 배포 · 시드 smoke(행 수 == manifest) · radar-gw 설치(타이머 disabled) · 공개키"
    verification:
      - kind: manual
        ref: "메인 세션 2026-10-05 20:53~21:05 KST — IAM · 배포 · 시드 · smoke 4날짜 PASS 12/FAIL 0 · radar-gw 설치 · 타이머 disabled"
        status: pass
    human_judgment: true

duration: 9min
completed: 2026-10-05
---

# Phase 28 Plan 14: 배포 ① — 준비 게이트 · DB push · GCS/IAM/워커 · radar-gw 설치 Summary

**HEAD `5c78dab3` 기준으로 typecheck 5종, 단위 테스트 5개 패키지(shared 376 · relay 1007 · webapp 3501 · server 308 · limitup-sync 71), pgTAP 4파일, e2e 6 spec(130 passed), 워커 dry-run(4일 합계가 인박스 숫자와 같음), 워커 이미지 amd64 빌드와 컨테이너 안 dry-run 이 모두 통과했다. 배포는 하지 않았다. 아래 Task 2·3 명령은 메인 세션이 사용자 확인 뒤 그대로 쓰도록 실제 값으로 적었다.**

## Performance

- **Duration:** 9 min (Task 1 게이트)
- **Started:** 2026-10-05T11:33:37Z (20:33 KST)
- **Task 1 completed:** 2026-10-05T11:42Z (20:42 KST)
- **Tasks:** 3 / 3 (Task 2 · 3 은 메인 세션이 사용자 승인 「니가 다 반영하고 배포해」 뒤 실행)
- **Files modified:** 1 (이 SUMMARY)

## Task 1 — 배포 준비 게이트 (배포하지 않음)

기준 커밋 **`5c78dab3`**(HEAD — 게이트 도중 바뀌지 않았다).

### ① verify 4개

| 게이트 | 결과 |
|---|---|
| `shared build` · `relay typecheck` · `relay typecheck:tests` · `webapp typecheck` · `server typecheck` · `limitup-sync typecheck` | exit 0 · `error TS` 0 |
| shared `vitest run` | **16 files / 376 passed** |
| relay `test` | **36 files / 1007 passed** |
| webapp `test` | **149 files / 3501 passed · 1 skipped** |
| server `vitest run` | **34 files / 308 passed** |
| limitup-sync `vitest run` | **7 files / 71 passed** |
| verify ① 체인 전체 | **exit 0** · vitest 요약 줄 failed 0(로그의 "failed" 문자열은 테스트가 일부러 만든 상태 전이 · fetch 실패 로그) |
| pgTAP `dma_strategy_limit_feature` · `dma_strategy_read` · `limitup_load` · `limitup_report`(일회용 Postgres 재생) | **`# RESULT: PASS` ×4** · exit 0 (24 · 28 · 145 · 50 단언) |
| e2e 6 spec(`trading-workbench` · `order-log` · `sidebar-tree` · `limitup-report` · `me` · `a11y`) | **130 passed · 0 failed · 0 flaky · exit 0** (5.6m) — 첫 실행에 webServer 타임아웃 없음 |
| 워커 dry-run(`LIMITUP_EXPORT_DIR=~/ticks/research/export LIMITUP_KEEP_DAYS=3650`) | exit 0 · `limitup-sync complete` · totals `entries 99 · locks 39 · jumps 40626 · member_alloc 253247 · facts 542 · touches 216 · grid_summary 99 · member_daily 64` · grids 99 · skipped 0 |

추가 확인(28-08 이후 이미지 회귀가 없는지 보려고 같은 조건으로 다시 돌림):
- `docker build --platform=linux/amd64 --build-arg GIT_SHA=5c78dab3 -f workers/limitup-sync/Dockerfile .` → exit 0. `require('./dist/index.js')` exit 0. 실행 사용자 `uid=100(app)`(비root).
- 컨테이너 안 dry-run(`-v ~/ticks/research/export:/mnt/export/export:ro` · `LIMITUP_EXPORT_DIR=/mnt/export/export`, Cloud Run 볼륨 경로와 같음) → 위 totals 와 같음 · `limitup-sync complete`. 로컬 태그 `gh-radar-limitup-sync:gate-5c78dab3` 는 확인 뒤 지웠다(push 없음).

날짜별 manifest 행 수(= 워커 dry-run `rows`, 로컬 `~/ticks/research/export/<D>/manifest.json`):

| 날짜 | entries | locks | jumps | member_alloc | facts | touches | 격자(grid/) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 20260929 | 20 | 12 | 1,135 | 49,847 | 128 | 108 | 20 |
| 20260930 | 23 | 10 | 18,576 | 79,220 | 134 | 45 | 23 |
| 20261001 | 27 | 5 | 11,684 | 61,971 | 111 | 32 | 27 |
| 20261002 | 29 | 12 | 9,231 | 62,209 | 169 | 31 | 29 |
| **합** | **99** | **39** | **40,626** | **253,247** | **542** | **216** | **99** |

### ② 작업 트리 · 밀릴 커밋

- `git status --porcelain --untracked-files=no` → **0줄**. 미추적 파일은 다른 세션 것이다(`.planning/milestone.lock` · `*/shots/` 3개 · `.planning/research/.cache/`). 건드리지 않았다.
- `git rev-list --left-right --count origin/master...HEAD` → **`0	67`**(이 SUMMARY 커밋 전. 커밋 뒤에는 `0 68`). origin/master 팁은 `78486f1b`(docs(28): Phase 28 플래닝).
- 작성자 67건 전부 `deepblue-1`. 구성: **Phase 28 커밋 49건**(28-01~28-13 · 28-16), **Phase 27 마감 · 코드 리뷰 수정 18건**(27-09 docs 2 · inbox 1 · 검증/UAT docs 3 · fix(27) WR-01~05 · IN-01~06 11 · 리뷰 보고서 docs 2 · lessons 1). Phase 27 fix 에는 relay · webapp · shared 코드가 있다. **이 플랜은 push 하지 않으므로 상관없다.** 다만 28-15 의 relay 배포와 `git push` 가 이 수정들을 함께 내보낸다.
- 변경 파일 181개(`webapp/` 68 · `workers/` 34 · `.planning/` 23 · `relay/` 14 · `packages/` 13 · `server/` 9 · `supabase/` 8 · `infra/` 4 · `scripts/` 3 · `docs/` 2 · `ops/` 1 · `pnpm-lock.yaml` · `tasks/`). `supabase/` 변경은 이 phase 의 마이그레이션 5개와 pgTAP 3개뿐이다(`git diff --name-status origin/master..HEAD -- supabase/`).

```
5c78dab3 deepblue-1 docs(28-13): 보고서 ② 플랜 완료 — SUMMARY · 상태 · 로드맵(14/16)
5276fafc deepblue-1 test(28-13): e2e P28-R1 상한가 보고서 한 장
2d90eefd deepblue-1 feat(28-13): 사건 카드 · 창구 지문표 · 어제 결과 — 레인 HTML 오버레이 · 중립색
4950e4e5 deepblue-1 feat(28-13): 레인 · 표 계산 lib · 격자 로더(서명 URL · gzip 해제 · 캐시)
7742e6bf deepblue-1 docs(28-12): 보고서 ① 플랜 완료 — SUMMARY · 상태 · 로드맵(13/16)
a4babce6 deepblue-1 feat(28-12): 사이드바 「분석 › 상한가 보고서」 · DmaGate surface
3ef049b1 deepblue-1 feat(28-12): /analytics/limitup — 머리 · 날짜 탐색 · KPI · 하루 격자 · 빈/에러/게이트
d2f94fdb deepblue-1 feat(28-12): 보고서 계산 lib — KPI(gh-trade 정의) · 결과 태그 · 행 순서 · 날짜 탐색
03ddba0b deepblue-1 docs(28-11): 주문로그 상한가 특징 체크 플랜 완료 — SUMMARY · 상태 · 로드맵(12/16)
9ecb3362 deepblue-1 test(28-11): e2e P28-O1 주문로그 상한가 특징 체크
4c865a34 deepblue-1 feat(28-11): 「상한가 특징」 체크 칩 — 세 표면 · 빈 문구 · 카드 팝업 · 배지
22bfd866 deepblue-1 feat(28-11): kind 15 별도 스토어 · lf=1 조회 · 피드 체크 상태 · 시세 = kind
0bf74445 deepblue-1 docs(28-10): 보고서 API 플랜 완료 — SUMMARY · 상태 · 로드맵(11/16)
669423cb deepblue-1 feat(28-10): /api/limitup report · grid-urls — requireAuth · DMA 게이트 403 · 서명 URL 1회
9fa5af52 deepblue-1 feat(28-10): 보고서 RPC — 게이트 · 날짜 목록 · 하루 묶음 · 마커 상위 40 · 90일 지문 (jsonb 1회)
d0c17ebe deepblue-1 docs(28-09): kind 15 한 줄 문장 플랜 완료 — SUMMARY · 상태 · 로드맵(10/16)
530451f3 deepblue-1 feat(28-09): 조립기 kind 15 · tone feature · lead — F-A · 카드 팝업 렌더
f0cfbcc0 deepblue-1 feat(28-09): kind 15 되돌림 · message 파서 · 문장 조각 (UI-SPEC ②-2 골든)
1eaaa04b deepblue-1 docs(28-08): limitup-sync 운영 한 벌 플랜 완료 — SUMMARY · 상태 · 로드맵(9/16)
c0ed3afb deepblue-1 feat(28-08): limitup-sync IAM · 버킷(relay objectUser) · smoke(행 수 == manifest)
5dbe3df4 deepblue-1 feat(28-08): limitup-sync 이미지 · 배포 스크립트(GCS 볼륨 · 21:20 평일) · 실패 알림 정책
94c08e29 deepblue-1 docs(28-07): 카드 탭 「상한가」 9칸 완성 플랜 완료 — SUMMARY · 상태 · 로드맵(8/16)
2cf77c2d deepblue-1 feat(28-07): 카드 탭 「상한가」 표 완성 — 폰 축약 · 툴팁 · 접속 끊김 · e2e P28-2
c4c06a41 deepblue-1 feat(28-07): 9칸 완성 — 10초 · 창구 행 · 짝수 반올림 · 만 단위 · 툴팁 (WinForms 동형)
7dc6412a deepblue-1 feat(28-07): 회원사 표 — gh-trade MemberCodes 이식 · memberName
256a87c8 deepblue-1 docs(lessons): 원문으로 풀리는 갈림은 직접 정한다 — IN-04 WinForms 대조 누락
4f0d1c86 deepblue-1 fix(27): IN-04 재판정 — 자동 LED 툴팁을 WinForms ledAutoSell 동형으로 복원(기준가격 > 0 이면 꼬리 · 기준 0 은 상한가), 낱말만 shared autoSellBasisLabel
39859561 deepblue-1 docs(28-06): 파생 2표 · 격자 업로드 · 보존 정리 플랜 완료 — SUMMARY · 상태 · 로드맵(7/16)
4407912a deepblue-1 feat(28-06): 격자 업로드 · 파생 stage · 90/30일 정리 · kind 15 30일 purge
5221f7c9 deepblue-1 feat(28-06): 파생 2표 계산 — 스파크 · 최대 잔량 · +60초 매도 · 창구 기여분 (gh-trade 골든)
a33218d3 deepblue-1 docs(28-16): 적재 규칙 플랜 완료 — SUMMARY · 상태 · 로드맵(6/16)
f7f766ce deepblue-1 feat(28-16): 적재 규칙 — 바뀐 날짜만 · schema/sha/manifest skip 기록 · 3연속 skip 알림 종료
4d141470 deepblue-1 docs(27): 코드 리뷰 2차 수정 보고서 — Info 6/6 수정(IN-01~06) · IN-01 은 relay 배포 후 효과
a652152b deepblue-1 fix(27): IN-06 lc.set 자동매도 범위를 shared LC_AUTO_SELL_RANGES 한 벌로 — relay zod · superRefine · 웹 lc 행이 같이 읽는다
44d2c28e deepblue-1 fix(27): IN-05 계층 역전 해소 — lc 범위 표를 lib/lc-ranges 로, 카드 공용 상수를 card/constants 로 이동
6d54e068 deepblue-1 fix(27): IN-04 자동 LED 툴팁 기준 꼬리를 카드 「기준」 행과 같은 함수(lcAutoSellBasisText)로
2d21c033 deepblue-1 fix(27): IN-03 /me 54 거부 귀속의 다른 탭 한계를 주석으로 명시
22312908 deepblue-1 fix(27): IN-02 /me 42 조립 시 11칸 전부 범위 검사 — 캐시의 다른 칸이 범위 밖이면 보내지 않고 그 행을 실패로
cf6323ed deepblue-1 fix(27): IN-01 relay 거부에 출처 태그(kind=거부된 인바운드 t) — 41 대기는 autosell.cmd 태그만 답으로 받는다
31edcbc5 deepblue-1 docs(28-05): 85 스냅샷 · 얼린 값 방지 플랜 완료 — SUMMARY · 상태 · 로드맵(5/16)
a8e30281 deepblue-1 feat(28-05): 웹 85 얼린 값 방지 — full 소비자 0 드롭 · e2e P28-1b
33e4b408 deepblue-1 feat(28-05): relay 85 스냅샷 — FULL 구독 · 승격 직후 q → tape → 85
1f66340d deepblue-1 docs(28-04): radar-gw 운반기 플랜 완료 — SUMMARY · 상태 · 로드맵(4/16)
b7b4f9c8 deepblue-1 feat(28-04): radar-gw 운반기 설치기 · 운영 문서 — 키 radar-gw-pull · 타이머 등록 전 disabled
b1a3fa1b deepblue-1 feat(28-04): radar-gw 상한가 export 운반 스크립트 · 유닛 — 평일 21:00 KST rsync → GCS 2단
a4955b1e deepblue-1 docs(27): 코드 리뷰 수정 보고서 — Warning 5/5 수정(WR-01~05) · Info 6 범위 밖
a901b8c5 deepblue-1 fix(27): WR-05 /me 행 실패에 시도 값을 함께 저장 — 늦은 84 가 그 값을 실으면 실패를 거둔다
5d51b609 deepblue-1 fix(27): WR-04 카드 54 표시에 종목·계좌 축 추가 — 남의 41 거부·자동매도 사유 줄이 모든 카드에 서지 않게
5fd3b29a deepblue-1 fix(27): WR-03 41 무응답 「미반영」을 아무 에코로 지우지 않게 · 무응답 로그 1줄
1b08002a deepblue-1 fix(27): WR-02 41 해제를 키별 server 로도 판정 — 단일 슬롯 에코가 남의 키에 가려져도 풀리게
def26175 deepblue-1 fix(27): WR-01 41 대기를 lc.set 응답 채널에서 분리 — 거부·무응답이 다른 그룹 lc.set 판정을 오염시키지 않게
a854ae2d deepblue-1 docs(28-03): 밤 적재 트레이서 플랜 완료 — SUMMARY · 상태 · 로드맵(3/16)
5ea22b16 deepblue-1 feat(28-03): 밤 적재 트레이서 — limitup 표 10 · 날짜 원자 commit RPC · 워커 핵심 경로 · 픽스처
d33c8bc0 deepblue-1 docs(28-02): kind 15 가시성 플랜 완료 — SUMMARY · 상태 · 로드맵(2/16)
52da41a5 deepblue-1 feat(28-02): 시세 kind 집합 15 · 「상한가특징」 라벨 · relay 라이브 푸시 전원 가시
ae1fe66c deepblue-1 feat(28-02): kind 15 시세 가시성 · jsonb 래퍼(기본 제외) · purge RPC · server ?lf=1
4e77d2e6 deepblue-1 test(27): 사람 검증 항목 UAT 저장 — 운영 화면 확인 · 10-06 첫 거래일 관찰 4건
66699be3 deepblue-1 docs(27): 검증 보고서 — 목표 ①~⑤ 배포본 78486f1b 기준 확인 · 12/12 · human_needed(운영 화면 · 첫 거래일 관찰 5건) · 리뷰 Warning 5건은 비차단
0a6f7725 deepblue-1 docs(28-01): 85 상한가 특징 트레이서 플랜 완료 — SUMMARY · 상태 · 로드맵(1/16)
8a1b6c11 deepblue-1 test(28-01): 주문로그 e2e 카드 탭 단언을 4개로 — 「상한가」 탭 추가 반영
3048cc54 deepblue-1 docs(27): 코드 리뷰 보고서 — Critical 0 · Warning 5(41 대기가 lc.set 응답 채널 공유 · 54 자동매도 줄 isin 미필터 · /me 42 늦은 84) · Info 6
1e85f4f6 deepblue-1 test(28-01): e2e P28-1 상한가 특징 한 경로
7e9fdbe0 deepblue-1 feat(28-01): 카드 탭 「상한가」 — 85 스토어 · level 게이트 · 지금 행 · 탭 제목 상태
9c700f44 deepblue-1 docs(27-09): 로드맵 진행 갱신 — 27-09 완료(9/9)
e4edc7e7 deepblue-1 docs(27-09): 배포 · 인박스 마감 SUMMARY — relay 78486f1b · smoke FAIL 0 · push 465e7372..78486f1b · Vercel Ready · 인박스 done 2cdefdc9
2cdefdc9 deepblue-1 docs(inbox): 261004-auto-sell-wire done_commit 78486f1b
86cc9148 deepblue-1 feat(28-01): 85 LimitFeature 중계 트레이서 — INBOUND 승격 · parseLimitFeature · hub 키 캐시 · FULL 소켓 팬아웃
```

### ③ Task 2 명령 — [BLOCKING] `supabase db push` → RPC smoke (메인 세션 · 사용자 확인 뒤)

적용할 마이그레이션 5개(`supabase/migrations/`, 순서대로):

| 파일 | 만드는 것 |
|---|---|
| `20261006090000_dma_strategy_events_limit_feature.sql` | `dma_strategy_events_for_user(uuid,date)` 재정의(시세 kind 집합 1·2·10·15) · `dma_strategy_events_for_user_json(uuid,date,boolean DEFAULT false)` · `dma_strategy_events_purge_limit_feature(integer)` · 부분 인덱스 `idx_dma_strategy_events_limit_feature_day` |
| `20261006090100_limitup_tables.sql` | 표 10: `limitup_entries` · `_locks` · `_jumps` · `_member_alloc` · `_facts` · `_touches` · `_stage` · `_loads` · `_grid_summary` · `_member_daily`. 모두 RLS 켜짐 · 정책 0 · anon/authenticated REVOKE |
| `20261006090200_limitup_load_rpcs.sql` | `limitup_stage_clear(text)` · `limitup_commit_day(text,text,text,integer,jsonb)` · `limitup_record_skip(text,text)` |
| `20261006090300_limitup_retention_storage.sql` | `limitup_purge_old(integer,integer)` · Storage 버킷 `limitup-grid`(비공개 · 10MB · application/gzip · `ON CONFLICT DO NOTHING`, 정책 0) |
| `20261006090400_limitup_report_rpcs.sql` | `limitup_report_for_user(uuid,text DEFAULT NULL)` · `limitup_grid_isins_for_user(uuid,text)` |

RPC 는 9개다(새로 만드는 것 8 + 다시 정의하는 것 1). 9개 모두 service_role 만 EXECUTE 할 수 있다.

```bash
# 1. 남의 미커밋 · 로컬 커밋 확인 (ahead 68 = 이 초안 포함. 더 늘었으면 git show --stat 으로 마이그레이션 추가 여부 확인)
cd /Users/alex/repos/gh-radar && git status -sb

# 2. 원격 미적용 = 정확히 이 다섯이어야 한다 (Local 만 있고 Remote 가 빈 줄 5개). 다르면 멈춤
supabase migration list --linked
#   기대: 20261006090000 · 20261006090100 · 20261006090200 · 20261006090300 · 20261006090400 만 Remote 칸 공백

# 3. 적용 (비TTY 면 SUPABASE_ACCESS_TOKEN 먼저 — 값 출력 금지)
supabase db push --linked
#   출력에서 "Applying migration 20261006090000_…" ~ "…090400_limitup_report_rpcs.sql" 5줄 확인

# 4. RPC smoke — 키는 변수에만(echo 금지), SUPABASE_URL 은 라이브 server Cloud Run env 값
#    (읽기: gcloud run services describe gh-radar-server --region asia-northeast3 --format=json | jq -r '.spec.template.spec.containers[0].env[] | select(.name=="SUPABASE_URL") | .value')
SUPABASE_URL='<라이브 server env 값 — 메인 세션이 채움>'
SR="$(gcloud secrets versions access latest --secret=gh-radar-supabase-service-role)"
Z=00000000-0000-0000-0000-000000000000
#  a. kind 15 래퍼 → []
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/dma_strategy_events_for_user_json" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
  -H 'Content-Type: application/json' -d "{\"p_user_id\":\"$Z\",\"p_trade_date\":\"2026-10-06\"}"
#  b. 보고서 게이트 → {"access": false}
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/limitup_report_for_user" -H "apikey: $SR" -H "Authorization: Bearer $SR" \
  -H 'Content-Type: application/json' -d "{\"p_user_id\":\"$Z\"}"
#  c. anon 키로 (a) → 401/403 또는 "permission denied for function" (EXECUTE 잠금)
ANON='<webapp NEXT_PUBLIC_SUPABASE_ANON_KEY — 공개 키>'
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/rest/v1/rpc/dma_strategy_events_for_user_json" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' -d "{\"p_user_id\":\"$Z\",\"p_trade_date\":\"2026-10-06\"}"
#  d. 버킷 비공개 → "public":false
curl -s "$SUPABASE_URL/storage/v1/bucket/limitup-grid" -H "apikey: $SR" -H "Authorization: Bearer $SR"
#  e. 표 10개
supabase inspect db table-stats --linked | grep limitup_
unset SR
```

5. a~e 중 하나라도 기대와 다르면 멈추고 보고한다. 되돌릴지는 사용자가 정한다(아래 「되돌리기」).

### ④ Task 3 명령 — GCS · IAM → 워커 → 시드 → smoke → radar-gw (Task 2 통과 뒤 · 순서 고정 · 앞 단계가 실패하면 멈춤)

```bash
cd /Users/alex/repos/gh-radar
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar
gcloud config configurations activate gh-radar   # 스크립트 가드: 활성 config = gh-radar · project = gh-radar

# 1. 버킷(없을 때만) · 워커 SA gh-radar-limitup-sync-sa · Secret accessor(gh-radar-supabase-service-role) · 버킷 IAM
#    (워커 SA objectViewer · gh-radar-relay-sa objectUser). 선행 SA gh-radar-scheduler-sa · gh-radar-relay-sa 가 있어야 한다
GCP_PROJECT_ID=gh-radar bash scripts/setup-limitup-sync-iam.sh
#    기대 끝줄: ✅ setup-limitup-sync-iam.sh complete

# 2. 이미지 빌드/푸시(태그 = git rev-parse --short HEAD) · Job gh-radar-limitup-sync(1Gi · 1800s · gen2 · gs 볼륨 ro → /mnt/export)
#    · Scheduler gh-radar-limitup-sync-nightly('20 21 * * 1-5' Asia/Seoul) · 알림 gh-radar-limitup-sync-failure(ops/alert-limitup-sync-failure.yaml)
GCP_PROJECT_ID=gh-radar SUPABASE_URL='<라이브 server env 값>' NOTIFICATION_CHANNEL_ID='<채널 — 메인 세션이 채움>' \
  bash scripts/deploy-limitup-sync.sh
#    기대: ✅ Deployed @ asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/limitup-sync:<sha> · Alert: ✓ Alert policy ready
#    NOTIFICATION_CHANNEL_ID 가 없으면 Section 7(알림)만 실패한다 — Job · Scheduler 는 이미 반영된 상태

# 3. 시드 — 버킷 export/ 가 비어 있을 때만 (맥 로컬 4일)
gcloud storage ls gs://gh-radar-limitup-export/export/ 2>/dev/null | head
gcloud storage rsync ~/ticks/research/export gs://gh-radar-limitup-export/export --recursive --checksums-only
#    기대: gs://gh-radar-limitup-export/export/{20260929,20260930,20261001,20261002}/ 각 manifest.json + 6 ndjson.gz + grid/

# 4. smoke — 첫 실행이 Job 을 돌려 4일을 한꺼번에 적재한다. 같은 명령을 날짜만 바꿔 네 번 돌린다
#    (두 번째부터 INV-1 이 Job 을 다시 돌리지만 files_sig 가 같아 unchanged skip — 멱등)
for D in 20261002 20261001 20260930 20260929; do
  GCP_PROJECT_ID=gh-radar SUPABASE_URL='<라이브 server env 값>' bash scripts/smoke-limitup-sync.sh --date "$D"
done
```

smoke 기대(날짜마다 INV-1~7 PASS · `PASS: 12  FAIL: 0` — INV-1 · 2 · 3 · 4×6 · 6 · 5 · 7):

| `--date` | INV-4 entries · locks · jumps · member_alloc · facts · touches | INV-6 격자 |
|---|---|---|
| 20261002 | 29 · 12 · 9,231 · 62,209 · 169 · 31 | 29 |
| 20261001 | 27 · 5 · 11,684 · 61,971 · 111 · 32 | 27 |
| 20260930 | 23 · 10 · 18,576 · 79,220 · 134 · 45 | 23 |
| 20260929 | 20 · 12 · 1,135 · 49,847 · 128 · 108 | 20 |
| 4일 합 | 99 · 39 · 40,626 · 253,247 · 542 · 216 | 99 |

- **member_alloc 도 대조 대상이다.** 4 날짜 모두 KST 오늘 − 30일(10-05 기준 20260905) 안이다. 그러니 SKIP 이나 0 이면 안 되고 위 숫자가 나와야 한다. 플랜 Task 3 의 「보존 창 밖이면 0 이 정상」은 이번 시드에는 해당하지 않는다. smoke 를 2026-10-29 이후에 돌리면 20260929 부터 차례로 SKIP 이 된다.
- INV-5 `ENABLED` · cron `20 21 * * 1-5` · `Asia/Seoul`. INV-7 relay SA `roles/storage.objectUser` · 워커 SA `roles/storage.objectViewer`.

```bash
# 5. radar-gw 운반기 — 타이머 disabled 로 설치(--enable-timer 금지, D-13 · D-21)
#  5a. 119 호스트키 지문 (tick-archive 가 고정해 둔 값. 2026-10-05 기록 = SHA256:7s4iOpsEMcJkjLHD9KpGv7TIDXxJj2ip5Na+hU4aiJY — docs/relay-operations.md)
gcloud compute ssh radar-gw --zone asia-northeast3-a --tunnel-through-iap --project=gh-radar \
  --command='sudo ssh-keygen -lf /var/lib/tickarc/.ssh/known_hosts'
#  5b. 4파일 복사 (repo root, 맥)
gcloud compute ssh radar-gw --zone asia-northeast3-a --tunnel-through-iap --project=gh-radar --command='mkdir -p ~/limitup-pull-src'
gcloud compute scp --tunnel-through-iap --zone asia-northeast3-a --project=gh-radar \
  infra/relay/limitup-pull/{limitup-pull.sh,limitup-pull.service,limitup-pull.timer,install.sh} radar-gw:~/limitup-pull-src/
#  5c. 설치 — 지문이 다르면 아무것도 쓰지 않고 종료 2
gcloud compute ssh radar-gw --zone asia-northeast3-a --tunnel-through-iap --project=gh-radar --command \
  'sudo bash ~/limitup-pull-src/install.sh --bucket gs://gh-radar-limitup-export --host-fp SHA256:<5a 지문>'
#      기대 출력: [install] 호스트키 지문 일치 10.16.207.119 SHA256:… · [install] 키 지문: 256 SHA256:… radar-gw-pull (ED25519) · [install] 타이머 enabled=disabled active=inactive · [install] 완료
#  5d. 공개키 한 줄 · 타이머 · 자가 시험
gcloud compute ssh radar-gw --zone asia-northeast3-a --tunnel-through-iap --project=gh-radar --command \
  'sudo cat /var/lib/limitpull/.ssh/id_ed25519.pub; systemctl is-enabled limitup-pull.timer; /usr/local/lib/limitup-pull/limitup-pull.sh --self-test; systemd-analyze calendar "Mon..Fri 21:00:00 Asia/Seoul" | head -3'
#      기대: "ssh-ed25519 AAAA… radar-gw-pull" 한 줄 · "disabled" · self-test 통과
```

6. 결과로 공개키 한 줄, 키 지문, 119 호스트키 지문, 1~5 출력 요약을 붙인다. 공개키 본문은 이 SUMMARY 에만 적는다. 커밋 메시지와 로그에는 지문만 남긴다. 28-15 Task 1 이 인박스 노트에 한 번 추기한다.

참고: radar-gw VM 은 relay SA 에 `--scopes=cloud-platform` 으로 만들어져 있다(`scripts/setup-relay-iam.sh:378`). 그래서 운반기의 `gcloud storage rsync` 는 버킷 IAM 만 있으면 된다(SA JSON 키 불필요).

### ⑤ 되돌리기 (수동 · 사용자 판단 · 각 마이그레이션 머리 주석 정본)

server 가 새 RPC 를 부르기 시작한 뒤(28-15)라면 **server 를 먼저 이전 리비전으로** 돌린다. 그다음 마이그레이션의 역순으로 DROP 한다. Supabase 대시보드 SQL Editor 에서 하고, 끝나면 `supabase migration repair --status reverted <버전>` 으로 이력을 맞춘다.

```sql
-- 090400 보고서 RPC
DROP FUNCTION public.limitup_grid_isins_for_user(uuid, text);
DROP FUNCTION public.limitup_report_for_user(uuid, text);
-- 090300 보존 · 버킷 (버킷은 Storage 대시보드에서 비운 뒤 삭제 — 객체가 있으면 DELETE FROM storage.buckets 가 막힌다)
DROP FUNCTION public.limitup_purge_old(integer, integer);
-- 090200 적재 RPC (표보다 먼저)
DROP FUNCTION public.limitup_record_skip(text, text);
DROP FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb);
DROP FUNCTION public.limitup_stage_clear(text);
-- 090100 표 10
DROP TABLE public.limitup_member_daily, public.limitup_grid_summary, public.limitup_loads,
  public.limitup_stage, public.limitup_touches, public.limitup_facts, public.limitup_member_alloc,
  public.limitup_jumps, public.limitup_locks, public.limitup_entries;
-- 090000 kind 15 (래퍼는 server 를 이전 커밋으로 먼저)
DROP INDEX IF EXISTS public.idx_dma_strategy_events_limit_feature_day;
DROP FUNCTION public.dma_strategy_events_purge_limit_feature(integer);
DROP FUNCTION public.dma_strategy_events_for_user_json(uuid, date, boolean);
-- 그리고 20261003120000_dma_strategy_events_burst_limit.sql 의 dma_strategy_events_for_user 본문 재적용(집합 1·2·10)
```

GCP · radar-gw 되돌리기(Task 3 를 했을 때만):
- Scheduler: `gcloud scheduler jobs pause gh-radar-limitup-sync-nightly --location asia-northeast3`(또는 delete). Job: `gcloud run jobs delete gh-radar-limitup-sync --region asia-northeast3`. 알림 정책: `gh-radar-limitup-sync-failure` 삭제.
- 버킷 `gs://gh-radar-limitup-export` 는 지우지 않는 것을 권한다(D-16: 재적재용 사본). 버킷 IAM 두 바인딩만 `remove-iam-policy-binding` 한다.
- radar-gw: `systemctl disable --now limitup-pull.timer` · 유닛 · `/usr/local/lib/limitup-pull` · `/etc/limitup-pull.env` · `limitpull` 사용자를 지운다. 119 `authorized_keys` 의 `radar-gw-pull` 줄 삭제는 gh-trade 사용자와 함께 맞추고, 인박스 노트로 알린다(docs/relay-operations.md).

## Task 2 결과 — DB push · RPC smoke (2026-10-05 20:52 KST)

- `supabase migration list --linked` — Remote 공백이 정확히 `20261006090000` · `090100` · `090200` · `090300` · `090400` 다섯.
- `supabase db push --linked --yes` — 다섯 파일 「Applying migration …」 · 「Finished supabase db push.」
- smoke(키는 변수에만 · 출력 0):

| | 호출 | 결과 |
|---|---|---|
| a | `dma_strategy_events_for_user_json` (service role) | `[]` |
| b | `limitup_report_for_user` (service role · 0 uuid) | `{"access": false}` |
| c | anon 키로 a · 보고서 RPC · `limitup_entries` 표 | 401 · `42501 permission denied for function …` / 401 / 401 `permission denied for table` |
| d | Storage 버킷 `limitup-grid` | `public:false` · 10MB · `application/gzip` |
| e | `inspect db table-stats` | `limitup_` 표 10개 전부 |

## Task 3 결과 — GCS · IAM · 워커 · 시드 · radar-gw (2026-10-05 20:53~21:05 KST)

1. `setup-limitup-sync-iam.sh` — 첫 실행은 SA 생성 직후 전파 지연으로 Secret 바인딩 400. 20초 뒤 재실행(멱등)으로 완료: 워커 SA `gh-radar-limitup-sync-sa` · secretAccessor · 버킷 `gs://gh-radar-limitup-export` 생성 · 워커 objectViewer · relay SA objectUser.
2. `deploy-limitup-sync.sh` (NOTIFICATION_CHANNEL_ID `14409521670382124894` · ops email) — 이미지 `limitup-sync:d4a044dd` · Job `gh-radar-limitup-sync` · Scheduler `gh-radar-limitup-sync-nightly`(`20 21 * * 1-5` Asia/Seoul · ENABLED) · 알림 정책 생성 `projects/gh-radar/alertPolicies/8811279302594685098`.
3. 시드 — 버킷 비어 있음 확인 뒤 `gcloud storage rsync ~/ticks/research/export … --recursive --checksums-only` → 4 날짜 디렉터리.
4. smoke — 날짜마다 `PASS: 12  FAIL: 0`(첫 실행 execution `gh-radar-limitup-sync-kdrkp` 가 4일 적재 · 이후 unchanged skip):

| 날짜 | entries · locks · jumps · member_alloc · facts · touches | 격자 |
|---|---|---|
| 20261002 | 29 · 12 · 9,231 · 62,209 · 169 · 31 | 29 |
| 20261001 | 27 · 5 · 11,684 · 61,971 · 111 · 32 | 27 |
| 20260930 | 23 · 10 · 18,576 · 79,220 · 134 · 45 | 23 |
| 20260929 | 20 · 12 · 1,135 · 49,847 · 128 · 108 | 20 |
| 합 | 99 · 39 · 40,626 · 253,247 · 542 · 216 | 99 |

5. radar-gw — 119 호스트키 지문 `SHA256:7s4iOpsEMcJkjLHD9KpGv7TIDXxJj2ip5Na+hU4aiJY`(기록값과 일치) · 4파일 scp · `install.sh --bucket gs://gh-radar-limitup-export --host-fp …`(`--enable-timer` 없음) → 사용자 `limitpull` 생성 · 키 생성 · 키 지문 `256 SHA256:qLovMlHsTyP2f3sR7MqbrkTi41Bhkc02uD0iELuqGak radar-gw-pull (ED25519)` · 타이머 `disabled` · `--self-test` OK 13 · `systemd-analyze calendar` 다음 실행 Tue 2026-10-06 21:00 KST · `systemd-analyze verify` rc 0. 복사 원본 `~/limitup-pull-src` 는 지웠다.

공개키(28-15 Task 1 이 인박스 노트에 한 번 추기):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJCgU7SWiM+dAYN26xUi/zUUt2IUD308fnQS5Ofv00wd radar-gw-pull
```

## Task Commits

1. **Task 1: 배포 준비 게이트** — 코드 커밋 없음(게이트 green · 회귀 0). 이 SUMMARY 초안 docs 커밋만 있다.
2. **Task 2: [BLOCKING] DB push + RPC smoke** — 원격 반영(커밋 없음). 아래 「Task 2 결과」.
3. **Task 3: GCS · IAM · 워커 · 시드 smoke · radar-gw** — 원격 반영. 직전 `d4a044dd` fix(28-16)(연속 skip 수 리셋)를 이미지에 실었다. 아래 「Task 3 결과」.

## Decisions Made

- 게이트 기준 커밋은 `5c78dab3` 이다. Task 3 의 이미지 태그는 배포할 때의 `git rev-parse --short HEAD` 가 된다(이 초안 커밋이 HEAD 면 그 해시. 코드는 `5c78dab3` 과 같다).
- smoke 의 member_alloc 기대치를 바로잡았다(위 ④). 4 날짜 모두 30일 보존 창 안에 있다.
- 시드는 `--checksums-only` rsync 로 한다. 이미 올라간 객체는 다시 올리지 않는다(멱등).

## Deviations from Plan

**1. [Rule 2 - 정보 보강] 워커 이미지 로컬 amd64 빌드 + 컨테이너 안 dry-run 을 추가했다**
- **Found during:** Task 1 ①
- **내용:** 플랜 objective 의 「이미지 빌드」를 verify 4개가 덮지 않는다. 그래서 28-08 의 확인 명령을 HEAD 에서 다시 돌렸다(build · require · 비root · ro 마운트 dry-run). push 는 하지 않았고 로컬 태그는 지웠다.
- **결과:** 모두 통과. totals 는 호스트 dry-run 과 같다.

**2. [기록] smoke 기대치 정정(member_alloc)** — 위 ④ · key-decisions. 코드 변경 없음.

**Total deviations:** 보강 1 · 기록 1. **Impact:** 코드 변경 없음.

## Issues Encountered

없음. e2e 는 첫 실행에서 통과했다(webServer 타임아웃 없음 · `.next` 삭제 불필요). flaky 0.

## Acceptance (Task 1)

| 기준 | 결과 |
|---|---|
| 네 automated 명령 종료 코드 0 | ① exit 0 · ② exit 0(PASS ×4) · ③ exit 0(130 passed) · ④ exit 0(grep 3종 일치) |
| `git status --porcelain --untracked-files=no` 0줄 | 0줄 |
| SUMMARY 에 「origin/master..HEAD 목록 · left/right 수」 · 「Task 2 명령」 · 「Task 3 명령」 · 「되돌리기」 | ② · ③ · ④ · ⑤ 절 |
| `supabase db push` · `gcloud storage buckets create` · `gcloud run jobs` · `gcloud compute ssh` 미실행 | 실행하지 않았다(gcloud 호출 0 · Secret 읽기 0 · 명령은 문서로만 적었다) |

## Next

28-15 — 공개키 인박스 추기 · relay → server → push(webapp) · 119 등록 뒤 타이머 · 인박스 마감.

---
*Phase: 28-limitup-feature-ingest*
*Completed: 2026-10-05*

## Self-Check: PASSED

- 파일: `28-14-SUMMARY.md` 있음 · 마이그레이션 5개 · 스크립트 3개 · `infra/relay/limitup-pull/` 4파일 있음
- 참조 커밋: `5c78dab3`(게이트 기준 HEAD) · `78486f1b`(origin/master) 있음
- 코드 미커밋 0줄(`--untracked-files=no`) · 배포 · gcloud · Secret 호출 0
