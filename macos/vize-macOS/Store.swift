import Foundation
import SQLite3

struct Category {
    let id: Int64
    let name: String
    var payload: [String: Any] { ["id": id, "name": name] }
}

struct Activity {
    let id: Int64
    let appID: String
    let appName: String
    let start: Double
    var end: Double
    let categoryID: Int64

    var payload: [String: Any] {
        ["id": id, "appID": appID, "appName": appName, "start": start, "end": end, "categoryID": categoryID]
    }
}

enum StoreError: LocalizedError {
    case database(String)
    case invalid(String)

    var errorDescription: String? {
        switch self {
        case let .database(message), let .invalid(message): return message
        }
    }
}

final class Store {
    static let uncategorized: Int64 = 1
    private let db: OpaquePointer
    private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    init(url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        var connection: OpaquePointer?
        let code = sqlite3_open_v2(url.path, &connection, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nil)
        guard code == SQLITE_OK,
              let connection
        else {
            if let connection {
                sqlite3_close(connection)
            }
            throw StoreError.database("Could not open local activity data.")
        }
        db = connection
        sqlite3_busy_timeout(db, 3000)
        do {
            try execute("PRAGMA foreign_keys = ON")
            let version = try read("PRAGMA user_version") { sqlite3_column_int($0, 0) }.first
            switch version {
            case 0:
                try transaction {
                    try execute("""
                        CREATE TABLE categories (
                            id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL
                        );
                        CREATE TABLE app_defaults (
                            app_id TEXT PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id)
                        );
                        CREATE TABLE activity (
                            id INTEGER PRIMARY KEY, app_id TEXT NOT NULL, app_name TEXT NOT NULL,
                            start REAL NOT NULL, end REAL NOT NULL CHECK(end >= start),
                            category_id INTEGER NOT NULL REFERENCES categories(id)
                        );
                        CREATE INDEX activity_start ON activity(start);
                        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                        CREATE TABLE pomodoros (id TEXT PRIMARY KEY, completed_at REAL NOT NULL);
                        CREATE INDEX pomodoros_completed_at ON pomodoros(completed_at);
                        INSERT INTO categories (id, name) VALUES
                            (1, 'Uncategorized'), (2, 'Development'), (3, 'Communication'), (4, 'Research');
                        PRAGMA user_version = 1;
                        """)
                }
            case 1:
                break
            default:
                throw StoreError.database("This database requires a newer version of Vize.")
            }
            try run("DELETE FROM activity WHERE end = start")
        } catch {
            sqlite3_close(db)
            throw error
        }
    }

    deinit { sqlite3_close(db) }

    private func error() -> StoreError {
        .database(String(cString: sqlite3_errmsg(db)))
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else {
            throw error()
        }
    }

    private func transaction<T>(_ operation: () throws -> T) throws -> T {
        try execute("BEGIN IMMEDIATE")
        do {
            let result = try operation()
            try execute("COMMIT")
            return result
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    private enum Value {
        case text(String), integer(Int64), real(Double)
    }

    private func statement<T>(_ sql: String, _ values: [Value], _ use: (OpaquePointer) throws -> T) throws -> T {
        var prepared: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &prepared, nil) == SQLITE_OK,
              let prepared
        else {
            throw error()
        }
        defer { sqlite3_finalize(prepared) }
        for (index, value) in values.enumerated() {
            let position = Int32(index + 1)
            let code: Int32
            switch value {
            case let .text(text):
                code = text.withCString { sqlite3_bind_text(prepared, position, $0, -1, transient) }
            case let .integer(number):
                code = sqlite3_bind_int64(prepared, position, number)
            case let .real(number):
                code = sqlite3_bind_double(prepared, position, number)
            }
            guard code == SQLITE_OK else {
                throw error()
            }
        }
        return try use(prepared)
    }

    private func run(_ sql: String, _ values: [Value] = []) throws {
        try statement(sql, values) {
            guard sqlite3_step($0) == SQLITE_DONE else {
                throw error()
            }
        }
    }

    private func read<T>(_ sql: String, _ values: [Value] = [], _ decode: (OpaquePointer) -> T) throws -> [T] {
        try statement(sql, values) { statement in
            var rows: [T] = []
            var status = sqlite3_step(statement)
            while status == SQLITE_ROW {
                rows.append(decode(statement))
                status = sqlite3_step(statement)
            }
            guard status == SQLITE_DONE else {
                throw error()
            }
            return rows
        }
    }

    private func text(_ statement: OpaquePointer, _ index: Int32) -> String {
        sqlite3_column_text(statement, index).map { String(cString: $0) } ?? ""
    }

    func categories() throws -> [Category] {
        try read("SELECT id, name FROM categories ORDER BY id") {
            Category(id: sqlite3_column_int64($0, 0), name: text($0, 1))
        }
    }

    func addCategory(_ input: String) throws -> Category {
        let name = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty,
              name.count <= 40,
              name.rangeOfCharacter(from: .controlCharacters) == nil
        else {
            throw StoreError.invalid("Enter a category name between 1 and 40 characters.")
        }
        guard try !categories().contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) else {
            throw StoreError.invalid("A category with this name already exists.")
        }
        try run("INSERT INTO categories (name) VALUES (?)", [.text(name)])
        return Category(id: sqlite3_last_insert_rowid(db), name: name)
    }

