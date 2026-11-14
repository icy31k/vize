import Foundation

enum TimerPhase: String, Codable {
    case focus, rest

    var next: Self {
        self == .focus
            ? .rest
            : .focus
    }
}

struct TimerState: Codable, Equatable {
    var phase: TimerPhase = .focus
    var focusMinutes = 25
    var breakMinutes = 5
    var remaining: Double = 25 * 60
    var deadline: Double?
    var runID: String?

    var phaseDuration: Double {
        Double(
            (phase == .focus
                ? focusMinutes
                : breakMinutes) * 60
        )
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

    mutating func advance(at now: Double) -> (changed: Bool, completion: (id: String, at: Double)?) {
        guard let deadline,
              deadline <= now
        else {
            return (false, nil)
        }
        let completion = phase == .focus
            ? runID.map { (id: $0, at: deadline) }
            : nil
        queue(phase.next)
        return (true, completion)
    }

    func encoded() throws -> String {
        String(decoding: try JSONEncoder().encode(self), as: UTF8.self)
    }
}
