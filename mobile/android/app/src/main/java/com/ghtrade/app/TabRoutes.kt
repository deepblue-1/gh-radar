package com.ghtrade.app

// RED 스텁 — GREEN 에서 표를 채운다.

enum class TabId(val path: String, val title: String) {
    HOME("/", "홈"),
    SEARCH("/search", "검색"),
    TRADING("/trading", "트레이딩"),
    AI("/chat", "AI"),
    ME("/me", "마이"),
}

object TabRoutes {
    fun normalize(path: String): String = path

    fun activeTabFor(path: String): TabId? = null

    fun hidesTabBar(path: String): Boolean = false
}
