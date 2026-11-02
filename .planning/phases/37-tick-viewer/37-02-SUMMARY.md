---
phase: 37-tick-viewer
plan: 02
subsystem: shared-decoder
status: complete
tags: [ticks, pcap, zstd, decoder, golden, tickana, pcap2parquet, bigint]

requires:
  - phase: gh-trade tickana
    provides: "packets.py LAYOUTS · pcap2parquet.convert_file(파이썬 정본) · 로컬 원본 pcap(컷 13시 · 10/14 09시)"
provides:
  - "packages/shared/src/ticks/framing.ts — REC_HDR · TICK_FMT `pcapns-rec+zstd/1` · iterRecords · encodeRecord · concatBytes · PcapNsReader · RawPacket · PcapFormatError · splitZstdFrames(추가)"
  - "packages/shared/src/ticks/layouts.ts — LAYOUTS(A3 · B6 · R8 · B9 · C3 · A0) · checkLayout · layoutOf · layoutKey · LayoutError · *_LAYOUT 6종"
  - "packages/shared/src/ticks/decode.ts — 파서 7종 · exchangeOf · marketOf · decodeFields · rawHeadOf · decodeAny"
  - "packages/shared/src/ticks/route.ts — ISIN_OFFSET · tagOf · isinKeyOf · exchangeLabelOf · hits15 · DayRateTracker"
  - "scripts/tick-oracle/{oracle.py,gen-fixtures.sh} 부명령 layouts · decode — 37-03 · 37-05 가 부명령을 더한다"
  - "packages/shared/src/__fixtures__/ticks/ 픽스처 7개 + README · 테스트 헬퍼 tick-digest.ts(canonOf · columnDigest · readTicksZst · readTickJson · tickFixturePath)"
affects: [37-03, 37-05, 37-06, 37-08, 37-12, 37-13, 37-15, 37-18, tickgw]

actuals:
  tokens: 100075      # chars/4 over 텍스트 diff 전체(생성 JSON 포함 400,301자) · 손으로 쓴 코드만은 89,145자 ≈ 22,286
  tasks: 2
  commits: 3          # MEASURED: git rev-list --count a43ca660..6a039a6f (SUMMARY 커밋 제외)
plan_head_before: a43ca660900410acb330f4b52166b3a5aec8cc13
plan_head_after: 6a039a6fda8b581c642f06b360e242b97edd37ab

tech-stack:
  added: []
  patterns:
    - "오라클 골든: 파이썬 정본 출력 → 열마다 canon 문자열 sha256 + 앞 30행 JSON — 손으로 쓴 기대값 없음"
    - "레이아웃은 데이터 + 파이썬과 같은 빌더 루프 · import 때 자체검사 · 파이썬 덤프와 deep-equal"
    - "recv_ns · *_ns 는 언제나 BigInt · 숫자 필드는 2^53 안이면 number, 넘으면 bigint(int64 감김 재현)"

key-files:
  created:
    - packages/shared/src/ticks/framing.ts
    - packages/shared/src/ticks/layouts.ts
    - packages/shared/src/ticks/decode.ts
    - packages/shared/src/ticks/route.ts
    - packages/shared/src/ticks/index.ts
    - scripts/tick-oracle/oracle.py
    - scripts/tick-oracle/gen-fixtures.sh
    - packages/shared/src/__fixtures__/ticks/README.md
    - packages/shared/src/__fixtures__/ticks/layouts.json
    - packages/shared/src/__fixtures__/ticks/cut1300-krx.ticks.zst
    - packages/shared/src/__fixtures__/ticks/cut1300-krx.decode.json
    - packages/shared/src/__fixtures__/ticks/cut1300-nxt.ticks.zst
    - packages/shared/src/__fixtures__/ticks/cut1300-nxt.decode.json
    - packages/shared/src/__fixtures__/ticks/raw20k-0900.ticks.zst
    - packages/shared/src/__fixtures__/ticks/raw20k-0900.decode.json
    - packages/shared/src/__tests__/helpers/tick-digest.ts
    - packages/shared/src/__tests__/ticks-framing.test.ts
    - packages/shared/src/__tests__/ticks-decode.golden.test.ts
    - packages/shared/src/__tests__/ticks-layouts.test.ts
    - packages/shared/src/__tests__/ticks-route.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "Node 24 zstd 해제(zstdDecompressSync · createZstdDecompress)는 이어붙인 프레임의 첫 프레임만 풀고 나머지를 조용히 버린다 — 순수 함수 splitZstdFrames 를 framing.ts 에 두고, 이어붙인 바이트는 프레임별로 풀어 concatBytes 로 잇는다(브라우저 · Node 공용)"
  - "canon 의 부동소수 판정은 값이 아니라 열 종류(dec6)로 한다 — 파이썬 float64 0.0 은 '0.000000' 인데 JS 에서는 정수 0 과 구별되지 않는다 · -0 은 '-0.000000'"
  - "head 30행도 canon 문자열로 저장 — recv_ns(>2^53)를 JSON 숫자로 두면 TS 에서 뭉개진다"
  - "marketOf 는 정보구분 문자열이 아니라 전문 바이트(오프셋 4)를 받는다 — pcap2parquet market_array 가 바이트에 parse_str 을 거는 것과 같게(공백 → '' · 128 이상 → '?')"

