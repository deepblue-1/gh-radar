---
phase: quick-261012-qld
plan: 01
subsystem: webapp/trading (상따 LimitChaser)
tags: [gh-trade-inbox, limit-chaser, post-buy, wire]
status: complete
requires: [gh-trade b5a4a6ee (quick-261012-ow7)]
provides:
  - "lc.set postBuyReentry 255 고정 (POST_BUY_REENTRY_UNLIMITED)"
  - "후매수 카드 「최대」 칸 · 요약 kv · 소진 안내 줄 삭제"
  - "줄매수 ☐자동 힌트 · 보유중 LED 툴팁에서 횟수 문구 제거"
affects: [webapp/src/components/trading, webapp/src/lib/limit-chaser.ts]
key-files:
  modified:
    - webapp/src/lib/limit-chaser.ts
    - webapp/src/components/trading/limit-chaser-form.tsx
    - webapp/src/components/trading/strategy-log.tsx
    - webapp/src/components/trading/lc/lc-fields.ts
    - webapp/src/components/trading/lc/setting-group.tsx
    - webapp/src/components/trading/latch-led.tsx
    - webapp/src/lib/__tests__/limit-chaser.test.ts
    - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
    - webapp/src/components/trading/__tests__/strategy-log.test.tsx
    - webapp/src/components/trading/__tests__/latch-led.test.tsx
    - webapp/src/components/trading/lc/__tests__/lc-fields.test.ts
    - webapp/src/components/trading/lc/__tests__/setting-group.test.tsx
    - webapp/src/components/trading/lc/__tests__/inline-navigation.test.tsx
    - webapp/e2e/specs/trading-workbench.spec.ts
    - docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md
decisions:
  - "postBuyReentry 는 buildCfg 의 클라 고정 4번째 필드(255) — ...values 뒤라 폼·에코·84 시딩을 이긴다"
  - "isMasterOnlyDelta · VALUE_COMPARE_SKIP 가 postBuyReentry 를 건너뛴다 — 옛 등록 에코(3)가 D-02 자동 끔을 막거나 「서버 반영 완료」를 세우지 않게"
  - "lcValueTextOf 의 server 인자 제거 — 유일한 소비처(재진입 잔여 표시)가 사라져 죽은 인자"
metrics:
  completed: 2026-10-12
actuals:
  tasks: 3
  commits: 0   # 오케스트레이터가 사용자 확인 후 커밋 (executor 커밋 금지 제약)
---

# Quick 261012-qld: gh-trade 261012 후매수 재진입 무제한 반영 Summary

상따 화면에서 후매수 「최대」 칸 · 「남은 N회」 · 소진 안내 줄을 지우고, 모든 lc.set 이 C# 처럼 `postBuyReentry = 255` 를 싣게 했다. 옛 등록 에코 값(예: 3)은 D-02 자동 끔 판정과 「서버 반영 완료」 로그에서 빠진다.

## 항목별 처리 (인박스 노트 1~7)

| # | 항목 | 처리 |
|---|------|------|
| 1 | 후매수 「최대」 칸 | `lc-fields.ts` 에서 값 행 · `LcNumField` 멤버 · 요약 kv · `lcValueTextOf` 분기를 지웠다. 카드는 금액 → 최소 잔량 → 반등 → 발동잔량 |
| 2 | 줄매수 ☐자동 힌트 | `'줄매수가 풀린 뒤(발주 · 포기 · 버스트 취소) 상한가를 벗어나고 잔고가 0 이면 서버가 줄매수를 다시 켜요'` (후매수 칸 언급 삭제) |
| 3 | 소진 안내 줄 | 안내 문구 상수 · renderRow note 분기 · `LcRowSpec` note 종류 · 정적 안내 줄 컴포넌트(setting-group) 삭제. 「소진」 상태 문구 매핑은 남겼다(옛 gh-trade 상태 파일이 단계 3 을 복원할 수 있음) |
| 4 | 와이어 255 | `POST_BUY_REENTRY_UNLIMITED = 255` export, 기본 폼 값, `buildCfg` 클라 고정 4번째. `isMasterOnlyDelta` · `VALUE_COMPARE_SKIP` 가 이 키를 건너뛴다 |
| 5 | 「버스트 취소」 라벨 | 변경 없음: quick-261012-oif 에서 이미 반영됨(`label: '버스트 취소'` grep 1건 확인) |
| 6 | 테스트 | 단위 · e2e 갱신(아래 검증) |
| 7 | 노트 done | frontmatter `status: done`. `done_commit` 은 **비워 둠**. 오케스트레이터가 커밋한 뒤 해시를 채워야 함 |

