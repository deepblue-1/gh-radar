---
phase: 37-tick-viewer
plan: 17
subsystem: deploy
tags: [tickgw, radar-gw, tickpull, 119-indexer, cloud-run-job, scheduler, live-path, tick-viewer]
status: uat-pending

requires:
  - phase: 37-tick-viewer (37-09 · 37-12 · 37-15 · 37-16 · 37-19)
    provides: "tickgw 컨테이너 · 승격 모드 · server /api/ticks/live 중계 · 과거 경로 운영 · 웹 당일 훅"
provides:
  - "당일 경로 켜짐 — radar-gw tickgw(:8092) · server gh-radar-server-00071-q9s(TICKGW_URL · TICKGW_SECRET) · 승격 Job + Scheduler 20:10 · 20:40"
  - "tickgw 119 어댑터 = gh-trade 1차 회신 계약(차이 2건 반영)"
affects: []

actuals:
  tasks: 3
plan_head_before: f385bf59
plan_head_after: (이 SUMMARY 커밋)

key-files:
  modified:
    - tickgw/src/indexer.ts
    - tickgw/src/poller.ts
    - tickgw/tests/indexer.test.ts
    - tickgw/tests/fixtures/fake-indexer.mjs

key-decisions:
  - "계약 차이 2건(compressed_files_skipped · 0건 빈 프레임)은 프레이밍을 바꾸지 않는다 → 37-09 「원본 zstd 그대로 · 재압축 없음」 예외 없음 · docs/relay-operations.md 무변경"
  - "D-19 범위 재검토: 종목 단위 기타 태그 = B2(오프셋 9) · B0(오프셋 7) — 사용자 답 「유지 (권고)」 → 지금처럼 여섯 태그만"
  - "radar-gw 작업 시각: tickpull 설치(09:4x)와 tickgw 배포(10:1x)를 장중에 했다 — 사용자 결정 「지금 설치 (권고)」 · 「gh-trade 서버를 배포해야되는거 아니면 지금 다 배포해도 돼」(deploy-tickgw.sh --allow-daytime). gh-trade 쪽은 2차 회신으로 이미 끝났다"

requirements-completed: [D-05, D-06, D-07, D-21, D-22]

completed: 2026-11-03
---

# Phase 37 Plan 17: 당일 경로 켜기 Summary

**gh-trade 2차 회신(가동 통보) 뒤 radar-gw 에 tickpull · tickgw 를 올리고 server 를 결선해 당일 경로를 켰다. KRX · NXT 모두 08:00 부터 하루치 → 5초 증분으로 받는다. 승격 Job 은 20:10 · 20:40 에 돈다.**

## Task 1 — gh-trade 회신 확인

- 1차 회신: `docs/inbox/from-gh-trade/261102-tick-viewer-contract-1.md` — 37-01 제안 계약 그대로 + 차이 2건
- 2차 회신: `docs/inbox/from-gh-trade/261103-tick-viewer-live-2.md` — 119 인덱서 11/2 22:23 KST 설치(f6f551b4) · tickpull 키 등록 11/3 오전 · 장중 실측 · 16MB · 동시 1 유지
- 두 노트 `status: done`(이 플랜에서 처리)

| 항목 | 37-01 제안 | 회신 |
|---|---|---|
| 질의 명령 | (미정) | `/home/smok95/gh-trade-server/bin/tick-indexer --query` · SSH_ORIGINAL_COMMAND |
| stderr JSON | 6키 | + `compressed_files_skipped` |
| 0건 stdout | 빈 출력 가능 | 빈 zstd 프레임 1개(응답 N = 프레임 N) |
| 16MB | 넘으면 끊음 | 넘기 전에 끊음(엄격) |
| 범위 · 커서 | — | from 포함 · to 배타 · next_from_ns 포함 커서 |

D-19 재검토 — 사용자 답 원문: 「유지 (권고)」(B2 · B0 넣지 않음).

## Task 2 — 어댑터 (e2ad2371)

- `IndexerMeta.compressedFilesSkipped`(없으면 0) · poller 로그 `skipped`
- 0건 빈 프레임: poller 가 records > 0 일 때만 캐시에 붙여 이미 호환 · 가짜 인덱서도 빈 프레임을 낸다
- tickgw 시험 41/41 · typecheck 통과 · 프레이밍 변환 예외 없음

## Task 3 — 운영 반영 (11/3 KST)

| 단계 | 결과 |
|---|---|
| `setup-tickgw-iam.sh`(사용자 `!`) | 방화벽 `relay-allow-internal-tickgw` · Secret `gh-radar-tickgw-secret` ENABLED |
| `infra/relay/tickpull/install.sh` | tickpull uid 992 / gid 991 · 키 지문 `SHA256:SL4V3R4lsPLoZJyg49d7dW/N5k7sIE3qbvATI+X4j40` · 119 지문 일치 |
| 119 등록 | 사용자 · gh-trade 확인(radar-gw-tickpull 1줄) |
| radar-gw → 119 시험 | 삼성 KRX 5초치 148건 · 3,695B · 종료 0 |
| `deploy-tickgw.sh --allow-daytime` | 이미지 tickgw:8aab2d8c · healthz 200 · 자기 시험 OK · 47.8MiB |
| `deploy-server.sh` + TICKGW_URL=http://10.10.0.5:8092 | gh-radar-server-00071-q9s · 스모크 15/15 · 무인증 /api/ticks/live · /today 401 |
| `deploy-tick-convert.sh` + TICKGW_URL | Job gh-radar-tick-convert-promote · Scheduler `10 20 * * 1-5` · `40 20 * * 1-5` |

### SC 2 실측 — radar-gw tickgw → 119 하루치 (11/3 10:14 KST · from 08:00)

| 키 | 레코드 | 압축 바이트 | 첫 조회 소요 | has_more |
|---|---|---|---|---|
| 삼성전자 KRX | 365,022 | 8,946,459 | 8,738ms | false |
| 삼성전자 NXT(극단) | 640,952 | 15,833,352 | 16,807ms | false |
| 한양디지텍 KRX(보통) | 15,860 | 508,145 | 947ms | false |
| 한양디지텍 NXT | 10,768 | 355,610 | 146ms | false |

- 5초 증분: 1~900건 · 0.1~22KB · 35~50ms
- tickgw 메모리 94MiB / 256MiB · VM load 0.07
- gh-trade 가 119 로컬에서 잰 지연(삼성 NXT 1.23초)보다 길다 — 차이는 VPN 전송(약 1MB/s)으로 본다. 하루치 첫 조회는 대형주가 10~17초 걸리고, 그동안 웹은 「하루치 받는 중」 카드 + 진행 바 + % 를 보인다
- 75(바쁨) · 연속 오류 없음
- 119 쪽(gh-trade 확인 10:25 KST): 기록기 `[stats]` 10:13:25 · 10:23:25(첫 하루치 질의 뒤) KRX · NXT drops=0 · 버림=0 · 인덱서 CPU 0.2 % · load 1.0(평소) · 남은 질의 프로세스 없음 · 지연은 VPN 전송 탓이라는 데 동의(119 로컬 0.5~1.2초)

### D-07 승격

- 20:10 · 20:40 실행 결과는 그날 밤 기록(아래 추기)

## 당일 UAT (D-06)

사용자 확인 대기 — KRX · NXT 오늘 종목: 끝 틱 자동 증분(5초) · 과거 틱 보기 중 멈춤 + 「새 틱 n건」 · 「끝으로」 · 탭 숨김 정지 · 지연 표시 · 브라우저 둘에서 같은 종목 → tickgw 119 호출 키당 하나.
