import SwiftUI
import AppKit

@main
struct ClaudeRTLApp: App {
    @StateObject private var runner = PatchRunner()

    var body: some Scene {
        MenuBarExtra {
            ContentView(runner: runner)
                .task { await runner.refresh() }
        } label: {
            Image(nsImage: Self.statusIcon)
                .accessibilityLabel("Claude RTL")   // VoiceOver otherwise announces an unnamed image
        }
        .menuBarExtraStyle(.window)
    }

    // isTemplate → monochrome, adapts to the light/dark menu bar.
    private static let statusIcon: NSImage = {
        let img = bundledNSImage("claude-rtl-statusTemplate")
        img.isTemplate = true
        img.size = NSSize(width: 26, height: 26)
        return img
    }()
}

// SwiftUI's Image("name") won't resolve a loose bundle PNG without an asset catalog, so load
// the NSImage explicitly (named → handles @2x; path fallback; empty image as a last resort).
func bundledNSImage(_ name: String) -> NSImage {
    NSImage(named: name)
        ?? Bundle.main.url(forResource: name, withExtension: "png").flatMap { NSImage(contentsOf: $0) }
        ?? NSImage()
}

// Our logo (the menu-bar template glyph) for in-window use — rendered white over the gradient.
let brandLogo: NSImage = bundledNSImage("claude-rtl-statusTemplate")

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

// Carries the SwiftUI-measured content height out of the view tree (see WindowResizer for why
// we measure it ourselves instead of asking AppKit).
private struct HeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

// Forces the MenuBarExtra panel to track the SwiftUI content's exact height (grow AND shrink).
// MenuBarExtra(.window) only ever grows the panel, so without this the window keeps its largest
// size and the content ends up un-anchored with a transparent gap. We resize the panel to the
// content height, keeping the top edge fixed (it drops down from the menu bar).
//
// `height` is the SwiftUI-measured height of the .fixedSize content — NOT win.contentView.fittingSize.
// On some setups (e.g. a built-in Retina display) MenuBarExtra pins its hosting view to the panel's
// high-water-mark size, so fittingSize keeps reporting the stale large height when Details collapses;
// the shrink guard then sees no change and the gap stays. The SwiftUI geometry is the true intrinsic
// height on every machine, so driving the resize from it grows AND shrinks reliably everywhere.
private struct WindowResizer: NSViewRepresentable {
    var height: CGFloat
    func makeNSView(context: Context) -> NSView { NSView(frame: .zero) }
    func updateNSView(_ nsView: NSView, context: Context) {
        let target = height
        guard target > 1 else { return }
        DispatchQueue.main.async {
            guard let win = nsView.window else { return }
            guard abs(win.frame.height - target) > 0.5 else { return }
            var f = win.frame
            let top = f.maxY                 // keep the top edge anchored to the menu bar
            f.size.height = target
            f.origin.y = top - target
            win.setFrame(f, display: true)
        }
    }
}

struct ContentView: View {
    @ObservedObject var runner: PatchRunner
    @State private var showDetails = false
    @State private var contentHeight: CGFloat = 0

