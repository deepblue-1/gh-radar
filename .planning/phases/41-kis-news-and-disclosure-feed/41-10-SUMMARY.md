---
phase: 41-kis-news-and-disclosure-feed
plan: 10
subsystem: home-ai
status: complete
tags: [home-sync, claude, prompt, stock-feed, disclosure, webapp, home, dedupe]

requires:
  - phase: 41-01 ~ 41-09
    provides: "RPC stock_feed_by_codes(네이버 제목 종목명 조건 20261112320000 포함) · shared mergeStockFeed(시황 제목 제외) · StockFeedKind · isEtpProduct · FeedKindBadge · formatFeedTime"
provides:
  - "shared HomeNewsRef { title · url: string | null · source · kind? · publishedAt? } · homeNewsRefKey(ref)"
  - "home-sync NewsRow(kind · url null · source string · published_at +09:00) · DISCLOSURE_TOP_MAX(2) · loadSurges 3단계 = RPC + mergeStockFeed"
  - "home-sync 프롬프트 공시 줄 `[N] [공시] <코드> <제목> (<자료원> <HH:MM>)` · 시스템 규칙 한 줄 · toHomeNewsRef"
  - "home-sync dedupeNewsByUrl 키 = homeNewsRefKey · Claude 호출 로그 newsLines · disclosureLines"
  - "webapp NewsBlock 링크 없는 줄(data-slot=home-news-disclosure) · 공시 배지 · ThemeCard 건수 키"
affects: [41-11]

actuals:
  tokens: 18288   # chars/4 over 전체 diff(73,150자 · 13파일)
  tasks: 3
  commits: 3
plan_head_before: 2423ac7a9eac844b167d9fdb15ce4dfe9f14998a
plan_head_after: 1a4af278f87040cdc88ea60b644bef35ee5a7922

tech-stack:
  added: []
  patterns:
    - "홈 AI 재료는 server 와 같은 RPC + shared 합치기 — 피드 쪽 거르기(auto_market · 네이버 제목 종목명 · 시황 제목)가 홈 입력에 자동으로 따라온다, home-sync 에 따로 두지 않는다"
    - "링크 없는 줄의 중복 제거 키는 워커 · 웹이 같은 shared 함수(homeNewsRefKey) 하나"

key-files:
  created:
    - packages/shared/src/__tests__/home.test.ts
  modified:
    - packages/shared/src/home.ts
    - packages/shared/src/index.ts
    - workers/home-sync/src/pipeline/loadSurges.ts
    - workers/home-sync/src/pipeline/loadSurges.test.ts
    - workers/home-sync/src/ai/prompt.ts
    - workers/home-sync/src/ai/clusterSurges.ts
    - workers/home-sync/src/ai/prompt.test.ts
    - workers/home-sync/src/ai/clusterSurges.test.ts
    - webapp/src/components/home/news-block.tsx
    - webapp/src/components/home/theme-card.tsx
    - webapp/src/components/home/__tests__/news-block.test.tsx
    - webapp/src/components/home/__tests__/theme-card.test.tsx

key-decisions:
  - "모델 · max_tokens 16000 · effort low 는 지금 값 그대로(77b680e6) — 플랜의 「claude-haiku-4-5 · 8192 그대로」 는 「바꾸지 않는다」 로 읽었다"
  - "home-sync 는 RPC 결과를 mergeStockFeed 로만 합치고 다시 거르지 않는다 — 한투 auto_market · ETP 연결 숨김(RPC) · 네이버 제목 종목명(RPC) · 시황 제목(mergeStockFeed)이 그대로 적용"
  - "top-K = 최근 공시 최대 2 → 나머지(남은 공시 포함)에서 종목명 든 기사 → 최신순. 네이버 줄은 RPC 가 이미 종목명 든 것만 주므로 종목명 우선은 사실상 「네이버 · 종목명 든 한투 > 테마 · 업종 한투」"
  - "newsLines = 공시 아닌 줄 수 · disclosureLines = 공시 줄 수(합 = 입력 인덱스 수) · 정상 종료도 info 로 남긴다(전엔 비정상만 warn)"
  - "링크 없는 줄의 시각은 formatFeedTime(publishedAt, 'news') — 같은 KST 날 HH:MM(공시도 초 없이) · 다른 날 MM/DD"
  - "공시가 링크를 가진 경우(네이버와 합쳐진 줄)는 지금 anchor + 제목 앞 「공시」 배지 · 링크 없는 한투 뉴스는 배지 없이 글자 줄"

patterns-established:
  - "HomeNewsRef 를 만드는 곳은 toHomeNewsRef(NewsRow) 하나 — 프롬프트 인덱스와 테마 뉴스 보강이 같이 쓴다"

requirements-completed: [SC-6]

duration: 약 10분(문맥 읽기 뒤)
completed: 2026-11-12
---

# Phase 41 Plan 10: 홈 급등 요약 AI 가 공시 · 한투 뉴스도 재료로 Summary

