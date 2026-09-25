package com.ghtrade.app

import android.net.Uri
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.view.View
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import kotlin.math.max

/**
 * GH Trade Android 셸 (Phase 21 · D-02).
 *
 * Capacitor 가 만든 WebView 위에 붙는다 — `load()` 에서 `super.load()` 뒤에만 확장한다.
 *  - WebView 클라이언트는 `BridgeWebViewClient` 상속본을 `bridge.setWebViewClient` 로 설치한다.
 *    WebView 에 새 클라이언트 인스턴스를 직접 대입하면 로컬 에셋 서버·SystemBars 콜백이 끊긴다(Pitfall 4).
 *  - 웹 → 네이티브 채널은 `window.GhTradeBridge.postMessage(json)` 하나(`GhTradeBridge`).
 *  - 뒤로가기는 21-13 이 `onBackPressedDispatcher` 로 붙인다 — 옛 back 콜백 오버라이드는 Android 16 에서 불리지 않는다(Pitfall 5).
 *  - DecorView/루트/WebView 에 인셋 리스너를 걸지 않는다 — SystemBars 의 DecorView 리스너(CSS 안전영역 주입 · IME 패딩)를
 *    덮어쓴다(Pitfall 8). 인셋 리스너는 탭바 컨테이너에만 건다.
 *  - 하단 플로팅 탭바(21-12 · D-02 · D-27a): 활성 판정 = `TabRoutes`(D-14) · 숨김 = 로그인/오프라인/오버레이/키보드(D-12) ·
 *    탭 = 웹 navigate 훅(D-06a — 클라 내비라 relay 소켓 유지). iOS `GHTradeBridgeViewController`(21-10)와 같은 동작.
 */
class MainActivity : BridgeActivity() {

    lateinit var tabBar: GhTradeTabBar
        private set

    /** 템플릿 CoordinatorLayout. 21-13 이 WebView 를 SwipeRefreshLayout 으로 감싸기 **전에** 잡아 둔다. */
    lateinit var rootLayout: ViewGroup
        private set

    /** 웹 테마(D-23 — 웹이 정본). 21-13 이 저장값 복원·팔레트 적용을 붙인다. */
    var currentTheme = "light"

    /** 현재 앱 서버 문서의 정규화 경로(D-14). */
    var currentPath = "/"
        private set

    /** 현재 문서가 앱 서버(server.url 의 스킴+호스트) 밖 = 오프라인 로컬 페이지 등(D-12 ②). */
    var isOfflinePage = false
        private set

    /** 웹 `overlay {open}` 신호(D-12 ③). 새 문서의 `ready` 에서 false 로 되돌린다(T-21-18 고착 방지). */
    var overlayOpen = false
        private set

    /** 웹 `pull {blocked}` 신호 — 21-13 의 SwipeRefreshLayout 이 소비한다. */
    var pullBlocked = false
        private set

    private var keyboardVisible = false
    private var hideRunnable: Runnable? = null

    override fun load() {
        super.load()
        val wv = bridge.webView ?: return
        bridge.setWebViewClient(GhTradeWebViewClient(bridge, this))
        wv.addJavascriptInterface(GhTradeBridge(this), "GhTradeBridge")
        setupTabBar()
    }

    /** 앱 호스트 = server.url 호스트(없으면 appUrl 호스트). 브리지 메시지 출처 검사에 쓴다(T-21-03). */
    fun serverHost(): String? = serverUri()?.host

    private fun serverUri(): Uri? {
        val url = bridge.config.serverUrl ?: bridge.appUrl ?: return null
        return Uri.parse(url)
    }

    // ── 탭바 (D-02 · D-13 · D-27a) ─────────────────────────────────────────────

