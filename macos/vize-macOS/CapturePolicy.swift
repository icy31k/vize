struct CapturePolicy {
    static let idleLimit: Double = 300

    var enabled = false
    var systemSleeping = false
    var displaySleeping = false
    var sessionInactive = false
    var locked = false

    var sessionAvailable: Bool {
        !systemSleeping
            && !displaySleeping
            && !sessionInactive
            && !locked
    }

    func allowsCapture(idle: Double) -> Bool {
        enabled
            && sessionAvailable
            && idle < Self.idleLimit
    }

    func endTime(at now: Double, idle: Double) -> Double {
        idle >= Self.idleLimit
            && idle.isFinite
                ? now - (idle - Self.idleLimit)
                : now
    }
}
