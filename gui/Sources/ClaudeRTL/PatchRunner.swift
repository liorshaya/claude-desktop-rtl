import Foundation

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

@MainActor
final class PatchRunner: ObservableObject {
    @Published var status = AppStatus()
    @Published var log = ""
    @Published var busy = false

    // Dev location of the pipeline. Step 3 bundles these into the .app's Resources.
    private let scriptsDir = NSHomeDirectory() + "/Developer/claude-desktop-rtl/desktop"

    // GUI/launchd processes start with a bare PATH — give bash node/npx + the usual tools.
    private var env: [String: String] {
        var e = ProcessInfo.processInfo.environment
        e["PATH"] = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
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
    }

    func install() async { busy = true; log = ""; await runPatch(["--install"]); await refresh(); busy = false }
    func uninstall() async { busy = true; await runPatch(["--uninstall"]); await refresh(); busy = false }
    func setWatch(_ on: Bool) async { busy = true; await runPatch([on ? "--watch" : "--unwatch"]); await refresh(); busy = false }
    func openPatched() async { _ = await run("/usr/bin/open", [NSHomeDirectory() + "/Applications/Claude-RTL.app"]) }
    func quitOriginal() async { _ = await run("/usr/bin/osascript", ["-e", "tell application \"Claude\" to quit"]); await refresh() }

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

    private static func version(in text: String, line: String) -> String {
        for l in text.split(separator: "\n") where l.contains(line + " ") {
            if let r = l.range(of: "v") { return String(l[r.lowerBound...]).split(separator: " ").first.map(String.init) ?? "—" }
        }
        return "—"
    }
}
