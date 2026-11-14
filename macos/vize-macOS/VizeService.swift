import AppKit
import CoreGraphics
import Foundation

private struct ForegroundApp: Equatable {
    let id: String
    let name: String

    init?(_ app: NSRunningApplication?) {
        guard let app,
              let id = app.bundleIdentifier,
              let name = app.localizedName
        else {
            return nil
        }
        self.id = id
        self.name = name
    }

    var payload: [String: Any] { ["id": id, "name": name] }
}

final class VizeService {
    static let shared = VizeService()
    static let changed = Notification.Name("VizeServiceChanged")

    private static let allInputEvents = CGEventType(rawValue: UInt32.max)!
    private var store: Store?
    private var timer = TimerState()
    private var capture = CapturePolicy()
    private var foreground: ForegroundApp?
    private var activity: Activity?
    private var monitor: Timer?
    private var observations: [(NotificationCenter, NSObjectProtocol)] = []
    private var storageError: String?

    private var now: Double { Date().timeIntervalSince1970 }

    func launch() {
        guard monitor == nil else {
            return
        }
        do {
            let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                       appropriateFor: nil, create: true)
            let database = try Store(url: support.appendingPathComponent("Vize/activity.sqlite3"))
            let capture = try database.setting("capture") == "1"
            if let saved = try database.setting("timer") {
                timer = try JSONDecoder().decode(TimerState.self, from: Data(saved.utf8))
                if timer.deadline != nil {
                    timer.pause(at: now)
                    if timer.remaining == 0 {
                        timer.reset()
                    }
                    try database.saveTimer(timer.encoded())
                }
            }
            store = database
            self.capture.enabled = capture
        } catch {
            fail(error)
        }

