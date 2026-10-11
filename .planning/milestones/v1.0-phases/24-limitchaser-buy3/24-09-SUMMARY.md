---
phase: 24-limitchaser-buy3
plan: 09
subsystem: deploy (relay VM 컨테이너 · webapp Vercel)
tags: [deploy, relay, webapp, buy3_schema, gh-trade-sync, checkpoint]
status: complete
task1_status: complete (gh-trade-38 예고 2026-09-28 10:53 KST)
task2_status: complete (준비 게이트 통과 — 배포하지 않음)
task3_status: complete (메인 세션 배포 2026-09-28 11:05~11:27 KST — relay 94ebc91c · smoke FAIL 0 · master push · Vercel Ready · gh-trade 회신. 운영 웹 눈 확인 · 300ms 창 관찰은 UAT 이월)
requires: ["24-01", "24-02", "24-03", "24-04", "24-05", "24-06", "24-07", "24-08"]
provides:
  - "gh-trade 배포 커밋 cfbbd3e2 기준 relay 생성물 드리프트 0 확인"
  - "배포 준비 게이트 결과(build · typecheck · unit · e2e)"
  - "메인 세션용 배포 절차 · 롤백 태그 확인 방법 · master 병합 판단"
  - "프로덕션 반영: relay 이미지 relay:94ebc91c(직전 2fe94209) · webapp master 94ebc91c(Vercel Ready) — buy3_schema=1 라이브"
  - "gh-trade 회신(2026-09-28 11:27 KST, 후계 세션 gh-trade-f2) — buy_watch_side 봉인 후속 진행 가능"
affects: [relay 컨테이너 radar-gw, webapp 프로덕션(Vercel), gh-trade buy_watch_side 봉인 후속]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/24-limitchaser-buy3/24-09-SUMMARY.md
  modified: []
decisions:
  - "재기동·배포를 장중 11:00~12:00 KST 로 당김(사용자 결정) — 플랜의 「20:00 KST 이후」 조건을 대체"
  - "gh-trade 트리 HEAD 27adbcfc 는 배포 커밋 cfbbd3e2 뒤 docs 전용 1커밋(.planning 3파일) — 스키마·서버 코드 동일로 판정해 진행"
  - "중간 창(옛 relay + 새 서버) 10:47:22 ~ 11:13:46 KST 약 26분 · 장중 — 사용자 결정(Deviation 1)"
  - "운영 웹 눈 확인(Task 3 ⑥)과 후매수 소진 300ms 창 실기 관찰(⑨)은 미수행 — verify-work UAT 로 이월"
metrics:
  duration: "~45m (Task 2 10:55~11:05 · Task 3 메인 세션 11:05~11:27 KST · 재기동 10:47 포함 시 중간 창 26분)"
  completed: "2026-09-28"
actuals:
  tokens: 9000
  tasks: 3
  commits: 1
plan_head_before: 9457a53d468cecf573e30eab3185a6b316628d9e
commits: 1
---

# Phase 24 Plan 09: 배포 — buy3_schema=1 프로덕션 반영 Summary

**relay `relay:94ebc91c`(직전 `2fe94209`) → smoke PASS 12 · FAIL 0 · SKIP 1 → master `94ebc91c` fast-forward push → Vercel 프로덕션 Ready, gh-trade 에 11:27 KST 회신 — 롤백 없음. 운영 웹 눈 확인 · 300ms 창 실기 관찰만 UAT 로 이월.**

> Task 1 · 2 는 서브에이전트, Task 3 배포는 메인 세션이 사용자 확인 뒤 수행했다(서브에이전트는 배포 명령을 하나도 실행하지 않음). 아래 「배포 절차」 는 초안 당시 정리본이고 실제 결과는 「배포 기록」 절에 있다.

## Task 1 — gh-trade-38 예고 (2026-09-28 10:53 KST)

