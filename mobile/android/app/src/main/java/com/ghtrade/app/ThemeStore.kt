package com.ghtrade.app

import android.content.Context

/**
 * 마지막 웹 테마 저장소 (D-23) — 다음 실행 `load()` 첫 프레임부터 같은 테마로 칠한다(깜빡임 방지).
 *
 * SharedPreferences `gh_trade` / 키 `theme`. 값은 `"dark"` · `"light"` 둘뿐이고 그 외·미저장은 다크(웹 기본값 · D-23a).
 * iOS `ThemeStore`(UserDefaults `gh-trade.theme`, 21-11)의 Android 판.
 */
object ThemeStore {
    private const val PREFS = "gh_trade"
    private const val KEY = "theme"

    fun load(ctx: Context): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "dark").let { if (it == "light") "light" else "dark" }

    fun save(ctx: Context, theme: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY, if (theme == "dark") "dark" else "light")
            .apply()
    }
}