        let workspace = NSWorkspace.shared.notificationCenter
        remember(workspace, NSWorkspace.didActivateApplicationNotification) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self?.refresh(activation: app, notify: true)
        }
        remember(workspace, NSWorkspace.willSleepNotification) { [weak self] _ in
            self?.capture.systemSleeping = true
            self?.refresh(notify: true)
        }
        remember(workspace, NSWorkspace.didWakeNotification) { [weak self] _ in
            self?.capture.systemSleeping = false
            self?.refresh(notify: true)
        }
        remember(workspace, NSWorkspace.screensDidSleepNotification) { [weak self] _ in
            self?.capture.displaySleeping = true
            self?.refresh(notify: true)
        }
        remember(workspace, NSWorkspace.screensDidWakeNotification) { [weak self] _ in
            self?.capture.displaySleeping = false
            self?.refresh(notify: true)
        }
        remember(workspace, NSWorkspace.sessionDidResignActiveNotification) { [weak self] _ in
            self?.capture.sessionInactive = true
            self?.refresh(notify: true)
        }
        remember(workspace, NSWorkspace.sessionDidBecomeActiveNotification) { [weak self] _ in
            self?.capture.sessionInactive = false
            self?.refresh(notify: true)
        }
        let distributed = DistributedNotificationCenter.default()
        remember(distributed, Notification.Name("com.apple.screenIsLocked")) { [weak self] _ in
            self?.capture.locked = true
            self?.refresh(notify: true)
        }
        remember(distributed, Notification.Name("com.apple.screenIsUnlocked")) { [weak self] _ in
            self?.capture.locked = false
            self?.refresh(notify: true)
        }

        let tick = Timer(timeInterval: 1, repeats: true) { [weak self] _ in self?.refresh() }
        tick.tolerance = 0.15
        RunLoop.main.add(tick, forMode: .common)
        monitor = tick
        refresh(notify: true)
    }

    private func remember(_ center: NotificationCenter, _ name: Notification.Name,
                          _ handler: @escaping @Sendable (Notification) -> Void) {
        observations.append((center, center.addObserver(forName: name, object: nil, queue: .main, using: handler)))
    }

    private var lastUptime: Double?
    private var lastWallTime: Double?

    private func refresh(activation: NSRunningApplication? = nil, notify: Bool = false) {
        let timestamp = now
        let uptime = ProcessInfo.processInfo.systemUptime
        let unexpectedGap = lastUptime.map { uptime - $0 > 5 } ?? false
        let clockChanged = lastWallTime.map { wall in
            abs(timestamp - wall - (uptime - (lastUptime ?? uptime))) > 5
        } ?? false
        lastUptime = uptime
        lastWallTime = timestamp
        let previousForeground = foreground
        let previousActivity = activity?.id
        let previousError = storageError
        let timerWasRunning = timer.deadline != nil
        let idleSeconds = CGEventSource.secondsSinceLastEventType(.combinedSessionState,
                                                                  eventType: Self.allInputEvents)
        foreground = capture.sessionAvailable
            ? ForegroundApp(activation ?? NSWorkspace.shared.frontmostApplication)
            : nil
        if let store {
            do {
                if unexpectedGap
                    || clockChanged
                {
                    activity = nil
                }
                let target = capture.allowsCapture(idle: idleSeconds)
                    ? foreground
                    : nil
                if let current = activity,
                   current.appID != target?.id
                {
                    let end = capture.endTime(at: timestamp, idle: idleSeconds)
                    try store.checkpoint(current, end: end)
                    activity = nil
                }
                if let target {
                    if var current = activity {
                        try store.checkpoint(current, end: timestamp)
                        current.end = max(current.end, timestamp)
                        activity = current
                    } else {
                        activity = try store.beginActivity(appID: target.id, name: target.name, start: timestamp)
                    }
                }
            } catch {
                fail(error)
            }
            do {
                try reconcileTimer(store, at: timestamp)
            } catch {
                fail(error)
            }
        }
        if notify
            || previousForeground != foreground
            || previousActivity != activity?.id
            || timerWasRunning
            || previousError != storageError
        {
            publish()
        }
    }

    private func requireStore() throws -> Store {
        guard let store else {
            throw StoreError.database(storageError ?? "Local storage is unavailable.")
        }
        return store
    }

    private func fail(_ error: Error) {
        storageError = error.localizedDescription
        capture.enabled = false
        activity = nil
    }

    func signalWindowOpened() { refresh(notify: true) }

    private func publish() {
        NotificationCenter.default.post(name: Self.changed, object: self)
    }

    func status() -> [String: Any] {
        let capturedForeground: Any = activity == nil
            ? NSNull()
            : (foreground?.payload as Any? ?? NSNull())
        return [
            "captureEnabled": capture.enabled,
            "foreground": capturedForeground,
            "error": storageError as Any? ?? NSNull(),
            "timer": [
                "phase": timer.phase.rawValue,
                "remaining": timer.secondsRemaining(at: now),
                "deadline": timer.deadline as Any? ?? NSNull(),
                "focusMinutes": timer.focusMinutes,
                "breakMinutes": timer.breakMinutes,
                "hasStarted": timer.runID != nil,
            ] as [String: Any],
        ]
    }

    func setCapture(_ enabled: Bool) throws {
        let store = try requireStore()
        try store.saveSetting(
            "capture",
            enabled
                ? "1"
                : "0"
        )
        capture.enabled = enabled
        storageError = nil
        refresh(notify: true)
    }

    func history(from: Double, to: Double) throws -> [String: Any] {
        guard from.isFinite,
              to.isFinite,
              from < to
        else {
            throw StoreError.invalid("Choose a valid date range.")
        }
        let store = try requireStore()
        return [
            "categories": try store.categories().map(\.payload),
            "activities": try store.activities(from: from, to: to).map(\.payload),
            "completed": try store.pomodoros(from: from, to: to),
        ]
    }

    func createCategory(_ name: String) throws {
        _ = try requireStore().addCategory(name)
        publish()
    }

    func assignCategory(_ id: Int64, category: Int64, saveDefault: Bool) throws {
        try requireStore().assignCategory(activityID: id, categoryID: category, saveDefault: saveDefault)
        publish()
    }

    private func reconcileTimer(_ store: Store, at timestamp: Double) throws {
        var updated = timer
        let result = updated.advance(at: timestamp)
        guard result.changed else {
            return
        }
        try store.saveTimer(updated.encoded(), completion: result.completion)
        timer = updated
        NSSound.beep()
    }

    func timerCommand(_ command: String) throws {
        let store = try requireStore()
        let timestamp = now
        try reconcileTimer(store, at: timestamp)
        var updated = timer
        switch command {
        case "start": updated.start(at: timestamp)
        case "pause": updated.pause(at: timestamp)
        case "reset": updated.reset()
        case "focus":
            if updated.phase != .focus {
                updated.queue(.focus)
            }
        case "rest":
            if updated.phase != .rest {
                updated.queue(.rest)
            }
        default: throw StoreError.invalid("Unknown timer command.")
        }
        try store.saveTimer(updated.encoded())
        timer = updated
        publish()
    }

    func setDurations(focus: Int, rest: Int) throws {
        let store = try requireStore()
        var updated = timer
        try updated.setDurations(focus: focus, rest: rest)
        try store.saveTimer(updated.encoded())
        timer = updated
        publish()
    }

    func terminate() {
        monitor?.invalidate()
        monitor = nil
        for (center, observation) in observations { center.removeObserver(observation) }
        observations.removeAll()
        guard let store else {
            return
        }
        let timestamp = now
        if let activity {
            let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState,
                                                               eventType: Self.allInputEvents)
            let end = capture.endTime(at: timestamp, idle: idle)
            try? store.checkpoint(activity, end: end)
        }
        activity = nil
        try? reconcileTimer(store, at: timestamp)
        if timer.deadline != nil {
            timer.pause(at: timestamp)
            if let encoded = try? timer.encoded() {
                try? store.saveTimer(encoded)
            }
        }
    }
}
