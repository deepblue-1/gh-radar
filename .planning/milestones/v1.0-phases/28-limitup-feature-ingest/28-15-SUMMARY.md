---
phase: 28-limitup-feature-ingest
plan: 15
subsystem: 배포 · relay · server · webapp · 인박스
tags: [deploy, relay, server, vercel, inbox, radar-gw, limitup-pull]
status: complete

requires:
  - phase: 28-14
    provides: "DB push 5 · 워커 · 시드 적재 · radar-gw 운반기 설치(타이머 disabled) · 공개키"
provides:
  - "relay b581af31 (직전 78486f1b) · smoke PASS 12 FAIL 0 SKIP 1 · /healthz ok"
  - "server gh-radar-server-00056-8mn (직전 00055-wlg · APP_VERSION b581af31) · smoke PASS 15 · /api/limitup/* · ?lf=1 미인증 401"
  - "git push 78486f1b..b581af31 · Vercel 프로덕션 dpl_5JGR4toxyrojELGmXQrDxY8rUTnh Ready · trade.jx1.io 갱신"
  - "인박스 261005-limitup-feature-85 공개키 추기 · 119 등록 대기 기록(open 유지)"
affects: [28-verification]

actuals:
  tokens: 2500
  tasks: 3
  commits: 2
plan_head_before: e039f02ea774696ccbd2d10f962f758adb1d58ae

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/28-limitup-feature-ingest/28-15-SUMMARY.md
  modified:
    - docs/inbox/from-gh-trade/261005-limitup-feature-85.md

key-decisions:
  - "relay 는 메인 트리에서 빌드했다 — 추적 파일 미커밋 0줄 · 미추적은 .planning 아래뿐이라 이미지 = HEAD b581af31(메모리 「relay 빌드 원천 함정」 조건 해당 없음)"
  - "타이머는 119 등록 전이라 disabled 유지 — 인박스 노트는 open + 「119 등록 대기」 한 줄(거짓 done 금지)"
  - "플랜의 `sudo -u limitpull … --check` 는 EnvironmentFile 을 읽지 않아 BUCKET 빈 값으로 종료 2 — 운영 문서(docs/relay-operations.md)의 `env $(cat /etc/limitup-pull.env)` 형태 또는 `systemd-run -p EnvironmentFile=…` 로 확인한다"

requirements-completed: [D-13, D-21, D-22]

coverage:
  - id: D1
    description: "인박스 공개키 추기(119 등록 줄 · 지문 · 확인 명령 · radar-gw 변경 알림)"
    verification:
      - kind: other
        ref: "플랜 Task 1 verify — 절 · 등록 줄 정규식 · HEAD 파일 1개 · status open · 다른 노트 무변경"
        status: pass
    human_judgment: false
  - id: D2
    description: "relay → server → push(webapp) 배포 · 검증"
    verification:
      - kind: manual
        ref: "smoke-relay PASS 12 · healthz ok · 85 warn 0 · smoke-server PASS 15 · 401 ×4 · Vercel Ready · 보고서 RPC 실사용자 4일"
        status: pass
    human_judgment: false
  - id: D3
    description: "radar-gw 타이머 활성 · 첫 운반"
    verification:
      - kind: manual
        ref: "2026-10-05 21:38 — 사용자 지시로 메인 세션이 119 등록 · --check OK(날짜 4) · timer enabled · 첫 운반 rsync=ok upload=ok · 워커 재적재 smoke PASS 12 ×4"
        status: pass
    human_judgment: true
    rationale: "119 authorized_keys 등록은 원래 gh-trade 사용자 몫 — 사용자가 「진행해」 로 메인 세션에 맡겼다"

duration: 15min
completed: 2026-10-05
---

# Phase 28 Plan 15: 배포 ② — 공개키 전달 · relay → server → push · 타이머 · 인박스 Summary

**relay `b581af31`, server `gh-radar-server-00056-8mn`, webapp 프로덕션(trade.jx1.io)까지 배포했고 각 검증이 통과했다. radar-gw 운반 타이머는 119 키 등록을 기다리며 꺼져 있다.**

## Performance

- **Duration:** 15 min (21:00 ~ 21:15 KST, 장 마감 뒤)
- **Tasks:** 3 / 3 (Task 2 는 메인 세션, 사용자 승인 「니가 다 반영하고 배포해」)

## Task 1 — 인박스 공개키 추기

`docs/inbox/from-gh-trade/261005-limitup-feature-85.md` 끝에 「radar-gw pull 공개키 (Phase 28 배포 — 2026-10-05)」 절을 추기했다(아래 Task Commits 1). 등록 줄 · 키 지문 · 119 호스트키 지문 · 등록 전후 확인 명령 · radar-gw 변경 알림 · 회신 요청이 들어 있다. frontmatter 는 open 그대로.

## Task 2 — 배포 결과