    func categoryForApp(_ appID: String) throws -> Int64 {
        try read("SELECT category_id FROM app_defaults WHERE app_id = ?", [.text(appID)]) {
            sqlite3_column_int64($0, 0)
        }.first ?? Self.uncategorized
    }

    func assignCategory(activityID: Int64, categoryID: Int64, saveDefault: Bool) throws {
        try assignCategory(activityIDs: [activityID], categoryID: categoryID, saveDefault: saveDefault)
    }

    func assignCategory(activityIDs: [Int64], categoryID: Int64, saveDefault: Bool) throws {
        guard let firstID = activityIDs.first else {
            throw StoreError.invalid("Select at least one activity block.")
        }
        try transaction {
            let apps = try read("SELECT app_id FROM activity WHERE id = ?", [.integer(firstID)]) { text($0, 0) }
            guard let appID = apps.first else {
                throw StoreError.invalid("This activity block is unavailable.")
            }
            for id in activityIDs {
                try run(
                    "UPDATE activity SET category_id = ? WHERE id = ? AND app_id = ?",
                    [.integer(categoryID), .integer(id), .text(appID)]
                )
                guard sqlite3_changes(db) == 1 else {
                    throw StoreError.invalid("An activity block is unavailable for this app.")
                }
            }
            if saveDefault {
                try run("""
                    INSERT INTO app_defaults (app_id, category_id) VALUES (?, ?)
                    ON CONFLICT(app_id) DO UPDATE SET category_id = excluded.category_id
                    """, [.text(appID), .integer(categoryID)])
            }
        }
    }

    func beginActivity(appID: String, name: String, start: Double) throws -> Activity {
        let category = try categoryForApp(appID)
        try run("""
            INSERT INTO activity (app_id, app_name, start, end, category_id) VALUES (?, ?, ?, ?, ?)
            """, [.text(appID), .text(name), .real(start), .real(start), .integer(category)])
        return Activity(id: sqlite3_last_insert_rowid(db), appID: appID, appName: name, start: start, end: start,
                        categoryID: category)
    }

    func checkpoint(_ activity: Activity, end: Double) throws {
        try run("UPDATE activity SET end = ? WHERE id = ?", [.real(max(activity.start, end)), .integer(activity.id)])
    }

    func activities(from: Double, to: Double) throws -> [Activity] {
        try read("""
            SELECT id, app_id, app_name, start, end, category_id FROM activity
            WHERE start < ? AND end > ? AND end > start ORDER BY start, id
            """, [.real(to), .real(from)]) {
            Activity(id: sqlite3_column_int64($0, 0), appID: text($0, 1), appName: text($0, 2),
                     start: sqlite3_column_double($0, 3), end: sqlite3_column_double($0, 4),
                     categoryID: sqlite3_column_int64($0, 5))
        }
    }

    func setting(_ key: String) throws -> String? {
        try read("SELECT value FROM settings WHERE key = ?", [.text(key)]) { text($0, 0) }.first
    }

    func saveSetting(_ key: String, _ value: String) throws {
        try run("""
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, [.text(key), .text(value)])
    }

    func saveTimer(_ json: String, completion: (id: String, at: Double)? = nil) throws {
        try transaction {
            if let completion {
                try run("INSERT OR IGNORE INTO pomodoros (id, completed_at) VALUES (?, ?)",
                        [.text(completion.id), .real(completion.at)])
            }
            try saveSetting("timer", json)
        }
    }

    func pomodoros(from: Double, to: Double) throws -> Int64 {
        try read("SELECT COUNT(*) FROM pomodoros WHERE completed_at >= ? AND completed_at < ?",
                 [.real(from), .real(to)]) { sqlite3_column_int64($0, 0) }.first ?? 0
    }
}