patterns-established:
  - "오라클 생성기 부명령 확장: gen-fixtures.sh 의 case 에 부명령 추가 · oracle.py 의 subparser 추가(37-03 orders/pnl · 37-05 g4cut/model)"

requirements-completed: [D-19]

coverage:
  - id: D1
    description: "pcap2parquet 와 TS 디코더의 표별 행 수 · 열 sha256 · 앞 30행 일치(컷 13시 KRX/NXT · 10/14 09시 무필터 20,000 프레임 — a3 · b6 · r8 · b9 · c3 · raw)"
    requirement: D-19
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-decode.golden.test.ts"
        status: pass
  - id: D2
    description: "LAYOUTS 6종이 파이썬 덤프 layouts.json 과 필드 이름 · 오프셋 · 길이 · 종류까지 같고 checkLayout 이 겹침 · 빈틈 · 합 · price/time12 길이 · 이름 중복을 잡는다"
    requirement: D-19
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-layouts.test.ts"
        status: pass
  - id: D3
    description: "레코드 프레이밍 왕복(BigInt recv_ns) · 잘린 꼬리 이어 읽기 · 다중 zstd 프레임 · PcapNsReader 청크 경계 무관 · magic/linktype 오류"
    requirement: D-19
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-framing.test.ts"
        status: pass
  - id: D4
    description: "변환 Job 라우팅 — isinKeyOf(태그 오프셋 · 길이 무관 · 모르는 태그 null) · exchangeLabelOf · hits15 정수 경계 · DayRateTracker 최빈 기준가"
    requirement: D-19
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/ticks-route.test.ts"
        status: pass

duration: 12min
completed: 2026-11-02
---

# Phase 37 Plan 02: shared 틱 디코더 Summary

**gh-trade tickana `packets.py` LAYOUTS 6종 · 필드 파서 · pcap2parquet raw 규칙을 TS 로 옮기고, 진짜 pcap 조각 세 개에서 pcap2parquet 와 열 단위 sha256 이 같음을 생성된 골든으로 잠갔다 — 레코드 프레이밍(`pcapns-rec+zstd/1`) · 원본 pcap 리더 · 변환 Job 라우팅(isinKeyOf · hits15 · DayRateTracker) 포함.**

## Performance

- **Duration:** 약 12분 (2026-11-02T09:54Z → 10:06Z)
- **Tasks:** 2 (트레이서 1 + TDD 1)
- **Files:** 21 생성 · 1 수정

## Accomplishments

