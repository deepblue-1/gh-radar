package com.ghtrade.app

/**
 * 탭바 팔레트 — 정본 CONTEXT D-27a(웹 `globals.css` 토큰을 hex 로 옮긴 값). iOS `GHTradePalette`(21-10)와 같은 값.
 *
 * `line` 다크는 흰색 7%(`0x12FFFFFF`) — 알파 포함 ARGB. 나머지는 불투명.
 * 테마 값은 웹이 정본이다(D-23) — `of` 는 `"dark"` 만 다크로 보고 그 외는 라이트.
 */
data class GhTradePalette(
    val card: Int,
    val bg: Int,
    val primary: Int,
    val muted: Int,
    val line: Int,
) {
    companion object {
        private val DARK = GhTradePalette(
            card = 0xFF202027.toInt(),
            bg = 0xFF17171C.toInt(),
            primary = 0xFF3485FA.toInt(),
            muted = 0xFF9E9EA4.toInt(),
            line = 0x12FFFFFF,
        )

        private val LIGHT = GhTradePalette(
            card = 0xFFFFFFFF.toInt(),
            bg = 0xFFFFFFFF.toInt(),
            primary = 0xFF3182F6.toInt(),
            muted = 0xFF6B7684.toInt(),
            line = 0xFFE5E8EB.toInt(),
        )

        fun of(theme: String): GhTradePalette = if (theme == "dark") DARK else LIGHT
    }
}
