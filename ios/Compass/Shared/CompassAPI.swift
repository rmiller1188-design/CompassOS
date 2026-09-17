import Foundation

struct CompassConfiguration {
    static let apiBaseURL = URL(string: "https://YOUR-M26-RENDER-URL.onrender.com")!
}

enum CompassAPIError: Error {
    case missingSession
    case invalidResponse
    case server(String)
}

struct SharedUpload: Identifiable {
    let id = UUID()
    let url: URL
    let name: String
    let mimeType: String
}

final class CompassAPI {
    static let shared = CompassAPI()

    func submitShare(
        workspaceID: String,
        scope: String,
        note: String,
        sourceURL: URL?,
        files: [SharedUpload]
    ) async throws {
        guard let token = SharedSessionStore.accessToken else { throw CompassAPIError.missingSession }
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: CompassConfiguration.apiBaseURL.appending(path: "/api/share-intake"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(workspaceID, forHTTPHeaderField: "X-Compass-Workspace")
        request.setValue(scope, forHTTPHeaderField: "X-Compass-Scope")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.appendField(name: "note", value: note, boundary: boundary)
        if let sourceURL { body.appendField(name: "sourceUrl", value: sourceURL.absoluteString, boundary: boundary) }
        for file in files {
            let data = try Data(contentsOf: file.url, options: .mappedIfSafe)
            body.appendFile(name: "files", filename: file.name, mimeType: file.mimeType, data: data, boundary: boundary)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw CompassAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "Compass rejected the share."
            throw CompassAPIError.server(message)
        }
    }
}

private extension Data {
    mutating func appendField(name: String, value: String, boundary: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
        append("\(value)\r\n".data(using: .utf8)!)
    }

    mutating func appendFile(name: String, filename: String, mimeType: String, data: Data, boundary: String) {
        append("--\(boundary)\r\n".data(using: .utf8)!)
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