- **오라클 생성기** `scripts/tick-oracle/oracle.py`(gh-trade venv `-I`) — `layouts` 는 LAYOUTS 덤프, `decode` 는 ① `pcap2parquet.convert_file` 로 정본 Parquet ② 같은 레코드 규칙 · 같은 프레임 상한으로 레코드 프레이밍 `.ticks.zst`(zstd-19) ③ 표별 `{rows, columns.sha256/nulls, head}` JSON. 프레임 수와 레코드 수를 pcap2parquet 카운터 · 표 행 합과 교차 확인하고 어긋나면 종료 1. 두 번 돌려도 픽스처 바이트가 같다(결정적).
- **골든 일치(TS = pcap2parquet):** 세 픽스처의 모든 표 행 수 · 열마다 canon sha256 · null 수 · 앞 30행이 첫 실행에 일치했다.
- **레이아웃:** 파이썬 `_Builder` 와 같은 빌더 · 같은 루프(B6 `47+46(i−1)` · B9 `23+78(i−1)`)로 만들어 `layouts.json` 과 deep-equal. 필드 수 A3 22 · B6 56 · R8 16 · B9 35 · C3 29 · A0 32.
- **raw 보존:** (태그, 길이)가 맞지 않는 전문 · 모르는 태그 · 5B 미만 전문 모두 `decodeAny` 가 raw 행으로 낸다. raw20k 조각의 raw 160행 열 digest 까지 pcap2parquet 와 같다.
- **라우팅:** `isinKeyOf` 는 `ISIN_OFFSET` 표 하나(회신으로 태그가 늘면 한 줄 추가) · `hits15` 는 `chg·100 ≥ (px−chg)·15` 정수식 · `DayRateTracker` 는 teamflow 최빈 기준가(동률이면 작은 값).

## 픽스처 · 표별 행 수 (decode.json `rows`)

| 픽스처 | `.ticks.zst` | 프레임 = 레코드 | a3 | b6 | r8 | b9 | c3 | a0 | raw |
|--------|-------------:|----------------:|---:|---:|---:|---:|---:|---:|----:|
| cut1300-krx | 247,536B | 11,990 | 3,089 | 8,901 | — | — | — | — | — |
| cut1300-nxt | 230,286B | 11,474 | 3,219 | 8,255 | — | — | — | — | — |
| raw20k-0900 | 563,576B | 20,000 | 2,712 | 16,448 | 2 | 105 | 573 | — | 160 |

- 세 `.ticks.zst` 모두 1.5MB 이하(`find … -size +1536k` 빈 출력) · `layouts.json` 9,786B · decode.json 75~150KB.
- pcap2parquet 카운터: 세 픽스처 모두 `non_ipv4=0 · non_udp=0 · bad_frame=0 · truncated=0`.
- cut1300-krx a3 = 3,089 — RESEARCH 실측(컷 KRX A3 3,089)과 같다(이 컷 파일은 이미 종목 필터된 조각이라 G1 외 보드가 없다).
- **A0 는 레이아웃 동일성만** — 09시 무필터 조각에 A0 행이 없다(A0 는 05~06시 배치). A0 레이아웃은 `layouts.json` deep-equal · `layoutOf` · `isinKeyOf` 오프셋 27 · 631B 옛 전문 raw 로 검증했다. `parseEuckr` 는 골든 대조가 없다(Known Gaps 참고).

## Task Commits

1. **Task 1 (tracer): 오라클 → 픽스처 → framing · A3 · decode → pcap2parquet A3 열 일치** — `7c3a6279` (feat)
   - 트레이서 게이트(interactive · end-of-phase · 자동 verify 만): verify 재실행 통과 → 확장 진행. 커밋에 `.pcap.zst` 없음(`git show --name-only --format= 7c3a6279` 확인).
2. **Task 2 (TDD): 나머지 레이아웃 · raw 보존 · 무필터 골든 · 라우팅**
   - RED `d98269dc` (test) — route.ts 는 시그니처 뼈대(전부 throw)
   - GREEN `6a039a6f` (feat)

## TDD Gate Compliance

- **RED:** `d98269dc` — 대상 `ticks-layouts.test.ts > LAYOUTS ↔ 파이썬 덤프 layouts.json > 키 집합 · 필드 배열이 deep-equal`. 실행 `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/ticks-layouts.test.ts --reporter=junit` exit 1 · 8 테스트 중 3 실패. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(`target_test_failed` · junit · report_errors 없음).
  - 처음에 tap-flat 리포터로 낸 증거는 `INVALID_RED (invalid_record — Malformed TAP)` 였다. vitest tap 리포터가 다줄 expected/actual 을 들여쓰기 없이 내기 때문이라 JUnit 리포터로 다시 돌렸다(실측 출력을 고치지 않았다).
  - **semanticAssessment:** 대상 테스트가 실제로 실행됐고 `AssertionError`(toEqual)로 실패했다. 원인은 B6 · R8 · B9 · C3 · A0 레이아웃이 아직 없다는 계획된 단언이다. 로드 · 문법 · 픽스처 오류가 아니다. 같은 RED 실행에서 골든 b6/r8/b9/c3/raw · route 테스트도 실패했다(route 는 뼈대 throw).
