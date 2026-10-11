---
phase: quick-260713-fir
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - workers/home-sync/src/index.ts
  - workers/home-sync/src/index.test.ts
  - server/src/routes/home.ts
  - scripts/deploy-home-sync.sh
autonomous: false
requirements: [HOME-01]

must_haves:
  truths:
    - "home-sync 스케줄러가 장중 5분 간격(00/05/10/…/55)으로 슬롯을 생성한다"
    - "15:30 종가 슬롯은 실행되고 15:35+ 슬롯은 skip 된다(5분 슬롯 경계에서도 성립)"
    - "hash-match carry 시 복제된 payload 의 종목 등락률이 이번 사이클 최신 시세로 갱신된다"
    - "홈 네비게이션 인덱스가 최신 400 슬롯까지 커버한다(5분 슬롯 ~4일)"
    - "배포 스케줄이 */5 로 반영되고 문서 주석의 '10분' 표현이 '5분' 으로 갱신된다"
  artifacts:
    - path: "workers/home-sync/src/index.ts"
      provides: "5분 슬롯 computeSlot + carry changeRate 최신화"
      contains: "Math.floor(kst.getUTCMinutes() / 5) * 5"
    - path: "server/src/routes/home.ts"
      provides: "index limit 400"
      contains: ".limit(400)"
    - path: "scripts/deploy-home-sync.sh"
      provides: "*/5 스케줄"
      contains: "*/5 8-15 * * 1-5"
  key_links:
    - from: "workers/home-sync/src/index.ts (carry 분기)"
      to: "loadSurges() 반환 Surge[] changeRate"
      via: "code→changeRate Map 로 payload themes/singles 덮어쓰기"
      pattern: "changeRate"
---

<objective>
home-sync 급등테마 갱신 주기를 10분→5분으로 완화하고, 부수적으로 (1) hash-match carry 시
등락률이 옛 값으로 고정되던 문제를 최신 시세로 갱신하고, (2) 5분 슬롯으로 늘어난 하루 슬롯 수
(~91개)에 맞춰 홈 네비게이션 인덱스 커버리지를 200→400 슬롯으로 확장한다.

Purpose: 5분 주기로 급등 포착 지연을 절반으로 줄이되, carry 슬롯의 등락률 stale 문제와
네비게이션 커버리지 축소(5분 슬롯이면 200개는 ~2일)를 함께 해소한다.
Output: computeSlot 5분화 + carry changeRate 최신화 + index limit 400 + 배포 스케줄 */5.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- 실행자가 바로 쓸 계약. 코드베이스 추가 탐색 불필요. -->

workers/home-sync/src/pipeline/loadSurges.ts — loadSurges 가 반환하는 Surge:
```typescript
export interface Surge {
  code: string;
  name: string;
  changeRate: number;
  news: NewsRow[];
}
```

packages/shared/src/home.ts — carry 시 갱신 대상 payload 구조:
```typescript
export interface HomeSurgeStock { code: string; name: string; changeRate: number; }
export interface HomeSurgeTheme  { name: string; reason: string | null; stocks: HomeSurgeStock[]; news: HomeNewsRef[]; }
export interface HomeSurgeSingle { code: string; name: string; changeRate: number; reason: string | null; news: HomeNewsRef[]; }
export interface HomeSnapshotPayload {
  threshold: number;
  marketStatus: "premarket" | "open" | "closed";
  themes: HomeSurgeTheme[];
  singles: HomeSurgeSingle[];
}
```

