# GH Trade 빌드 번호 공식 잠금 (Phase 22 · D-09 · D-09a)
#
# D-09a 정정: CONTEXT D-09 원문의 Android versionCode `YYMMDDHHmm` 은 2026년에 이미 26억대
# (`2609270049`)라 Play 상한 2,100,000,000 을 넘는다(22-RESEARCH Pitfall 1). 그래서 공식은
# `(연도−2020)·10^8 + MMDDHHmm` 이다 — 연도가 1 오를 때 더해지는 10^8 이 MMDDHHmm 최대값
# (12,312,359)보다 커서 연 경계에서도 단조 증가하고, 2040-12-31 23:59 까지 상한 안이다.
#
# 이 테스트가 깨지면 겪는 일
#   - 번호가 줄거나 같아지면 스토어가 두 번째 업로드를 거절한다(엣지 FA-1).
#   - 연 경계 단조성이 깨지면 연초 첫 빌드가 연말 빌드보다 작아 거절된다.
#   - 상한을 넘는 값을 그대로 내보내면 Play 가 업로드 자체를 거부한다 — lane 이 빌드 전에 멈춰야 한다.
#
# 실행: /opt/homebrew/opt/ruby/bin/ruby mobile/fastlane/test/build_numbers_test.rb
#       (Homebrew Ruby 4 의 번들 minitest — Gemfile 에 넣지 않는다)
require "minitest/autorun"
require_relative "../build_numbers"

class GhTradeBuildNumbersTest < Minitest::Test
  KST = "+09:00"

  # 시각은 모두 KST 오프셋을 명시해 만든다 — 테스트가 머신 시간대에 기대지 않는다(22-REVIEW WR-03).
  def kst(y, mo, d, h = 0, mi = 0, s = 0)
    Time.new(y, mo, d, h, mi, s, KST)
  end

  def vc(*args)
    GhTradeBuildNumbers.android_version_code(kst(*args))
  end

  def ios(*args)
    GhTradeBuildNumbers.ios_build_number(kst(*args))
  end

  def test_android_version_code_formula_for_first_release_minute
    assert_equal 609270049, vc(2026, 9, 27, 0, 49)
  end

  def test_android_version_code_last_minute_of_2040_is_within_play_limit
    last = vc(2040, 12, 31, 23, 59)
    assert_equal 2012312359, last
    assert_operator last, :<=, GhTradeBuildNumbers::ANDROID_VERSION_CODE_MAX
  end

  def test_android_version_code_is_monotonic_across_year_boundary
    assert_equal 612312359, vc(2026, 12, 31, 23, 59)
    assert_equal 701010000, vc(2027, 1, 1, 0, 0)
    assert_operator vc(2026, 12, 31, 23, 59), :<, vc(2027, 1, 1, 0, 0)
  end

  def test_android_version_code_rejects_values_over_play_limit
    err = assert_raises(ArgumentError) { vc(2041, 1, 1, 0, 0) }
    assert_includes err.message, "상한"
  end

  def test_android_version_code_strictly_increases_per_minute_and_repeats_within_a_minute
    assert_operator vc(2026, 9, 27, 0, 49), :<, vc(2026, 9, 27, 0, 50)
    # 같은 분 재실행은 같은 값 — 스토어가 거절한다(FA-1). 1분 뒤 다시 실행한다.
    assert_equal vc(2026, 9, 27, 0, 49, 0), vc(2026, 9, 27, 0, 49, 59)
  end

  def test_ios_build_number_formula
    assert_equal "202609270049", ios(2026, 9, 27, 0, 49)
  end

  def test_ios_build_number_is_monotonic_across_year_boundary_as_integer
    assert_operator ios(2026, 12, 31, 23, 59).to_i, :<, ios(2027, 1, 1, 0, 0).to_i
  end

  # WR-03 — 번호는 머신·프로세스 시간대가 아니라 KST 로 계산한다. 같은 순간이면 어느 시간대의
  # Time 이 들어와도 같은 번호이고, Mac 시간대가 서쪽으로 바뀌어도 1분 뒤 번호가 더 크다.
  # 이게 깨지면 번호가 작아져 ASC 가 업로드를 거절하고 Android 덮어 설치가 VERSION_DOWNGRADE 로 실패한다.
  def test_ios_build_number_is_kst_regardless_of_input_zone
    instant = kst(2026, 9, 27, 0, 49)
    assert_equal "202609270049", GhTradeBuildNumbers.ios_build_number(instant.getutc)
    assert_equal "202609270049", GhTradeBuildNumbers.ios_build_number(instant.getlocal("-07:00"))
  end

  def test_android_version_code_is_kst_regardless_of_input_zone
    instant = kst(2026, 9, 27, 0, 49)
    assert_equal 609270049, GhTradeBuildNumbers.android_version_code(instant.getutc)
    assert_equal 609270049, GhTradeBuildNumbers.android_version_code(instant.getlocal("-07:00"))
  end

  def test_numbers_stay_monotonic_when_machine_zone_moves_west
    before = kst(2026, 9, 27, 10, 0)
    after = (before + 60).getlocal("-07:00") # 1분 뒤, 시간대만 LA 로 바뀐 Mac
    assert_operator GhTradeBuildNumbers.ios_build_number(before).to_i, :<, GhTradeBuildNumbers.ios_build_number(after).to_i
    assert_operator GhTradeBuildNumbers.android_version_code(before), :<, GhTradeBuildNumbers.android_version_code(after)
  end

  def test_default_argument_uses_kst_even_when_process_tz_is_not_kst
    old = ENV["TZ"]
    ENV["TZ"] = "America/Los_Angeles"
    expected = Time.now.getlocal(KST).strftime("%Y%m%d%H%M")
    got = GhTradeBuildNumbers.ios_build_number
    # 분 경계에 걸리면 1 차이가 날 수 있다 — 시간대 차이(수백~수천)만 잡는다.
    assert_operator (got.to_i - expected.to_i).abs, :<=, 1
  ensure
    ENV["TZ"] = old
  end
end