- **GREEN:** `6a039a6f` — 4 파일 97 테스트 통과.
- **REFACTOR:** 없음.

## Verification

- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/shared run typecheck && pnpm --filter @gh-radar/shared exec vitest run <ticks 4종> --maxWorkers=2` → exit 0 · **4 파일 97 테스트 통과 · 실패 0 · TS2308 없음**.
- shared 전체 `vitest run --maxWorkers=2` → 30 파일 953 테스트 통과.
- 하류 `pnpm --filter @gh-radar/webapp run typecheck`(+ e2e tsconfig) · `pnpm --filter @gh-radar/relay run typecheck` 통과(배럴 export 충돌 없음).
- 결정성: `bash scripts/tick-oracle/gen-fixtures.sh decode` 재실행 뒤 `git status --porcelain packages/shared/src/__fixtures__/ticks` 빈 출력.
- pgTAP 대상 없음(DB 변경 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 정확성] Node zstd 가 이어붙인 프레임의 첫 프레임만 푼다 → `splitZstdFrames` 추가**
- **Found during:** Task 1 (framing 테스트 「zstd 프레임 둘을 이어붙인 바이트 해제 → 레코드 수 = 합」 이 2/5 레코드로 실패)
- **Issue:** Node 24.21 `zlib.zstdDecompressSync` 와 `createZstdDecompress` 스트림이 둘 다 첫 zstd 프레임에서 멈추고 뒤 프레임을 **오류 없이 버린다**(gunzip 은 멤버를 모두 푼다 — 스크래치 실측). 이 형식의 핵심 성질(「여러 응답 · 여러 zstd 프레임을 이어붙여도 유효한 스트림」)이 Node 에서 조용히 깨진다.
- **Fix:** `framing.ts` 에 순수 함수 `splitZstdFrames(buf)`(RFC 8878 프레임 헤더 · 블록 헤더 · 체크섬 · 스킵 가능 프레임 · 잘림 → RangeError)를 넣었다. 이어붙인 바이트는 프레임별로 풀어 `concatBytes` 로 잇는다. 테스트가 Node 동작 자체도 단언해서, Node 가 고쳐지면 그 단언이 알린다.
- **Files modified:** `packages/shared/src/ticks/framing.ts` · `packages/shared/src/__tests__/ticks-framing.test.ts`
- **Commit:** `7c3a6279`
- **영향(하류 플랜 필독):** 원본 아카이브 `.pcap.zst` 는 한 프레임이다(컷 13시 · 10/14 08시 · 09시 847MB 모두 1프레임 실측). 그래서 37-06 Job 의 `createZstdDecompress` 통독은 안전하다. 반면 **여러 zstd 청크를 이어붙이는 곳은 반드시 `splitZstdFrames` 를 거쳐야 한다**: 37-06 스테이징(64KB 청크마다 `zstdCompressSync` 후 이어붙임) · tickgw 응답 이어붙이기 · 브라우저 당일 캐시 append(37-12 · 37-15). 브라우저 쪽 zstd 해제기가 다중 프레임을 푸는지도 그 플랜에서 확인해야 한다.

**2. [Rule 1 - 정확성] canon 부동소수 판정을 값이 아니라 열 종류로**
- **Found during:** Task 1 설계(dec6 열)
- **Issue:** 플랜 문구 「number 정수 → String · 비정수 → toFixed(6)」 대로면 파이썬 float64 `0.0`(→ `"0.000000"`)과 JS `0`(→ `"0"`)이 갈려 R8 disparity 열 digest 가 틀린다. 파이썬 `-0.0` 은 `"-0.000000"` 인데 JS `(-0).toFixed(6)` 은 `"0.000000"` 이다.
- **Fix:** `canonOf(v, float)` — 부동소수 열(LAYOUTS 의 dec6 필드)이면 언제나 `.6f` · `-0` 은 `"-0.000000"`. 파이썬 쪽은 pyarrow float 값 → `format(v, ".6f")`. raw20k r8 2행 digest 일치로 확인.
- **Files modified:** `packages/shared/src/__tests__/helpers/tick-digest.ts`
- **Commit:** `7c3a6279`

**3. [Rule 3 - 차단] decode.json `head` 값을 canon 문자열로**
- **Issue:** recv_ns(≈1.79e18 > 2^53)를 JSON 숫자로 쓰면 TS `JSON.parse` 에서 뭉개져 head 비교가 불가능하다.
- **Fix:** 오라클이 head 의 모든 값을 canon 문자열로 쓰고, 테스트도 canon 으로 비교한다(플랜 「값은 canon 으로 비교」 와 같은 뜻).
- **Commit:** `7c3a6279`

**4. [Rule 3 - 차단] RED 증거 리포터를 tap-flat → junit**
- **Issue:** vitest tap-flat 출력이 다줄 문자열 때문에 분류기에서 `Malformed TAP` 로 거부됐다.
- **Fix:** 같은 대상 테스트를 JUnit 리포터로 다시 돌려 `RED_EVIDENCE_OK` 를 받았다. 임시 증거 파일은 커밋하지 않았다.

**5. [작은 시그니처 조정] `marketOf(payload)` · `exchangeOf(firstByte, label)` 은 바이트를 받는다**
- 플랜 문구 `marketOf(infoCat)` 와 달리 전문 바이트(오프셋 4)를 받는다. 이유는 pcap2parquet `market_array` 가 정보구분 셋째 **바이트**에 parse_str 을 걸기 때문이다(공백 → `""` · ≥128 → `?`). 문자열로 받으면 공백 처리가 어긋난다.

**6. [추가] `PcapNsReader.counters`(`packets · nonIpv4 · nonUdp · badFrame`) · `pending` · 헬퍼 `readTickJson` · `tickFixturePath`** — 플랜이 「counters 에 센다」 고만 한 것을 pcap2parquet 카운터와 같은 이름 집합으로 구체화했다.

---

**Total deviations:** 자동 수정 4건(Rule 1 1 · Rule 2 1 · Rule 3 2) + 시그니처 조정 1 + 보강 1. 범위 확대 없음.

## D-19 범위 경계

이 플랜의 디코더는 아무것도 버리지 않는다. `isinKeyOf` 의 null 은 프리미티브일 뿐이고, 「ISIN 없는 태그를 종목 격자 · 당일 캐시에서 뺀다」 는 결정은 37-01 Task 2 「D-19 범위: 승인」 을 precondition 으로 Job(37-06 · 37-18)이 적용한다.

## Known Gaps (스텁 아님)

- `parseEuckr`(A0 종목명)는 골든 대조가 없다. 픽스처에 A0 행이 없고, WHATWG `euc-kr`(= windows-949)와 파이썬 `cp949` `replace` 는 깨진 바이트에서 U+FFFD 개수가 다를 수 있다. 05~06시 원본 조각으로 A0 골든을 더하는 일은 A0 를 화면에 쓰는 플랜이 맡는다.
- 스텁 · TODO · placeholder 없음. route.ts 뼈대(RED)는 GREEN 커밋에서 구현으로 바뀌었다.

## Threat Flags

없음 — 네트워크 · 인증 · 스키마 표면이 없다(순수 함수 + 로컬 생성 스크립트).

## Next Phase Readiness

- 37-03 · 37-05 는 `gen-fixtures.sh` 의 case 와 `oracle.py` subparser 에 부명령을 더한다. `readTicksZst` · `readTickJson` · `canonOf` · `columnDigest` 를 재사용한다.
- 37-06 · 37-18(Job): `PcapNsReader` + `isinKeyOf` + `exchangeLabelOf` + `hits15`/`DayRateTracker` 를 바로 쓸 수 있다. 스테이징 청크 이어붙이기는 `splitZstdFrames` 를 거친다(Deviation 1).
- 브라우저(37-12 이후): `iterRecords` + `decodeAny`/`decodeFields` · `TICK_FMT` 를 쓴다. `recv_ns` 는 bigint 그대로 다룬다.

## Self-Check: PASSED

- 생성 파일 21개 존재 확인 · 커밋 `7c3a6279` · `d98269dc` · `6a039a6f` 가 HEAD 조상.