| # | 항목 | 값 |
|---|---|---|
| ① | 24-11 서버 바이너리 전송 | KB 120 전송 완료 |
| ② | 24-12 재기동 | 2026-09-28 **10:47:22 KST** Initialized successfully · 브로커 재연결 10:47:52 · 전략 24건 복원(후매수 4값 포함) · 주문 저널 열림(epoch 20260925, head 253 이어짐) |
| ③ | WinForms Release 발행 | 2026-09-28 10:29 (cfbbd3e) 매니페스트 갱신 완료. 구 클라가 살아 있어 서버가 「buy3_schema 부재 → 선매수만 켠 등록」 WARN 을 냄 — 예상 동작(gh-trade D-24) |
| ④ | 서버 가동본 커밋 | **cfbbd3e2** (= gh-trade origin/master 당시) |
| ⑤ | 트리 경로 | `/Users/alex/repos/gh-trade/.claude/worktrees/phase-24-limitchaser-buy3` |

gh-trade-38: 「gh-radar 24-09(relay 배포 → smoke → webapp push)를 진행해도 된다」.

**중간 창:** 10:47 재기동 이후 옛 relay(buy3_schema 없음)가 가동 중 — relay 배포 전까지 웹 상따 매수 조작 삼가 필요(사용자 · 팀 안내는 메인 세션 몫).

## D-14 상태

24-02-SUMMARY 「D-14 추출 결과」 = **옛 서버 lc.snap — 총 2건 · 매수잔량 기준 0건** (08:06 KST, 24-12 재기동 **전**). 재설정 대상 없음 — 추출 기회 상실 아님.

## 생성물 대조 (Task 2 ①)

- 트리 확인: `git -C <tree> log -1 --format=%h` = **27adbcfc** (≠ cfbbd3e2). `cfbbd3e2..27adbcfc` = docs 1커밋(`docs(24): 24-11 전송·24-12 재기동·클라 발행 요약`), 바뀐 파일은 `.planning/STATE.md` · `24-11-SUMMARY.md` · `24-12-SUMMARY.md` 3개뿐 — `server/src/protocol/StockDMA.fbs` 포함 코드 변경 0. cfbbd3e2 는 조상. → 배포 커밋과 같은 스키마로 판정(Deviation 2).
- `RELAY=/Users/alex/repos/gh-radar/relay ./scripts/sync-relay-schema.sh --check` (flatc 25.12.19):
  - 생성 .ts 49 개 · **신규/변경 예정 : 0 개** · 삭제 예정 없음 · **.fbs 사본 : 최신 (마커 7줄 제외 본문 동일)** · 가드 3종 통과
- relay `StockDMA.fbs` 마커: `server-repo-commit: cfbbd3e2` · `synced-date: 2026-09-28` — 재생성은 메인 세션이 이미 `136d4d87`(chore(24), QuoteState 58/59 시간외 잔량 필드 append · buy_enabled D-34 주석 — relay 미사용 · 와이어 영향 없음)로 끝냄. 이 태스크에서 추가 재생성 없음.
- 24-01 재생성 당시: 팁 `9c35fcbf` · 마커 커밋 `1d95f64f` → 이번이 두 번째 동기화(cfbbd3e2).

## 준비 게이트 결과 (Task 2 ②)

| 게이트 | 명령 | 결과 |
|---|---|---|
| 1 스키마 | `sync-relay-schema.sh --check` (위) | exit 0 · 0 개 · 최신 |
| 2 build/typecheck/unit | `pnpm --filter @gh-radar/shared build && … relay typecheck && … relay typecheck:tests && … webapp typecheck && … relay test && … webapp test` | exit 0 · `error TS` 0 · relay **28 files / 651 passed** · webapp **125 files / 2681 passed · 1 skipped (2682)** |
| 3 e2e | `pnpm --filter @gh-radar/webapp exec playwright test e2e/specs/trading-workbench.spec.ts e2e/specs/a11y.spec.ts --grep-invert "5\. 격자\|P20-3 최악값\|iPhone 가로 폭 844"` | exit 0 · **67 passed (2.9m)** |

HEAD `9457a53d` (사용자 quick-260928-ei9 두 커밋 포함) 기준으로 다시 돌렸다.

## 작업 트리 · master 병합 (Task 2 ③)

