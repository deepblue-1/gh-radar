---
phase: 35-launch-gate
plan: 09
subsystem: 배포 (DB · 백필 · server · webapp)
status: complete
tags: [deploy, backfill, uat, launch-gate]
requires: ["35-01", "35-08"]
provides:
  - "원격 스키마 20261027200000_launch_gate · 20261027200100_launch_gate_apply"
  - "launch_pieces 254 · launch_heads 51 백필(gh-trade 전체 ndjson) — 이후 10/26 09:00:30 사전 발사 기록 삭제"
  - "server gh-radar-server-00067-5cq · webapp 프로덕션 653185e5 → 190f3e57(툴팁)"
affects:
  - "35-10 · 35-11 (Wave B — gh-trade Phase 43 정식 노트 대기)"
key-files:
  created: []
  modified:
    - webapp/src/components/admin/launch-gate-chart.tsx
    - webapp/src/lib/launch-map.ts
    - docs/inbox/from-gh-trade/261027-launch-backfill.md
decisions:
  - "백필은 첨부 pieces.json 대신 gh-trade 전체 ndjson 만 적재 — 196조각을 같은 논리 키로 모두 포함하고 주문 속성까지 실었다(dry-run 이 counts TSV 51행과 전부 일치)"
  - "10/26 09:00:30(N) 기록 삭제 — 사전 발사(약 −20ms)로 잘못 쏜 날이라 사용자 지시로 지움. 16:00 10/26 은 유지"
  - "10/12 이전 예약별 머리 수준 결과는 받지 않는다(사용자 답)"
metrics:
  completed: 2026-10-27
---

# Phase 35 Plan 09: Wave A 배포 런북 Summary

메인 세션이 사용자 승인(「전부 진행」) 아래 D-22 순서대로 원격 DB → 백필 → server → push 를 끝냈고, 백필 UAT 에서 사용자가 「같다」 고 답했다. UAT 중 요청 2건(점 툴팁 · 10/26 09:00:30 삭제)을 처리했다.

## Task 1 — 원격 스키마 (22:02 KST · 장 시간 밖)

- pgTAP: 35-08 회귀에서 실제 실행 — launch_gate 60/60 · launch_gate_apply 38/38 (「미실행」 승인 단계 불필요).
- 사전 확인: master · 미커밋 마이그레이션 없음 · Remote 최신 20261026120000(두 버전보다 이름).
- `supabase db push --linked --yes` → `migration list --linked`:
  - `20261027200000 | 20261027200000`
  - `20261027200100 | 20261027200100`
- relay: push 뒤 relay_docker 에 WARNING 이상 · journal 적용 실패 · 투영 실패 줄 0(장 마감 뒤라 로그 자체가 조용함).

## Task 2 — 백필 (D-09 · 명령 먼저 보이기)

- gh-trade 전체 ndjson(`261027-launch-backfill-attach/launch_pieces_KB120.ndjson` 150 · `launch_pieces_KYOBO119.ndjson` 104)이 와 있어 그것만 적재. 첨부 pieces.json 196조각은 같은 키로 전부 포함된다.
- 처음 dry-run 에서 「기타」 거부 24행이 `result_code` 정수 검증에 걸렸다(브로커 원 코드 F083 · E124 · E127) → 원격 적용 전에 열을 text 로 바꿈(8c7c999a).
- dry-run: `합계: 조각 254 · 머리 51 · 날짜 12 · 중복 0 · 거부 0` — counts TSV 51행과 전부 일치.
- `--apply`: `적재: 조각 254/254 · 머리 51/51 · RPC 2회`.
- `--status`: q16 날짜 12 · 조각 214(KB 130 + 교보 84) · n0930 날짜 2 · 조각 30. 나머지 10조각은 지도에 들어가지 않는 09:00:27 KRX 다리.

## Task 3 — server · push · UAT

- server: 라이브 env(CORS_ALLOWED_ORIGINS · RELAY_INTERNAL_URL) 그대로, 깨끗한 detached worktree(653185e5)에서 `deploy-server.sh` → `gh-radar-server-00067-5cq` · 스모크 15/15. 무인증 `/api/admin/launch/orders` · `/map` 401(스모크의 429 가 풀린 뒤).
- push: `5f706d17..653185e5`(Phase 35 + Phase 36 문서 커밋 4개 — 사용자 승인 범위) → Vercel Production Ready(22:06).
- UAT 사용자 답 원문: 「같아. 근데 몇가지만 고쳐줘. 1. 점에 마우스를 대면 툴팁으로 그 값을 보여줘. -247us 이런식으로. 2. 09:00:30 주문의 교보/KB 10월 26일 코스닥 수치가 -20000대에서 시작하는데 이거 실제로 이렇게 쏜거야? 그럼 잘못 쏜거니까 10월 26일 기록은 지우자.」

## UAT 후속

1. **점 툴팁** — 기존 `<title>` 은 1초쯤 머물러야 뜨고 점(r 4.5)이 작아 맞추기 어려웠다. 점마다 보이지 않는 16px 감지 칸 + 즉시 툴팁(큰 줄 「−247µs」 · 작은 줄 날짜 · wire · 결과). RTL 300 · E2E admin-launch 12 통과 → `190f3e57` push · Vercel Ready.
2. **10/26 09:00:30 삭제** — gh-trade 백필 노트대로 그날 N 은 사전 발사(약 −20ms)로 실제로 그렇게 나갔다. 사용자가 비출력 일회용 스크립트로 `launch_pieces` · `launch_heads` 의 (2026-10-26, 09:00:30) 행을 지웠고, `--status` 로 n0930 = 10/27 하루 · 조각 20 확인. 16:00 10/26 은 그대로. 일회용 스크립트는 지웠다.
   - 주의: 인박스 ndjson 에는 10/26 N 행이 남아 있다. 다시 적재하면 돌아오므로 재적재 때는 `--date` 로 10/26 을 빼거나 적재 뒤 같은 삭제를 한다.

## Deviations from Plan

- 백필을 pieces.json → 전체 ndjson 두 번이 아니라 전체 ndjson 한 번으로 — 결과 상태가 같고 더 풍부하다.
- `result_code` text 변경(8c7c999a)은 이 플랜 중 gh-trade 데이터로 드러난 계약 불일치 수정.
- UAT 후속 2건은 사용자 요청.

## Self-Check: PASSED

- 원격 두 버전 Remote 확인 · 백필 status 확인 · server 리비전 · 401×2 · `origin/master == master`(190f3e57) · Vercel Ready.
