package com.ghtrade.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.net.Uri
import android.util.Log
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent

/**
 * 사이트 밖 링크를 Custom Tabs(앱 위 인앱 브라우저)로 연다 — CONTEXT D-28 · UAT G-21-N3 · 21-17 Task 1 선택 a.
 *
 * - 툴바 색은 앱 테마의 배경색(`GhTradePalette.of(theme).bg`), 색 구성은 앱 테마와 같게(다크/라이트).
 * - URL 은 받은 그대로 넘긴다 — 쿼리·쿠키·헤더를 덧붙이지 않는다. Custom Tabs 는 WebView 세션 쿠키를 공유하지 않는다.
 * - 로그는 **호스트만** 남긴다(경로·쿼리·전체 URL 금지 — T-21-45).
 * - Custom Tabs 지원 브라우저가 없으면 계약상 기본 브라우저로 열린다. 브라우저가 아예 없으면(`ActivityNotFoundException`)
 *   경고만 남기고 삼킨다 — WebView 는 제자리.
 */
object InAppBrowser {

    fun open(activity: Activity, uri: Uri, theme: String) {
        val dark = theme == "dark"
        val intent = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setColorScheme(if (dark) CustomTabsIntent.COLOR_SCHEME_DARK else CustomTabsIntent.COLOR_SCHEME_LIGHT)
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(GhTradePalette.of(theme).bg)
                    .build(),
            )
            .build()
        try {
            Log.i(MainActivity.TAG, "in-app browser host=${uri.host}")
            intent.launchUrl(activity, uri)
        } catch (e: ActivityNotFoundException) {
            Log.w(MainActivity.TAG, "in-app browser unavailable host=${uri.host}")
        }
    }
}