- `git status --porcelain --untracked-files=no` → **0 줄**. 추적 안 되는 남의 파일(`.planning/milestone.lock` · `.planning/quick/260928-cs1-toast-top-right/shots/` · `.planning/research/.cache/`)은 건드리지 않음.
- `git rev-list --left-right --count origin/master...HEAD` → **0 / 72** (fetch 직후, origin/master = `3bb17a72`)
- **master 병합 필요: 아니오 (left 0 / right 72)** — origin/master 가 HEAD 의 조상이라 fast-forward 로 올라간다. 병합 방식(직접 FF push · `/gsd-ship`)은 메인 세션이 사용자와 정한다. push 직전 `git fetch && git rev-list --left-right --count origin/master...HEAD` 재확인(동시 세션 경합).
- 참고: `origin/gsd/phase-24-limitchaser-buy3` 는 로컬보다 64 뒤 — phase 브랜치 원격은 배포와 무관.

### origin/master..HEAD 중 Phase 24 밖 커밋 (모두 deepblue-1 · 사용자 본인) — push 하면 함께 프로덕션에 나간다

| 커밋 | 내용 | 프로덕션 영향 |
|---|---|---|
| `9457a53d` | docs(quick-260928-ei9) 교보 DMA 신규 서버 .127 — 계획·요약·STATE | 없음(.planning) |
| `d15bc821` | feat(quick-260928-ei9) radar-gw wg0 전달 규칙·문서 — `infra/relay/startup.sh` · README · securwayssl.service | relay 컨테이너 무관(`deploy-relay.sh` 는 startup.sh 를 쓰지 않음 — `setup-relay-iam.sh` 소관, VM 메타데이터는 이미 라이브 반영) |
| `4928cf0a` · `ed2cbd64` · `44cb29d1` | quick-260928-cs1 작업대 알림 토스트 우상단(헤더 아래) — `alert-toasts.tsx` · `globals.css` · `trading-alerts.ts` · e2e | **webapp 에 나감**(UI 변경) |
| `02a2fe40` | docs(quick-260927-s4j) Phase 22 보안 W-1·W-2 | 없음 |
| `473bfb7e` · `49c9c380` · `d71e841c` | fix(mobile) release-apps.sh · Fastfile lane 게이트 (Phase 22 W-1/W-2 · CR-01) | 웹 무관(네이티브 릴리스 스크립트) |
| `34fda0ef` · `9965d0b5` · `b5c8e051` · `b963c0e7` · `c0835cb4` | docs(22) 보안·UAT·검증 | 없음 |
| `96abbb03` | docs(sketch-010) 상따 옵션 금액 환산 스케치 · tasks/lessons.md | 없음 |
| `db1c249b` | merge origin/master(3bb17a72) → Phase 24 브랜치 (사전 병합) | origin/master 쪽 내용이라 이미 master 에 있음 |

(Phase 24 관련이지만 plan 번호 없는 커밋: `4d272bda` · `f6a2cdc9` · `6c309635` sketch-009 · `d05044ed` · `5cec6b50` · `6047c3f3` · `a8836fb2` · `10fea29b` · `6f5dd8ce` · `136d4d87` · `ad06e4b6`)

→ 메인 세션은 cs1 토스트 변경과 Phase 22 mobile 수정이 이번 push 에 함께 실린다는 것을 사용자와 확인할 것.

## 배포 절차 (Task 3 — 메인 세션만 · 사용자 확인 뒤)

사용자 결정으로 **장중 11:00~12:00 KST** 창에서 진행(플랜 원문 「20:00 이후」 대체). 서브에이전트는 아래 명령을 하나도 실행하지 않았다.