프론트 정렬 사실(중요): webapp/src/components/home/theme-card.tsx:87 에서
`const sorted = [...theme.stocks].sort((a, b) => b.changeRate - a.changeRate);` —
테마 내 종목은 **표시 시점에 프론트가 changeRate desc 로 재정렬**한다.
→ 워커 carry 갱신은 stocks 배열 순서를 유지한 채 changeRate 값만 in-place 덮어쓰면 되고,
   워커에서 재정렬할 필요 없음(저장 순서 유지가 안전).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: computeSlot 5분 슬롯화 + carry changeRate 최신화</name>
  <files>workers/home-sync/src/index.ts, workers/home-sync/src/index.test.ts</files>
  <behavior>
    computeSlot (index.test.ts):
    - 10:37 KST → 10:35 슬롯 (5분 floor, 기존 10:30 기대값 갱신)
    - 10:42 KST → 10:40 슬롯 (기존 유지 — 40 은 5의 배수)
    - 15:34 KST → capturedAt 15:30, marketStatus "closed", afterClose=false (신규: 15:30 종가 슬롯으로 귀속, skip 아님)
    - 15:35 KST → capturedAt 15:35, marketStatus "closed", afterClose=true (신규: slotMinute 35 > 30 → skip 대상)
    - 15:30 KST → afterClose=false (종가 슬롯 실행, 회귀 없음)
    - 15:40 KST → afterClose=true (기존 유지)
    - 기존 premarket/open 경계 케이스는 그대로 통과
    carry changeRate (index.test.ts, hash-match 분기):
    - 직전 payload 종목 changeRate 가 옛 값이고 이번 loadSurges 가 갱신된 changeRate 를 반환할 때,
      upsert 되는 payload 의 themes[].stocks[].changeRate 와 singles[].changeRate 가 최신값으로 갱신됨
      (stocks/singles 개수·순서·news·reason 은 그대로 유지, is_carried=true).
  </behavior>
  <action>
    (A) computeSlot 5분 슬롯화 (index.ts):
    - line 79: `Math.floor(kst.getUTCMinutes() / 10) * 10` → `Math.floor(kst.getUTCMinutes() / 5) * 5`.
    - afterClose(line 89) / marketStatus(line 83-88) 조건식은 수정 금지 — `slotMinute > 30` / `slotMinute >= 30`
      로직이 5분 슬롯에서도 그대로 성립(15:30 실행, 15:35+ skip)함을 테스트로 증명한다.
    - line 58-63, 78-82 doc comment 의 "10분 슬롯 / 10분 경계 / 10분 cron" 표현을 "5분" 으로 갱신.
    - line 17-32 파일 상단 doc comment 의 "KST 10분 슬롯" 언급도 "5분 슬롯" 으로 갱신.

    (B) carry changeRate 최신화 (index.ts hash-match 분기, line 180-188):
    - loadSurges 결과(surges: Surge[])로 `const rateByCode = new Map(surges.map((s) => [s.code, s.changeRate]));` 구성.
    - hash-match 분기에서 `payload = prevRow.payload` 대신, prevRow.payload 를 깊은 복제 후
      themes[].stocks[] 와 singles[] 를 순회하며 rateByCode 에 존재하는 code 는 changeRate 를 덮어쓴다.
      rateByCode 에 없는 code(급등 이탈)는 기존 값 유지. 배열 순서·news·reason·name 은 불변.
    - 이를 `function applyLatestRates(payload: HomeSnapshotPayload, rateByCode: Map<string, number>): HomeSnapshotPayload`
      순수 헬퍼로 추출(불변 반환, prevRow.payload 원본 미변경). structuredClone 또는 명시적 map 복제 사용.
    - 정렬 재수행 금지(프론트 theme-card.tsx 가 표시 시 changeRate desc 재정렬 — interfaces 블록 참조).
    - surges.length === 0 의 transient-empty clone 경로(line 152-179)는 **수정 금지** — 덮어쓸 최신 시세 소스가 없다.
    - hash-miss 분기(line 189-200, Claude 호출)는 무변경(clusterSurges 가 이미 최신 changeRate 사용).

    (C) index.test.ts: computeSlot describe 제목/케이스를 5분 기준으로 갱신하고 위 behavior 의
        15:34/15:35 경계 케이스를 추가. hash-match 테스트(line 190-235)에 prevPayload 의 changeRate 를
        이번 seed(seedSurgeSupabase: 005930=25, 000660=30, 347700=22)와 **다른 옛 값**으로 설정하고,
        upsert 된 payload 의 changeRate 가 최신값으로 갱신됐는지 assert 추가.
  </action>
  <verify>
    <automated>cd workers/home-sync && pnpm vitest run src/index.test.ts</automated>
  </verify>
  <done>vitest 통과. computeSlot 5분 floor + 15:34/15:35 경계 + carry changeRate 최신화 검증. 기존 슬롯/carry/skip/transient-empty 테스트 회귀 없음.</done>
