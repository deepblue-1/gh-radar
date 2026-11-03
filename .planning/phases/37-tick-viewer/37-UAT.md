---
status: testing
phase: 37-tick-viewer
source: [37-VERIFICATION-R2.md]
started: 2026-11-04T07:55:00+09:00
updated: 2026-11-04T07:55:00+09:00
---

## Current Test

number: 1
name: 오늘 밤 19:55 따라잡기 · 20:01 마감 마무리 · 20:10 승격이 새 코드로 처음 도는 것을 로그로 확인
expected: |
  radar-gw `docker logs tickgw` 에 `catchup start` · `catchup done`(keys · caught · lost=0 · left) · `close sweep done` 이 있고 19:59:00 뒤 따라잡기 질의가 없다.
  지금 보던 종목은 19:55~20:00 에도 5초 증분이 붙고(delayed 아님) 마감 뒤 closed 다(R3-WR-01).
  20:10 `[tick-convert] mode=promote … failed=0` · 0건 키가 있어도 Job 종료 0 · 압축 건너뜀 키는 export 에서 빠진다(unclosed).
awaiting: user response

## Tests

### 1. 오늘 밤 19:55 따라잡기 · 20:01 마감 마무리 · 20:10 승격이 새 코드(tickgw 517033a2 · Job 517033a2)로 처음 도는 것을 로그로 확인
expected: tickgw 로그 `catchup done … lost=0` · 19:59 뒤 따라잡기 질의 없음 · 보던 종목 증분 유지 · `close sweep done` · 20:10 promote `failed=0` · 승격 키 `tick_grids.sources = {promoted}`
result: [pending]

### 2. 요청 변환 실측 수치 기록(SC 3 — 1라운드부터 이월된 기록 공백)
expected: 격자 · 승격이 없는 비대상 종목 하나를 열어 「변환 중 · 약 N분 → 자동 열림」 소요와, 같은 종목 동시 요청이 Cloud Run 실행 1회로 합쳐지는지를 기록한다(기능은 UAT C 로 확인됨 · 수치만 비어 있음)
result: [pending]

### 3. 동작이 바뀐 운영 규칙 판단(R2 · R3 수정)
expected: |
  (a) 19:55~21:00 승격 입력 보호 — 지금 보는 종목은 강 보호, 승격 입력은 약 보호(보는 종목이 자리가 필요할 때만 마지막에 지움), 따라잡기는 캐시 상한의 25% 를 남김(R3-WR-01). 그 결과 캐시가 꽉 찬 날엔 아무도 안 보던 일부 종목이 승격에서 빠질 수 있다 — 수용 가능한가.
  (b) nightly 결정적 실패 2회 초과 날짜는 포기 · 포기 직후 실행에서만 알림(R3-WR-02) · 크래시 포기 날짜는 `smoke-tick-convert.sh` 의 TASK_TIMEOUT · MEMORY override 로 수동 재변환 — 알림 설계 의도와 맞는가.
  (c) 인덱서 75(색인 준비 안 됨)가 이어지면 전역 대기 5→15→30→60초(R2-IN-05) — 장중 체감 지연이 없는가.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