**home-sync 가 급등 종목 재료를 `stock_feed_by_codes`(등록 안 함) + shared `mergeStockFeed` 로 읽어 공시 최대 2건을 먼저 넣고, 프롬프트는 공시를 `[공시]` 줄로 구분하며, 홈 카드 근거 목록은 링크 없는 공시를 「공시」 배지 · 글자 제목 · 「코스닥 공시 · 15:15」 로 보인다. 모델 · 출력 상한은 그대로.**

## Performance

- **Started:** 2026-11-12T04:27:07Z
- **Completed:** 2026-11-12T04:36Z
- **Tasks:** 3
- **Files modified:** 13 (생성 1 · 수정 12)

## Accomplishments

- **재료(T1):** `loadSurges` 3단계가 `news_articles` 직접 조회 대신 RPC `stock_feed_by_codes(p_codes, p_since = newsWindowCutoffIso(now), p_per_source 50, p_register false)` 를 청크마다 1회 부르고 종목마다 `mergeStockFeed`. 운영 피드와 같은 거르기가 홈 AI 입력에 그대로 적용된다(41-09 SUMMARY 「남긴 것」 첫 줄 해소).
- **프롬프트(T2):** 공시 줄 꼴 · 시스템 규칙 한 줄 · 인덱스 → 원문 해석에 kind · 시각 · null url · 링크 없는 줄 중복 제거 · 호출 로그 입력 줄 수.
- **표시(T3):** 목업 ④ 그대로 — 링크 없는 줄은 anchor 가 아니고 「↗」 가 없다. 테마 카드 「뉴스 N건 전체 보기」 도 같은 키로 센다.
- **ETP(D-09):** `isExcludedProduct` 몸체가 shared `isEtpProduct` 호출 하나(지역 상수 두 개 삭제 · 570127 주석 유지 · 스팩 통과).

## 프롬프트 공시 줄 예시

```
[0] [공시] 012340 (주)가람전자 단일판매ㆍ공급계약체결 (코스닥 공시 15:15)
[1] 012340 가람전자, 대형 수주 소식에 상한가 — 가람전자 수주 공시
```

뉴스 줄은 이전 꼴 그대로(라운드업 라벨 · 스니펫). 시각은 published_at 을 +9h 뒤 `getUTC*` 로 읽은 KST `HH:MM`.

## 시스템 규칙 문장 (규칙 목록 끝에 한 줄 · few-shot 은 그대로)

> - 뉴스 라인 중 `[공시]` 로 표시된 줄은 거래소·코스닥 공시 제목이다. 종목 특정 재료의 근거로 우선하되, 다른 뉴스와 같이 인덱스로만 인용한다.

## Task Commits

1. **Task 1: HomeNewsRef 확장 · homeNewsRefKey + 합친 피드 로드 · 공시 2건 먼저 · ETP 한 정의** — `6af9791f`
2. **Task 2: [공시] 줄 · 규칙 한 줄 · 원문 해석 kind · 시각 · null url dedupe · 호출 로그** — `0d93c792`
3. **Task 3: 홈 근거 목록 공시 줄 · 링크 없는 줄 dedupe · 테마 카드 건수 키** — `1a4af278`

## 테스트

| 묶음 | 결과 | 이 플랜에서 늘어난 것 |
|---|---|---|
| shared 전체 | 50 files · 1357 passed · 2 skipped | `home.test.ts` 4 (homeNewsRefKey) |
| home-sync 전체 | 10 files · 188 passed | loadSurges 33 → 39 · prompt +5 · clusterSurges 37 → 45 |
| webapp 홈(`src/components/home`) | 6 files · 54 passed | news-block 5 → 10 · theme-card 9 → 10 · solo-card 6 그대로 |
| 타입 검사 | shared · home-sync · webapp(+e2e) · server 0 오류 | |

- loadSurges 기존 케이스는 `news_articles` 목을 RPC 목(`setFeed`)으로 다시 썼다. Pitfall 1(뒤쪽 종목 0건 방지) · 종목명 우선(광진실업) · 48h 창 · 월요일 창은 RPC 인자 · 합친 줄로 같은 뜻을 지킨다.
- 「종목명 든 기사 먼저」 기대값: 네이버 줄은 RPC 가 이미 제목에 종목명 든 것만 주므로, 테스트의 네이버 행은 모두 종목명을 담고 종목명 없는 줄은 한투 뉴스(테마 · 업종)로 만들었다.
- 수용 기준 grep: `export function homeNewsRefKey` 1 · `url: string | null` 1 · loadSurges `stock_feed_by_codes` · `isEtpProduct` 있음 · `from("news_articles")` 없음 · prompt `[공시]` 4 · clusterSurges `homeNewsRefKey` 3 · `disclosureLines` 3 · news-block `home-news-disclosure` 2 · theme-card `homeNewsRefKey` 3 · `seen.has(item.url)` 없음.

## 41-11 이 알아둘 것

