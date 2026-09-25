package com.ghtrade.app

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * D-14 활성 판정 · D-12 ① 경로 숨김 · TabId 순서/경로/제목 표.
 *
 * iOS `mobile/scripts/tab-routes-check.swift`(21-10)와 **같은 케이스·같은 기대값**이다 —
 * 한쪽 표만 바꾸면 두 앱의 활성 탭이 갈린다. 표를 고치면 두 파일을 함께 고칠 것.
 * 실행: `pnpm --filter @gh-radar/mobile run native:test:android`
 */
class TabRoutesTest {

    @Test
    fun normalize() {
        val cases = listOf(
            "" to "/",
            "/" to "/",
            "/trading?focus=X" to "/trading",
            "/scanner/" to "/scanner",
            "/a#b" to "/a",
        )
        for ((input, expected) in cases) {
            assertEquals("normalize \"$input\"", expected, TabRoutes.normalize(input))
        }
    }

    @Test
    fun activeTabFor() {
        val cases = listOf<Pair<String, TabId?>>(
            "/" to TabId.HOME,
            "" to TabId.HOME,
            "/search" to TabId.SEARCH,
            "/scanner" to TabId.SEARCH,
            "/scanner/" to TabId.SEARCH,
            "/themes" to TabId.SEARCH,
            "/watchlist" to TabId.SEARCH,
            "/trading" to TabId.TRADING,
            "/trading?focus=X" to TabId.TRADING,
            "/trading/" to TabId.TRADING,
            "/chat" to TabId.AI,
            "/me" to TabId.ME,
            "/stocks/005930" to null,
            "/themes/abc" to null,
            "/trading/vi" to null,
            "/chat/123" to null,
            "/me/x" to null,
            "/searching" to null,
            "/login" to null,
            "/auth/callback" to null,
        )
        for ((input, expected) in cases) {
            assertEquals("activeTabFor \"$input\"", expected, TabRoutes.activeTabFor(input))
        }
    }

    @Test
    fun hidesTabBar() {
        val cases = listOf(
            "/login" to true,
            "/login/x" to true,
            "/auth" to true,
            "/auth/callback" to true,
            "/" to false,
            "/me" to false,
            "/loginx" to false,
            "/author" to false,
        )
        for ((input, expected) in cases) {
            assertEquals("hidesTabBar \"$input\"", expected, TabRoutes.hidesTabBar(input))
        }
    }

    @Test
    fun tabIdOrderPathTitle() {
        val tabs = TabId.values().toList()
        assertEquals("TabId order", "HOME,SEARCH,TRADING,AI,ME", tabs.joinToString(",") { it.name })
        assertEquals("TabId.path", "/,/search,/trading,/chat,/me", tabs.joinToString(",") { it.path })
        assertEquals("TabId.title", "홈,검색,트레이딩,AI,마이", tabs.joinToString(",") { it.title })
    }
}
