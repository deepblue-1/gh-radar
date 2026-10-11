---
phase: 30-kb-ip-mac
verified: 2026-10-11T10:30:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - ".planning/phases/30-kb-ip-mac/30-01-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-01-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-02-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-02-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-03-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-03-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-04-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-04-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-05-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-05-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-06-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-06-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-07-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-07-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-08-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-08-SUMMARY.md"
  - ".planning/phases/30-kb-ip-mac/30-09-PLAN.md"
  - ".planning/phases/30-kb-ip-mac/30-09-SUMMARY.md"
  - "packages/shared/src/admin.ts"
  - "packages/shared/src/order-endpoint.ts"
  - "relay/src/admin/admin-api.ts"
  - "relay/src/admin/dispatcher.ts"
  - "relay/src/admin/planner.ts"
  - "server/src/routes/admin.ts"
  - "server/src/schemas/admin.ts"
  - "server/src/services/relay-admin-client.ts"
  - "webapp/src/components/admin/account-editor.tsx"
  - "webapp/src/components/admin/user-sheet.tsx"
  - "webapp/src/components/admin/users-client.tsx"
covered_digest: "v3:sha256:cad5665767b079197aae10212fb49a5cf65d6ef2bbae5085ebbbabb3669a582a"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 30: 인박스 KB 계좌별 주문자 IP/MAC 검증 보고서

**Phase Goal:** 운영자가 웹 Admin 에서 KB 계좌별 주문자 IP/MAC 을 안전하게 설정·수정할 수 있고, relay 밖에서 설정한 값이 웹 계좌 편집으로 지워지지 않는다(R3-01 해제 → KB 운영 서버 IP/MAC 설정 보류 해제)
**Verified:** 2026-10-11
**Status:** passed
**Re-verification:** 아니오 — 최초 검증 (이전 VERIFICATION.md 없음)

## 목표 달성 여부

SUMMARY 주장이 아니라 코드와 테스트 실행 결과로 확인했다. 배포 코드(webapp `34f145b1`)와 현재 HEAD 의 제품 코드 차이는 0이다(`git diff --stat 34f145b1..HEAD -- relay/src server/src packages/shared/src webapp/src webapp/e2e` 빈 출력, 이후 커밋 5건은 전부 docs). relay/server 는 `2234a1b5..HEAD` 사이 무변경이다.

### Observable Truths (ROADMAP Success Criteria 7개 = 계약)

| # | Truth | 상태 | 증거 |
|---|-------|------|------|
| 1 | relay 밖에서 설정한 IP/MAC 이 이름만 바꾼 웹 저장 뒤에도 87 에 남는다(미설정은 빈 문자열) | VERIFIED | `relay/src/admin/dispatcher.ts` `#applyServer` 303-322행: 계획에 op 3 또는 op 1(계좌) 이 있으면 `admin.command({op: ListUsers})` 로 87 을 새로 받아 `plan(snapshot)` 을 처음부터 다시 만든다. 재조회가 result 가 아니면 44 를 보내지 않고 timeout/offline 반환(fail closed). `planner.ts` `withServerEndpoint` 가 의도 쌍 > 이 유저 87 > 다른 유저 87 > `""` 순으로 되싣는다. 단위 테스트 `admin-dispatcher.test.ts` "IPMAC-01 R3-01" 블록(재조회 timeout/offline 44 0건, 비밀번호·제거·삭제 재조회 0회, 마감 포함) green. 실서버 UAT 1: relay_docker 에서 저장 6건 모두 87 수신 → 약 30ms 뒤 op 3 code 0. |
| 2 | `10.41.1.124` / `1c:fd:08:7d:97:8e` 저장 → 86 code 0, 목록은 `10.41.1.124` / `1C:FD:08:7D:97:8E` 표기, 같은 값 재저장은 「변경 없음」 | VERIFIED | `shared/order-endpoint.ts` 의 `normalizeOrderIp/Mac` · `formatOrderIp/Mac` 한 벌. `account-editor.tsx` 읽기 줄 464-466행이 `formatOrderIp/Mac(summary…)`, 편집 초깃값 697-698행도 동일. 전송은 원문 trim(561행 `draft.ip.trim()`), 비교는 양쪽 정규화(shared `sameValues` 458-459행). webapp 컴포넌트 테스트 186개 green, E2E `P30-E2` 존재. 실서버 UAT 2·3 및 2라운드 R2-1 pass. |
| 3 | 한쪽만 적거나 형식 오류면 웹이 저장 전에 차단, 서버 code 13 은 서버 문구 원문 표시 | VERIFIED | `validateOrderEndpointInput`(shared) 클라 검증, Express 스키마(`server/src/schemas/admin.ts` 162-181행)·relay 는 형식 검사 없이 통과시켜 서버 code 13 message 를 결과 배열로 원문 전달. E2E `P30-E3`, UAT 4 pass. |
| 4 | 입력칸 아래 도움말 한 줄 | VERIFIED | `account-editor.tsx` 154행 `ipmacHelp` 「같은 서버의 두 계좌가 서로 체결될 수 있으면 계좌마다 서로 다른 사용자 PC 의 IP · MAC 을 적으세요(ipconfig /all).」 교보는 「해당 없음」 줄. |
| 5 | 기존 계좌 계좌명 편집 → 등록 서버마다 op 3 반영, 카드에 새 이름 | VERIFIED | `account-editor.tsx` `editSave = useFieldSave(putDmaAccount…)` 편집 카드. relay 는 이름 변경 시 active 등록 서버마다 op 3(IPMAC-05 테스트 green). E2E `P30-E4`, UAT 1 pass. |
| 6 | 인박스 `261010-kb-order-ip-mac.md` 질문 3개 답 + `status: done` + `done_commit` | VERIFIED | `docs/inbox/from-gh-trade/261010-kb-order-ip-mac.md`: `status: done`, `done_commit: 5687c282`(실존 커밋 확인), 「회신」 섹션에 ① code 7(261011 연결) ② 입력 표기(원문 전송 · 표시는 87 값) ③ `ipconfig /all` 수기 절차. `261011-shared-account-ipmac` 언급 1건. 비고: `done_commit` 이 `test(30-09)` 커밋을 가리킨다(기능상 문제 없음, 형식 요건 충족). |
| 7 | 공유 KB 계좌 편집 시 「함께 쓰는 사용자」 안내, 저장 뒤 그 사용자 카드도 새 값으로 재조회 | VERIFIED | shared `findSharedAccountHolders`(`admin.ts` 863행), `account-editor.tsx` 672-674행·164행 안내 문구, `users-client.tsx` 177행 · `user-sheet.tsx` 289행에서 `users` 결선. 저장 성공 시 `onChanged()` 개요 재조회. E2E `P30-E6`/`E7`, UAT 5 · R2-2 · R2-3 pass(KB120). SC 문구대로 KB121 실서버 확인은 비차단. |

