import SwiftUI

struct ContentView: View {
    @State private var privateWorkspace = SharedSessionStore.privateWorkspaceID ?? ""
    @State private var sharedWorkspace = SharedSessionStore.sharedWorkspaceID ?? ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Compass account") {
                    Text(SharedSessionStore.hasAccessToken ? "Signed in" : "Sign in through the Compass web app, then complete native session handoff.")
                        .foregroundStyle(SharedSessionStore.hasAccessToken ? .green : .secondary)
                }
                Section("Workspace IDs") {
                    TextField("Private workspace UUID", text: $privateWorkspace)
                        .textInputAutocapitalization(.never)
                        .onChange(of: privateWorkspace) { _, newValue in SharedSessionStore.privateWorkspaceID = newValue }
                    TextField("Shared Us workspace UUID", text: $sharedWorkspace)
                        .textInputAutocapitalization(.never)
                        .onChange(of: sharedWorkspace) { _, newValue in SharedSessionStore.sharedWorkspaceID = newValue }
                }
                Section("Share extension") {
                    Text("Use the iOS Share Sheet in Photos, Files, Safari, Voice Memos, or another app. Choose Compass, then save privately or into Us.")
                }
            }
            .navigationTitle("Compass")
        }
    }
}
