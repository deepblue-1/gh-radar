# GH Trade 빌드 번호 (Phase 22 · D-09 · D-09a)
#
# 빌드 번호는 빌드 시각에서 계산해 lane 이 빌드 시점에 **주입만** 한다 — Info.plist ·
# pbxproj · build.gradle 에 쓰지 않으므로 릴리스 뒤에도 작업 트리가 깨끗하다.
#   - iOS CFBundleVersion = 로컬 시각(KST) YYYYMMDDHHMM 12자리 → gym xcargs
#     `CURRENT_PROJECT_VERSION=` 로 넘기고, Info.plist 는 `$(CURRENT_PROJECT_VERSION)` 변수 그대로 둔다.
#   - 같은 분 안에 두 번 릴리스하면 번호가 같아져 스토어가 두 번째 업로드를 거절한다(엣지 FA-1).
#     1분 뒤 다시 실행한다.
#   - Android versionCode 공식은 22-04 가 이 모듈에 더하고, 두 함수의 단위 테스트도 22-04 가 잠근다.
module GhTradeBuildNumbers
  def self.ios_build_number(t = Time.now)
    t.strftime("%Y%m%d%H%M")
  end
end