보유중 LED 툴팁: `"후매수 보유중 — 산 물량이 전부 정리되면 다시 감시"`. gh-trade `client/Forms/Trading/LimitChaserForm.cs:1562` 원문과 글자 단위로 일치하는 것을 확인했다(「C# 원문」 주석 유지).

## 일부러 남긴 것

- 폼 타입 `LimitChaserFormValues.postBuyReentry` 필드, `formFromServer` 매핑
- 84 시딩 맵 `['postBuyReentry', 'postBuyMaxCount']`: 폼 값에만 시딩되고 전송 때는 255 가 이긴다(주석 추가)
- `lib/lc-ranges.ts` 의 `postBuyReentry` 범위(시딩 `fitsLcRange` 가 사용)
- 「소진」 그룹 상태 매핑
- relay/ · packages/shared · DB · fbs 재동기화 · /me 페이지는 손대지 않음

## Deviations from Plan

**1. [Rule 3 - Blocking] `touchedRef` 타입 확장**
- **발견:** Task 2 typecheck. `LcNumField` 에서 `postBuyReentry` 를 빼자, 84 재시딩 이펙트의 `touchedRef.current.has(field)` 가 `UserSettingsSeed` 키(`postBuyReentry` 포함)를 받지 못해 TS2345 오류가 났다.
- **수정:** `limit-chaser-form.tsx` 의 `touchedRef` 를 `Set<keyof LimitChaserFormValues>` 로 넓히고 이유를 한 줄 주석으로 달았다(시딩 맵은 계획대로 유지).

**2. [Rule 1 - Lint] `lcValueTextOf` 의 `server` 인자 제거**
- **발견:** Task 3 eslint 에서 `'server' is defined but never used` 경고가 났다. 이 인자를 쓰던 곳은 재진입 잔여 표시뿐이었다.
- **수정:** 시그니처를 `(field, values)` 로 줄이고 호출부를 맞췄다(lc-fields 2곳 · form 2곳 · lc-fields.test 12곳). 시트 「지금」 주석의 「잔여」 언급도 정리했다.

**3. [Rule 1] 직접 파생 테스트 2건 추가 수정**
- `limit-chaser.test.ts:653` 의 Phase 24 기본값 테스트(계획 목록 밖): `postBuyReentry: 3` 을 `POST_BUY_REENTRY_UNLIMITED` 로 바꿨다.
- `limit-chaser-form.test.tsx` ⑦ 행 높이 테스트: 행 수를 31 → 30 으로, 44px 행을 22 → 21 로 바꿨다(후매수 「최대」 행 삭제 때문).

**4. 계획 범위 안의 소폭 추가**
- `limit-chaser-form.tsx` 파일 상단 ⑤ 주석: 「클라 고정 3」 → 「4」 로 고치고 255 의 이유를 한 줄 넣었다.
- `setting-group.test.tsx:976` 의 generic `SettingRow` valueText 테스트(label 「최대」 · 「3회 · 남은 2회」)는 컴포넌트 일반 동작 검증이라 그대로 두었다.

## Verification

전부 `--maxWorkers=2` / `--workers=1` 로 실행했고, e2e 는 `-g` 로 거른 케이스만 돌렸다.

| 단계 | 명령 | 결과 |
|------|------|------|
| T1 typecheck | `pnpm --filter @gh-radar/webapp run typecheck` | PASS |
| T1 vitest | `pnpm --filter @gh-radar/webapp exec vitest run src/lib/__tests__/limit-chaser.test.ts src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/strategy-log.test.tsx --maxWorkers=2` | 3 files · 523/523 PASS |
| T1 tracer e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-1 buy3" --workers=1` | 2 passed (setup + P24-1, 게이트웨이 바이트 postBuyReentry 255) |
| T2 vitest | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading/lc/__tests__ src/components/trading/__tests__/limit-chaser-form.test.tsx src/components/trading/__tests__/latch-led.test.tsx --maxWorkers=2` | 10 files · 728/728 PASS |
| T2 e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts -g "P24-1 buy3\|P24-6 \|P24-7 \|P20-3 " --workers=1` | 5 passed (setup + P24-1 · P24-6 · P24-7 · P20-3), 마지막 수정 뒤 재실행해도 5 passed |
| T3 note | `grep "^status: done$"` · `grep "^done_commit:[[:space:]]*$"` | PASS |
| T3 잔재 grep | 4개 UI 소스 파일 대상 residue 패턴 | 0 hit (RESIDUE_CLEAN) |
| T3 eslint | 6개 소스 파일 + lc-fields.test.ts | 0 errors · 0 warnings |
| T3 넓은 회귀 | `pnpm --filter @gh-radar/webapp exec vitest run src/components/trading src/lib/__tests__/limit-chaser.test.ts --maxWorkers=2` | 41 files · 1960/1960 PASS |
| 범위 | `git status --short` | 계획의 files_modified 14개와 untracked 노트·quick 디렉터리만. relay/ · packages/ · supabase/ 변경 없음. 커밋 없음(HEAD 39fd1d48 그대로) |

## Proposed Commit Message (오케스트레이터용, Co-Authored-By 없음)

```
fix(quick-261012-qld): gh-trade 261012 반영 — 상따 후매수 「최대」 칸 · 소진 안내 삭제 · 줄매수 자동 힌트 정리 · lc.set 재진입 255 고정

- 서버가 post_buy_reentry 를 읽지 않음(gh-trade quick-261012-ow7) → buildCfg 클라 고정 4번째로 255(C# 동형)
- 옛 등록 에코(3)는 D-02 자동 끔 판정(isMasterOnlyDelta) · 「서버 반영 완료」(VALUE_COMPARE_SKIP)에서 제외
- 후매수 카드 금액 → 최소 잔량 → 반등 → 발동잔량, 요약 「최대」 kv · 소진 안내 줄 삭제(「소진」 상태 문구는 유지)
- 줄매수 ☐자동 힌트 · 보유중 LED 툴팁에서 횟수 문구 제거(C# 원문 일치)
- lcValueTextOf server 인자 제거(소비처 소멸) · 인박스 노트 status done
```

커밋 후 `docs/inbox/from-gh-trade/261012-lc-reentry-unlimited.md` 의 `done_commit:` 에 해시를 채워야 한다(inbox README 규칙).

## Follow-up (범위 밖)

- `/me` 기본값 페이지(`webapp/src/components/me/limit-chaser-defaults.tsx:95`)에 「후매수 최대」(84 postBuyMaxCount) 칸이 아직 있다. C# 기본값 창은 이 칸을 지웠으므로 별도 quick 으로 처리할 후보다.

## Self-Check: PASSED

- 수정 파일 14개와 노트가 `git status` 에 있음
- 커밋 해시 대상 없음(커밋 금지 제약)
