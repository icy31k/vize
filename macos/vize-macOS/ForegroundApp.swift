import AppKit
import Darwin
import Foundation

struct ForegroundApp: Equatable {
    let id: String
    let name: String

    init?(_ app: NSRunningApplication) {
        let executable = app.executableURL?.lastPathComponent ?? Self.processName(app.processIdentifier)
        let wineProgram: String?
        if Self.isWineLoader(executable)
            || Self.isWineLoader(app.localizedName)
        {
            wineProgram = Self.windowsProgram(in: Self.processArguments(app.processIdentifier))
        } else {
            wineProgram = nil
        }
        self.init(
            bundleID: app.bundleIdentifier,
            localizedName: app.localizedName,
            executable: executable,
            wineProgram: wineProgram
        )
    }

    init?(bundleID: String?, localizedName: String?, executable: String?, wineProgram: String?) {
        if let wineProgram {
            id = "wine:\(wineProgram.lowercased())"
            name = (wineProgram as NSString).deletingPathExtension
            return
        }

        if let bundleID {
            id = bundleID
            name = localizedName ?? executable ?? bundleID
            return
        }

        guard let executableName = executable ?? localizedName else {
            return nil
        }
        id = "process:\(executableName.lowercased())"
        name = localizedName ?? executableName
    }

    var payload: [String: Any] { ["id": id, "name": name] }

    private static func isWineLoader(_ name: String?) -> Bool {
        switch name?.lowercased() {
        case "wine", "wine64", "wine-preloader", "wine64-preloader":
            return true
        default:
            return false
        }
    }

    private static func processName(_ pid: pid_t) -> String? {
        var bytes = [CChar](repeating: 0, count: Int(MAXCOMLEN) + 1)
        let length = proc_name(pid, &bytes, UInt32(bytes.count))
        guard length > 0 else {
            return nil
        }
        return String(cString: bytes)
    }

    private static func processArguments(_ pid: pid_t) -> Data {
        var mib = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0,
              size > 0
        else {
            return Data()
        }
        var data = Data(count: size)
        let result = data.withUnsafeMutableBytes { bytes in
            sysctl(&mib, 3, bytes.baseAddress, &size, nil, 0)
        }
        guard result == 0 else {
            return Data()
        }
        return data.prefix(size)
    }

    static func windowsProgram(in data: Data) -> String? {
        let headerSize = MemoryLayout<Int32>.size
        guard data.count >= headerSize else {
            return nil
        }
        let argumentCount = data.withUnsafeBytes { $0.loadUnaligned(as: Int32.self) }
        guard argumentCount > 0,
              let pathEnd = data.dropFirst(headerSize).firstIndex(of: 0)
        else {
            return nil
        }

        // The kernel returns the executable path, padding, then argv and the environment.
        var cursor = pathEnd + 1
        while cursor < data.endIndex,
              data[cursor] == 0
        {
            cursor += 1
        }
        for _ in 0..<argumentCount {
            guard let end = data[cursor...].firstIndex(of: 0) else {
                return nil
            }
            let argument = String(decoding: data[cursor..<end], as: UTF8.self)
            cursor = end + 1

            guard let filename = argument.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last,
                  filename.count > 4,
                  filename.lowercased().hasSuffix(".exe"),
                  !filename.contains("="),
                  !filename.hasPrefix("-")
            else {
                continue
            }
            return String(filename)
        }
        return nil
    }
}
