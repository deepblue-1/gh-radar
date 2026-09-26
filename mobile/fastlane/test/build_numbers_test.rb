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
  def vc(*args)
    GhTradeBuildNumbers.android_version_code(Time.new(*args))
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
    assert_equal "202609270049", GhTradeBuildNumbers.ios_build_number(Time.new(2026, 9, 27, 0, 49))
  end

  def test_ios_build_number_is_monotonic_across_year_boundary_as_integer
    before = GhTradeBuildNumbers.ios_build_number(Time.new(2026, 12, 31, 23, 59)).to_i
    after = GhTradeBuildNumbers.ios_build_number(Time.new(2027, 1, 1, 0, 0)).to_i
    assert_operator before, :<, after
  end
end
