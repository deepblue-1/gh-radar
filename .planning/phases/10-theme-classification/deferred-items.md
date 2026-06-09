# Phase 10 Deferred Items

- [10-05 발견] `webapp/src/components/stock/__tests__/discussion-page-client.test.tsx` 3개 테스트 실패 (Phase 08.1 filter toggle). 테마 작업과 무관한 사전 실패 — SCOPE BOUNDARY 에 따라 미수정. theme-api.test.ts 는 별도 green 검증.
- [10-05 발견] `pnpm -F webapp lint` 환경 실패: eslint-config-next 가 eslint-plugin-import(스토어 존재) 를 resolve 못함 (pnpm hoisting/peer 이슈). 내 코드 무관 — 빌드(tsc+next compile)는 exit 0. SCOPE BOUNDARY 미수정.
