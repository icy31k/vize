import Foundation
import Security

final class AccountPlatform {
    enum Failure: LocalizedError {
        case invalidURL, invalidResponse, keychain, unreachable

        var errorDescription: String? {
            switch self {
            case .invalidURL:
                return "Set a valid Vize backend URL. Remote servers must use HTTPS."
            case .invalidResponse:
                return "The account server returned an unexpected response."
            case .keychain:
                return "Vize couldn’t access the account session in Keychain."
            case .unreachable:
                return "Couldn’t reach the account server. Try again when it’s available."
            }
        }
    }

    private final class RedirectPolicy: NSObject, URLSessionTaskDelegate {
        func urlSession(
            _ session: URLSession,
            task: URLSessionTask,
            willPerformHTTPRedirection response: HTTPURLResponse,
            newRequest request: URLRequest,
            completionHandler: @escaping (URLRequest?) -> Void
        ) {
            completionHandler(nil)
        }
    }

    private let network: URLSession = {
        let settings = URLSessionConfiguration.ephemeral
        settings.timeoutIntervalForRequest = 8
        settings.timeoutIntervalForResource = 15
        settings.httpShouldSetCookies = false
        settings.urlCache = nil
        return URLSession(configuration: settings, delegate: RedirectPolicy(), delegateQueue: nil)
    }()

    private func baseURL() throws -> URL {
        let setting = Bundle.main.object(forInfoDictionaryKey: "VizeAPIBaseURL") as? String
        let configured = ProcessInfo.processInfo.environment["VIZE_API_BASE_URL"] ?? setting ?? ""
        let address = configured.isEmpty ? "http://127.0.0.1:8000" : configured
        guard var components = URLComponents(string: address),
              let host = components.host?.lowercased(),
              !host.isEmpty,
              components.user == nil,
              components.password == nil,
              components.query == nil,
              components.fragment == nil
        else {
            throw Failure.invalidURL
        }
        let loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].contains(host)
        guard components.scheme == "https" || (components.scheme == "http" && loopback) else {
            throw Failure.invalidURL
        }
        components.path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if !components.path.isEmpty {
            components.path = "/" + components.path
        }
        guard let url = components.url else {
            throw Failure.invalidURL
        }
        return url
    }

    func send(path: String, method: String, body: String?, token: String?) async throws -> [String: Any] {
        let url = try baseURL().appendingPathComponent(path)
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = Data(body.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let result: (Data, URLResponse)
        do {
            result = try await network.data(for: request)
        } catch is URLError {
            throw Failure.unreachable
        }
        let (data, response) = result
        guard let http = response as? HTTPURLResponse else {
            throw Failure.invalidResponse
        }
        return ["status": http.statusCode, "body": String(decoding: data, as: UTF8.self)]
    }

    private func keychainQuery() throws -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "\(Bundle.main.bundleIdentifier ?? "local.vize.tracker").account",
            kSecAttrAccount as String: try baseURL().absoluteString,
        ]
    }

    func readSession() throws -> String? {
        var query = try keychainQuery()
        query[kSecReturnData as String] = true
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess, let data = item as? Data else {
            throw Failure.keychain
        }
        return String(decoding: data, as: UTF8.self)
    }

    func writeSession(_ value: String?) throws {
        var query = try keychainQuery()
        guard let value else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                throw Failure.keychain
            }
            return
        }
        let data = Data(value.utf8)
        let values = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            query[kSecValueData as String] = data
            guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
                throw Failure.keychain
            }
        } else if status != errSecSuccess {
            throw Failure.keychain
        }
    }
}
