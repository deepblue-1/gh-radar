package com.ghtrade.app

/**
 * 탭바 팔레트 — 정본 CONTEXT D-27a 색 토큰(웹 `globals.css` 토큰을 hex 로 옮긴 값) + D-27b 유리(스케치 007 C `--glass-hi`).
 * iOS `GHTradePalette`(21-10 · 21-20)와 같은 값.
 *
 * `glass` = `--glass-hi` 의 불투명 RGB(다크 #2c2c35 · 라이트 #ffffff) — iOS 와 같은 값. iOS 는 ultra-thin 재질 위에
 * 스케치 알파(62 · 72%)로 올리지만 Android 는 실블러가 없어 탭바가 알파 240(≈94%)으로 근사한다(A10 — 뒤 글자가
 * 아이콘과 겹쳐 읽히지 않게). 테두리(D-27a `--line`)는 D-27b 에서 없앴다.
 * `card` 는 당겨서 새로고침 스피너 배경에 계속 쓴다. 모든 값은 불투명 ARGB.
 * 테마 값은 웹이 정본이다(D-23) — `of` 는 `"dark"` 만 다크로 보고 그 외는 라이트.
 */
data class GhTradePalette(
    val card: Int,
    val bg: Int,
    val primary: Int,
    val muted: Int,
    val glass: Int,
) {
    companion object {
        private val DARK = GhTradePalette(
            card = 0xFF202027.toInt(),
            bg = 0xFF17171C.toInt(),
            primary = 0xFF3485FA.toInt(),
            muted = 0xFF9E9EA4.toInt(),
            glass = 0xFF2C2C35.toInt(),
        )

        private val LIGHT = GhTradePalette(
            card = 0xFFFFFFFF.toInt(),
            bg = 0xFFFFFFFF.toInt(),
            primary = 0xFF3182F6.toInt(),
            muted = 0xFF6B7684.toInt(),
            glass = 0xFFFFFFFF.toInt(),
        )

        fun of(theme: String): GhTradePalette = if (theme == "dark") DARK else LIGHT
    }
}
