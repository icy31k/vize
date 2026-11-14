import AppKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
enum VizeApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let reactDelegate = ReactNativeDelegate()
    private lazy var factory = RCTReactNativeFactory(delegate: reactDelegate)
    private let service = VizeService.shared
    private var window: NSWindow?
    private var statusItem: NSStatusItem?
    private let captureItem = NSMenuItem()
    private let timerItem = NSMenuItem()
    private var observation: NSObjectProtocol?

    func applicationDidFinishLaunching(_ notification: Notification) {
        reactDelegate.dependencyProvider = RCTAppDependencyProvider()
        service.launch()
        installMenus()
        observation = NotificationCenter.default.addObserver(forName: VizeService.changed, object: nil, queue: .main) {
            [weak self] _ in self?.updateMenu()
        }
        updateMenu()
        openWindow()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openWindow()
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationWillTerminate(_ notification: Notification) {
        service.terminate()
        if let observation {
            NotificationCenter.default.removeObserver(observation)
        }
    }

    private func installMenus() {
        let menuBar = NSMenu()
        let appMenuItem = NSMenuItem()
        menuBar.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Vize")
        appMenu.addItem(actionItem("Open Vize", #selector(openWindow), key: "1"))
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Vize", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        menuBar.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        let windowMenuItem = NSMenuItem()
        menuBar.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenuItem.submenu = windowMenu
        NSApp.mainMenu = menuBar
        NSApp.windowsMenu = windowMenu

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem = item
        let menu = NSMenu()
        menu.autoenablesItems = false
        menu.addItem(actionItem("Open Vize", #selector(openWindow)))
        menu.addItem(.separator())
        captureItem.target = self
        captureItem.action = #selector(toggleCapture)
        menu.addItem(captureItem)
        timerItem.target = self
        timerItem.action = #selector(toggleTimer)
        menu.addItem(timerItem)
        menu.addItem(.separator())
        menu.addItem(actionItem("Quit Vize", #selector(quit)))
        item.menu = menu
    }

    private func actionItem(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }

    private func updateMenu() {
        let state = service.status()
        let capture = state["captureEnabled"] as? Bool ?? false
        let timer = state["timer"] as? [String: Any] ?? [:]
        let active = timer["deadline"] is Double
        let rest = timer["phase"] as? String == "rest"
        let remaining = Int(ceil(timer["remaining"] as? Double ?? 0))
        let countdown = String(format: "%02d:%02d", remaining / 60, remaining % 60)
        statusItem?.button?.title = active
            ? "Vize \(countdown)"
            : "Vize"
        statusItem?.button?.image = NSImage(
            systemSymbolName: capture
                ? "circle.fill"
                : "circle",
            accessibilityDescription: capture
                ? "Capture enabled"
                : "Capture paused"
        )
        statusItem?.button?.imagePosition = .imageLeading
        statusItem?.button?.toolTip = capture
            ? "Vize · Capture enabled"
            : "Vize · Capture paused"
        captureItem.title = capture
            ? "Pause Capture"
            : "Enable Capture"
        timerItem.title = active
            ? "Pause Timer"
            : timer["hasStarted"] as? Bool == true
                ? "Resume Timer"
                : rest
                    ? "Start Break"
                    : "Start Focus"
    }

    @objc private func openWindow() {
        if window == nil {
            let newWindow = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1060, height: 725),
                                     styleMask: [.titled, .closable, .miniaturizable, .resizable],
                                     backing: .buffered, defer: false)
            newWindow.title = "Vize"
            newWindow.minSize = NSSize(width: 620, height: 560)
            newWindow.isReleasedWhenClosed = false
            newWindow.contentView = factory.rootViewFactory.view(withModuleName: "Vize")
            newWindow.center()
            window = newWindow
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        service.signalWindowOpened()
    }

    @objc private func toggleCapture() {
        perform { try service.setCapture(!(service.status()["captureEnabled"] as? Bool ?? false)) }
    }

    @objc private func toggleTimer() {
        let timer = service.status()["timer"] as? [String: Any]
        perform {
            try service.timerCommand(
                timer?["deadline"] is Double
                    ? "pause"
                    : "start"
            )
        }
    }

    @objc private func quit() { NSApp.terminate(nil) }

    private func perform(_ action: () throws -> Void) {
        do { try action() }
        catch {
            openWindow()
            NSAlert(error: error).runModal()
        }
    }
}

final class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
    override func sourceURL(for bridge: RCTBridge) -> URL? { bundleURL() }

    override func bundleURL() -> URL? {
#if DEBUG
        RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
        Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
    }
}
