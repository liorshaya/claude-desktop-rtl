import Foundation
import ServiceManagement
import AppKit

// One source of truth = the bash scripts. This wraps them via Process and parses status.
// (Step 2 will swap the Node dependency for a bundled standalone asar/fuses binary so the
// shipped .app needs neither Node nor a checked-out repo.)

struct AppStatus {
    var originalVersion = "—"
    var originalPresent = false
    var patchedVersion = "—"
    var patchedInstalled = false
    var watcherActive = false
    var originalRunning = false
}

// State of the user-initiated update check (see PatchRunner.checkForUpdates).
enum UpdateCheck: Equatable {
    case idle, checking, upToDate
    case available(String)   // the newer version string upstream
    case failed(String)      // a short human reason
}

@MainActor
final class PatchRunner: ObservableObject {
    @Published var status = AppStatus()
    @Published var log = ""
    @Published var busy = false
    @Published var busyTask = ""   // what the spinner is doing — install/uninstall/open differ a lot in duration
    @Published var lastFailure: String?   // one-line failure banner; the full log lives under Details
    @Published var updateCheck: UpdateCheck = .idle
    @Published var launchAtLogin = false

    // This manager's own version (baked into Info.plist from the repo's VERSION file).
    let managerVersion = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "dev"
    let repoURL = URL(string: "https://github.com/liorshaya/claude-desktop-rtl")!
    // Network only in the manager (never the engine / injected payload, which stay strictly
    // zero-network), and only on an explicit click: read the latest GitHub Release to learn the
    // newest version + its .dmg, then (if you choose) download that .dmg.
    private let releasesAPI = URL(string: "https://api.github.com/repos/liorshaya/claude-desktop-rtl/releases/latest")!
    private var pendingDmgURL: URL?

    // The shipped .app carries the whole node-free pipeline in Resources; fall back to the
    // dev repo when running via `swift run`.
    private var bundledResources: URL? {
        guard let r = Bundle.main.resourceURL,
              FileManager.default.fileExists(atPath: r.appendingPathComponent("scripts/patch.sh").path)
        else { return nil }
        return r
    }
    private var scriptsDir: String {
        bundledResources?.appendingPathComponent("scripts").path
            ?? NSHomeDirectory() + "/Developer/claude-desktop-rtl/desktop"
    }

    // GUI/launchd processes start with a bare PATH — give bash the usual tools. When bundled,
    // point patch.sh at the bundled helper + payload so it patches with NO system Node.
    private var env: [String: String] {
        var e = ProcessInfo.processInfo.environment
        e["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        if let r = bundledResources {
            e["CLAUDE_RTL_HELPER"] = r.appendingPathComponent("claude-rtl-helper").path
            e["CLAUDE_RTL_PAYLOAD"] = r.appendingPathComponent("payload.js").path
        }
        return e
    }

    // Run patch.sh with args, streaming output into `log`. Returns the exit code.
    @discardableResult
    private func runPatch(_ args: [String]) async -> Int32 {
        await run("/bin/bash", [scriptsDir + "/patch.sh"] + args)
    }

    private func run(_ tool: String, _ args: [String]) async -> Int32 {
        let (out, code) = await exec(tool, args)
        log += out
        return code
    }

    func refresh() async {
        let (out, code) = await exec("/bin/bash", [scriptsDir + "/patch.sh", "--status"])
        // --status always exits 0 when it runs at all, so a nonzero code means the status run
        // itself broke (script missing, bash failed to launch). Silently discarding that left
        // the UI claiming "Claude: not found" with an empty log and no way to diagnose it.
        if code != 0 {
            log += "status check failed (exit \(code)):\n\(out)"
        }
        var s = AppStatus()
        s.originalPresent = out.contains("original :") && !out.contains("original : MISSING")
        s.patchedInstalled = out.contains("— installed")
        s.watcherActive = out.contains("watcher  : active")
        s.originalVersion = Self.version(in: out, line: "original")
        s.patchedVersion = Self.version(in: out, line: "patched")
        s.originalRunning = await isOriginalRunning()
        status = s
        launchAtLogin = (SMAppService.mainApp.status == .enabled)
    }

