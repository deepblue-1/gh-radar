---
phase: quick-261113-rn7
reviewed: 2026-11-13T12:02:12Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - workers/dart-alert/src/collector.ts
  - workers/dart-alert/src/lap.ts
  - workers/dart-alert/src/cadence.ts
  - workers/dart-alert/src/watches.ts
  - workers/dart-alert/src/apiUsage.ts
  - workers/dart-alert/src/config.ts
  - workers/dart-alert/src/index.ts
  - workers/dart-alert/src/logger.ts
  - workers/dart-alert/src/message.ts
  - scripts/deploy-dart-alert.sh
  - scripts/setup-dart-alert-secrets.sh
  - scripts/setup-dart-alert-iam.sh
  - scripts/smoke-dart-alert.sh
  - scripts/dart-alert-report.sh
  - ops/alert-dart-alert-failure.yaml
  - ops/alert-dart-alert-error-log.yaml
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
  necessity: 1
status: issues_found
---

# Quick 261113-rn7: 코드 리뷰 보고서

**리뷰 시각:** 2026-11-13T12:02:12Z
**깊이:** standard (호출 사슬은 `dart/client.ts` · `db.ts` · 마이그레이션 `20261113200000_dart_alert.sql` 까지 따라 읽음)
**파일 수:** 16
**상태:** issues_found

## 요약

커밋 `020b2894` · `6832ec38` · `3dcc287b` 의 `workers/dart-alert` · `scripts/*dart-alert*` · `ops/alert-dart-alert-*` 를 읽었다. 시험(456)은 돌리지 않았다 — 판단은 모두 코드 · 마이그레이션 원문 대조다.

확인된 것(문제 아님):
- **전날 확인의 한 번만 보장**은 DB 가 진다. `dart_alerts.rcept_no` PK + `ON CONFLICT DO NOTHING` + 정리 작업 없음(마이그레이션 41 ~ 43행)이라 재기동 · 임대 교대 · 표시(`prevday:`) 유실이 있어도 **같은 접수번호가 두 번 나가지 않는다**(호출만 더 든다). `last_ok` 는 `last_ok || p_last_ok` 병합(마이그레이션 149행)이라 불러온 표시가 연장 때 지워지지 않는다.
- **월 → 금 계산**(`cadence.ts:141-147`)은 KST 정오에서 하루씩 빼므로 자정 경계 오차가 없다.
- **호출 수 집계**: 오늘 조회 · 추가 쪽 · 전날 확인 · 시작 탐침 · 재탐침 · probe 모드가 모두 `addCalls(watch.key | l.key)` 로 그 키 카운터에 들어간다(`collector.ts:1097-1136` · `502-507` · `613-618` · `693-699`). 키를 잘못 세는 길은 찾지 못했다. 예산 문은 바퀴 시작에만 있어 넘침은 한 바퀴 호출 수(수 건) 이내다.
- **한 키 멈춤 → 다른 키 계속**, **두 키 모두 멈춤 → 종료 1** 은 코드대로 동작한다.
- **`matchesKind`**: 끝 괄호 꼬리 · 겹괄호(「기타시장안내(관리종목지정우려종목)(…)」) · 연속 공백 · 전각 공백(`\s`)은 맞게 처리한다. 「주권매매거래정지해제」 · 「불성실공시법인지정예고」 · 「…주주명부폐쇄(기준일)결정」 은 섞이지 않는다. 맨 앞 `[기재정정]` 등은 `plain` 꼴에서 늘 정정으로 떨어진다(설계).
- **비밀**: 키 2 값이 화면 · 명령줄 · 로그 · 오류 문구로 나가는 길은 **찾지 못했다**. 워커는 `dartApiKey2` 를 로거 가림 목록에 더했고(`logger.ts:27`) 같은 값 오류는 이름만 싣는다(`config.ts:137-141`). 비밀 스크립트의 같은 값 비교는 변수 안에서만 하고 곧바로 비운다. 보고 스크립트는 키 · 서비스롤 키를 `curl -K -` 표준입력으로만 넘긴다.
- **셸**: 다섯 스크립트에서 따옴표 누락 · BSD/GNU 차이로 깨지는 줄은 찾지 못했다(참고 IN-06 의 진단 문구 하나만).

