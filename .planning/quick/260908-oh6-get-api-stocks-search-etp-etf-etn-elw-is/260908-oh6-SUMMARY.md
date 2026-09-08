---
phase: quick-260908-oh6
plan: 01
subsystem: server-api
tags: [search, etp-filter, regression, tdd]
requires:
  - "stocks.security_group (NOT NULL DEFAULT '주권', master-sync 적재)"
  - "stocks.is_delisted"
provides:
  - "/api/stocks/search 의 ETP(ETF/ETN/ELW) + 상장폐지 제외 계약"
  - "supabase-mock 빌더의 .not(col,'in',literal) 지원"
affects:
  - "webapp 종목검색 드롭다운 (webapp/src/lib/stock-api.ts 소비)"
tech-stack:
  added: []
  patterns:
    - "PostgREST 최상위 필터 AND 결합 — .or(...) 는 하나의 AND 항이라 ilike 매치 의미 보존"
    - "블랙리스트(NOT IN) 방식 — 기존 SQL 선례 4곳과 대칭"
key-files:
  created: []
  modified:
    - server/src/routes/stocks.ts
    - server/tests/routes/search.test.ts
    - server/tests/fixtures/supabase-mock.ts
    - server/tests/fixtures/stocks.ts
decisions:
  - "화이트리스트가 아닌 블랙리스트 2종만 (ETF/ETN/ELW + is_delisted=false) — 부동산투자회사·외국주권·주식예탁증권·'미확인' sentinel 은 계속 검색"
  - "종목명 패턴(/ETN|ETF|인버스|레버리지/) fallback 미채택 — 이름 패턴에 걸리며 group 이 ETP 가 아닌 활성 행 0건, 정상 주식 오배제 위험만 남음"
  - "MASTER_COLS 에 security_group 미추가 — PostgREST 는 select 하지 않은 컬럼으로도 필터 가능, 응답 스키마 계약 불변"
  - "supabase-mock .not() 은 미지원 연산자를 no-op 아닌 throw — 목의 거짓 통과 차단"
metrics:
  duration: "~7분"
  completed: "2026-09-08"
  tasks: 2
  files: 4
  tests_before: "31 files / 264 tests"
  tests_after: "31 files / 268 tests"
---

# Quick 260908-oh6: /api/stocks/search ETP·상폐 제외 Summary

`/api/stocks/search` 마스터 쿼리에 `.not("security_group","in",'("ETF","ETN","ELW")')` +
`.eq("is_delisted", false)` 두 줄을 체이닝해, ELW/ETF 가 name-asc 앞자리를 점거하며 실제 주권을
`limit 20` 밖으로 밀어내던 회귀(삼성전자·현대차·카카오 응답 탈락)를 해소했다.

## 배경 (재조사 불필요 — PLAN 의 운영 DB 실측 인용)

커밋 `c3d679d` 가 master-sync 의 ETP 코드 필터를 `^\d{6}$` → `^[0-9A-Z]{6}$` 로 넓히면서
stocks 마스터가 3,999 → 7,453 행이 되었다(ELW 2,735 · 영문코드 ETF 303 신규 유입). 이 확대는
스캐너 ETF 오염 차단에 필요했던 것이라 되돌릴 대상이 아니었다. 문제는 스캐너(화이트리스트)·
home-sync(제외집합)와 달리 **`/search` 만 마스터를 무필터로 읽는 유일한 사용자 표면**이라는 점.

| 검색어 | 변경 전 매치 | 회귀 후 매치 | 실제 주식 name-asc 순위 |
|---|---|---|---|
| 하이닉스 | 3건 | 17건 (ETF 15) | 1위 → 11위 |
| 삼성전자 | 4건 | 200건 (ELW 182) | 3위 → 84위 **응답 탈락** |
| 현대차 | 7건 | 110건 (ELW 98) | 3위 → 106위 **응답 탈락** |
| 카카오 | 4건 | 81건 (ELW 76) | 1위 → 24위 **응답 탈락** |

## Tasks

### Task 1 — 테스트 목 `.not()` + 마스터 픽스처 `security_group` (commit `d313fb5`)

- `server/tests/fixtures/supabase-mock.ts`: 빌더에 `not(col, operator, value)` 추가.
  `operator !== "in"` 이면 명시 `throw`(CLAUDE.md "무로그 fail-safe 금지" — no-op 통과시키면
  목이 라우트 회귀를 못 잡는다). `in` 일 때 PostgREST 리터럴 `("ETF","ETN","ELW")` 를
  괄호 제거 → `,` 분리 → trim → 큰따옴표 제거 → Set 구성으로 파싱하고 builder 를 반환해
  `.or().not().eq().order().limit()` 체이닝을 유지한다. 컬럼이 행에 없으면(`undefined`)
  제외하지 않는 관용을 주석으로 명시(프로덕션 `security_group` 은 NOT NULL 이라 발생 불가 경로).
