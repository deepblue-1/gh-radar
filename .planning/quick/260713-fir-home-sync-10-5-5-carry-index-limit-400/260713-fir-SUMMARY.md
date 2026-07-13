# Quick Task 260713-fir: home-sync 급등테마 갱신 주기 10분→5분 완화 — Summary

**Date:** 2026-07-13
**Status:** 코드 3/3 완료·커밋. 배포는 checkpoint(human-verify)로 이관.

## Tasks

| Task | 내용 | Commit | Files |
|------|------|--------|-------|
| 1 | computeSlot 5분 슬롯화(`/10`→`/5`) + hash-match carry 시 changeRate 최신화 (TDD) | 7397f18 | workers/home-sync/src/index.ts, index.test.ts |
| 2 | server home 라우트 index limit 200→400 + 주석 갱신 | b24b696 | server/src/routes/home.ts |
| 3 | deploy-home-sync.sh SCHEDULE `*/10`→`*/5` + 주석 갱신 (편집·커밋만, 배포는 게이트) | 9578653 | scripts/deploy-home-sync.sh |

## 구현 요점

- **5분 슬롯:** `slotMinute = Math.floor(min / 5) * 5` (00/05/…/55). afterClose/marketStatus 조건식(`slotMinute > 30` / `>= 30`)은 수정 없이 5분 슬롯에서도 성립 — 15:30 종가 슬롯 실행, 15:35+ skip을 테스트로 증명.
- **carry 등락률 최신화:** hash-match clone-append 시 payload의 `themes[].stocks[].changeRate`/`singles[].changeRate`를 이번 사이클 loadSurges의 최신값으로 in-place 덮어쓰기 (배열 순서 유지 — 프론트 theme-card가 표시 시점에 재정렬). Claude 호출 추가 0. transient-empty 가드(surges 0) 경로는 최신 시세 소스가 없어 기존 그대로.
- **index limit 400:** 5분 슬롯(하루 ~91개)에서 네비게이션 커버리지 ~4일 유지.

## Verification

- workers/home-sync vitest 65/65 (index.test.ts 18/18 — 15:34/15:35 경계, carry 등락률 갱신, 기존 회귀 없음), typecheck clean
- server home.route.test.ts 6/6 (limit 400 회귀 없음)
- deploy 스크립트 잔여 "10분" 참조 0, `*/5 8-15 * * 1-5` 확인

## 남은 작업 (checkpoint)

1. `GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar bash scripts/deploy-home-sync.sh`
2. scheduler describe로 `*/5 8-15 * * 1-5` 확인
3. smoke-home-sync.sh 검증