치명 등급은 없다. 실제로 아플 수 있는 것은 **전날 확인이 실패 · 넣기 실패 때 상한 없이 다시 도는 것(키 1 여유 238 소모)**, **한 키 멈춤으로 열린 장애가 다른 키의 장애를 가리는 것**, **I001 추가 쪽 · 키 1 여유가 계산상 상한이 아닌 것**, **seed 를 잊으면 다음 아침 쏟아지는 것을 막는 장치가 수동 절차뿐인 것** 넷이다.

## 치명 (Critical)

없음. 알림 쏟아짐 · 중복 송신 · 조용한 알림 유실로 이어지는 결함은 증명하지 못했다(전날 확인 중복은 DB PK 가 막고, 놓친 건은 다음 성공 조회나 다음 날 전날 확인이 「(늦은 알림)」 으로 줍는다).

## 경고 (Warning)

### WR-01: 전날 확인이 「넣기 실패」 · 「전날 조회 실패」 때 상한 없이 매 조회 다시 돈다 — 키 1 여유 238 을 태우고, 전날 조회의 치명 분류는 키 레인 전체를 멈춘다

**File:** `workers/dart-alert/src/collector.ts:658-673` · `collector.ts:782-785` · `collector.ts:795-806` · `workers/dart-alert/src/lap.ts:284-305`
**Issue:**
1. 전날 확인 표시(`prevDayDone`)는 `takeResult` 에서만 남는다. 그런데 `collectOnce` 끝의 넣기(`lap.ts:304`)가 던지면 `r` 이 null 이라 `takeResult` 를 부르지 않는다(`collector.ts:665-673`). 그러면 다음 조회 때 `prevDayDue` 가 다시 직전 평일을 준다. 공개매수(D004)는 **매 바퀴(5초)** 라 넣기가 실패하는 동안 키 1 호출이 바퀴마다 2배(오늘 1 + 전날 전 쪽 1)가 되고, B001 · I001(전 쪽 2 ~ 6쪽) · 30초 감시 대상도 조회 칸마다 전날을 다시 읽는다.
   - 시나리오: 07:00 첫 바퀴. 전날 통과 건이 있어 `items` 가 비지 않는다 → `dart_alert_insert` 가 SQLSTATE 22 · 23 이 아닌 오류(문장 시간 초과 · 함수 오류 · RPC 스키마 어긋남)로 실패, 임대 RPC 는 정상 → `judgeInsertFailure` 가 5분 뒤 장애를 열 때까지(그 뒤에도 고쳐질 때까지) 키 1 이 분당 약 12 + 6 = 18회 더 쓴다. 20분이면 약 360회 → 키 1 설계 14,762 + 360 > 15,000 → 그날 19시대에 키 1 예산 소진 → **공개매수 알림이 마감 전까지 멈춤**(`pauseLane` 의 `retryAt` = Infinity · `collector.ts:377`).
2. 전날 조회만 계속 실패해도(전 쪽 중 뒤 쪽이 일시 오류로 자주 깨짐) 같은 일이 그 감시 대상 조회 칸마다 생긴다 — 횟수 상한 · 간격 늘림이 없다.
3. 전날 조회도 `countedList` 를 지나 `noteListError` 로 분류된다(`collector.ts:1109-1112`). 전날 날짜 질의에만 `100` · `101` · 모르는 코드가 오는 상황이면 오늘 조회는 멀쩡한데 **그 키 레인 전체가 멈추고** → 5분 뒤 탐침(오늘 날짜라 통과) → 재개 → 첫 조회 직후 전날 조회가 또 같은 코드 → 또 멈춤. 바퀴마다 장애가 열리고 닫혀 단체방에 「멈췄습니다」 · 「다시 동작」 짝이 약 5분마다 나갈 수 있다.
   시험은 「전날 조회 실패 시 다음 조회에 다시」 한 번만 묶고, 넣기 실패 중 반복 횟수 · 전날 조회의 치명 분류는 묶지 않는다.
