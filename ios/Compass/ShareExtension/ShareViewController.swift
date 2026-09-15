import Social
import UniformTypeIdentifiers

final class ShareViewController: SLComposeServiceViewController {
    private var collectedFiles: [SharedUpload] = []
    private var collectedURL: URL?

    override func isContentValid() -> Bool {
        SharedSessionStore.hasAccessToken && !(SharedSessionStore.privateWorkspaceID ?? "").isEmpty
    }

    override func didSelectPost() {
        Task {
            do {
                try await collectAttachments()
                let useShared = SharedSessionStore.sharedWorkspaceID?.isEmpty == false && contentText.lowercased().contains("#us")
                let workspace = useShared ? SharedSessionStore.sharedWorkspaceID! : SharedSessionStore.privateWorkspaceID!
                try await CompassAPI.shared.submitShare(
                    workspaceID: workspace,
                    scope: useShared ? "shared" : "private",
                    note: contentText.replacingOccurrences(of: "#us", with: ""),
                    sourceURL: collectedURL,
                    files: collectedFiles
                )
                extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            } catch {
                let alert = UIAlertController(title: "Compass could not save this", message: error.localizedDescription, preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: "OK", style: .default))
                present(alert, animated: true)
            }
        }
    }

    override func configurationItems() -> [Any]! {
        let destination = SLComposeSheetConfigurationItem()!
        destination.title = "Destination"
        destination.value = "Private by default; type #us to share"
        return [destination]
    }

    private func collectAttachments() async throws {
        collectedFiles = []
        collectedURL = nil
        let providers = extensionContext?.inputItems
            .compactMap { $0 as? NSExtensionItem }
            .flatMap { $0.attachments ?? [] } ?? []

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let item = try await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                collectedURL = item
                continue
            }
            let type = preferredType(for: provider)
            guard let type else { continue }
            let item = try await provider.loadItem(forTypeIdentifier: type.identifier)
            if let url = item as? URL {
                collectedFiles.append(SharedUpload(url: url, name: url.lastPathComponent, mimeType: type.preferredMIMEType ?? "application/octet-stream"))
            } else if let data = item as? Data {
                let url = FileManager.default.temporaryDirectory.appending(path: "share-\(UUID().uuidString).\(type.preferredFilenameExtension ?? "bin")")
                try data.write(to: url)
                collectedFiles.append(SharedUpload(url: url, name: url.lastPathComponent, mimeType: type.preferredMIMEType ?? "application/octet-stream"))
            } else if let image = item as? UIImage, let data = image.jpegData(compressionQuality: 0.92) {
                let url = FileManager.default.temporaryDirectory.appending(path: "share-\(UUID().uuidString).jpg")
                try data.write(to: url)
                collectedFiles.append(SharedUpload(url: url, name: url.lastPathComponent, mimeType: "image/jpeg"))
            }
        }
    }

    private func preferredType(for provider: NSItemProvider) -> UTType? {
        [UTType.image, .movie, .pdf, .audio, .plainText, .data].first { provider.hasItemConformingToTypeIdentifier($0.identifier) }
    }
}

private extension NSItemProvider {
    func loadItem(forTypeIdentifier typeIdentifier: String) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: item) }
            }
        }
    }
}