    private fun setupTabBar() {
        rootLayout = bridge.webView.parent as ViewGroup
        tabBar = GhTradeTabBar(this)
        val fade = tabBar.fadeView

        // 페이드 → 탭바 순서로 얹는다(탭바가 위, elevation 으로도 위). WebView 프레임은 건드리지 않는다(D-25 풀블리드).
        rootLayout.addView(fade, CoordinatorLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(120f)).apply {
            gravity = Gravity.BOTTOM
        })
        // 폭 = min(560, 화면 − 32): MATCH_PARENT + 좌우 16 에서 GhTradeTabBar.onMeasure 가 560 으로 자른다 · 가운데 정렬.
        rootLayout.addView(tabBar, CoordinatorLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(70f)).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            leftMargin = dp(16f)
            rightMargin = dp(16f)
            bottomMargin = dp(14f)
        })

        // 바닥 = 화면 끝에서 max(내비 인셋 − 14, 14)(D-27a) — 웹 `--native-tabbar-offset` 과 같은 식(21-06).
        // Pitfall 8: 리스너는 탭바에만. SystemBars 가 DecorView 에서 다듬은 인셋(웹 CSS 주입값과 같은 값)이 여기로 내려온다.
        ViewCompat.setOnApplyWindowInsetsListener(tabBar) { v, insets ->
            val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            val lp = v.layoutParams as ViewGroup.MarginLayoutParams
            val margin = max(nav - dp(14f), dp(14f))
            if (lp.bottomMargin != margin) {
                lp.bottomMargin = margin
                v.requestLayout()
            }
            insets
        }
        ViewCompat.requestApplyInsets(tabBar)

        // 키보드(IME) 표시 중에는 숨긴다. 인셋 리스너 대신 레이아웃 변화 시 루트 창 인셋을 읽기만 한다(Pitfall 8).
        rootLayout.viewTreeObserver.addOnGlobalLayoutListener {
            val ime = ViewCompat.getRootWindowInsets(rootLayout)?.isVisible(WindowInsetsCompat.Type.ime()) == true
            if (ime != keyboardVisible) {
                keyboardVisible = ime
                updateTabBarVisibility()
            }
        }

        tabBar.apply(GhTradePalette.of(currentTheme))
        tabBar.onSelect = { selectTab(it) }
        // 첫 앱 서버 URL 이 판정될 때까지 숨긴 채 시작한다(로그인 리다이렉트 전에 잠깐 보였다 사라지는 깜빡임 방지).
        tabBar.visibility = View.GONE
        tabBar.alpha = 0f
        fade.visibility = View.GONE
        fade.alpha = 0f
    }

    /** 페이지 로드 완료 · history 변경(pushState 포함)마다 불린다(`GhTradeWebViewClient`). */
    fun onUrlChanged(url: String) {
        val uri = Uri.parse(url)
        val server = serverUri()
        // 호스트만 비교하면 dev(`http://localhost:3100`)에서 로컬 오프라인 페이지(`https://localhost`)와 겹친다 → 스킴도 본다(21-10 과 같음).
        val onAppServer = server != null && uri.host == server.host && uri.scheme == server.scheme
        isOfflinePage = !onAppServer
        if (onAppServer) {
            applyPath(uri.path ?: "/")
        } else {
            tabBar.setActive(null)
            updateTabBarVisibility()
        }
    }

    private fun applyPath(path: String) {
        currentPath = TabRoutes.normalize(path)
        tabBar.setActive(TabRoutes.activeTabFor(currentPath))
        updateTabBarVisibility()
    }

    /** `GhTradeBridge` 가 출처·타입 검사를 통과시킨 메시지만 UI 스레드에서 전달한다. payload 는 표시 상태만 바꾼다(T-21-02). */
    fun onNativeMessage(type: String, payload: JSONObject?) {
        when (type) {
            "ready" -> {
                Log.i(
                    TAG,
                    "ready platform=${payload?.optString("platform")} nativeApp=${payload?.optBoolean("nativeApp")}",
                )
                // 새 문서 = 웹 오버레이 참조계수 0 에서 시작 — 전체 로드로 닫힘 신호를 못 받은 경우를 푼다(T-21-18).
                if (overlayOpen) {
                    overlayOpen = false
                    updateTabBarVisibility()
                }
            }
            // SPA pushState 보강(D-14). 문자열 · `/` 시작만 받는다.
            "route" -> {
                val path = payload?.optString("path").orEmpty()
                if (path.startsWith("/") && !isOfflinePage) applyPath(path)
            }
            "overlay" -> {
                overlayOpen = payload?.optBoolean("open") == true
                updateTabBarVisibility()
            }
            "pull" -> pullBlocked = payload?.optBoolean("blocked") == true
            // "dark"/"light" 두 값만 저장한다. 팔레트·시스템 바 적용은 21-13(계획된 분할).
            "theme" -> {
                val t = payload?.optString("theme")
                if (t == "dark" || t == "light") currentTheme = t
            }
            else -> Log.d(TAG, "message type=$type")
        }
    }

    // ── 표시/숨김 (D-12: 숨김은 150ms 지연 후 200ms 페이드 · 보임은 지연 없이 200ms) ─────────────────

    private fun shouldHideTabBar(): Boolean =
        TabRoutes.hidesTabBar(currentPath) || isOfflinePage || overlayOpen || keyboardVisible

    fun updateTabBarVisibility() {
        if (!::tabBar.isInitialized) return
        val fade = tabBar.fadeView
        hideRunnable?.let { tabBar.removeCallbacks(it) }
        hideRunnable = null

        if (shouldHideTabBar()) {
            if (tabBar.visibility != View.VISIBLE) return
            // 리다이렉트·짧은 오버레이 깜빡임은 150ms 안에 취소된다(weekly-wine 방식).
            val r = Runnable {
                hideRunnable = null
                if (!shouldHideTabBar()) return@Runnable
                fade.animate().alpha(0f).setDuration(200).start()
                tabBar.animate().alpha(0f).translationY(dpF(8f)).setDuration(200).withEndAction {
                    // 페이드 도중 다시 보이기로 바뀌었으면 숨기지 않는다(보임 쪽이 animate().cancel() 후 되살린다).
                    if (shouldHideTabBar()) {
                        tabBar.visibility = View.GONE
                        fade.visibility = View.GONE
                    }
                }.start()
            }
            hideRunnable = r
            tabBar.postDelayed(r, 150)
        } else {
            // 진행 중인 숨김 애니메이션과 경합하지 않게 먼저 걷어낸다(weekly-wine onUrlChanged).
            tabBar.animate().cancel()
            fade.animate().cancel()
            tabBar.visibility = View.VISIBLE
            fade.visibility = View.VISIBLE
            tabBar.animate().alpha(1f).translationY(0f).setDuration(200).start()
            fade.animate().alpha(1f).setDuration(200).start()
        }
    }

    // ── 탭 이동 (D-06 · D-06a) ──────────────────────────────────────────────

    fun selectTab(tab: TabId) {
        // 반응성 — 이동 결과는 onUrlChanged · route 메시지가 다시 확정한다.
        tabBar.setActive(tab)
        val wv = bridge.webView ?: return

        if (isOfflinePage) {
            // 오프라인 폴백 문서에는 웹 훅이 없다 → 앱 서버 경로를 직접 로드한다.
            val server = bridge.config.serverUrl ?: return
            wv.loadUrl(server.trimEnd('/') + tab.path)
            return
        }

        // T-21-36: 스크립트에 들어가는 값은 TabId.path 상수뿐 — 외부 입력 없음.
        val p = tab.path
        wv.evaluateJavascript(
            "window.__ghTrade&&window.__ghTrade.navigate?window.__ghTrade.navigate('$p'):location.assign('$p')",
            null,
        )
    }

    private fun dpF(v: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

    private fun dp(v: Float): Int = dpF(v).toInt()

    companion object {
        const val TAG = "GHTrade"
    }
}