0. 인증: `export GOOGLE_APPLICATION_CREDENTIALS=~/.config/gcloud/gh-radar-deployer.json CLOUDSDK_CORE_PROJECT=gh-radar` · 활성 gcloud configuration 이 `gh-radar` 이고 project 가 `gh-radar` 인지(deploy-relay.sh Section 1 가드가 불일치 시 중단).
1. `cd /Users/alex/repos/gh-radar && git status -sb && git log --oneline -3` — 남의 새 로컬 커밋 · 미커밋 추적 변경 없음 확인. `git fetch origin && git rev-list --left-right --count origin/master...HEAD` 가 `0 N` 인지(앞 숫자 > 0 이면 멈추고 병합 → build/test 재실행).
2. 롤백 대상(직전 태그) 먼저 적어 두기 — 아래 「롤백 태그 확인 방법」.
3. env 준비(로컬 .env 파일 읽지 않음):
   - `SUPABASE_URL=$(gcloud run services describe gh-radar-server --region=asia-northeast3 --project=gh-radar --format=json | jq -r '.spec.template.spec.containers[0].env[] | select(.name=="SUPABASE_URL") | .value')`
   - `NOTIFICATION_CHANNEL_ID=$(gcloud alpha monitoring policies list --project=gh-radar --filter='displayName="gh-radar-relay-down"' --format='value(notificationChannels)' | head -1)` (선택 — 비면 알림 정책 단계만 건너뜀, 배포는 완료)
   - **`DMA_HOST` 는 주입하지 않는다**(실행 중 컨테이너 값 보존 — 16-26 · 16-35 강등 선례). 출력의 「DMA_HOST 출처」 가 실행 중 값 보존인지, 「⚠ DMA_HOST 가 이번 배포로 바뀝니다」 경고가 **없는지** 확인. 경고가 뜨면 즉시 Ctrl-C.
4. relay 배포: `GCP_PROJECT_ID=gh-radar SUPABASE_URL="$SUPABASE_URL" NOTIFICATION_CHANNEL_ID="$NOTIFICATION_CHANNEL_ID" bash scripts/deploy-relay.sh` — 출력의 `SHA=` · `TARGET=` (새 이미지 태그 = HEAD short SHA)를 적는다.
5. `bash scripts/smoke-relay.sh` → **FAIL 0** (INV-9 SKIP 정상 — SMOKE_AUTH_TOKEN 미저장이 정상, INV-4 SKIP 도 가능) · `curl -s https://dma.jx1.io/healthz` 에 `status:"ok"` · `dma:true` · `stalledCount:0`.
6. 4 · 5 중 하나라도 실패 → **push 하지 않는다** → `GCP_PROJECT_ID=gh-radar SUPABASE_URL="$SUPABASE_URL" bash scripts/deploy-relay.sh --rollback <직전 태그>` → `bash scripts/smoke-relay.sh` → 원인 보고.
7. 통과 → push 직전 `git status -sb` 재확인 → master fast-forward push(= webapp 프로덕션 배포, 예: `git push origin HEAD:master`; 방식은 사용자와 정한 대로).
8. Vercel 확인: 이 push 의 팁은 **docs 커밋**(`docs(24-09): …`)이라 ignoreCommand 가 빌드를 건너뛸 가능성이 높다 — 프로덕션 배포가 그 커밋으로 실제 빌드됐는지 확인하고, 건너뛰었으면 저장소 루트에서 `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod`.
9. 운영 웹 확인: 상따 카드 매수 LED · 접힌 카드 3장 · DevTools WS `lc.snap` 에 `buy3Schema: 1` · (가능하면) 실전략 1건 값 확정 → 에코. cs1 토스트 우상단 위치도 한 번.
10. 사용자에게 열린 탭 · 앱 WebView 새로고침 안내(옛 JS 는 거부 프레임 「매수 설정 방식이 바뀌었어요 — 화면을 새로고침해 주세요」만 받는다).
11. gh-trade-38 에 SendMessage: 「gh-radar buy3_schema=1 배포 완료 — relay 이미지 <태그> · webapp <커밋> · <시각 KST>. buy_watch_side 봉인 후속 진행 가능」.
12. (선택 · 실기 UAT) 후매수 소진 푸시(300ms) 전 옛 ON 재제출 창이 웹에서 생기는지 관찰.

## 롤백 태그 확인 방법 (실행하지 않음 — 방법만)

