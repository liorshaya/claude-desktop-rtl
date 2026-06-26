import Foundation
import ServiceManagement

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
    @Published var updateCheck: UpdateCheck = .idle
    @Published var launchAtLogin = false

    // This manager's own version (baked into Info.plist from the repo's VERSION file).
    let managerVersion = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "dev"
    let repoURL = URL(string: "https://github.com/liorshaya/claude-desktop-rtl")!
    // The SOLE network call in the whole project, and only in the manager (never the engine /
    // injected payload, which stay strictly zero-network). User-initiated, GET-only, sends
    // nothing: just reads the repo's VERSION file to tell you a newer build exists.
    private let versionURL = URL(string: "https://raw.githubusercontent.com/liorshaya/claude-desktop-rtl/main/VERSION")!

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
        let out = await capture("/bin/bash", [scriptsDir + "/patch.sh", "--status"])
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

    func install() async { busy = true; log = ""; await runPatch(["--install"]); await refresh(); busy = false }
    func uninstall() async { busy = true; await runPatch(["--uninstall"]); await refresh(); busy = false }
    func setWatch(_ on: Bool) async { busy = true; await runPatch([on ? "--watch" : "--unwatch"]); await refresh(); busy = false }
    // The original and the patched copy share a userData dir, so they can't run together —
    // quit the original, wait for it to fully exit (Cowork cleanup can take a moment), then
    // open Claude-RTL.
    func openPatched() async {
        busy = true
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

    // Fetch the repo's VERSION and compare to ours. One GET, on explicit click only.
    func checkForUpdates() async {
        updateCheck = .checking
        var req = URLRequest(url: versionURL)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        req.timeoutInterval = 10
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, http.statusCode == 200,
                  let raw = String(data: data, encoding: .utf8) else {
                updateCheck = .failed("couldn't reach GitHub"); return
            }
            let latest = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            updateCheck = Self.isNewer(latest, than: managerVersion) ? .available(latest) : .upToDate
        } catch {
            updateCheck = .failed("offline?")
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