    private var s: AppStatus { runner.status }
    private var needsUpdate: Bool {
        // originalPresent gate: with /Applications/Claude.app gone, originalVersion is "—" ≠
        // patchedVersion, which showed "Update available" and offered an Update that patch.sh
        // can only die on (no source app to copy).
        s.originalPresent && s.patchedInstalled && s.patchedVersion != "—" && s.originalVersion != s.patchedVersion
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            VStack(alignment: .leading, spacing: 14) {
                stateBadge
                controls
                if s.originalRunning { warning }
                if let failure = runner.lastFailure, !runner.busy { failureBanner(failure) }
                primaryButton
                secondaryRow
                if runner.busy { workingRow }
                details
            }
            .padding(16)
        }
        .frame(width: 326)
        .fixedSize(horizontal: false, vertical: true)
        // MenuBarExtra(.window) grows its panel to fit content but never shrinks it back (the
        // "high-water-mark" bug) - leaving a transparent gap above the content when Details closes.
        // Measure the content's intrinsic height in SwiftUI and feed it to WindowResizer, which
        // forces the hosting panel to that exact height (top-anchored) so it grows AND shrinks
        // cleanly on every machine — see WindowResizer for why fittingSize can't be trusted.
        .background(GeometryReader { g in
            Color.clear.preference(key: HeightKey.self, value: g.size.height)
        })
        .onPreferenceChange(HeightKey.self) { contentHeight = $0 }
        .background(WindowResizer(height: contentHeight))
    }

    // MARK: - Header
    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(Color(red: 0.99, green: 0.97, blue: 0.94))   // Claude's warm off-white
                    .shadow(color: .black.opacity(0.16), radius: 3, y: 1)
                Image(nsImage: brandLogo)
                    .resizable().renderingMode(.template).scaledToFit()
                    .frame(width: 44, height: 44).foregroundStyle(brandGradient)   // Claude orange
            }
            .frame(width: 50, height: 50)
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
            Toggle(isOn: loginBinding) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Start at login")
                    Text("Open Claude RTL automatically when you sign in").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.switch).controlSize(.small).font(.callout)
        }
    }

    private var warning: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                Text("Claude is open — it'll be quit first before opening Claude-RTL.")
                    .font(.caption)
                    .fixedSize(horizontal: false, vertical: true)   // wrap, never truncate
            }
            HStack {
                Spacer()
                Button("Quit Claude now") { Task { await runner.quitOriginal() } }
                    .controlSize(.small).buttonStyle(.bordered)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    // MARK: - Actions
    // The primary button is always the most relevant next action for the current state.
    private enum Primary { case install, update, open }
    private var primary: Primary {
        if !s.patchedInstalled { return .install }
        return needsUpdate ? .update : .open
    }

    private var primaryButton: some View {
        let label: (String, String) = {
            switch primary {
            case .install: return ("Install RTL", "arrow.down.circle.fill")
            case .update:  return ("Update RTL", "arrow.clockwise")
            case .open:    return ("Open Claude-RTL", "play.fill")
            }
        }()
        return Button {
            Task { primary == .open ? await runner.openPatched() : await runner.install() }
        } label: {
            Label(label.0, systemImage: label.1)
        }
        .buttonStyle(BrandButton())
        .disabled(runner.busy)
    }

    private var secondaryRow: some View {
        HStack {
            if s.patchedInstalled {
                if primary == .open {
                    // Already installed + current → the rare repair action lives here, quietly.
                    Button { Task { await runner.install() } } label: { Label("Re-apply", systemImage: "arrow.clockwise") }
                } else {
                    Button { Task { await runner.openPatched() } } label: { Label("Open", systemImage: "play.fill") }
                }
                Spacer()
                Button(role: .destructive) { confirmUninstall() } label: { Label("Uninstall", systemImage: "trash") }
            }
        }
        .buttonStyle(.bordered).disabled(runner.busy)
    }

    // Uninstall is the one destructive action with no natural gate (no admin prompt on macOS),
    // so a mis-click next to "Open" removed the app instantly. NSAlert (not SwiftUI's
    // confirmationDialog) because presentation inside a MenuBarExtra window panel is reliable.
    private func confirmUninstall() {
        let alert = NSAlert()
        alert.messageText = "Uninstall Claude-RTL?"
        alert.informativeText = "This removes the patched copy at ~/Applications/Claude-RTL.app. The original Claude app is never touched, and you can reinstall anytime."
        alert.alertStyle = .warning
        let remove = alert.addButton(withTitle: "Uninstall")
        remove.hasDestructiveAction = true
        alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn {
            Task { await runner.uninstall() }
        }
    }

    // A failed action used to leave no visible trace — the badge simply stayed at its old
    // state and the reason sat in the collapsed Details log. One red line, cleared when the
    // next action starts; it also opens Details so the log is a single click away.
    private func failureBanner(_ text: String) -> some View {
        Button {
            showDetails = true
        } label: {
            HStack(alignment: .top, spacing: 6) {
                Image(systemName: "xmark.octagon.fill").foregroundStyle(.red)
                Text(text)
                    .font(.caption)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)   // wrap, never truncate
                Spacer()
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Last action failed. \(text)")
    }

    private var workingRow: some View {
        HStack(spacing: 7) {
            ProgressView().controlSize(.small)
            Text(runner.busyTask.isEmpty ? "Working…" : runner.busyTask)
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)   // wrap, never truncate
            Spacer()
        }
        .transition(.opacity)
    }

    // Manual disclosure (not DisclosureGroup): adding/removing the body from the tree forces
    // MenuBarExtra to re-measure and grow the window — DisclosureGroup didn't resize it on the
    // first expand, so the content stayed clipped until another interaction.
    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { showDetails.toggle() } label: {
                HStack(spacing: 5) {
                    Image(systemName: "chevron.right")
                        .rotationEffect(.degrees(showDetails ? 90 : 0))
                        .font(.caption2)
                    Text("Details")
                    Spacer()
                }
                .contentShape(Rectangle())
                .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain).font(.caption)

            if showDetails {
                Text("First install: macOS asks for your keychain password — click **Always Allow**. A blank first window? Quit (⌘Q) and reopen.")
                    .font(.caption2).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)   // wrap to full height, never truncate
                if !runner.log.isEmpty {
                    ScrollView {
                        Text(runner.log)
                            .font(.system(.caption2, design: .monospaced))
                            .textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(height: 80)
                    .padding(8)
                    .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                }
                updateRow
                HStack {
                    Button { Task { await runner.refresh() } } label: { Label("Refresh", systemImage: "arrow.clockwise") }
                    Spacer()
                    Button("Quit app") { NSApplication.shared.terminate(nil) }
                }
                .controlSize(.small).buttonStyle(.borderless).padding(.top, 2)
                Divider().padding(.vertical, 1)
                (Text("Made with ") + Text("\u{2665}").foregroundColor(Color(red: 0.74, green: 0.27, blue: 0.18)) + Text(" by Lior Shaya"))
                    .font(.caption2).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }

    // Manager version + the user-initiated update check (the project's only network call).
    private var updateRow: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text("Manager v\(runner.managerVersion)").font(.caption2).foregroundStyle(.secondary)
                Spacer()
                switch runner.updateCheck {
                case .idle:
                    Button("Check for updates") { Task { await runner.checkForUpdates() } }
                case .checking:
                    HStack(spacing: 5) { ProgressView().controlSize(.mini); Text("Checking…").font(.caption2).foregroundStyle(.secondary) }
                case .upToDate:
                    Label("Up to date", systemImage: "checkmark.circle.fill").font(.caption2).foregroundStyle(.green)
                case .available(let v):
                    Button { Task { await runner.installUpdate() } } label: {
                        Label("Download v\(v)", systemImage: "arrow.down.circle.fill")
                    }.foregroundStyle(.orange)
                case .failed(let why):
                    Button("Retry — \(why)") { Task { await runner.checkForUpdates() } }.foregroundStyle(.secondary)
                }
            }
            .controlSize(.small).buttonStyle(.borderless)
            if case .available = runner.updateCheck {
                Text("Downloads the new .dmg, then opens it — drag Claude RTL to Applications.")
                    .font(.caption2).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Helpers
    private var watchBinding: Binding<Bool> {
        Binding(get: { s.watcherActive }, set: { v in Task { await runner.setWatch(v) } })
    }

    private var loginBinding: Binding<Bool> {
        Binding(get: { runner.launchAtLogin }, set: { v in runner.setLaunchAtLogin(v) })
    }
}
