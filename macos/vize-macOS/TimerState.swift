import Foundation

enum TimerPhase: String, Codable {
    case focus, rest, longRest
}

struct LongBreakCycle: Codable, Equatable {
    var minutes = 15
    var interval = 4
    var completed = 0
}

struct TimerState: Codable, Equatable {
    var phase: TimerPhase = .focus
    var focusMinutes = 25
    var breakMinutes = 5
    var remaining: Double = 25 * 60
    var deadline: Double?
    var runID: String?
    // Older saved timers have no cycle; start those timers with the defaults.
    private var savedLongBreakCycle: LongBreakCycle?

    var longBreakCycle: LongBreakCycle {
        savedLongBreakCycle ?? LongBreakCycle()
    }

    var phaseDuration: Double {
        switch phase {
        case .focus:
            return Double(focusMinutes * 60)
        case .rest:
            return Double(breakMinutes * 60)
        case .longRest:
            return Double(longBreakCycle.minutes * 60)
        }
    }

    func secondsRemaining(at now: Double) -> Double {
        deadline.map { max(0, $0 - now) } ?? remaining
    }

    mutating func start(at now: Double) {
        guard deadline == nil else {
            return
        }
        runID = runID ?? UUID().uuidString
        deadline = now + remaining
    }

    mutating func pause(at now: Double) {
        remaining = secondsRemaining(at: now)
        deadline = nil
    }

    mutating func reset() {
        remaining = phaseDuration
        deadline = nil
        runID = nil
    }

    mutating func queue(_ phase: TimerPhase) {
        self.phase = phase
        reset()
    }

    mutating func setDurations(focus: Int, rest: Int) throws {
        guard (1...120).contains(focus),
              (1...60).contains(rest)
        else {
            throw StoreError.invalid("Use 1–120 minutes for focus and 1–60 minutes for a break.")
        }
        focusMinutes = focus
        breakMinutes = rest
        if runID == nil {
            reset()
        }
    }

    mutating func setLongBreak(minutes: Int, interval: Int) throws {
        guard (1...60).contains(minutes),
              (1...99).contains(interval)
        else {
            throw StoreError.invalid("Use 1–60 minutes and 1–99 Pomodoros for a long break.")
        }
        var cycle = longBreakCycle
        cycle.minutes = minutes
        cycle.interval = interval
        savedLongBreakCycle = cycle
        if phase == .longRest,
           runID == nil {
            reset()
        }
    }

    mutating func advance(at now: Double) -> (changed: Bool, completion: (id: String, at: Double)?) {
        guard let deadline,
              deadline <= now
        else {
            return (false, nil)
        }
        guard phase == .focus else {
            queue(.focus)
            return (true, nil)
        }

        let completion = runID.map { (id: $0, at: deadline) }
        var cycle = longBreakCycle
        cycle.completed += 1
        let longBreakDue = cycle.completed >= cycle.interval
        if longBreakDue {
            cycle.completed = 0
        }
        savedLongBreakCycle = cycle
        queue(longBreakDue
            ? .longRest
            : .rest)
        return (true, completion)
    }

    func encoded() throws -> String {
        String(decoding: try JSONEncoder().encode(self), as: UTF8.self)
    }
}