- `GCP_PROJECT_ID=gh-radar SUPABASE_URL=<위 값> bash scripts/deploy-relay.sh --rollback` (**태그 없이**) → Section 1 가드 · DMA_HOST 해석 뒤 「ERROR: --rollback 은 이미지 태그가 필요합니다. 사용 가능한 태그:」 와 함께 `gcloud artifacts docker tags list <REGISTRY>/relay` 최근 10개를 출력하고 exit 1 (빌드 · VM 배포 없음). 주의: 이 경로도 DMA_HOST 현재 값 조회를 위해 VM 조회를 먼저 지난다.
- 현재 가동 태그를 직접 보려면(읽기 전용): `gcloud compute ssh radar-gw --tunnel-through-iap --zone=asia-northeast3-a --command="sudo docker inspect gh-radar-relay --format '{{.Config.Image}}'"` — 배포 전 이 값이 곧 「직전 태그」.

## 배포 기록 (Task 3 — 메인 세션 · 2026-09-28)

배포 순서 준수: gh-trade 서버 재기동 **10:47:22** → WinForms 발행 **10:29**(재기동 전 선행) → relay 배포 → smoke → master push.

| 항목 | 값 |
|---|---|
| relay 직전 이미지 태그(롤백 대상) | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:2fe94209` (2026-09-26 기동) |
| relay 새 이미지 태그 | `asia-northeast3-docker.pkg.dev/gh-radar/gh-radar/relay:94ebc91c` |
| relay 배포 명령 · 시각 | `bash scripts/deploy-relay.sh` (GCP_PROJECT_ID=gh-radar · SUPABASE_URL 은 라이브 Cloud Run gh-radar-server env 에서 · NOTIFICATION_CHANNEL_ID 주입) — 시작 ~11:05, 완료 **11:13:46 KST**, exit 0 |
| DMA_HOST 출처 · 값 보존 | 실행 중 컨테이너 값 보존 — `10.41.1.120`, 이번 배포로 바뀌지 않음(경고 없음) |
| VM /healthz (배포 직후) | 200 · status ok · vpn true · dma true · version 94ebc91c · sessionCount 2 · stalledCount 0 · journal live (lastSeq 266) |
| 모니터링 | uptime check `gh-radar-relay-healthz` 갱신 · alert policy `gh-radar-relay-down` 갱신 |
| smoke PASS / FAIL / SKIP | `bash scripts/smoke-relay.sh` 11:14 KST — **PASS 12 · FAIL 0 · SKIP 1** (INV-9 `SMOKE_AUTH_TOKEN` 미설정 — 정상). INV-1~8 · 10a/10b PASS, INV-4 PASS |
| 공개 /healthz status · dma · stalledCount | 11:15:10 KST `{"status":"ok","dma":true,"vpn":true,"version":"94ebc91c","sessionCount":3,"stalledCount":0,"journal":"live"}` |
| push 한 webapp 커밋 | **`94ebc91c`** — 11:15:27 KST `3bb17a72..94ebc91c HEAD -> master` (fast-forward, 직전 `origin/master...HEAD` 0/73). 브랜치 `gsd/phase-24-limitchaser-buy3` 도 같은 커밋으로 push |
| Vercel 프로덕션 배포 확인 | 자동 프로덕션 빌드가 돌았음(ignoreCommand 가 건너뛰지 않음) — deployment `https://gh-radar-webapp-3npxs5eqz-alexs-projects-eabbefc0.vercel.app`, created 11:15:29 KST, **Ready**, 프로덕션 alias `gh-radar-webapp.vercel.app` 가 이 deployment 를 가리킴(11:25 확인). 수동 `vercel deploy --prebuilt` 불필요 |
| 롤백 | 하지 않음 — 모든 게이트 통과 |
| 새로고침 안내 | 메인 세션이 사용자에게 11:27 KST 안내(열린 탭 · 앱 WebView) |
| gh-trade 회신 시각 | **2026-09-28 11:27 KST** SendMessage 「gh-radar buy3_schema=1 배포 완료 — relay 이미지 94ebc91c · webapp 94ebc91c. buy_watch_side 봉인 후속 진행 가능」. 주의: **gh-trade-38 세션 소켓이 사라져 후계 세션 gh-trade-f2 로 보냄** |
| 중간 창(옛 relay + 새 서버) | 10:47:22 ~ 11:13:46 KST (약 26분, 장중) — 장중 배포는 사용자 결정(Deviation 1) |

