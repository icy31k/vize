import Foundation

@main
enum NativeChecks {
    static func main() throws {
        checkForegroundIdentity()

        var capture = CapturePolicy()
        precondition(!capture.allowsCapture(idle: 0))
        capture.enabled = true
        precondition(capture.allowsCapture(idle: 299.9))
        precondition(!capture.allowsCapture(idle: 300))
        precondition(capture.endTime(at: 500, idle: 301) == 499)
        capture.locked = true
        capture.systemSleeping = true
        precondition(!capture.allowsCapture(idle: 0))
        capture.systemSleeping = false
        precondition(!capture.allowsCapture(idle: 0))
        capture.locked = false
        capture.displaySleeping = true
        precondition(!capture.allowsCapture(idle: 0))
        capture.displaySleeping = false
        capture.sessionInactive = true
        precondition(!capture.allowsCapture(idle: 0))
        capture.sessionInactive = false
        precondition(capture.allowsCapture(idle: 0))

        let url = URL(fileURLWithPath: CommandLine.arguments[1])
        let store = try Store(url: url)
        let id = "test.editor"
        let first = try store.beginActivity(appID: id, name: "Editor", start: 100)
        try store.checkpoint(first, end: 130)
        let second = try store.beginActivity(appID: id, name: "Editor", start: 140)
        try store.checkpoint(second, end: 170)

        let design = try store.addCategory("Design")
        try store.assignCategory(activityID: second.id, categoryID: design.id, saveDefault: true)
        let third = try store.beginActivity(appID: id, name: "Editor", start: 180)
        try store.checkpoint(third, end: 190)

        let reopened = try Store(url: url)
        let blocks = try reopened.activities(from: 0, to: 1_000)
        precondition(blocks.map(\.categoryID) == [Store.uncategorized, design.id, design.id])
        precondition(blocks.map(\.end) == [130, 170, 190])
        let later = try reopened.activities(from: 185, to: 300)
        precondition(later.map(\.id) == [third.id])

        var timer = TimerState()
        try timer.setDurations(focus: 1, rest: 1)
        timer.start(at: 1_000)
        timer.pause(at: 1_013)
        precondition(timer.remaining == 47 && timer.deadline == nil)
        timer.start(at: 1_020)
        precondition(timer.deadline == 1_067)
        let expired = timer.advance(at: 1_200)
        precondition(expired.changed && expired.completion?.at == 1_067)
        precondition(timer.phase == .rest && timer.deadline == nil && timer.remaining == 60)
        precondition(!timer.advance(at: 1_206).changed)
        try store.saveTimer(timer.encoded(), completion: expired.completion)
        try store.saveTimer(timer.encoded(), completion: expired.completion)
        let completed = try reopened.pomodoros(from: 1_000, to: 1_100)
        precondition(completed == 1)
        print("Capture boundaries, SQLite persistence, future app defaults, pause/resume, and timer completion verified.")
    }

    private static func checkForegroundIdentity() {
        let executable = "wine64-preloader"
        var argumentCount: Int32 = 3
        var arguments = withUnsafeBytes(of: &argumentCount) { Data($0) }
        arguments.append(contentsOf: "/usr/local/bin/wine64-preloader\0\0wine64\0--\0C:\\Games\\Skyrim Special Edition\\SkyrimSE.exe\0OTHER=Ignored.exe\0".utf8)
        let windowsProgram = ForegroundApp.windowsProgram(in: arguments)
        precondition(windowsProgram == "SkyrimSE.exe")

        let game = ForegroundApp(
            bundleID: nil,
            localizedName: executable,
            executable: executable,
            wineProgram: windowsProgram
        )
        precondition(game?.id == "wine:skyrimse.exe")
        precondition(game?.name == "SkyrimSE")

        let unbundled = ForegroundApp(
            bundleID: nil,
            localizedName: nil,
            executable: "Editor",
            wineProgram: nil
        )
        precondition(unbundled?.id == "process:editor")
        precondition(unbundled?.name == "Editor")

        let bundled = ForegroundApp(
            bundleID: "com.apple.finder",
            localizedName: "Finder",
            executable: "Finder",
            wineProgram: nil
        )
        precondition(bundled?.id == "com.apple.finder")

        argumentCount = 2
        withUnsafeBytes(of: &argumentCount) { arguments.replaceSubrange(0..<MemoryLayout<Int32>.size, with: $0) }
        precondition(ForegroundApp.windowsProgram(in: arguments) == nil)
        precondition(ForegroundApp.windowsProgram(in: Data()) == nil)
        print("Bundled, unbundled, and Wine foreground identities verified.")
    }
}
