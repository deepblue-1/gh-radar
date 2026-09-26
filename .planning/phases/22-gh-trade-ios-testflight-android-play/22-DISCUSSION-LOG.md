# Phase 22: GH Trade 테스트 배포 (iOS TestFlight · Android Play 내부 테스트) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 22-gh-trade-ios-testflight-android-play
**Areas discussed:** 계정 · 테스터 범위, 테스터 권한 · 로그인 허용, 빌드 · 서명 · 업로드 절차, 스토어 최소 자료

---

## 계정 · 테스터 범위

### Q1. Apple Developer Program 유료 멤버십(팀 954QPCS3F5)과 Play Console 계정 상태

| Option | Description | Selected |
|--------|-------------|----------|
| 둘 다 있음 | Apple 유료 + Play Console 개설·결제 완료. 바로 앱 레코드 생성 가능 | ✓ |
| Apple 만 있음 | Play 개설은 사용자가 직접, iOS 먼저 | |
| 둘 다 없음 / 불확실 | 계정 확인·개설을 사용자 선행 태스크로 | |

**User's choice:** 둘 다 있음

### Q2. 테스터는 누구이고 어느 정도 규모인가

| Option | Description | Selected |
|--------|-------------|----------|
| 지인 몇 명 · 내부 테스트만 | iOS 내부 테스터(100) + Play 내부 테스트(100). 심사 없음 | ✓ (비교 후) |
| 내부 먼저 · 외부 링크도 준비 | TestFlight 외부(베타 심사) + Play 비공개 링크 절차까지 | |
| 외부 공개 링크가 주목적 | 공개 베타. 심사 자료·계정 제한 설계 필수 | |

**User's choice:** 자유 답변 「내부 테스터와 외부 공개링크의 큰 차이를 비교해줘. 사용할 사람은 5명 미만인데, 설치절차가 복잡하거나 그런 건 싫어서」 → 비교표(심사 유무 · 등록 방식 · 테스터 설치 절차 · 인원 · 함정) 제시 → 추가 질문 「설치 후 업데이트 절차는?」 → TestFlight 자동 배포·90일 만료 / Play 자동 업데이트·versionCode 증가 설명 → 「응」 으로 내부 테스터 + Play 내부 테스트 확정.
**Notes:** 외부 테스터는 Google 로그인 필수 앱이라 심사용 계정·문답이 붙는다는 점이 결정 근거.

---

## 테스터 권한 · 로그인 허용

### Q1. 테스터 로그인 시 트레이딩 탭

| Option | Description | Selected |
|--------|-------------|----------|
| 지금 그대로 (추천) | 코드 변경 없음. relay unauthorized → DmaGate. dma_credentials 행 보유자만 주문 | ✓ |
| 탭 자체를 숨김 | 권한 플래그를 네이티브에 전달하는 웹 수정 필요 | |
| 조회는 허용 · 주문만 차단 | relay 인증 구조 변경 필요 | |

**User's choice:** 지금 그대로

### Q2. 테스터 Google 계정 로그인 허용 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 지금 설정 유지 · 필요 시 테스트 사용자만 추가 (추천) | 동의 화면 상태 확인 태스크를 플랜에 | ✓ |
| 동의 화면을 프로덕션으로 게시 | 누구나 로그인 가능 | |
| Supabase 쪽에 이메일 allow-list 추가 | 웹 사용자도 막힘 · 범위 확장 | |

**User's choice:** 지금 설정 유지

---

## 빌드 · 서명 · 업로드 절차

### Q1. 릴리스 빌드·업로드 실행 주체

| Option | Description | Selected |
|--------|-------------|----------|
| Claude가 실행 · 비밀만 직접 주입 (추천) | 비밀은 사용자 `! bash …` 한 줄 주입 | ✓ |
| 직접 실행 · Claude는 스크립트만 | 검증은 사용자 보고 의존 | |
| Xcode · Android Studio GUI 로 직접 | 반복 빌드가 수작업 | |

**User's choice:** Claude가 실행 · 비밀만 직접 주입

### Q2. 빌드·업로드 자동화 도구

| Option | Description | Selected |
|--------|-------------|----------|
| 쉘 스크립트 + 공식 CLI (1차 추천) | xcodebuild/altool + gradle/Play API. Ruby 없음 | |
| fastlane | pilot · supply. Ruby 환경 추가 | |
| 빌드만 스크립트 · 업로드는 콘솔 수동 | API 키 불필요 | |