- `server/tests/fixtures/stocks.ts`: 테스트 로컬 별칭
  `MasterFixture = StockMasterRow & { security_group?: string | null }` 도입.
  `samsungMaster`/`masterOnly` 에 `security_group: "주권"` 명시. **`allMasters` 구성원은 불변**
  (stock-detail·scanner 가 공유 — blast radius 차단). 회귀 전용 새 export:
  `hynixMaster`(000660 주권), `hynixEtfMasters`(ETF 3건), `delistedSamsungMaster`(425290 상폐 주권),
  `reitMaster`(448730 부동산투자회사), `unknownGroupMaster`(465000 '미확인'),
  `makeElwCrowd(n)`(`미래M073삼성전자콜NN`, ELW).

**검증 (실제 출력):**

```
$ tsc --noEmit
(exit 0, 출력 없음)

$ pnpm -F @gh-radar/server exec vitest run tests/routes/search.test.ts tests/routes/stock-detail.test.ts tests/routes/scanner.test.ts tests/routes/themes.test.ts
 Test Files  4 passed (4)
      Tests  47 passed (47)

$ grep -n "not:" server/tests/fixtures/supabase-mock.ts
135:      not: vi.fn().mockImplementation(
```

라우트 미변경 상태에서 4개 스위트 전부 green — 픽스처/목 확장이 기존 계약을 건드리지 않았음을 확인.

### Task 2 — RED → GREEN (commit `ec6cceb`)

#### RED — 라우트 수정 **전** 실행한 실제 실패 출력

```
$ pnpm -F @gh-radar/server exec vitest run tests/routes/search.test.ts

 ❯ tests/routes/search.test.ts (14 tests | 3 failed) 51ms
     × q=삼성전자 → ELW 25건이 앞자리를 채워도 주권 005930 이 응답에 남는다 (crowd-out 해소) 10ms
     × q=하이닉스 → ETF 는 제외되고 주권 000660 이 응답에 있다 4ms
     × q=삼성 → 상장폐지 종목(is_delisted=true)은 응답에 없다 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=삼성전자 → ELW 25건이 앞자리를 채워도 주권 005930 이 응답에 남는다 (crowd-out 해소)
AssertionError: expected [ '5001KE', '5002KE', '5003KE', …(17) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "5001KE",
+   "5002KE",
+   "5003KE",
+   "5004KE",
+   "5005KE",
+   "5006KE",
+   "5007KE",
+   "5008KE",
+   "5009KE",
+   "5010KE",
+   "5011KE",
+   "5012KE",
+   "5013KE",
+   "5014KE",
+   "5015KE",
+   "5016KE",
+   "5017KE",
+   "5018KE",
+   "5019KE",
+   "5020KE",
+ ]

 ❯ tests/routes/search.test.ts:91:50
     89|     expect(r.status).toBe(200);
     90|     const codes = codesOf(r.body);
     91|     expect(codes.filter((c) => elwCodes.has(c))).toEqual([]);
       |                                                  ^
     92|     expect(codes).toContain("005930");
     93|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=하이닉스 → ETF 는 제외되고 주권 000660 이 응답에 있다
AssertionError: expected [ '0011E0', '0022F0', '0033G0' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "0011E0",
+   "0022F0",
+   "0033G0",
+ ]

 ❯ tests/routes/search.test.ts:102:50
    100|     expect(r.status).toBe(200);
    101|     const codes = codesOf(r.body);
    102|     expect(codes.filter((c) => etfCodes.has(c))).toEqual([]);
       |                                                  ^
    103|     expect(codes).toContain("000660");
    104|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=삼성 → 상장폐지 종목(is_delisted=true)은 응답에 없다
AssertionError: expected [ '425290', '005930' ] to not include '425290'
 ❯ tests/routes/search.test.ts:115:23
    113|     expect(r.status).toBe(200);
    114|     const codes = codesOf(r.body);
    115|     expect(codes).not.toContain(delistedSamsungMaster.code);
       |                       ^
    116|     expect(codes).toContain("005930");
    117|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 11 passed (14)
   Start at  17:51:25
   Duration  580ms (transform 165ms, setup 27ms, import 425ms, tests 51ms, environment 0ms)

undefined
/Users/alex/repos/gh-radar/server:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run tests/routes/search.test.ts
```

**RED 판독:**
- crowd-out 재현 성공 — 주권 1건 + ELW 25건 중 응답 20건이 **전부 ELW**(`5001KE`~`5020KE`),
  `005930` 은 `limit 20` 밖으로 탈락. 운영 실측(삼성전자 3위→84위)과 동일한 메커니즘.
