---
phase: "22"
slug: "gh-trade-ios-testflight-android-play"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-27"
---

# Phase 22 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> 등록부 정본은 22-01~22-10 PLAN `<threat_model>`. 콘솔·기기·업로드가 필요한 항목은 SUMMARY·VERIFICATION 근거로 닫았다(「SUMMARY 근거」).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| 저장소 밖 비밀 파일 → 래퍼 | `~/.config/gh-trade/release/` env·.p8 가 래퍼 프로세스 env 로만 | ASC 키 · 업로드 키스토어·비밀번호 |
| 사용자 `!` 셸 → 비밀 디렉터리 · Secret Manager | 비밀 쓰기의 유일한 경로 | 키스토어 · 비밀번호 · .p8 · SA JSON |
| 로컬 빌드 → TestFlight / Firebase App Distribution | 서명 산출물이 테스터 기기로 배포 | 서명 IPA · APK · 빌드 설정 |
| 셸 환경(owner ADC) → fastlane 플러그인 | 자격 미명시 시 owner 키 폴백 | GOOGLE_APPLICATION_CREDENTIALS |
| 운영 GCP 프로젝트 → Firebase 추가 | 되돌릴 수 없는 API·SA 표면 | 프로젝트 API · IAM |
| rubygems.org → Gemfile.lock | 서드파티 Ruby 코드 실행 | fastlane · 플러그인 |
| 테스터 계정 → relay 트레이딩 | 실돈 주문 경로 | WS 구독 · 주문 |
| 비로그인 요청 → middleware 인증 벽 | 공개 prefix 경계 | pathname |
| `git push` → Vercel 프로덕션 · 다른 세션 커밋 | 웹 변경 즉시 배포 | 웹 커밋 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-22-01 | I | 비밀 저장소 유입 | high | mitigate | 저장소 밖 700/600 · ignore · hygiene (1)(2)(3)(8) | closed |
| T-22-02 | I | 비밀 로그·출력 | high | mitigate | 래퍼 키 이름만 · 추적 모드 0 · gradle 서명 속성 미전달 | closed |
| T-22-03 | I | 산출물 작업 트리 잔류 | medium | mitigate | fastlane output 저장소 밖 · ignore | closed |
| T-22-04 | T/I | dev 설정 릴리스 혼입 | high | mitigate | verify-prod 선행 사슬 · check-apk lane 내 업로드 전 · iOS Release 고정 | closed (W-2) |
| T-22-05 | D | Android OAuth SHA-1 누락 | medium | mitigate (+Play 부분 transfer) | 본인 로그인 게이트 → 초대 · README 문제 해결 절 | closed |
| T-22-06 | E | 테스터 실돈 주문 | high | mitigate | relay 서버측 unauthorized · dma_credentials 미발급 · UAT #4 | closed |
| T-22-07 | T | 빌드 번호 파일 기록 | low | mitigate | xcargs·gradle property 주입만 · hygiene (6) | closed |
| T-22-08 | R | 방침 부정확·미승인 | medium | mitigate | 승인본 · 시행일 · page.test 자리표시 단언 | closed (W-3) |
| T-22-09 | D/R | 백엔드 결합 push | high | mitigate | 22-10 GATE1·GATE4 · 백엔드 diff 0 재확인 | closed |
| T-22-10 | E | Play SA 과권한 | medium | transfer | Phase 23 · Phase 22 GCP 역할 0 확인 | closed |
| T-22-11 | D | 업로드 키 분실·덮어쓰기 | high | mitigate | SKIP/ERROR 가드 · 생성 경로 없음 · 백업 3개 | closed |
| T-22-12 | E | 공개 prefix 경계 | medium | mitigate | `public-path.ts` 정확 일치/`prefix/` · 단위 + e2e | closed |
| T-22-13 | I | Secret Manager 백업 접근 | low | accept | Accepted Risks AR-22-01 | closed |
| T-22-14 | E | ASC 테스터 역할 | medium | mitigate | Marketing · 앱 한정(SUMMARY 근거) | closed |
| T-22-15 | S | 동의 화면·가입 정책 | low | accept | Accepted Risks AR-22-02 | closed |
| T-22-17 | I | 문서 개인 이메일 | medium | mitigate | README 이메일 0 · 승인 연락처만 | closed |
| T-22-18 | D/T | `/privacy` 결합 | low | mitigate | 정적 RSC · fetch/훅 0 | closed |
| T-22-19 | S | 다른 키 APK | high | mitigate | check-apk 서명자 1 · SHA-1 대조(음성 검사 확인) | closed |
| T-22-20 | T/E | Firebase SA 키 | high | mitigate | 단일 역할 · 600 · 백업 없음 | closed |
| T-22-21 | E | ADC 폴백 | high | mitigate | `service_credentials_file` 명시 · env unset · hygiene (9) | closed |
| T-22-22 | T | 엉뚱한 APK 업로드 | high | mitigate | 절대 경로 · 빌드 전 삭제 · versionCode 대조 · debuggable 거부 | closed |
| T-22-23 | I | 1시간 다운로드 링크 | medium | mitigate | 문서 URL 0 · README 공유 금지 · 로그 저장소 밖 | closed (W-1) |
| T-22-24 | E | 운영 프로젝트 Firebase 표면 | medium | mitigate | D-17 결정 · 웹 로그인 회귀 ok(SUMMARY 근거) | closed |
| T-22-25 | T/I | google-services.json 유입 | medium | mitigate | ignore · hygiene (3)(8) | closed |
| T-22-26 | D | 에뮬레이터 release 잔류 | low | mitigate | uninstall 확인(SUMMARY 근거) | closed |
| T-22-27 | D | SHA-1 × 클라이언트 쌍 중복 | medium | mitigate | Firebase SHA-1 비움 · GCP 클라이언트 1개(SUMMARY 근거) | closed |
| T-22-28 | T | 모르는 모드 → 업로드 | medium | mitigate | env 로드 전 모드 검사 exit 2 · 조회 lane 쓰기 0 | closed |
| T-22-29 | R/T | 다른 세션 커밋 동반 push | high | mitigate | push 직전 behind 0 · LIST OK | closed (W-3) |
| T-22-SC | T | RubyGems 공급망 | high | mitigate | 단일 소스 · 버전 핀 · lock 추적 · Legitimacy Audit | closed |