**Score:** 7/7 truths verified (behavior_unverified 0 — 동작 의존 truth 인 fail-closed·재조회 순서는 `admin-dispatcher.test.ts` 가 직접 실행해 증명하고, 실서버 relay_docker 로그가 87 → op 3 순서를 확인함)

### Required Artifacts

| Artifact | 기대 | 상태 | 세부 |
|----------|------|------|------|
| `relay/src/admin/dispatcher.ts` | op 5 재조회 + fail closed | VERIFIED | 실질 구현, 배포 중 |
| `relay/src/admin/planner.ts` | `withServerEndpoint` · R3-02 되싣기 | VERIFIED | |
| `relay/src/admin/admin-api.ts` | `orderEndpoint` 스키마 · `GET /order-endpoints` | VERIFIED | 교보 400, 감사 set/clear 플래그 |
| `server/src/schemas/admin.ts` · `routes/admin.ts` · `relay-admin-client.ts` | zod 통과 · 개요 병렬 병합 · PUT 전달 | VERIFIED | zod 가 `orderEndpoint` 를 버리지 않음 |
| `packages/shared/src/order-endpoint.ts` · `admin.ts` | 규칙 한 벌 · 공유 계좌 판정 | VERIFIED | |
| `webapp/src/components/admin/account-editor.tsx` | 입력칸 · 읽기 줄 · 안내 · 계좌명 편집 | VERIFIED | |
| `webapp/e2e/specs/admin.spec.ts` · `fixtures/admin.ts` | P30-E1~E7 | VERIFIED (존재만 — Playwright 는 지침상 미실행) | |

### Key Link Verification

| From | To | Via | 상태 |
|------|----|-----|------|
| `account-editor` 저장 | Express PUT | `putDmaAccount` body 최상위 `orderEndpoint` | WIRED |
| Express PUT | relay `putAccount` | `relay.putAccount(dma, body)` 전체 body 전달 | WIRED |
| relay `putAccount` | op 3 | reconcile override → `planServerOps` → `sendable()` | WIRED |
| dispatcher | op 5 | `#applyServer` 재조회 → `plan(freshSnapshot)` | WIRED |
| Express `GET /users` | relay `GET /order-endpoints` | `Promise.all([rpc, fetchOrderEndpoints])` | WIRED |
| `users-client` → `user-sheet` → `account-editor` | `findSharedAccountHolders` | `users` prop | WIRED |

### Data-Flow Trace (Level 4)

IP/MAC 읽기 줄의 값은 relay 87 메모리 캐시(실 gh-trade 응답) → relay `/order-endpoints` → Express 개요 병합 → `summarizeOrderEndpoint` → `formatOrderIp/Mac` 로 흐른다. 하드코딩·정적 폴백 없음(relay 실패 시 null → 「확인 전」 으로 명시 표기). FLOWING. 실서버 UAT 에서 실제 값 표시 확인.