- **배포 뒤 첫 1회는 해시가 바뀌어 Claude 를 한 번 더 부른다.** content_hash 입력인 뉴스 id 꼴이 `news_articles.id`(uuid) → `kis:<일련번호>` · `naver:<uuid>` 로 바뀐다. 그 뒤로는 한투 글(공시 포함)이 들어올 때마다 해시가 바뀔 수 있어 호출 수가 늘 수 있다 — 배포 전후 비교는 41-11 몫.
- 호출 로그: 정상 종료 `clusterSurges — Claude 호출 완료`(info) · 비정상 `응답이 정상 종료되지 않음`(warn) 둘 다 `stopReason · outputTokens · maxTokens(16000) · surgeCount · newsLines · disclosureLines`. stop_reason 분포는 이 로그로 본다.
- 저장 payload 의 뉴스 참조에 `kind` · `publishedAt` 이 붙고 공시는 `url: null` 이다. 옛 스냅샷(kind 없음)은 웹이 뉴스로 그린다.
- home-sync 이미지 재배포가 필요하다(shared 변경 포함). webapp 은 push 로 반영 — 워커 배포 전에 push 돼도 옛 스냅샷 모양이라 화면은 그대로다.

## Decisions Made

frontmatter `key-decisions` 6건. 핵심: 모델 · 상한 · effort 불변 · home-sync 는 다시 거르지 않는다 · 공시 2건 → 종목명 → 최신 · 정상 호출도 info 로그.

## Deviations from Plan

### 실행 지시가 플랜보다 우선한 것

**1. 모델 · 출력 상한 문구**
- 플랜은 「`claude-haiku-4-5` 그대로 · 출력 상한 8192 그대로」 였으나 이미 `claude-haiku-5-5` · `max_tokens` 16000 · effort low(77b680e6). 값은 건드리지 않았고, 상한 주석에 플랜의 D-19 한 줄만 더했다.
- 플랜 수용 기준 `git diff -G 'claude-haiku' --name-only e951de6e -- workers/home-sync/src` 는 77b680e6(메인 세션) 때문에 `config.ts` · `clusterSurges.test.ts` 가 나온다. 이 플랜 기준(`git diff -G 'claude-haiku' 2423ac7a HEAD -- workers/home-sync/src`)은 빈 출력 — 이 플랜은 모델 문자열을 바꾸지 않았다.

**2. home-sync 에 별도 필터 없음**
- 지시대로 시황 제목 · 네이버 종목명 · auto_market 을 home-sync 에 다시 구현하지 않았다(RPC · mergeStockFeed 가 한다). 테스트 「D-19 합치기는 shared mergeStockFeed」 가 시황 제목 제외 · 한투 ↔ 네이버 합침이 홈 입력에 적용되는 것을 보인다.

### files_modified 밖

**3. `packages/shared/src/__tests__/home.test.ts` 새 파일**
- 이유: Task 1 behavior 첫 항목(`homeNewsRefKey` 의 url · 「자료원|제목」)을 정의한 패키지에서 바로 잠그려고. shared 의 다른 순수 함수(etp 등)와 같은 자리.

### TDD

- 세 태스크 모두 `tdd="true"` 지만 RED 커밋을 따로 두지 않고 테스트와 구현을 한 커밋에 넣었다(실행 지시의 커밋 단위 — 태스크당 1커밋). 새 동작 테스트는 옛 구현에서 실패하는 꼴로 썼다(예: 테마 카드 건수 테스트는 url 로 세면 3이라 버튼이 없다).

### 중간 커밋의 타입 상태

- Task 1 커밋(`6af9791f`) 시점에는 `HomeNewsRef.url` 이 넓어져 home-sync `prompt.ts` · `clusterSurges.ts` 가 타입 오류(3건)였다 — Task 2 파일이라 Task 2 커밋(`0d93c792`)에서 풀렸다. 최종 HEAD 는 모든 타입 검사 0 오류.

**Total deviations:** 지시 우선 2 · 파일 1 · 절차 2. 동작 · 이름은 플랜 Artifacts 와 같다(`DISCLOSURE_TOP_MAX` · `homeNewsRefKey` · `newsLines` · `disclosureLines` · `data-slot="home-news-disclosure"`). `toHomeNewsRef` 만 추가.

## Issues Encountered

- 워크트리에 `node_modules` 가 없어 `pnpm install --frozen-lockfile --prefer-offline` 으로 채웠다(락파일 변경 없음).
- 하네스가 복합 명령(heredoc 안 긴 스크립트 · 변수 경로 git)을 막아 편집 스크립트를 스크래치 파일로 두고 단계별로 돌렸다.

## Known Stubs

없음.

## User Setup Required

없음 — 배포 · 호출 수 비교는 41-11.

## Self-Check: PASSED

- FOUND: packages/shared/src/__tests__/home.test.ts · 수정 12파일
- FOUND: 6af9791f · 0d93c792 · 1a4af278 (HEAD 조상)
- 플랜 verification: home-sync 전체 테스트 · typecheck · webapp 홈 테스트 · webapp · server typecheck 통과
- STATE.md · ROADMAP.md · state.json 수정 없음

---
*Phase: 41-kis-news-and-disclosure-feed*
*Completed: 2026-11-12*
