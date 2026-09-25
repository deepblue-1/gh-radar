package com.ghtrade.app

// 네이티브 탭바 경로표 — D-14(활성 판정) · D-12 ①(경로 숨김)의 Android 정본.
//
// 순수 Kotlin 이다(android.* · Uri 금지 — 문자열 연산만): JVM 단위 테스트 `TabRoutesTest` 가 표 전체를 단언한다.
// iOS `mobile/ios/App/App/TabRoutes.swift`(21-10)와 **같은 표**를 유지해야 한다 —
// 한쪽만 바꾸면 두 앱의 활성 탭이 갈린다. 표를 고치면 두 파일과 두 검사(TabRoutesTest · tab-routes-check.swift)를 함께 고칠 것.

/** 하단 탭 5개. 선언 순서가 곧 화면 순서다(D-06: 홈 · 검색 · 트레이딩 · AI · 마이). */
enum class TabId(
    /** 탭을 눌렀을 때 이동하는 웹 경로(D-06). 스크립트에 그대로 들어가므로 상수만 둔다(T-21-36). */
    val path: String,
    val title: String,
) {
    HOME("/", "홈"),
    SEARCH("/search", "검색"),
    TRADING("/trading", "트레이딩"),
    AI("/chat", "AI"),
    ME("/me", "마이"),
}

object TabRoutes {

    /** 쿼리·프래그먼트 제거 · 루트 외 끝 슬래시 제거 · 빈 문자열은 `/`. */
    fun normalize(path: String): String {
        val cut = path.indexOfFirst { it == '?' || it == '#' }
        var p = if (cut >= 0) path.substring(0, cut) else path
        while (p.length > 1 && p.endsWith("/")) {
            p = p.dropLast(1)
        }
        return p.ifEmpty { "/" }
    }

    /** D-14: 경로 **정확 일치**만 활성. 하위 경로(`/stocks/…` · `/themes/…` · `/trading/vi` 등)는 null = 5탭 전부 비활성. */
    fun activeTabFor(path: String): TabId? = when (normalize(path)) {
        "/" -> TabId.HOME
        "/search", "/scanner", "/themes", "/watchlist" -> TabId.SEARCH
        "/trading" -> TabId.TRADING
        "/chat" -> TabId.AI
        "/me" -> TabId.ME
        else -> null
    }

    /** D-12 ①: `/login` · `/auth` 와 그 하위에서는 탭바를 숨긴다(`/loginx` · `/author` 같은 접두 유사 경로는 제외). */
    fun hidesTabBar(path: String): Boolean {
        val p = normalize(path)
        return p == "/login" || p.startsWith("/login/") || p == "/auth" || p.startsWith("/auth/")
    }
}
