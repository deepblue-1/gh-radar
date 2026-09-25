import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // D-23 첫 프레임 — 저장된 앱 테마 배경으로 창을 칠한다(WebView 가 뜨기 전 흰/검 깜빡임 방지).
        window?.backgroundColor = GHTradePalette.of(ThemeStore.load()).bg
        window?.rootViewController = GHTradeBridgeViewController()   // 21-01: 템플릿 기본 VC 대신 서브클래스(Pitfall 1·3 — storyboard 만 바꾸면 적용되지 않는다)
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
