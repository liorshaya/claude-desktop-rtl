import SwiftUI

@main
struct ClaudeRTLApp: App {
    @StateObject private var runner = PatchRunner()

    var body: some Scene {
        MenuBarExtra("Claude RTL", systemImage: "character.bubble") {
            ContentView(runner: runner)
                .task { await runner.refresh() }
        }
        .menuBarExtraStyle(.window)
    }
}

struct ContentView: View {
    @ObservedObject var runner: PatchRunner

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Claude RTL").font(.headline)

            // --- Status ---
            VStack(alignment: .leading, spacing: 4) {
                row("Claude", runner.status.originalPresent ? runner.status.originalVersion : "not found")
                row("Claude-RTL", runner.status.patchedInstalled ? "installed \(runner.status.patchedVersion)" : "not installed")
                row("Auto-update", runner.status.watcherActive ? "on" : "off")
            }
            .font(.system(.callout, design: .monospaced))

            // --- The original must be quit before launching the patched copy ---
            if runner.status.originalRunning {
                HStack {
                    Label("Claude is open — quit it before opening Claude-RTL", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange).font(.caption)
                    Button("Quit Claude") { Task { await runner.quitOriginal() } }
                }
            }

            Divider()

            // --- Actions ---
            VStack(spacing: 6) {
                Button(runner.status.patchedInstalled ? "Update RTL" : "Install RTL") {
                    Task { await runner.install() }
                }.buttonStyle(.borderedProminent)

                Toggle("Keep RTL after Claude updates", isOn: Binding(
                    get: { runner.status.watcherActive },
                    set: { v in Task { await runner.setWatch(v) } }
                ))

                HStack {
                    Button("Open Claude-RTL") { Task { await runner.openPatched() } }
                        .disabled(!runner.status.patchedInstalled)
                    Spacer()
                    if runner.status.patchedInstalled {
                        Button("Uninstall", role: .destructive) { Task { await runner.uninstall() } }
                    }
                }
            }
            .disabled(runner.busy)

            // First-run heads-up for the gotchas we hit during bring-up.
            Text("First install: macOS will ask for your keychain password — click **Always Allow**. If the first window is blank, quit (⌘Q) and reopen.")
                .font(.caption2).foregroundStyle(.secondary)

            if runner.busy { ProgressView().controlSize(.small) }
            if !runner.log.isEmpty {
                ScrollView { Text(runner.log).font(.system(.caption2, design: .monospaced)).textSelection(.enabled) }
                    .frame(maxHeight: 120)
            }

            HStack {
                Button("Refresh") { Task { await runner.refresh() } }
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
            }
        }
        .padding(14)
        .frame(width: 320)
    }

    private func row(_ k: String, _ v: String) -> some View {
        HStack { Text(k); Spacer(); Text(v).foregroundStyle(.secondary) }
    }
}