</task>

<task type="auto">
  <name>Task 2: server home 라우트 index limit 200→400</name>
  <files>server/src/routes/home.ts</files>
  <action>
    - line 66 `.limit(200)` → `.limit(400)`.
    - line 27, 61 주석의 "최신 ~200 슬롯" → "최신 ~400 슬롯 (5분 슬롯 ~4일)" 로 갱신.
    - home.route.test.ts 는 index 3행만 seed 하므로(3 < 400) 영향 없음 — 편집 불필요. verify 로 회귀만 확인.
  </action>
  <verify>
    <automated>cd server && pnpm vitest run src/routes/home.route.test.ts</automated>
  </verify>
  <done>home.route.test.ts 통과. 라우트가 index 최대 400 슬롯 반환. 주석 갱신.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: 배포 스케줄 */5 반영 + 커밋 + 배포</name>
  <files>scripts/deploy-home-sync.sh</files>
  <what-built>
    (A) scripts/deploy-home-sync.sh 편집(Claude 자동):
      - line 169 `SCHEDULE="*/10 8-15 * * 1-5"` → `SCHEDULE="*/5 8-15 * * 1-5"`.
      - line 13, 14, 160, 162, 198 등 헤더/Section 7/결과 출력 주석의 "10분 간격 / 매 10분 / 장중 10분 간격"
        표현을 "5분 간격 / 매 5분" 으로 갱신.
    (B) 커밋: 사용자 전역 규칙 준수 — 커밋 메시지 한글, Co-Authored-By 절대 금지.
      커밋 메시지 예: "feat(quick-260713-fir): home-sync 갱신 주기 10→5분 + carry 등락률 최신화 + index limit 400"
      커밋 전 메시지를 사용자에게 보여주고 확인 후 커밋 → push.
    (C) 배포(커밋 후 — 이미지 태그가 HEAD SHA 라 커밋 이후 실행):
      GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json,
      CLOUDSDK_CORE_PROJECT=gh-radar 환경으로 `bash scripts/deploy-home-sync.sh` 실행 →
      Cloud Scheduler gh-radar-home-sync-cron 이 */5 로 업데이트됨.
  </what-built>
  <how-to-verify>
    1. `git log -1` 커밋 메시지가 한글 + Co-Authored-By 없음 확인.
    2. 배포 후 스케줄 확인:
       `gcloud scheduler jobs describe gh-radar-home-sync-cron --location=asia-northeast3 --project=gh-radar --format='value(schedule)'`
       → `*/5 8-15 * * 1-5` 출력.
    3. (선택) `bash scripts/smoke-home-sync.sh` 로 Job 1회 실행 → snapshot row 적재 확인.
  </how-to-verify>
  <resume-signal>배포 완료 + 스케줄 */5 확인되면 "approved", 문제 시 내용 기술</resume-signal>
</task>

</tasks>

<verification>
- workers/home-sync vitest 전체 통과 (computeSlot 5분 + carry changeRate + 기존 회귀 없음).
- server home.route.test.ts 통과 (limit 400 회귀 없음).
- deploy-home-sync.sh SCHEDULE 및 주석 "5분" 반영.
- Cloud Scheduler 실제 스케줄이 */5 (배포 후).
</verification>

<success_criteria>
- computeSlot 가 5분 경계(00/05/…/55)로 floor 하고 15:30 실행 / 15:35+ skip 이 성립.
- hash-match carry 슬롯의 종목 등락률이 최신 시세로 갱신 (transient-empty 경로는 불변).
- 홈 index 네비게이션이 최신 400 슬롯 커버.
- 배포 스케줄 */5 반영 + 문서 주석 정합.
</success_criteria>

<output>
After completion, create `.planning/quick/260713-fir-home-sync-10-5-5-carry-index-limit-400/260713-fir-SUMMARY.md`
</output>