**Fix:**
- 전날 확인 결과를 넣기 성공과 떼어 기록한다: `collectOnce` 가 던지기 전에 `prevOk` 결과를 돌려줄 수 있게 하거나(예: `CollectResult` 를 만든 뒤 넣기를 따로 부르는 2단계), 넣기 실패 바퀴에서도 「전날 조회 시도함」 을 메모리에 남겨 **넣기 재시도는 이미 읽은 전날 행(메모리)로만** 하게 한다.
- 전날 확인 재시도에 감시 대상별 상한을 둔다(예: 하루 3번 · 실패마다 5분 간격). 상한을 넘으면 warn 1번 뒤 그날은 표시만 남기고 건너뛴다.
- 전날 조회 오류는 레인을 멈추지 않게 분류를 나눈다 — `quota`(020 · HTTP 429)만 레인 멈춤으로 올리고, 그 밖은 `prevOk:false` + warn 으로 끝낸다:
```ts
// lap.ts 전날 조회 — fullRead 호출만 치명 분류를 건너뛰게 표시
const p = await deps.dart.list(watch, prevDay, { fullRead: true, prevDay: true });
// collector.ts countedList
} catch (err) {
  this.addCalls(l.key, callsOf(err));
  const isQuota = err instanceof DartApiError && err.kind === "quota";
  if (!opts?.prevDay || isQuota) this.noteListError(l, err);
  throw err;
}
```

### WR-02: 한 키 멈춤으로 열린 장애가 다른 키의 일시 장애를 가린다 — 단체방 글 0 · 메일 0

**File:** `workers/dart-alert/src/collector.ts:898-914`(특히 908) · `collector.ts:724-742` · `workers/dart-alert/src/lap.ts:279`
**Issue:** `settleHalts` 는 멈춘 키의 감시 대상 이름으로 장애를 연다(예: 「⚠ … (거래소 시장조치 · 거래소 수시공시 · 최대주주 소유주식 변동 · 임원ㆍ주요주주 거래계획 — 자체 하루 예산 소진)」). 예산 소진은 재탐침이 없어(`retryAt = Infinity`) 그 장애는 **그날 창 끝까지 열린 채**다(`judgeOutage` 는 `anyPaused()` 면 닫지 않음 · 905행). 그동안 `judgeOutage` 는 `this.outage` 가 있으면 곧바로 돌아가므로(908행) 다른 키의 감시 대상이 일시 오류(네트워크 · 5xx · `800` · `900` · 깨진 본문)로 몇 시간 실패해도:
- 단체방에는 아무 글이 없다(열린 글은 「키 2 쪽만 멈췄다」 고 말한다 → 사람들은 공개매수는 살아 있다고 믿는다),
- 실패 로그는 `dart list failed` **warn** 뿐이라(lap.ts 279) error 로그 메일(`jsonPayload.level >= 50`)도 안 온다.
시나리오: 16:00 키 2 예산 소진 → 장애 1건(키 2 사유). 17:00 ~ 19:00 OpenDART 응답 없음으로 D004 · B001 실패 → 공개매수 조회 2시간 공백, 알림 · 메일 0. 회복 뒤 건은 「(늦은 알림)」 으로 나가지만 그 2시간 동안 운영자 · 단체방 누구도 모른다. 한 키 실행이던 이전 구조에서는 열린 장애 글이 「공시 알림 전체」 를 뜻했으므로 이번 변경이 만든 새 사각이다(SUMMARY 의 「다른 키까지 막히면 error 로그만」 은 치명 신호에만 해당하고 일시 오류는 덮지 않는다).
**Fix:** 열린 장애가 「어느 키 때문인지」 를 메모리에 들고(`outageKeys: Set<DartKeyId>`), `judgeOutage` 에서 열린 장애가 있어도 **그 장애에 포함되지 않은 키**의 실패 감시 대상이 기준점에서 5분을 넘으면 error `dart outage widened`(→ 메일) 1번 + 단체방에 보충 글 1건(「… 공개매수 · 주요사항보고서도 조회 실패」)을 낸다. 최소한 error 로그만이라도:
```ts
if (this.outage) {
  const others = failed.filter((x) => !this.outageKeys.has(this.keyOf(x.watch)) && now - this.coverOf(now, x.watch) > OUTAGE_AFTER_MS);
  if (others.length > 0 && !this.widenedLogged) { this.widenedLogged = true; this.d.log.error({ watches: others.map((x) => x.watch) }, "dart outage widened — other key failing"); }
  return;
}
```