### Behavioral Spot-Checks (직접 실행, `--maxWorkers=2`)

| 대상 | 결과 |
|------|------|
| shared build + `order-endpoint` · `admin` · `admin-overview` 테스트 | 3 파일 144 tests pass |
| relay `admin-dispatcher` · `admin-planner` · `admin-api` | 3 파일 135 tests pass |
| server `routes/admin` · `routes/admin-dma` · `services/relay-admin-client` | 3 파일 143 tests pass |
| webapp `src/components/admin` | 9 파일 186 tests pass |
| webapp `typecheck`(tsc 본체 + e2e tsconfig) | 오류 없음 |
| Playwright | 지침상 미실행 |

### Probe Execution

해당 없음(이 phase 는 probe 스크립트를 선언하지 않음).

### Requirements Coverage

PLAN frontmatter 의 requirements 합집합 = IPMAC-01 ~ 05. REQUIREMENTS.md 의 Phase 30 매핑 5건과 일치하며 orphaned 없음.

| Requirement | 상태 | 증거 |
|-------------|------|------|
| IPMAC-01 | SATISFIED | SC1 — op 5 재조회 · fail closed · 실서버 로그 순서 확인 |
| IPMAC-02 | SATISFIED | SC2·4·7 — 입력칸 · 검증 · 표기(D-17) · 7필드 멱등 · 도움말 · 공유 안내(D-18) |
| IPMAC-03 | SATISFIED | SC3 — code 13/7 서버 문구 원문, 문장 대조 코드 없음(제품 소스 grep 0건) |
| IPMAC-04 | SATISFIED | SC6 — 인박스 노트 done + 실존 `done_commit` |
| IPMAC-05 | SATISFIED | SC5 — 계좌명 편집, 등록 서버마다 op 3 |

### Anti-Patterns

phase 가 수정한 제품 파일 14개에서 `TBD|FIXME|XXX|TODO|HACK` 0건. 스텁·하드코딩 빈 데이터 없음.

### 코드 리뷰 지적 (30-REVIEW.md · 처분 10건 모두 open) — 모두 비차단 경고

| ID | 내용 | 목표 영향 |
|----|------|-----------|
| WR-01 | `GET /api/admin/users` 가 relay 장애 시 최대 15초 대기 후 「확인 전」 | 지연 회귀, 기능 정상. 별도 짧은 타임아웃 권고 |
| WR-02 | `fetchOrderEndpoints` 모양 검사가 얕아 비정상 행이면 개요 500 가능 | relay 가 자체 서버라 발생 확률 낮음. 행 단위 검증 권고 |
| WR-03 | 편집 저장 진행 중 서버 토글 시 미확정 초안 이름이 PUT 으로 나갈 수 있음 | 토글 body 에는 `orderEndpoint` 가 없어 IP/MAC 은 위험 없음. 이름 경합 좁은 구간 |
| WR-04 | 편집 저장 실패 칩이 편집 카드 닫힌 뒤 BusyLines 에서 사라짐 | 표시 누락. 결과 자체는 영향 없음 |
| IN-01~06 | 저장 버튼 비활성 사유 미표시, 공유 사용자 근사, R3-02 tie-break, 교보 87 IP/MAC 브라우저 노출, 재조회 마감, 「확인 전」 에서 지우기 불가 | 정보 수준 |

이 항목들은 어떤 ROADMAP SC 도 깨뜨리지 않아 gap 으로 올리지 않았다. 다만 처분이 전부 open 이므로 `fixed|deferred|skipped` 로 정리할 것을 권한다(WR-01·WR-02 는 server 재배포가 필요).

### 비차단 후속 (must-have 밖, 인지용)

1. **KB TCHODR1000 `orderInfo`/`macAddr` 회선 관측 미완** — 설정한 IP/MAC 이 실제 KB 주문 전문에 실리는지는 gh-trade 단위 테스트(`test_kb_endpoint_race.cpp`)로만 커버된다. 이 phase 의 책임 경계(웹·relay·server) 밖이며 SC 에 없다. 그러나 phase 의 최종 동기(통정거래 경고 회피)가 이 관측에 달려 있으므로 운영자가 첫 실주문 뒤 KB 담당 조회 또는 패킷 캡처로 확인하길 권한다.
2. **KB121 공유 계좌 저장 미확인** — SC7 이 명시적으로 비차단으로 규정. gh-trade 쪽 현재 KB121 미가동.

### Human Verification Required

없음. 실서버 확인 항목은 이미 30-UAT.md 1·2라운드에서 사용자 pass 로 기록됐고(5/5), 위 비차단 후속은 phase 의 must-have 가 아니다.

### Gaps Summary

gap 없음. 7개 성공 기준과 5개 요구사항 ID 모두 코드·테스트·실서버 UAT 로 뒷받침되며, 배포된 코드가 HEAD 와 동일하다.

---

_Verified: 2026-10-11_
_Verifier: Claude (gsd-verifier)_
