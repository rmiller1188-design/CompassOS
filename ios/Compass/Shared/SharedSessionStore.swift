import Foundation
import Security

final class SharedSessionStore {
    private static let service = "com.compass.youandus.session"
    private static let account = "supabase-access-token"
    // Replace YOUR_TEAM_ID with the Apple Developer Team ID used by both targets.
    private static let accessGroup = "YOUR_TEAM_ID.com.compass.youandus.shared"
    private static let defaults = UserDefaults(suiteName: "group.com.compass.youandus")!

    static var hasAccessToken: Bool { accessToken != nil }

    static var accessToken: String? {
        get {
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecAttrAccessGroup as String: accessGroup,
                kSecReturnData as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne
            ]
            var item: CFTypeRef?
            guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
                  let data = item as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecAttrAccessGroup as String: accessGroup] as CFDictionary)
            guard let newValue, let data = newValue.data(using: .utf8) else { return }
            SecItemAdd([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: account,
                kSecAttrAccessGroup as String: accessGroup,
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ] as CFDictionary, nil)
        }
    }

    static var privateWorkspaceID: String? {
        get { defaults.string(forKey: "privateWorkspaceID") }
        set { defaults.set(newValue, forKey: "privateWorkspaceID") }
    }

    static var sharedWorkspaceID: String? {
        get { defaults.string(forKey: "sharedWorkspaceID") }
        set { defaults.set(newValue, forKey: "sharedWorkspaceID") }
    }
}
