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

// Muted warm terracotta — clearly the Claude orange, but not a neon/eye-searing yellow.
private let brandGradient = LinearGradient(
    colors: [Color(red: 0.84, green: 0.40, blue: 0.28), Color(red: 0.74, green: 0.27, blue: 0.18)],
    startPoint: .topLeading, endPoint: .bottomTrailing
)

// A soft warm-orange gradient button (the system .orange tint renders an eye-searing yellow).
private struct BrandButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 9)
            .background(brandGradient.opacity(configuration.isPressed ? 0.85 : 1),
                        in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: Color(red: 0.91, green: 0.28, blue: 0.13).opacity(0.22), radius: 4, y: 2)
            .opacity(enabled ? 1 : 0.45)
            .saturation(enabled ? 1 : 0.3)
            .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
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
        VStack(spacing: 0) {
            header
            Divider()
            VStack(alignment: .leading, spacing: 14) {
                stateBadge
                controls
                if s.originalRunning { warning }
                primaryButton
                secondaryRow
                if runner.busy { workingRow }
                details
            }
            .padding(16)
        }
        .frame(width: 326)
        .animation(.easeInOut(duration: 0.22), value: s.patchedInstalled)
        .animation(.easeInOut(duration: 0.22), value: needsUpdate)
        .animation(.easeInOut(duration: 0.22), value: s.originalRunning)
        .animation(.easeInOut(duration: 0.22), value: runner.busy)
    }

    // MARK: - Header
    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 11, style: .continuous).fill(brandGradient)
                    .shadow(color: .black.opacity(0.18), radius: 3, y: 1)
                Image(systemName: "character.bubble.fill")
                    .font(.system(size: 18, weight: .semibold)).foregroundStyle(.white)
            }
            .frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 2) {
                Text("Claude RTL").font(.headline)
                Text("Smooth Hebrew & Arabic for Claude").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
    }

    // MARK: - State badge
    private var stateBadge: some View {
        let (text, icon, color): (String, String, Color) =
            !s.patchedInstalled ? ("RTL not installed", "circle.dashed", .secondary) :
            needsUpdate ? ("Update available", "exclamationmark.circle.fill", .orange) :
            ("RTL is active", "checkmark.circle.fill", .green)
        return HStack(spacing: 10) {
            Image(systemName: icon).font(.title3).foregroundStyle(color)
            VStack(alignment: .leading, spacing: 1) {
                Text(text).font(.callout.weight(.semibold))
                if s.patchedInstalled {
                    Text("Patched copy v\(s.patchedVersion)").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(color.opacity(0.22)))
    }

    // MARK: - Controls
    private var controls: some View {
        VStack(spacing: 12) {
            HStack { Text("Claude").foregroundStyle(.secondary); Spacer()
                Text(s.originalPresent ? s.originalVersion : "not found") }
                .font(.callout)
            Toggle(isOn: watchBinding) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Keep RTL after updates")
                    Text("Re-applies automatically when Claude updates").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch).controlSize(.small).font(.callout)
        }
    }

    private var warning: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            Text("Claude is open — “Open” will quit it first").font(.caption)
            Spacer()
            Button("Quit") { Task { await runner.quitOriginal() } }.controlSize(.small).buttonStyle(.bordered)
        }
        .padding(10)
        .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    // MARK: - Actions
    private var primaryButton: some View {
        Button {
            Task { await runner.install() }
        } label: {
            Label(primaryTitle, systemImage: s.patchedInstalled ? "arrow.clockwise" : "arrow.down.circle.fill")
        }
        .buttonStyle(BrandButton())
        .disabled(runner.busy)
    }

    private var secondaryRow: some View {
        HStack {
            Button { Task { await runner.openPatched() } } label: { Label("Open", systemImage: "play.fill") }
                .disabled(!s.patchedInstalled || runner.busy)
            Spacer()
            if s.patchedInstalled {
                Button(role: .destructive) { Task { await runner.uninstall() } } label: {
                    Label("Uninstall", systemImage: "trash")
                }.disabled(runner.busy)
            }
        }
        .buttonStyle(.bordered)
    }

    private var workingRow: some View {
        HStack(spacing: 7) {
            ProgressView().controlSize(.small)
            Text("Working…").font(.caption).foregroundStyle(.secondary)
            Spacer()
        }
        .transition(.opacity)
    }

    private var details: some View {
        DisclosureGroup("Details", isExpanded: $showDetails) {
            VStack(alignment: .leading, spacing: 8) {
                Text("First install: macOS asks for your keychain password — click **Always Allow**. A blank first window? Quit (⌘Q) and reopen.")
                    .font(.caption2).foregroundStyle(.secondary)
                if !runner.log.isEmpty {
                    ScrollView {
                        Text(runner.log)
                            .font(.system(.caption2, design: .monospaced))
                            .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(height: 108)
                    .padding(8)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                }
                HStack {
                    Button { Task { await runner.refresh() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                    Spacer()
                    Button("Quit app") { NSApplication.shared.terminate(nil) }
                }
                .controlSize(.small).buttonStyle(.borderless).padding(.top, 2)
            }
            .padding(.top, 6)
        }
        .font(.caption)
    }

    // MARK: - Helpers
    private var primaryTitle: String {
        s.patchedInstalled ? (needsUpdate ? "Update RTL" : "Reinstall RTL") : "Install RTL"
    }
    private var watchBinding: Binding<Bool> {
        Binding(get: { s.watcherActive }, set: { v in Task { await runner.setWatch(v) } })
    }
}
