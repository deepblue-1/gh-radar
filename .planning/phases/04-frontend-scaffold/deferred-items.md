# Phase 4 Deferred Items

실행 중 발견했으나 Phase 4 범위 밖이라 이관한 항목.

## ESLint Config 경고 (Phase 3 이월)

`next build` 시 다음 경고 발생:

```
⨯ ESLint: Cannot find package '@eslint/eslintrc' imported from webapp/eslint.config.mjs
```

- 빌드 자체는 성공(`✓ Compiled successfully`, `✓ Generating static pages`). 린트 단계에서만 경고.
- Phase 3 기본 스캐폴드에서 설정된 `eslint.config.mjs` 구조 문제로, Phase 4 작업과 무관.
- 해결 방안: `@eslint/eslintrc` 를 devDependency 로 추가하거나 `eslint.config.mjs` 를 flat config 순정으로 재작성.
- **처리 시점:** Phase 5 초 또는 별도 chore PR.
