---
phase: quick-261025-uf2
plan: 01
subsystem: accum (매집감지) — DB 적재 · 워커 · 공유 타입
tags: [accum_flow, kind16, day-axis, pgtap, gh-trade-phase39]
status: complete
requires: [gh-trade 51e21a8f export 말미 4열, relay 829c3d17 스키마 동기화]
provides: [limitup_accum_flow 당일 축 4열, AccumReportRow 선택 키 4, AccumSignal 당일 축 9필드]
affects: [당일 축 UI(목업 뒤 별도), 보고서 차트 라벨 500만원(별도)]
tech-stack:
  added: []
  patterns: [ADD COLUMN 만으로 jsonb_populate_record 행 타입 확장(quick-261006-ide 선례)]
key-files:
  created:
    - supabase/migrations/20261025200000_limitup_accum_flow_day_axis.sql
  modified:
    - supabase/tests/limitup_load.test.sql
    - supabase/tests/accum_report.test.sql
    - workers/limitup-sync/src/load.ts
    - workers/limitup-sync/tests/load.test.ts
    - packages/shared/src/accum-report.ts
    - packages/shared/src/accum-signal.ts
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/__tests__/accum-signal.test.ts
    - webapp/src/components/trading/__tests__/accum-strip.test.tsx
    - webapp/src/lib/__tests__/accum-list.test.ts
decisions:
  - limitup_commit_day 재정의 안 함 — 열 목록 없는 jsonb_populate_record 위치 대응이라 ADD COLUMN 만으로 새 4키 적재(pgTAP L 이 증명)
  - 보고서 RPC 무변경 — 상세(to_jsonb)는 42키로 자동 확장, 목록(37열 명시)은 38키 그대로
  - AccumSignal 당일 칸은 snapQty · snapCum 둘 다 길이 3 일 때만 값(0 포함), 아니면 null
metrics:
  duration: ~25m
  completed: 2026-10-25
actuals:
  tokens: 9500
  tasks: 3
  commits: 4
plan_head_before: 829c3d172989e3b49d51d773b37ff7b3e6476a01
plan_head_after: 2cf5e807d95f7790216eed6a4fb0832f74d46c2d
---

# Quick 261025-uf2: 매집감지 당일 축 기반 — accum_flow 4열 · 워커 검사 · kind 16 day=/recent= 파서 Summary

accum_flow export 말미 4열(pos_day_buy_krw · pos_day_sell_krw · th_recent_pieces · th_recent_sec)을 ADD COLUMN 만으로 적재 경로에 실었고, limitup-sync 가 stage 전에 그 값의 정수 여부를 검사한다. kind 16 파서는 snap 길이 3 행의 당일 칸 3개와 message `day=` · `recent=` 를 읽어 AccumSignal 9필드로 푼다. 화면 변화는 없다.

## 커밋

| Task | 커밋 | 내용 |
|---|---|---|
| 1 (tracer) | b10ea63a | feat — accum_flow 당일 축 4열 마이그레이션 · pgTAP L 절 · 보고서 ④⑥ 정합 |
| 2 | 323e5db7 | feat — limitup-sync 당일 축 4열 정수 검사 · AccumReportRow 선택 키 |
| 3 RED | ee66a5de | test — kind 16 당일 칸 · day= · recent= 실패 테스트 |
| 3 GREEN | 2cf5e807 | feat — kind 16 파서 당일 칸 3 · message day= · recent= |

## commit 함수를 재정의하지 않은 근거

`limitup_commit_day` 의 accum_flow INSERT 는 `SELECT (jsonb_populate_record(NULL::public.limitup_accum_flow, s.payload)).*` 로 표 행 타입 전체를 열 목록 없이 위치 대응시킨다. ADD COLUMN 은 표와 그 레코드 타입 끝에 같은 순서로 붙기 때문에 새 키는 같은 이름의 열에 그대로 들어가고, 키가 없으면 NULL 이 된다. 본문을 다시 적으면 바이트 동일한 재진술일 뿐이고 Pitfall 2(statement_timeout 120s 소실) 위험만 생긴다. 선례는 quick-261006-ide(`20261006120000`)다. 권한은 표 단위 잠금이 새 열에도 그대로 적용된다(마이그레이션 본문의 FUNCTION/GRANT/REVOKE/POLICY 0 · ADD COLUMN 4).