### WR-03: 예산 여유가 계산상 상한이 아니다 — 키 1 여유 238 · 키 2 의 I001 추가 쪽은 「최악 2쪽」 이 아니라 쪽 수만큼 늘고, 소진되면 그 키는 그날 끝까지 멈춘다

**File:** `workers/dart-alert/src/dart/client.ts:233-239` · `workers/dart-alert/src/cadence.ts:13-16` · `workers/dart-alert/src/collector.ts:1143-1154` · `collector.ts:377` · `workers/dart-alert/tests/cadence.test.ts:171-178`
**Issue:**
- `fetchWatchRows` 는 그날 건수가 100 을 넘으면 **건수가 1건이라도 늘 때마다**(`grew`) 또는 60초마다 2쪽 ~ 마지막 쪽을 전부 읽는다. I001 조회 간격이 30초 → 10초로 줄어 이 추가 쪽이 3배가 됐다. 설계 · 시험의 「키 2 최악 14,045」 는 I001 이 하루 200건 이하(2쪽)라는 가정 위의 값이고 상한이 아니다. 조사 원본(이번 주 I001 110 ~ 170건/일)에선 괜찮지만, 결산 · 배당 · 주총 시기처럼 I001 이 하루 400건(4쪽)을 넘고 15:30 이후 몰리는 날이면: 몰리는 2.5시간 동안 10초 조회마다 `grew` → 900회 × 3쪽 = 2,700 + 나머지 시간 60초 재읽기 780 × 3 = 2,340 → 키 2 ≈ 9,360 + 5,000 → 15,000 근처에서 **키 2 그날 끝까지 멈춤**(거래소 수시공시 · 시장조치 · 최대주주 · 거래계획 전부).
- 키 1 은 설계 14,762 / 15,000(여유 238). B001 이 하루 100건을 넘는 날, 넘은 뒤 60초마다 1쪽 + 늘 때마다 1쪽이 붙어 몇 시간이면 238 을 넘고 **공개매수(핵심 가치)까지 함께 멈춘다** — 공개매수(D004)와 B001 이 한 예산을 나눠 쓰기 때문이다. SUMMARY 9 가 이 위험을 적었지만 코드상 막는 장치가 없다.
- 예산 소진 멈춤은 재탐침이 없다(`retryAt = Infinity`). 하루 남은 시간 전체가 꺼진다.
**Fix:**
- 키 1: 예산이 가까워지면(예: 남은 예산 < 남은 바퀴 수 × 키 1 바퀴당 호출) **B001 을 먼저 성기게**(20초 칸) 해 D004 를 끝까지 지키는 「감속」 규칙을 둔다. 공개매수 9,360 은 늘 확보.
- I001: 100건을 넘은 뒤에는 `grew` 로 전 쪽을 읽지 말고 **늘어난 만큼만**(새 건은 정렬 순서가 문서에 없어 전 쪽이 필요하다면 최소한 `grew` 재읽기 간격 하한, 예: 30초) 읽게 하거나, I001 의 `FULL_REREAD_MS` 를 감시 대상별로 둔다.
- `cadence.test.ts` 의 「최악」 단언을 「I001 N쪽이면 몇 회」 의 표로 바꿔 쪽 수에 따라 넘는 지점을 드러낸다.

### WR-04: seed 를 빼먹으면 다음 아침 쏟아지는 것을 막는 장치가 수동 절차뿐이다 — seed 는 임대가 남에게 있으면 조용히 종료 0