| 단계 | 결과 |
|---|---|
| 0. 119 등록 분기 | 미등록 — 타이머 단계는 7번으로 |
| 1. `git status -sb` | ahead 73 · 추적 미커밋 0 · 로컬 커밋 전부 이 세션 |
| 2. 직전 relay 태그 | `relay:78486f1b` (DMA_HOST 10.41.1.120 보존) |
| 3. relay | `relay:b581af31` 기동 · `/healthz` ok(vpn · dma true · journal live · quote ready) · smoke `PASS 12 FAIL 0 SKIP 1`(INV-9 브라우저 왕복) · 10분 로그 warn 은 KYOBO 127 접속 시간 초과(기존 ACL 대기)와 smoke 의 의도된 잘못된 토큰 · 인증 시간 초과뿐, 85 관련 0 |
| 4. server | `00055-wlg` → `00056-8mn` · APP_VERSION b581af31 · DISCUSSION_CLASSIFY_ENABLED=false 유지 · smoke `PASS 15 FAIL 0` · `/api/limitup/report` · `?d=` · `/grid-urls` · `/api/strategy-events?lf=1` 미인증 401(smoke rate-limit 429 가 풀린 뒤) |
| 5. push | `78486f1b..b581af31` · Vercel `gh-radar-webapp-83y085f8u` Ready · `trade.jx1.io` = `dpl_5JGR4toxyrojELGmXQrDxY8rUTnh`(21:08) |
| 6. 운영 웹 | `/analytics/limitup` 미인증 307 → `/login?next=…` · 보고서 RPC 를 실제 DMA 사용자로 호출하면 `access:true` · 날짜 4개 · 20261002 entries 29 · locks 12 · facts 169 · 어제 결과 있음 · 지문 25 · 417KB · 0.23초 · 격자 서명 URL GET(Origin trade.jx1.io) 200 · `access-control-allow-origin: *` · coarse 2,340칸 · 24열 |
| 7. 타이머 | 21:15 에는 119 미등록(`Permission denied (publickey)`)이라 disabled. **21:38 사용자 「진행해」 → 메인 세션이 맥 `kyobo119` 로 119 `authorized_keys` 에 등록(백업 · 5→6줄 · 600) → `--check` OK(날짜 4) → `enable --now limitup-pull.timer`(다음 Tue 21:00 KST) → 첫 운반 `dates=4 latest=20261002 rsync=ok upload=ok`(relay SA 같은 경로 덮어쓰기 확인).** 등록 직후 `--check` 가 날짜 0개로 보여 원인을 찾았다 — radar-gw awk 는 mawk 1.3.4 라 `{8}` 반복을 모른다 → `6cc4d55c` 로 고쳐 재설치 |
| 8. 관찰 | 다음 거래일 — 장중 FULL 카드 「상한가」 탭(gh-trade 서버가 85 를 보낸 뒤) · kind 15 분당 행 · 119 등록 뒤 첫 21:00 운반 → 21:20 적재 smoke |

배포한 코드 커밋: `b581af31` (push tip. 마지막 코드 커밋은 `303d3a9f` 골든 보정 제거 · 그 앞 `d4a044dd` 연속 skip 리셋).

## Task 3 — 인박스 마감

21:15 에는 타이머가 꺼져 있어 「119 등록 대기」 한 줄만 추기했다. 21:38 등록 · 첫 운반 뒤 노트를 `status: done` · `done_commit: 6cc4d55c` 로 마감했다. 함께 `261005-member-top-int64.md` 도 재적재 대조(창구 0곳 차이) 뒤 done(`303d3a9f`).

재적재 확인: 운반기가 119 재생성본(gh-trade f483d409)을 올린 뒤 워커를 다시 돌려 4일 모두 `sigChanged true` 로 교체 적재 · smoke PASS 12 ×4(20260929 첫 회 1건 FAIL 은 로그 수집 지연 — 재실행 PASS 12). gh-trade `fingerprint_agg` 를 재생성본에 돌린 값 = 운영 `limitup_member_daily`(4일 · 9/16/18/19 창구 차이 0) · 운영 `limitup_entries` 창구 열 = 재생성본 99/99행.

## Task Commits

1. `docs(inbox): 261005-limitup-feature-85 radar-gw-pull 공개키 · radar-gw 변경 알림 추기`
2. `docs(inbox): 261005-limitup-feature-85 119 등록 대기 기록 — 배포 b581af31 · 타이머 disabled`

같은 배포 구간의 관련 커밋(메인 세션, 사용자 「다 반영」): `d4a044dd` fix(28-16) 연속 skip 리셋 · `303d3a9f` test(28-06) 골든 보정 제거(gh-trade f483d409) · `b581af31` 인박스 `261005-member-top-int64` 수신.

## Deviations from Plan

2. **[Rule 1] 운반 스크립트 mawk 호환(`6cc4d55c`)** — `--check` · `--dry-run` 의 날짜 세기 awk 가 `/^[0-9]{8}$/` 였다. radar-gw mawk 1.3.4 는 반복 표현을 몰라 0개로 셌다(맥 BSD awk 자가 시험은 통과해 놓쳤다). 자릿수를 풀어 쓰고 재설치. 실제 운반의 날짜 판정(bash `=~`)은 영향 없었다.
1. **[Rule 1] 타이머 점검 명령** — 플랜의 `sudo -u limitpull …/limitup-pull.sh --check` 는 `/etc/limitup-pull.env` 를 읽지 않아 종료 2(BUCKET 빈 값). `systemd-run --wait --pipe -p User=limitpull -p EnvironmentFile=/etc/limitup-pull.env … --check` 로 확인했다. 운영 문서는 이미 `env $(cat /etc/limitup-pull.env)` 형태라 고칠 것 없음.

## Issues Encountered

- 운영 버킷의 4일은 맥 로컬 사본(gh-trade f483d409 수정 **전** export)이다. entries 의 창구 비중 열(`entry_buy_member/share1~3`)은 수정 전 값이다(워커가 계산하는 `member_daily` 는 실수 곱셈이라 맞다). 119 등록 뒤 운반기가 재생성본을 올리면 files_sig 가 바뀌어 워커가 네 날짜를 다시 적재한다(인박스 `261005-member-top-int64` open 유지).

## Next

- 다음 거래일: 장중 카드 「상한가」 탭 · kind 15 줄 관찰 · 밤 21:00 운반 → 21:20 자동 적재 확인.

---
*Phase: 28-limitup-feature-ingest · Completed: 2026-10-05*
