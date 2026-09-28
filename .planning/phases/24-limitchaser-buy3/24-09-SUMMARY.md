---
phase: 24-limitchaser-buy3
plan: 09
subsystem: deploy (relay VM 컨테이너 · webapp Vercel)
tags: [deploy, relay, webapp, buy3_schema, gh-trade-sync, checkpoint]
status: in-progress
task1_status: complete (gh-trade-38 예고 2026-09-28 10:53 KST)
task2_status: complete (준비 게이트 통과 — 배포하지 않음)
task3_status: pending (checkpoint:human-action · blocking-human — 메인 세션 배포)
requires: ["24-01", "24-02", "24-03", "24-04", "24-05", "24-06", "24-07", "24-08"]
provides:
  - "gh-trade 배포 커밋 cfbbd3e2 기준 relay 생성물 드리프트 0 확인"
  - "배포 준비 게이트 결과(build · typecheck · unit · e2e)"
  - "메인 세션용 배포 절차 · 롤백 태그 확인 방법 · master 병합 판단"
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
metrics:
  duration: "~10m (Task 2 · 10:55~11:05 KST)"
  completed: "draft 2026-09-28"
actuals:
  tokens: 6000
  tasks: 2
  commits: 0
plan_head_before: 9457a53d468cecf573e30eab3185a6b316628d9e
commits: 0
---

# Phase 24 Plan 09: 배포 — 준비 게이트 통과 (초안 · Task 3 메인 세션 배포 대기)

**gh-trade 배포 커밋 cfbbd3e2 트리 기준 `sync-relay-schema.sh --check` 드리프트 0 · relay 651 · webapp 2681 · e2e 67 green — 아무것도 배포하지 않았고, 메인 세션이 relay → smoke → push 순서로 배포할 절차를 아래에 정리했다.**

> 이 문서는 **초안**이다. Task 3(메인 세션 배포) 결과를 받으면 「배포 기록」 절을 채우고 status 를 complete 로 올린다.

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

## 배포 기록 (Task 3 — 메인 세션 결과 대기)

| 항목 | 값 |
|---|---|
| relay 직전 이미지 태그 | _(대기)_ |
| relay 새 이미지 태그 | _(대기)_ |
| DMA_HOST 출처 · 값 보존 | _(대기)_ |
| smoke PASS / FAIL / SKIP | _(대기)_ |
| /healthz status · dma · stalledCount | _(대기)_ |
| push 한 webapp 커밋 | _(대기)_ |
| Vercel 프로덕션 배포 확인 | _(대기)_ |
| 새로고침 안내 | _(대기)_ |
| gh-trade-38 회신 시각 | _(대기)_ |

## Deviations from Plan

1. **[사용자 결정] 장중 재기동 · 배포** — 플랜은 24-12 재기동 · relay 교체를 「20:00 KST 이후」로 못박았으나, 사용자가 **장중 11:00~12:00 KST** 로 결정. 재기동은 10:47:22 에 이미 끝났다. Task 1 의 「재기동 시각 20:00 이후」 검증은 이 결정으로 대체. 영향: 중간 창(옛 relay · 새 서버)이 장중에 열림 → 빠른 배포 · 웹 상따 매수 조작 자제 안내 필요.
2. **[Rule 3] gh-trade 트리 HEAD 불일치(27adbcfc ≠ cfbbd3e2)** — 차이는 docs 1커밋(.planning 3파일)뿐이고 cfbbd3e2 가 조상 · 스키마 원본 변화 없음. 멈추지 않고 `--check` 를 그 트리에서 실행(결과 0 개 · 최신).
3. **사전 병합 `db1c249b`** — Task 3 단계 1 의 「필요하면 master 병합」을 메인 세션이 배포 전에 미리 수행(origin/master 3bb17a72 → Phase 24 브랜치). 그래서 이번 게이트에서 left = 0.
4. **사전 재생성 `136d4d87`** — Task 2 ① 의 조건부 재생성을 메인 세션이 이미 cfbbd3e2 기준으로 커밋(QuoteState 58/59 append · 주석, relay 미사용). 이번 `--check` 로 최신임을 재확인만.
5. **e2e `--grep-invert`** — 플랜 명령(trading-workbench + a11y 전체)은 Phase 21 기존 실패 3건(「5. 격자」 · 「P20-3 최악값」 · 「iPhone 가로 폭 844 … 16px」, `deferred-items.md`) 때문에 green 이 될 수 없어 이 셋을 빼고 실행(24-03 ~ 24-08 과 같은 관행). Phase 24 변경과 무관.

## Known Stubs

없음 (문서 전용 플랜 — 코드 변경 없음).

## Threat Flags

없음 — 새 네트워크 표면 없음. T-24-37 ~ T-24-41 완화는 위 절차(순서 고정 · 서브에이전트 미배포 · DMA_HOST 미주입 · 롤백 태그 기록 · 드리프트 0 게이트)로 유지.