**File:** `workers/dart-alert/src/collector.ts:437-442` · `collector.ts:622-630` · `collector.ts:782-785` · `scripts/deploy-dart-alert.sh:66-68`
**Issue:** 새 감시 대상(I003 · I004) · 새 종류(I001 배당 · 투자유의)를 처음 싣는 배포 뒤 seed 실행을 안 하면, 다음 평일 07:00 auto 의 전날 확인이 직전 평일의 해당 건 전부(SUMMARY 추정 20 ~ 40건)를 「(늦은 알림)」 으로 보낸다. 막는 것은 배포 스크립트 머리 주석과 SUMMARY 의 수동 명령뿐이고, 배포 스크립트는 seed 를 실행 · 확인하지 않는다. 또 seed 실행이 임대를 못 잡으면(창 끝 직후 앞 실행이 아직 임대를 쥐었거나 죽은 실행의 TTL 90초 안) info `lease held by another run — exiting` · 종료 0 으로 끝나 **아무것도 채우지 않는다**(`collector.ts:439-441`) — `gcloud run jobs execute` 결과는 성공으로 보인다.
시나리오: 금 20:00:30 배포 → 곧바로 seed 실행 → 20:00 창 끝 실행이 drain 중이라 임대 보유 → seed 종료 0 「lease_held」 → 운영자는 실행 성공만 보고 넘어감 → 월 07:00 금요일 I003 · I004 · 배당 건 수십 건이 단체방에 연달아.
**Fix:** 코드로 막는다 — `loadLastOk` 에서 DB `last_ok` 에 그 감시 대상 id 의 성공 시각이 **한 번도 없으면**(새 감시 대상) 그 감시 대상의 첫 전날 확인을 `seed=true` 로 넣는다(보내지 않음). 기존 감시 대상에 종류만 넓힌 경우는 `DART_ALERT_PREVDAY_SEED_UNTIL=YYYY-MM-DD` 같은 1회성 env 로 그날까지 전날 확인을 seeded 로 넣게 하거나, 배포 스크립트가 seed 실행 뒤 로그에서 `seed done` 을 찾지 못하면 실패로 끝나게 한다(`--wait` 없이 도는 seed 라면 `gcloud logging read` 로 2분 안 `seed done` 확인).

## 참고 (Info)

### IN-01: 전날 확인 건의 `rcept_dt` 를 오늘 날짜로 덮어써 칸 의미가 깨진다

**File:** `workers/dart-alert/src/lap.ts:291` · 마이그레이션 `20261113200000_dart_alert.sql:64`
**Issue:** 송신 차례 RPC 가 `rcept_dt = 오늘` 만 고르기 때문에 택한 우회지만, 표 주석은 「접수일(KST)」 이고 `dart_alert_ops_stats` 의 날짜 범위 · 앞으로 D-09(웹앱 지난 공시 표시)가 이 칸을 접수일로 읽는다. seed 의 직전 평일 건도 오늘 날짜로 들어간다.
**Fix:** 마이그레이션으로 `alert_day date`(송신 차례 날짜)를 따로 두고 claim · expired 판정을 그 칸으로 옮기는 것이 정석. 당장은 표 주석 · ops_stats 설명에 「전날 확인 · seed 건은 rcept_dt = 넣은 날」 을 적어 둔다.

### IN-02: 아침 전날 확인 건이 새 건보다 먼저 나갈 수 있고, 전날 하루가 통째로 비었으면 수십 건이 한꺼번에 나간다

**File:** `workers/dart-alert/src/lap.ts:284-298` · `workers/dart-alert/src/watches.ts:250-300`
**Issue:** 차례는 우선순위 → 처음 본 순이라 07:00 의 늦은 I003(우선 2) 묶음이 07:01 에 새로 뜬 I001(우선 3) 실시간 건보다 앞선다(60초 18건 상한 → 수십 건이면 몇 분). 또 수집기가 전날 종일 죽어 있었다면(설정 오류 등) 그날 통과 건 전부(조사 기준 하루 약 50건)를 늦은 알림으로 보낸다 — D-12 「며칠 죽었다 살아나도 옛 공시를 쏟아내지 않는다」 와 긴장한다(U-3 사용자 결정이라 결함은 아님).
**Fix:** 전날 확인 건은 넣을 때 `priority + 10` 처럼 뒤로 미루고, 감시 대상당 전날 건이 N(예: 10)건을 넘으면 나머지는 seeded 로 넣고 error 1번(→ 메일)으로 알리는 상한을 검토.