    // Launch this manager at login (mirrors the Windows "Start with Windows" toggle). SMAppService
    // registers the app itself as a login item; no admin, no helper bundle. macOS 13+.
    func setLaunchAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() }
            else  { try SMAppService.mainApp.unregister() }
        } catch {
            log += "login item: \(error.localizedDescription)\n"
        }
        launchAtLogin = (SMAppService.mainApp.status == .enabled)
    }

    func install() async {
        busy = true; busyTask = "Installing RTL — copying and re-signing Claude can take a minute…"
        log = ""; lastFailure = nil
        let code = await runPatch(["--install"])
        if code != 0 { lastFailure = "Install failed — the log under Details has the reason." }
        await refresh()
        busy = false; busyTask = ""
    }
    func uninstall() async {
        busy = true; busyTask = "Uninstalling…"
        lastFailure = nil
        let code = await runPatch(["--uninstall"])
        if code != 0 { lastFailure = "Uninstall failed — the log under Details has the reason." }
        await refresh()
        busy = false; busyTask = ""
    }
    func setWatch(_ on: Bool) async {
        busy = true; busyTask = on ? "Enabling auto re-apply…" : "Disabling auto re-apply…"
        lastFailure = nil
        let code = await runPatch([on ? "--watch" : "--unwatch"])
        if code != 0 { lastFailure = "Couldn't change the auto re-apply watcher — see Details." }
        await refresh()
        busy = false; busyTask = ""
    }
    // The original and the patched copy share a userData dir, so they can't run together —
    // quit the original, wait for it to fully exit (Cowork cleanup can take a moment), then
    // open Claude-RTL.
    func openPatched() async {
        busy = true; busyTask = "Opening Claude-RTL — quitting the original first…"
        defer { busyTask = "" }
        let rtl = NSHomeDirectory() + "/Applications/Claude-RTL.app"
        let m = "/Applications/Claude.app/Contents/MacOS/"
        _ = await run("/bin/bash", ["-c", """
        pkill -f '\(m)' 2>/dev/null || true
        for _ in $(seq 1 60); do pgrep -f '\(m)' >/dev/null 2>&1 || break; sleep 1; done
        open "\(rtl)"
        """])
        busy = false
        await refresh()
    }

    // Quit ONLY the original (matched by its exact path), never the RTL copy.
    func quitOriginal() async {
        _ = await run("/bin/bash", ["-c", "pkill -f '/Applications/Claude.app/Contents/MacOS/' 2>/dev/null; true"])
        await refresh()
    }

    private func isOriginalRunning() async -> Bool {
        await capture("/bin/bash", ["-c", "pgrep -f '/Applications/Claude.app/Contents/MacOS/Claude' >/dev/null && echo yes || echo no"])
            .contains("yes")
    }

    private func capture(_ tool: String, _ args: [String]) async -> String {
        await exec(tool, args).out
    }

    // Run a tool to completion off the main actor; return (stdout+stderr, exitCode). The
    // environment (a Sendable value) is snapshotted on the main actor before hopping off.
    private func exec(_ tool: String, _ args: [String]) async -> (out: String, code: Int32) {
        let environment = env
        return await withCheckedContinuation { cont in
            DispatchQueue.global().async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: tool)
                p.arguments = args
                p.environment = environment
                let pipe = Pipe()
                p.standardOutput = pipe
                p.standardError = pipe
                do { try p.run() } catch { cont.resume(returning: ("launch failed: \(error)\n", -1)); return }
                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                cont.resume(returning: (String(data: data, encoding: .utf8) ?? "", p.terminationStatus))
            }
        }
    }

    // Read the latest GitHub Release (tag + .dmg asset) and compare to ours. One GET, on click only.
    func checkForUpdates() async {
        updateCheck = .checking
        var req = URLRequest(url: releasesAPI)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 12
        req.setValue("claude-rtl", forHTTPHeaderField: "User-Agent")
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200,
                  let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = json["tag_name"] as? String else {
                updateCheck = .failed("couldn't reach GitHub"); return
            }
            let latest = tag.trimmingCharacters(in: CharacterSet(charactersIn: "vV "))
            pendingDmgURL = nil
            if let assets = json["assets"] as? [[String: Any]] {
                for a in assets where (a["name"] as? String)?.hasSuffix(".dmg") == true {
                    if let urlStr = a["browser_download_url"] as? String { pendingDmgURL = URL(string: urlStr) }
                    break
                }
            }
            updateCheck = Self.isNewer(latest, than: managerVersion) ? .available(latest) : .upToDate
        } catch {
            updateCheck = .failed("offline?")
        }
        // "Up to date" / "offline?" must not stick forever: the popup view persists across opens,
        // so revert to the clickable button after a moment. An ".available" result stays put.
        if case .available = updateCheck { } else {
            let shown = updateCheck
            Task {
                try? await Task.sleep(nanoseconds: 3_500_000_000)
                if self.updateCheck == shown { self.updateCheck = .idle }
            }
        }
    }

    // Download the release .dmg and open it (Finder shows the drag-to-Applications window). No
    // terminal, and no auto-replacing a running bundle — safest for an ad-hoc-signed app.
    func installUpdate() async {
        guard let url = pendingDmgURL else { NSWorkspace.shared.open(repoURL); return }
        busy = true
        defer { busy = false }
        do {
            let (tmpFile, _) = try await URLSession.shared.download(from: url)
            let dest = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("Claude-RTL-update.dmg")
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: tmpFile, to: dest)
            NSWorkspace.shared.open(dest)
        } catch {
            log += "update download failed: \(error.localizedDescription)\n"
            NSWorkspace.shared.open(repoURL)
        }
    }

    // Compare dotted numeric versions: 0.2.0 > 0.1.9 > 0.1.0.
    static func isNewer(_ a: String, than b: String) -> Bool {
        let pa = a.split(separator: ".").map { Int($0) ?? 0 }
        let pb = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(pa.count, pb.count) {
            let x = i < pa.count ? pa[i] : 0, y = i < pb.count ? pb[i] : 0
            if x != y { return x > y }
        }
        return false
    }

    // Pull "1.15200.0" out of a status line like "... (v1.15200.0) — installed".
    private static func version(in text: String, line: String) -> String {
        for l in text.split(separator: "\n") where l.contains(line) {
            if let open = l.range(of: "(v"),
               let close = l.range(of: ")", range: open.upperBound..<l.endIndex) {
                return String(l[open.upperBound..<close.lowerBound])
            }
        }
        return "—"
    }
}