- ETF 3건(`0011E0`/`0022F0`/`0033G0`)이 그대로 응답에 노출.
- 상폐 `425290` 이 응답에 포함 — `is_delisted` 필터 부재 확인.
- 과잉필터 가드 1건은 수정 전에도 통과(설계대로). 실패는 정확히 3건, TypeError 없음
  (`.not()` 은 Task 1 에서 이미 목에 구현했고 라우트가 아직 호출하지 않는 상태였다).

#### GREEN — 라우트 수정 후 실제 통과 출력

`server/src/routes/stocks.ts` `/search` 핸들러 (`.or(...)` 와 `.order(...)` 사이 =
"매치 → 제외 → 정렬 → limit" 순):

```ts
      .or(`name.ilike.%${q}%,code.ilike.%${q}%`)
      .not("security_group", "in", '("ETF","ETN","ELW")')
      .eq("is_delisted", false)
      .order("name", { ascending: true })
      .limit(20);
```

왜 블랙리스트인지 / 왜 이름 패턴 fallback 을 안 쓰는지 / 왜 `'미확인'` 을 통과시키는지를
한글 주석으로 남겼다(기존 SQL 선례 4곳과의 대칭 언급 포함).

```
$ pnpm -F @gh-radar/server exec vitest run tests/routes/search.test.ts --reporter=verbose

 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q=삼성전자 → 마스터 매치 + 시세 병합 15ms
 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q=005930 → code 매치 2ms
 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q=신규상장 → 마스터 매치 + 시세 부재 → price=0 (em-dash) 2ms
 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q=존재하지않는키워드xyz → 빈 배열 2ms
 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q 누락 → 400 3ms
 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q 빈 문자열 → 400 2ms
 ✓ tests/routes/search.test.ts > /api/stocks/search (마스터 universe + LEFT JOIN stock_quotes) > q=삼성 (2자) → ilike 매치로 005930 포함 2ms
 ✓ tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=삼성전자 → ELW 25건이 앞자리를 채워도 주권 005930 이 응답에 남는다 (crowd-out 해소) 2ms
 ✓ tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=하이닉스 → ETF 는 제외되고 주권 000660 이 응답에 있다 4ms
 ✓ tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=삼성 → 상장폐지 종목(is_delisted=true)은 응답에 없다 2ms
 ✓ tests/routes/search.test.ts > ETP/상폐 제외 회귀 (quick-260908-oh6) > q=삼성 → 부동산투자회사·'미확인' sentinel 은 계속 검색된다 (과잉필터 가드) 9ms
 ✓ tests/routes/search.test.ts > sanitizeSearchTerm (회귀) > removes ,()% 0ms
 ✓ tests/routes/search.test.ts > sanitizeSearchTerm (회귀) > preserves Korean/English/digits 0ms
 ✓ tests/routes/search.test.ts > sanitizeSearchTerm (회귀) > removes single quote (MED-1) 0ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

server 전량 스위트 + typecheck:

```
$ pnpm -F @gh-radar/server exec vitest run
 Test Files  31 passed (31)
      Tests  268 passed (268)
   Start at  17:52:52
   Duration  2.55s (transform 1.73s, setup 752ms, import 11.40s, tests 1.65s, environment 2ms)

$ pnpm -F @gh-radar/server typecheck
$ tsc --noEmit
(exit 0, 출력 없음)
```

**baseline 대비:** 실행 전 `31 files / 264 tests` → 실행 후 `31 files / 268 tests` (+4, 회귀 0).

## 계약 무변경 확인 (diff 기반)

```
$ git diff --stat HEAD~2 HEAD
 server/src/routes/stocks.ts            |  16 +++-
 server/tests/fixtures/stocks.ts        | 133 ++++++++++++++++++++++++++++++++-
 server/tests/fixtures/supabase-mock.ts |  34 +++++++++
 server/tests/routes/search.test.ts     |  73 +++++++++++++++++-
 4 files changed, 252 insertions(+), 4 deletions(-)

$ git diff -U0 server/src/routes/stocks.ts | grep -E '^[+-]' | grep -v '^[+-][+-]' \
    | grep -E 'MASTER_COLS|limit\(20\)|order\("name"|sanitizeSearchTerm'
