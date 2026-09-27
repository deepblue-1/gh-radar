# GH Trade 빌드 번호 (Phase 22 · D-09 · D-09a)
#
# 빌드 번호는 빌드 시각에서 계산해 lane 이 빌드 시점에 **주입만** 한다 — Info.plist ·
# pbxproj · build.gradle 에 쓰지 않으므로 릴리스 뒤에도 작업 트리가 깨끗하다.
#   - 시각은 머신·프로세스 시간대가 아니라 **KST(+09:00) 로 고정**해 읽는다(22-REVIEW WR-03).
#     Mac 시간대가 서쪽으로 바뀌면(출장·자동 시간대·TZ env) 로컬 시각 번호가 직전 번호보다 작아져
#     ASC 가 업로드를 거절하고 Android 덮어 설치가 INSTALL_FAILED_VERSION_DOWNGRADE 로 실패한다.
#     release-apps.sh 의 같은 분 대기 계산도 TZ=Asia/Seoul 로 맞춘다.
#   - iOS CFBundleVersion = KST YYYYMMDDHHMM 12자리 → gym xcargs
#     `CURRENT_PROJECT_VERSION=` 로 넘기고, Info.plist 는 `$(CURRENT_PROJECT_VERSION)` 변수 그대로 둔다.
#   - Android versionCode = (연도−2020)·10^8 + MMDDHHmm → gradle `-PghtradeVersionCode=` 로 넘긴다.
#     D-09a 정정: 원문 `YYMMDDHHmm` 은 2026년에 이미 26억대라 Play 상한 2,100,000,000 을 넘는다
#     (22-RESEARCH Pitfall 1). 연도 증가분 10^8 > MMDDHHmm 최대값 12,312,359 라 연 경계에서도 단조 증가하고,
#     2040-12-31 23:59(2012312359)까지 상한 안이다. 넘으면 빌드 전에 멈춘다.
#   - 같은 분 안에 두 번 릴리스하면 번호가 같아져 스토어가 두 번째 업로드를 거절한다(엣지 FA-1).
#     1분 뒤 다시 실행한다.
#   - 두 공식은 mobile/fastlane/test/build_numbers_test.rb(minitest)가 잠근다.
module GhTradeBuildNumbers
  # Google Play 가 허용하는 versionCode 최댓값(developer.android.com/studio/publish/versioning)
  ANDROID_VERSION_CODE_MAX = 2_100_000_000
  # 한국은 서머타임이 없어 고정 오프셋으로 충분하다.
  KST_OFFSET = "+09:00"

  def self.ios_build_number(t = Time.now)
    t.getlocal(KST_OFFSET).strftime("%Y%m%d%H%M")
  end

  def self.android_version_code(t = Time.now)
    k = t.getlocal(KST_OFFSET)
    code = (k.year - 2020) * 100_000_000 + k.strftime("%m%d%H%M").to_i
    if code > ANDROID_VERSION_CODE_MAX
      raise ArgumentError, "versionCode 상한 2,100,000,000 초과 — 2040년 이후 공식 교체 필요"
    end
    code
  end
end