*Status: open · closed · open — below high threshold (non-blocking)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-22-01 | T-22-13 | IAM 은 기존 운영자·deployer SA 만 · 백업 암호화 저장. 22-05 로 생긴 appdistro SA·Firebase 서비스 에이전트도 Secret Manager 접근 없음(W-4 gcloud 확인 2026-09-27) | 22-04 PLAN | 2026-09-27 |
| AR-22-02 | T-22-15 | D-05 웹과 같은 공개 가입 정책 · 동의 화면 「테스트」 3명 · 실돈 경로는 T-22-06 이 차단 | 22-05 · 22-08 PLAN | 2026-09-27 |

**Transferred → Phase 23:** T-22-10(Play 앱 단위 권한) · T-22-05 Play 앱 서명 SHA-1 · T-22-11 Play 앱 서명 키 보관 · T-22-04 Play `beta` 업로드 경로.

## Warnings (비차단)

- **W-1 (해소 2026-09-27 · quick 260927-s4j):** `mobile/scripts/release-apps.sh`(phase 뒤 `8bcfed07`)가 fastlane 전체 출력을 stdout 으로 tee — Claude 실행 시 Firebase 1시간 링크가 채팅에 노출될 수 있음 · 로그 umask 077 없음.
  → 바뀐 점: 화면에는 허용 표식 줄만 내고 URL 은 모두 가림 · 전체 출력은 로그 폴더 700 · 파일 600(서브셸 umask 077)에만 · 실패 시 오류 요약 + 로그 경로 · 오프라인 스텁 회귀 테스트 `mobile/scripts/test-release-apps-output.sh`(bash 5 · /bin/bash 3.2).
- **W-2 (해소 2026-09-27 · quick 260927-s4j):** REVIEW CR-01 미해결 — iOS check-ipa 가 TestFlight 업로드 뒤에 돈다(명시 벡터는 업로드 전 구조적으로 차단). Play `beta` 도 같은 순서 → Phase 23 전 lane 내 선행 게이트로.
  → 바뀐 점: iOS beta lane 은 check-ipa(절대 IPA · 빌드 번호) → `upload_to_testflight(ipa:)`, Android build · beta lane 은 check-aab → `upload_to_play_store(aab:)` 로 lane 안 업로드 전 게이트 · 래퍼의 lane 뒤 검사 제거 · 위생 검사 (10) 이 lane 단위 업로드 전 검사 순서와 `ipa:` 명시를 잠근다.
- **W-3:** 2026-09-27 15:28 KST 다른 세션 push `798f911f` 가 22-10 게이트 전 `/privacy`(자리표시 시행일)를 약 24분 운영 노출 · 백엔드 diff 0 · `d678bc51` 로 해소.
- **W-4 (해소 2026-09-27):** gcloud 읽기 확인 — Firebase 4개 역할(`firebase.appDistributionSdkServiceAgent` · `managementServiceAgent` · `sdkAdminServiceAgent` · `firebaseappdistro.admin`)에 `secretmanager.*` 권한 0 · 백업 비밀 3개에 비밀 단위 IAM 바인딩 0. `firebase-adminsdk-fbsvc` 는 사용자 관리 키 0 · actAs 부여 0(단 Google 기본 부여로 프로젝트 수준 `iam.serviceAccountTokenCreator` 보유 — Firebase 플랫폼·owner 만 도달 가능, 참고). `gh-trade-appdistro` 키 1개(`d9a9c4a3…` · 2026-09-27 04:00 UTC · 로컬 600)만.

---

## Security Audit 2026-09-27

| Metric | Count |
|--------|-------|
| Threats found | 29 |
| Closed | 29 |
| Open | 0 |

gsd-security-auditor (ASVS L1 · block_on high) — `## SECURED`. 정적 grep · `bash -n` · hygiene · verify-prod · 래퍼 exit 코드 · check-apk 음성 검사 · vitest 24/24 · 읽기 전용 git diff.

## Security Audit 2026-09-27 (보강)

| Metric | Count |
|--------|-------|
| Threats found | 29 |
| Closed | 29 |
| Open | 0 |

감사가 gcloud 로 확인하지 않은 W-4(AR-22-01 전제)를 읽기 전용 gcloud(`projects get-iam-policy` · `secrets get-iam-policy` · `iam roles describe` · `service-accounts keys list`)로 닫았다. W-1 · W-2 는 코드 수정 대상으로 남긴다(비차단).
