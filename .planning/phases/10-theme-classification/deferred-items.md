# Phase 10 Deferred Items

- [10-05 발견] `webapp/src/components/stock/__tests__/discussion-page-client.test.tsx` 3개 테스트 실패 (Phase 08.1 filter toggle). 테마 작업과 무관한 사전 실패 — SCOPE BOUNDARY 에 따라 미수정. theme-api.test.ts 는 별도 green 검증.
- [10-05 발견] `pnpm -F webapp lint` 환경 실패: eslint-config-next 가 eslint-plugin-import(스토어 존재) 를 resolve 못함 (pnpm hoisting/peer 이슈). 내 코드 무관 — 빌드(tsc+next compile)는 exit 0. SCOPE BOUNDARY 미수정.
- [10-08 재확인] `pnpm -F webapp build` 의 ESLint 단계 동일 경고(eslint-plugin-import resolve 실패) 잔존. build 는 여전히 exit 0(Compiled successfully + static 10/10). 신규 theme E2E spec 3종은 `playwright test --list` 로 컴파일·디스커버리 green(11 tests). 사전 tooling gap — SCOPE BOUNDARY 미수정.