### 미수행 — UAT 이월 (verify-work)

| Task 3 단계 | 항목 | 상태 |
|---|---|---|
| ⑥ 운영 웹 눈 확인 | 상따 카드 매수 LED · 접힌 카드 3장 · DevTools WS `lc.snap` 에 `buy3Schema: 1` · 실전략 1건 값 확정 → 에코 (cs1 토스트 우상단 위치 포함) | **미수행 — UAT 이월** |
| ⑨ 실기 관찰(선택) | 후매수 소진 푸시(300ms) 전 옛 ON 재제출 창이 웹에서 실제로 생기는지 | **미수행 — UAT 이월** |

플랜 acceptance_criteria(relay 새/직전 태그 · smoke 요약 · webapp 커밋 · Vercel 확인 · 회신 시각)는 모두 충족. 위 두 항목은 acceptance 밖의 눈 확인 · 선택 관찰이라 이 플랜을 막지 않는다.

## Deviations from Plan

1. **[사용자 결정] 장중 재기동 · 배포** — 플랜은 24-12 재기동 · relay 교체를 「20:00 KST 이후」로 못박았으나, 사용자가 **장중 11:00~12:00 KST** 로 결정. 재기동은 10:47:22 에 이미 끝났다. Task 1 의 「재기동 시각 20:00 이후」 검증은 이 결정으로 대체. 실제 중간 창(옛 relay · 새 서버)은 10:47:22 ~ 11:13:46 KST 약 26분(장중).
2. **[Rule 3] gh-trade 트리 HEAD 불일치(27adbcfc ≠ cfbbd3e2)** — 차이는 docs 1커밋(.planning 3파일)뿐이고 cfbbd3e2 가 조상 · 스키마 원본 변화 없음. 멈추지 않고 `--check` 를 그 트리에서 실행(결과 0 개 · 최신).
3. **사전 병합 `db1c249b`** — Task 3 단계 1 의 「필요하면 master 병합」을 메인 세션이 배포 전에 미리 수행(origin/master 3bb17a72 → Phase 24 브랜치). 그래서 이번 게이트에서 left = 0.
4. **사전 재생성 `136d4d87`** — Task 2 ① 의 조건부 재생성을 메인 세션이 이미 cfbbd3e2 기준으로 커밋(QuoteState 58/59 append · 주석, relay 미사용). 이번 `--check` 로 최신임을 재확인만.
5. **e2e `--grep-invert`** — 플랜 명령(trading-workbench + a11y 전체)은 Phase 21 기존 실패 3건(「5. 격자」 · 「P20-3 최악값」 · 「iPhone 가로 폭 844 … 16px」, `deferred-items.md`) 때문에 green 이 될 수 없어 이 셋을 빼고 실행(24-03 ~ 24-08 과 같은 관행). Phase 24 변경과 무관.
6. **gh-trade 회신 수신 세션 변경** — 플랜은 gh-trade-38 에 회신하도록 했으나 해당 세션 소켓이 사라져 메인 세션이 후계 세션 **gh-trade-f2** 로 보냈다(내용 동일, 11:27 KST).
7. **운영 웹 눈 확인(⑥) · 300ms 창 관찰(⑨) 미수행** — verify-work UAT 로 이월(위 「미수행 — UAT 이월」 표).
8. **Vercel 자동 빌드** — 초안은 팁이 docs 커밋이라 ignoreCommand 가 건너뛸 수 있다고 봤으나 실제로는 자동 프로덕션 빌드가 돌아 수동 배포가 필요 없었다.

## Known Stubs

없음 (문서 전용 플랜 — 코드 변경 없음).

## Threat Flags

없음 — 새 네트워크 표면 없음. T-24-37 ~ T-24-41 완화는 위 절차(순서 고정 · 서브에이전트 미배포 · DMA_HOST 미주입 · 롤백 태그 기록 · 드리프트 0 게이트)로 유지.

## Self-Check: PASSED

- FOUND: .planning/phases/24-limitchaser-buy3/24-09-SUMMARY.md
- FOUND: 94ebc91c (SUMMARY 초안 커밋 · push 된 webapp 커밋, origin/master 포함)
