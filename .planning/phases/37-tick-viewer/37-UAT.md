---
status: testing
phase: 37-tick-viewer
source: [37-VERIFICATION-R2.md]
started: 2026-11-04T07:55:00+09:00
updated: 2026-11-04T20:20:00+09:00
---

## Current Test

number: 2
name: 요청 변환 실측 수치 기록(SC 3)
expected: |
  격자 · 승격이 없는 비대상 종목 하나를 열어 「변환 중 · 약 N분 → 자동 열림」 소요와, 같은 종목 동시 요청이 Cloud Run 실행 1회로 합쳐지는지 기록
awaiting: user response

## Tests

### 1. 오늘 밤 19:55 따라잡기 · 20:01 마감 마무리 · 20:10 승격이 새 코드(tickgw 517033a2 · Job 517033a2)로 처음 도는 것을 로그로 확인
expected: tickgw 로그 `catchup done … lost=0` · 19:59 뒤 따라잡기 질의 없음 · 보던 종목 증분 유지 · `close sweep done` · 20:10 promote `failed=0` · 승격 키 `tick_grids.sources = {promoted}`
result: pass
observed: |
  2026-11-04 tickgw 517033a2 · Job 517033a2 관측.
  - 19:55:00 `catchup start keys=16` → 16키 모두 `catchup stopped (cache full)`(캐시 89,986,723B > 따라잡기 몫 72MB) → 19:59:00 `catchup done keys=16 caught=0 lost=0 left=0 calls=16 bytes=6,139,365`. 19:59 뒤 따라잡기 질의 0(인덱서 호출은 19:55 16회 · 20:01 16회뿐).
  - 20:01:06 `close sweep done closed=16` — `compressed files skipped` · `records skipped` · `close gave up` · `cache evict` 0.
  - 20:10 promote(gh-radar-tick-convert-promote-nxkn5, 성공 1): `keys=16 written=16 skipped=0 incomplete=0 unclosed=0 failed=0 too_large=0 bytes_read=96,637,192 ms=63,304`.
  - 그 시간대 리스가 살아 있는(보던) 키 0 — 「보던 키 delayed 아님」 은 오늘 관측 대상 없음(시험 R3-WR-01 로 잠금).
  - 발견 → 수정: 보는 키가 없는데도 25% 예비분 때문에 따라잡기가 헛돌았다(caught 0 · 6.1MB 버림). 예비분은 강 보호 키가 있을 때만 · 자리가 0 이면 호출하지 않게 고침(`6dc9b62c` · tickgw 시험 74 · 21:00 뒤 배포). 오늘은 20:01 마무리 시점에 아직 압축 전이라 16/16 승격됐다.

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
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
