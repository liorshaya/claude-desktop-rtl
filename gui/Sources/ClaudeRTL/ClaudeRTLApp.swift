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
    @State private var showDetails = false

    private var s: AppStatus { runner.status }
    private var needsUpdate: Bool {
        s.patchedInstalled && s.patchedVersion != "—" && s.originalVersion != s.patchedVersion
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            stateBadge
            Divider()

            VStack(spacing: 10) {
                infoRow("Claude", s.originalPresent ? s.originalVersion : "not found")
                Toggle(isOn: watchBinding) {
                    Label("Keep RTL after Claude updates", systemImage: "arrow.triangle.2.circlepath")
                }
                .toggleStyle(.switch).controlSize(.mini).font(.callout)
            }

            if s.originalRunning { warning }

            Button {
                Task { await runner.install() }
            } label: {
                Label(primaryTitle, systemImage: s.patchedInstalled ? "arrow.clockwise" : "arrow.down.circle.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent).controlSize(.large).disabled(runner.busy)

            HStack {
                Button { Task { await runner.openPatched() } } label: { Label("Open", systemImage: "play.fill") }
                    .disabled(!s.patchedInstalled || runner.busy)
                Spacer()
                if s.patchedInstalled {
                    Button(role: .destructive) { Task { await runner.uninstall() } } label: { Label("Uninstall", systemImage: "trash") }
                        .disabled(runner.busy)
                }
            }

            if runner.busy {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Working…").font(.caption).foregroundStyle(.secondary)
                }
            }

            DisclosureGroup("Details", isExpanded: $showDetails) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("First install: macOS asks for your keychain password — click **Always Allow**. If the first window is blank, quit (⌘Q) and reopen.")
                        .font(.caption2).foregroundStyle(.secondary)
                    if !runner.log.isEmpty {
                        ScrollView {
                            Text(runner.log)
                                .font(.system(.caption2, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .frame(height: 110)
                        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 6))
                    }
                }
                .padding(.top, 4)
            }
            .font(.caption)

            Divider()
            HStack {
                Button { Task { await runner.refresh() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.borderless).help("Refresh")
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }.buttonStyle(.borderless)
            }
            .font(.caption)
        }
        .padding(16)
        .frame(width: 340)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "character.bubble.fill").font(.title2).foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 1) {
                Text("Claude RTL").font(.headline)
                Text("Smooth Hebrew / Arabic for Claude").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var stateBadge: some View {
        let text: String
        let icon: String
        let color: Color
        if !s.patchedInstalled { text = "RTL not installed"; icon = "circle"; color = .gray }
        else if needsUpdate { text = "Update available"; icon = "exclamationmark.circle.fill"; color = .orange }
        else { text = "RTL active"; icon = "checkmark.circle.fill"; color = .green }
        return HStack(spacing: 8) {
            Image(systemName: icon).foregroundStyle(color)
            Text(text).font(.callout.weight(.medium))
            Spacer()
            if s.patchedInstalled { Text("v\(s.patchedVersion)").font(.caption).foregroundStyle(.secondary) }
        }
        .padding(10)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
    }

    private var warning: some View {
        HStack(spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            Text("Claude is open — Open will quit it first").font(.caption)
            Spacer()
            Button("Quit Claude") { Task { await runner.quitOriginal() } }.controlSize(.small)
        }
        .padding(8)
        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))
    }

    private var primaryTitle: String {
        s.patchedInstalled ? (needsUpdate ? "Update RTL" : "Reinstall RTL") : "Install RTL"
    }

    private var watchBinding: Binding<Bool> {
        Binding(get: { s.watcherActive }, set: { v in Task { await runner.setWatch(v) } })
    }

    private func infoRow(_ k: String, _ v: String) -> some View {
        HStack { Text(k).foregroundStyle(.secondary); Spacer(); Text(v) }.font(.callout)
    }
}