+    // security_group 은 필터에만 쓰고 MASTER_COLS 에는 넣지 않는다 (PostgREST 는 select
```

유일한 매치는 **새로 추가한 주석 라인**이며 `MASTER_COLS` 상수 · `.limit(20)` ·
`.order("name", { ascending: true })` · `sanitizeSearchTerm` 호출은 diff 상 변경되지 않았다.
`/api/stocks/:code` 상세 핸들러도 무변경(ETF/ETN/ELW/상폐 종목 상세 직접 진입은 그대로 200).

key_links 패턴 확인:

```
$ grep -nE '\.not\(\s*["'\'']security_group["'\'']' server/src/routes/stocks.ts
77:      .not("security_group", "in", '("ETF","ETN","ELW")')
$ grep -nE '\.eq\(\s*["'\'']is_delisted["'\'']\s*,\s*false' server/src/routes/stocks.ts
78:      .eq("is_delisted", false)
$ grep -nE 'not:\s*vi\.fn' server/tests/fixtures/supabase-mock.ts
135:      not: vi.fn().mockImplementation(
```

## Success Criteria

| # | 기준 | 상태 | 증거 |
|---|---|---|---|
| 1 | 응답에 `security_group ∈ {ETF,ETN,ELW}` 0건 | ✅ | crowd-out(ELW)·ETF 테스트 green, RED 시 각각 20건/3건 노출 |
| 2 | 응답에 `is_delisted=true` 0건 | ✅ | 상폐 제외 테스트 green (RED 시 `425290` 포함) |
| 3 | ELW/ETF 앞자리 점거 시에도 주권이 limit 20 안에 잔존 | ✅ | 주권 1 + ELW 25 조합에서 `005930` 포함 |
| 4 | 부동산투자회사·`'미확인'` sentinel 계속 검색 | ✅ | 과잉필터 가드 테스트 green (`448730`·`465000` 포함) |
| 5 | limit 20 · order name asc · MASTER_COLS · sanitizeSearchTerm · `/:code` 무변경 | ✅ | 위 diff 검사 |
| 6 | server 전량 green + typecheck | ✅ | 31 files / 268 tests, `tsc --noEmit` exit 0 |

## Deviations from Plan

계획 범위 밖 이탈 없음. 계획이 예시로만 남긴 세부는 재량으로 확정:

- 픽스처 코드/명: ETF `0011E0`/`0022F0`/`0033G0`, 상폐 `425290`(삼성스팩4호), 리츠 `448730`
  (삼성FN리츠), 미확인 `465000`, ELW `5001KE`~ (`미래M073삼성전자콜NN`).
  `미래…` < `삼성전자` (한글 정렬 미 < 삼), `ACE …`/`KODEX …` < `SK하이닉스` 는 Node
  `localeCompare` 로 사전 확인 후 채택 — 목 정렬이 실제 name-asc 를 재현함을 보장하기 위함.
- `.not()` 파싱 세부: 미지원 연산자 throw + 리터럴 형식 위반 시 throw 2단 가드.
- Task 2 커밋에 `supabase-mock.ts` 포매팅 1건 포함(`not: vi\n.fn()` → `not: vi.fn()`).
  PLAN key_links 의 `not:\s*vi\.fn` 패턴을 만족시키기 위한 순수 포맷 변경이며 동작 무영향
  (레포에 prettier 설정 없음 — 포맷 강제 도구 부재 확인 후 적용).

## Known Stubs

없음. 스텁·플레이스홀더·TODO 를 추가하지 않았다.

## Threat Flags

없음. 본 변경은 정적 리터럴 필터 2개만 추가하며 사용자 입력이 닿는 표면
(`sanitizeSearchTerm` → `.or()` or-expr)은 그대로다. `MASTER_COLS` 미변경이라
`security_group` 은 응답에 노출되지 않는다(T-oh6-03 accept 유지).

## 배포 필요 사항

- **server 재배포 필요** — Cloud Run service `gh-radar-server` (변경 파일이 서버 라우트).
- **마이그레이션 불필요** — `security_group`·`is_delisted` 컬럼은 이미 존재.
- **백필 불필요** — 읽기 필터만 추가, 데이터 변경 없음.
- 배포·push 는 executor 가 수행하지 않았다. 오케스트레이터가 사용자 승인 후 처리.

## Commits

| 태스크 | 커밋 | 메시지 |
|---|---|---|
| 1 | `d313fb5` | test(quick-260908-oh6): supabase 목에 .not(in) 추가 + 마스터 픽스처 security_group 명시 |
| 2 | `ec6cceb` | fix(quick-260908-oh6): /api/stocks/search 에서 ETF·ETN·ELW·상장폐지 종목 제외 |

## Self-Check: PASSED

- 파일 5/5 존재 (수정 4 + SUMMARY 1)
- 커밋 2/2 존재 (`d313fb5`, `ec6cceb`)
- SUMMARY 인용 diff --stat 을 실제 `git diff --stat HEAD~2 HEAD` 출력으로 정정 후 재확인