**User's choice:** 자유 답변 「weekly-wine-app 은 어떻게 했어?」 → weekly-wine 조사(iOS/Android Fastfile · ASC API 키 · 타임스탬프 빌드 번호 · Play 서비스 계정 · 키스토어 평문 기본값 결함) 보고 → 추천을 fastlane 으로 변경해 재질문.

| Option | Description | Selected |
|--------|-------------|----------|
| fastlane · weekly-wine 복사 후 수정 (추천) | 검증된 Fastfile 2개 재사용 · ASC API 키 재사용 · 평문 비밀번호 제거 | ✓ |
| 쉘 스크립트 + 공식 CLI | 처음부터 만들고 검증 | |
| 빌드만 스크립트 · 업로드는 콘솔 수동 | 반복마다 수작업 한 단계 | |

**User's choice:** fastlane · weekly-wine 복사 후 수정

### Q3. Android 릴리스 키스토어 생성·보관

| Option | Description | Selected |
|--------|-------------|----------|
| Play 앱 서명 + 업로드 키는 홈 디렉터리 (추천) | `~/.config/gh-trade/` · 환경변수 · Secret Manager 백업 1본 · SHA-1 2개 등록 | ✓ |
| Play 앱 서명 + 키는 GCP Secret Manager 가 정본 | 빌드마다 gcloud 호출 | |
| 자체 서명 키 | 신규 앱은 Play 가 앱 서명 강제 | |

**User's choice:** Play 앱 서명 + 업로드 키는 홈 디렉터리

### Q4. 버전·빌드 번호 규칙

| Option | Description | Selected |
|--------|-------------|----------|
| 버전 1.0 고정 · 빌드 번호 = 타임스탬프 (추천) | fastlane 이 자동 설정 · 커밋 없음 | ✓ |
| 빌드 번호를 저장소에 커밋해 1씩 증가 | 빌드마다 커밋 · 충돌 위험 | |
| 시맨틱 버전을 매번 올림 | 외부 TestFlight 였다면 심사 재발 | |

**User's choice:** 버전 1.0 고정 · 빌드 번호 = 타임스탬프

---

## 스토어 최소 자료

### Q1. 개인정보처리방침 위치·작성자

| Option | Description | Selected |
|--------|-------------|----------|
| 웹앱에 /privacy 페이지 · Claude 가 초안 (추천) | 공개 라우트 · 코드 기준 수집 항목 확인 · 사용자 검토 | ✓ |
| 정적 호스팅 별도 | 도메인 다름 · 배포 경로 추가 | |
| 사용자가 문안 작성 · Claude 는 페이지만 | 문안 올 때까지 등록 막힘 | |

**User's choice:** 웹앱에 /privacy 페이지 · Claude 가 초안

### Q2. Play 데이터 보안 양식 · App Store 앱 개인정보 양식 시점

| Option | Description | Selected |
|--------|-------------|----------|
| 이번에 채움 · Claude 가 답변 초안 (추천) | 로드맵 범위 그대로 | |
| 이번에는 미룸 · 정식 출시로 이연 | 내부 테스트에 필수 아님 · 로드맵 문구 정정 | ✓ |

**User's choice:** 이번에는 미룸 · 정식 출시로 이연

### Q3. 마무리 확인

| Option | Description | Selected |
|--------|-------------|----------|
| 마무리 | 앱 레코드 생성값(이름 · 언어 · 아이콘 · SKU · 스크린샷 생략 · 수출 규정)은 Claude 재량 | ✓ |
| 더 질문 | | |

---

## Claude's Discretion

- `native:verify-prod` 를 fastlane lane 앞단 게이트로 실행
- `.gitignore` 보강(p12 · mobileprovision · key.properties · AuthKey · play-store-key.json · aab · ipa)
- Android 릴리스 SHA-1 등록 = 같은 GCP 프로젝트에 Android OAuth 클라이언트 추가(코드 변경 없음)
- 앱 레코드 생성값 · iOS 수출 규정 면제 키 · 서명 세부 · PrivacyInfo.xcprivacy 처리 · 릴리스 문서 위치 · 테스터 안내문

## Deferred Ideas

- Play 데이터 보안 양식 · App Store 앱 개인정보 양식 — 정식 출시 phase
- TestFlight 외부 테스터 · Play 비공개/공개 테스트 — 심사 동반, 정식 출시 phase
- PrivacyInfo.xcprivacy · 푸시 알림 · 딥링크 — Phase 21 Deferred 유지