### IN-03: 「(자회사의 주요경영사항)」 꼬리가 같은 종류로 통과해 자회사 사건이 모회사 종목으로 알림된다

**File:** `workers/dart-alert/src/watches.ts:191-195` · `watches.ts:99-109`
**Issue:** `matchesKind` 의 「허용 이름(」 접두 규칙 때문에 「최대주주변경(자회사의 주요경영사항)」 · 「주식소각결정(자회사의 주요경영사항)」 · 「단일판매ㆍ공급계약체결(자회사의 주요경영사항)」 도 통과하고, 첫 줄은 「📢 최대주주변경(자회사의 주요경영사항) — 모회사(모회사 코드)」 꼴이 된다. 배당은 계획에서 받아들였지만(자회사 6), 최대주주변경 자회사 건은 트레이더가 모회사 경영권 변동으로 오독하기 쉽다.
**Fix:** 꼬리별 제외 목록(예: `EXCLUDED_TAILS = ["(자회사의주요경영사항)"]`)을 종류마다 선택적으로 두거나, 최소한 최대주주변경 계열은 자회사 꼬리를 떨군다.

### IN-04: 시작 때 이미 예산이 찬 키는 error · 장애 글 없이 조용히 멈춘다

**File:** `workers/dart-alert/src/collector.ts:592-604`
**Issue:** `budgetAtStart` 는 「앞 실행이 이미 글을 냈다」 고 가정해 `fresh=false` 로 멈추고 warn 만 남긴다. 그러나 예산을 넘긴 것이 앞 실행의 **종료 flush**(SIGTERM · 임대 잃음 직전 바퀴의 호출이 shutdown 의 `flushUsage` 로 들어가 15,000 을 넘김)라면 앞 실행의 `budgetGate` 는 그것을 못 봤고 장애 글 · error 도 없다. 새 실행은 그 키 감시 대상을 그날 끝까지 조용히 건너뛴다.
**Fix:** 시작 때 예산으로 멈춘 키는 DB 장애가 열려 있지 않으면 `fresh=true` 로 멈춰 `settleHalts` 가 error · 장애 글을 내게 한다(열려 있으면 지금처럼 조용히).

### IN-05: 비밀 스크립트의 「키 2 ≠ 키 1」 검사가 한쪽 방향이고 읽기 실패 때 조용히 건너뛴다

**File:** `scripts/setup-dart-alert-secrets.sh:224-239`
**Issue:** 검사는 파일에 키 2 줄이 있을 때만 한다. 키 1 줄만 바꾸면서 실수로 키 2 Secret 과 같은 값을 넣으면 그대로 새 버전이 들어가고, 다음 실행부터 수집기가 `invalid OPENDART_API_KEY_2` 로 시작을 거부해 **두 키 감시 대상 전부가 멈춘다**(실패 메일은 옴). 또 키 1 Secret 읽기가 실패하면(`|| true` → 빈 값) 검사가 소리 없이 건너뛰어진다.
**Fix:** 키 1 줄만 있을 때도 키 2 Secret 최신 값과 비교하고, 비교할 상대 값을 읽지 못하면 `SKIP 같은 값 검사 — <Secret> 을 읽지 못함` 줄을 찍는다(값은 계속 출력하지 않음).

### IN-06: 배포 자체시험의 `grep | head` 가 `set -e` 아래에서 FAIL 문구 없이 스크립트를 끝낸다

**File:** `scripts/deploy-dart-alert.sh:226-234`
**Issue:** `secrets_line="$(grep -E '^[[:space:]]+--set-secrets=' "$self" | head -1)"` — 이 검사가 잡으려는 바로 그 상황(`--set-secrets` 줄이 사라짐)에서 grep 이 1 을 돌려주고 `pipefail` + `set -e` 로 스크립트가 그 자리에서 끝난다. 종료 코드는 0 이 아니라 시험 실패는 드러나지만 「FAIL: 배포 명령의 --set-secrets 에 … 가 없다」 문구가 나오지 않는다.
**Fix:** `secrets_line="$(grep -E '^[[:space:]]+--set-secrets=' "$self" | head -1 || true)"`.

### IN-07: 필요성 — 멈춘 키 그물(`countedList` 의 paused 검사)은 지금 호출 사슬에서 닿지 않는다

**File:** `workers/dart-alert/src/collector.ts:1099-1103`
**Category:** necessity
**Issue:** (Already-defended-elsewhere) `lapDeps.dart.list` 를 부르는 곳은 `collectOnce` 두 군데뿐이다. 오늘 조회(`lap.ts:271`)는 바로 앞 `isDue`(`lap.ts:265` → `collector.ts:765` 의 `paused === null`)가 막고, 전날 조회(`lap.ts:289`)는 같은 감시 대상의 오늘 조회가 **성공한 직후**라 그 사이 레인을 멈출 수 있는 경로(`noteListError` 는 실패에서만)가 없다. seed 도 같은 `isDue` 를 쓴다. 이 분기가 실행될 수 있는 것은 앞으로 `isDue` 를 거치지 않는 호출자가 생길 때뿐이다(판단).
**Fix:** 남겨 둘 거라면 주석에 「현재 호출자는 모두 isDue 를 거침 — 미래 호출자용 그물」 이라 적는다. 지워도 동작은 같다.

### IN-08: 한 바퀴 안 순차 호출 — 30초 경계 · 첫 바퀴에 호출이 몰리고, 장애 글이 송신 창(60초 18건)을 기다리는 동안엔 조회가 전부 멈춘다

**File:** `workers/dart-alert/src/collector.ts:653-682` · `collector.ts:1053-1061` · `workers/dart-alert/src/lap.ts:263-300`
**Issue:** 바퀴 밀림은 칸을 건너뛸 뿐 몰아 부르지 않아 예산 쪽은 안전하다(`plannedDailyCalls` 는 상한으로 맞다). 다만 (가) `:00` · `:30` 바퀴는 6종 + I001 추가 쪽, 그날 첫 바퀴는 여기에 전날 전 쪽(I001 2 ~ 6쪽 포함 7쪽 이상)이 더해져 응답이 느린 날 다음 D004 조회가 그만큼 늦는다. (나) `sendNotice` 는 송신 창이 차 있으면 최대 60초 동안 `maintain` 만 하며 기다린다 — 아침 전날 확인 쏟아짐(18건/분을 채움)과 장애 글이 겹치면 그동안 D004 조회가 0 이고, 그 뒤 처음 보는 공개매수 건은 60초 간격을 넘어 「(늦은 알림)」 으로 잘못 붙는다.
**Fix:** 장애 글 · 다시 동작 글은 송신 창 상한에서 1 ~ 2칸을 예약해 기다리지 않게 하거나, 기다림을 바퀴 밖(다음 바퀴 송신 차례)으로 미룬다. 전날 확인은 첫 바퀴가 아니라 그 감시 대상의 **두 번째** 성공 조회 바퀴로 미뤄 07:00 첫 바퀴를 가볍게 하는 것도 방법.

---

## 범주별 「찾지 못함」 명시

- **중복 송신:** 찾지 못함 — PK + ON CONFLICT + 정리 작업 없음(마이그레이션 41 ~ 43행)으로 재기동 · 임대 교대 · 표시 유실 모두 같은 건 재송신 없음(SC-5 의 기존 「sending 회수 시 드문 중복」 만 그대로).
- **월 → 금 · KST 날짜 계산 오류:** 찾지 못함.
- **키 카운터 오배정:** 찾지 못함.
- **비밀 노출(키 2 값 출력 · 명령줄 · 로그):** 찾지 못함.
- **셸 따옴표 · BSD/GNU 차이:** 찾지 못함(IN-06 의 진단 문구만).
- **`matchesKind` 거짓 음성:** 조사 원본 이름 꼴에서는 찾지 못함(IN-03 은 거짓 양성 쪽).

_Reviewed: 2026-11-13T12:02:12Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