**pgTAP L 결과:** 301 행 30억 · 12억 · 30 · 60 저장(int4 를 넘는 금액이 bigint 로 그대로 들어감), 302(키 없음) · 303(JSON null) 은 네 열 모두 NULL, 열 타입 4개 일치. 11/11 ok.

## 검증 결과

- **pgTAP (docker · 샌드박스 해제 · 이미지 `public.ecr.aws/supabase/postgres:17.6.1.104` 를 이번에 pull)**
  - RED: `--until 20261024230000` 로 limitup_load 실행 → `column "pos_day_buy_krw" does not exist` FAIL(기대대로)
  - `supabase/tests/limitup_load.test.sql` → **282/282 ok** (`1..282` · RESULT: PASS)
  - `supabase/tests/accum_report.test.sql` → **55/55 ok** (`1..55` · RESULT: PASS)
- `workers/limitup-sync` vitest tests/load.test.ts → 11/11 통과(새 it 2개 포함 · RED 1 실패 확인 후 GREEN) · 워커 tsc 통과
- `@gh-radar/shared` vitest 전체 → 22 파일 · **669/669** 통과(RED 8 실패 확인 후 GREEN) · shared build 통과
- webapp `tsc --noEmit -p .` 통과 · webapp vitest accum-strip + accum-list → **53/53** 통과
- 화면 무변경: `git diff --name-only 829c3d17..HEAD -- webapp/src | grep -v __tests__` → 비어 있음

## Deviations from Plan

### 실행 방식 조정

**1. [Rule 3 - Blocking] webapp 타입체크 명령**
- plan 의 `npx tsc --noEmit -p webapp` 은 루트에 typescript 가 없어 npx 가 실행을 거부했다("This is not the tsc command you are looking for").
- 같은 검사를 `pnpm --filter @gh-radar/webapp exec tsc --noEmit -p .` 로 돌려 통과했다. 코드 변경은 없다.

**2. docker 이미지 pull**
- 러너 이미지가 로컬에 없어서 plan (d) 에 따라 `docker pull` 로 받았다. 샌드박스가 docker 소켓을 막아 샌드박스를 해제하고 실행했다.

그 밖에는 plan 대로 실행했다.

## 원격 적용 순서 메모

- 메인 세션은 gh-trade 재생성 · 새 export(4열이 실린 날짜) 적재 **전에** `supabase db push --linked --yes` 를 실행해야 한다.
- 이 순서가 늦어서 마이그레이션 전에 새 키가 실린 날짜가 적재되면, 모르는 키는 버려지고 files_sig 는 같아서 다시 적재되지 않는다. 그때는 그 날짜의 `limitup_loads.files_sig` 를 비워 재적재를 유도한다.
- 이 quick 에서는 db push · git push · 배포를 하지 않았다.

## 남은 일

- 보고서 차트 라벨 「1천만원 이상」 → 「500만원 이상」 (범위 밖 · 문구 그대로)
- 당일 축 UI(당일 순매수 열 · 전날 요약 등) — 목업 먼저(스케치 018)
- 인박스 노트 `docs/inbox/from-gh-trade/261025-accum-day-axis.md` 는 UI 라벨이 남아 있어 `status: open` 유지(스테이징하지 않음)

## Known Stubs

없음. 새 필드는 데이터 계층에만 있고 화면에는 아직 쓰지 않는다(의도된 범위).

## Self-Check: PASSED

- FOUND: supabase/migrations/20261025200000_limitup_accum_flow_day_axis.sql
- FOUND commits: b10ea63a · 323e5db7 · ee66a5de · 2cf5e807 (HEAD 의 조상)
