package com.ghtrade.app

/**
 * 앱 크롬 팔레트 — 정본 CONTEXT D-27a 색 토큰(웹 `globals.css` 토큰을 hex 로 옮긴 값). iOS `GHTradePalette` 와 같은 값(bg · primary).
 *
 * quick-261107-fbj 로 네이티브 하단 크롬이 없어져 남은 쓰임은 셋이다: `bg` = 창 · WebView · 인앱 브라우저 툴바 배경,
 * `primary` = 당겨서 새로고침 스피너 색, `card` = 그 스피너 배경. 모든 값은 불투명 ARGB.
 * 테마 값은 웹이 정본이다(D-23) — `of` 는 `"dark"` 만 다크로 보고 그 외는 라이트.
 */
data class GhTradePalette(
    val card: Int,
    val bg: Int,
    val primary: Int,
) {
    companion object {
        private val DARK = GhTradePalette(
            card = 0xFF151515.toInt(),
            bg = 0xFF0A0A0A.toInt(),
            primary = 0xFF3485FA.toInt(),
        )

        private val LIGHT = GhTradePalette(
            card = 0xFFFFFFFF.toInt(),
            bg = 0xFFFFFFFF.toInt(),
            primary = 0xFF3182F6.toInt(),
        )

        fun of(theme: String): GhTradePalette = if (theme == "dark") DARK else LIGHT
    }
}
