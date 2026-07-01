using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Text.Json;

namespace ClaudeRtl;

public enum InstallKind { None, Msix, Squirrel }

/// <summary>Live state of the Claude install + our patch, parsed from the PowerShell scripts.</summary>
public sealed class AppStatus
{
    public InstallKind Kind = InstallKind.None;
    public string Version = "-";
    public bool RtlActive;        // RTL payload injected into app.asar
    public bool CoworkOk = true;  // MSIX: cert-dance in place so Cowork still trusts Claude.exe (N/A => true)
    public bool AutoUpdateOn;     // the auto-updater (scheduled task) is installed
    public bool ClaudeRunning;    // Claude DESKTOP is running (not the editor extension)
    public bool FullyPatched;     // overall "everything is in place"
    public string Raw = "";       // last raw -Verify output (for the dashboard log)
}

/// <summary>Result of a GitHub-Releases update check (the project's only network call).</summary>
public sealed class UpdateInfo
{
    public bool Checked;
    public bool IsNewer;
    public string Latest = "";
    public string Notes = "";
    public string? WinAssetUrl;
    public string ReleaseUrl = "https://github.com/liorshaya/claude-desktop-rtl/releases";
    public string? Error;
}

/// <summary>
/// One source of truth = the PowerShell scripts (desktop/windows). This wraps them via Process and
/// parses status — the C# twin of the macOS PatchRunner. Read-only checks run non-elevated; apply /
/// restore / auto-update toggling elevate on demand (ShellExecute 'runas', output -> a log file).
/// </summary>
public sealed class PatchService
{
    public string ScriptsDir { get; }
    public string MsixScript     => Path.Combine(ScriptsDir, "patch-msix.ps1");
    public string SquirrelScript => Path.Combine(ScriptsDir, "patch.ps1");
    public string LogFile { get; } = Path.Combine(Path.GetTempPath(), "claude-rtl-gui.log");

    const string MsixTask = "ClaudeRtlMsixWatcher";

    public PatchService() { ScriptsDir = ResolveScriptsDir(); }

    // Scripts ship bundled next to the exe ("scripts\"); in dev, walk up to the repo's desktop\windows.
    static string ResolveScriptsDir()
    {
        var baseDir = AppContext.BaseDirectory;
        var bundled = Path.Combine(baseDir, "scripts");
        if (File.Exists(Path.Combine(bundled, "patch-msix.ps1"))) return bundled;
        for (var dir = new DirectoryInfo(baseDir); dir != null; dir = dir.Parent)
        {
            var cand = Path.Combine(dir.FullName, "desktop", "windows");
            if (File.Exists(Path.Combine(cand, "patch-msix.ps1"))) return cand;
        }
        return bundled;
    }

    public async Task<InstallKind> DetectKindAsync()
    {
        var (o, _) = await RunCapturedAsync("powershell.exe",
            "-NoProfile -ExecutionPolicy Bypass -Command \"[bool](Get-AppxPackage -Name Claude -ErrorAction SilentlyContinue)\"");
        if (o.Trim().StartsWith("True", StringComparison.OrdinalIgnoreCase)) return InstallKind.Msix;
        var squirrel = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AnthropicClaude");
        return Directory.Exists(squirrel) ? InstallKind.Squirrel : InstallKind.None;
    }

    string ScriptFor(InstallKind k) => k == InstallKind.Msix ? MsixScript : SquirrelScript;

    // --- read-only status (non-elevated) ---
    public async Task<AppStatus> RefreshAsync()
    {
        var kind = await DetectKindAsync();
        var st = new AppStatus { Kind = kind };
        if (st.Kind == InstallKind.None) return st;

        if (st.Kind == InstallKind.Msix)
        {
            var (verify, _) = await RunCapturedAsync("powershell.exe",
                $"-NoProfile -ExecutionPolicy Bypass -File \"{MsixScript}\" -Verify");
            st.Raw = verify;
            st.RtlActive = ParseBool(verify, "RTL injected");
            st.CoworkOk = ParseBool(verify, "Claude.exe signed by our cert") && ParseBool(verify, "cowork-svc signed by our cert");
            st.FullyPatched = verify.Contains("OK - RTL");
        }
        else
        {
            // patch.ps1 has NO -Verify switch (passing it fails parameter binding before the
            // script runs, so Squirrel installs could never show "patched"). Its -Status
            // prints "patched : True  (payload marker in app.asar)" — parse that. No
            // cowork-svc exists on Squirrel, so RTL-in-asar IS fully patched.
            var (status, _) = await RunCapturedAsync("powershell.exe",
                $"-NoProfile -ExecutionPolicy Bypass -File \"{SquirrelScript}\" -Status");
            st.Raw = status;
            st.RtlActive = status.Contains("patched : True");
            st.FullyPatched = st.RtlActive;
        }

        // one combined query for version + watcher + running-state — per install kind: the
        // old MSIX-only query returned an empty version, a permanently-false watcher state
        // (Squirrel's watcher is an HKCU Run entry, not the scheduled task), and a
        // never-matching process path on Squirrel, so the auto-update toggle snapped back
        // Off after every successful enable.
        var infoCmd = st.Kind == InstallKind.Msix
            ? "$p=Get-AppxPackage -Name Claude -ErrorAction SilentlyContinue; 'VER=' + $p.Version; " +
              "'TASK=' + [bool](Get-ScheduledTask -TaskName '" + MsixTask + "' -ErrorAction SilentlyContinue); " +
              "'RUN=' + [bool](@(Get-CimInstance Win32_Process -Filter \\\"Name='Claude.exe'\\\" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -like '*\\WindowsApps\\Claude_*' }).Count)"
            : "$d=Get-ChildItem (Join-Path $env:LOCALAPPDATA 'AnthropicClaude') -Directory -Filter 'app-*' -ErrorAction SilentlyContinue | " +
              "Sort-Object { [version]($_.Name -replace '^app-','') } -Descending | Select-Object -First 1; " +
              "'VER=' + ($d.Name -replace '^app-',''); " +
              "'TASK=' + [bool]((Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'ClaudeRtlWatcher' -ErrorAction SilentlyContinue).ClaudeRtlWatcher); " +
              "'RUN=' + [bool](@(Get-CimInstance Win32_Process -Filter \\\"Name='Claude.exe'\\\" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -like '*\\AnthropicClaude\\app-*' }).Count)";
        var (info, _) = await RunCapturedAsync("powershell.exe",
            "-NoProfile -ExecutionPolicy Bypass -Command \"" + infoCmd + "\"");
        st.Version       = Field(info, "VER=", "-");
        st.AutoUpdateOn  = Field(info, "TASK=", "False").StartsWith("True", StringComparison.OrdinalIgnoreCase);
        st.ClaudeRunning = Field(info, "RUN=", "False").StartsWith("True", StringComparison.OrdinalIgnoreCase);
        return st;
    }

    // --- elevated actions (UAC). Returns the script exit code; 1223 = user cancelled the prompt. ---
    public Task<int> ApplyAsync(InstallKind k)            => RunElevatedAsync(k, "");
    public Task<int> RestoreAsync(InstallKind k)          => RunElevatedAsync(k, "-Restore");
    public Task<int> SetAutoUpdateAsync(InstallKind k, bool on) => RunElevatedAsync(k, on ? "-Watch" : "-Unwatch");

    // --- launch the tray app at login (HKCU Run key; no admin). NOTE: the RTL patch itself already
    //     persists across reboots — it's baked into Claude's files. This only auto-starts the tray. ---
    const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string RunValueName = "ClaudeRTL";

    public bool IsStartupEnabled()
    {
        try
        {
            using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKeyPath);
            return k?.GetValue(RunValueName) is string;
        }
        catch { return false; }
    }

    public void SetStartup(bool on)
    {
        try
        {
            using var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(RunKeyPath);
            if (k == null) return;
            if (on)
            {
                var exe = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName;
                if (exe != null) k.SetValue(RunValueName, $"\"{exe}\"");
            }
            else k.DeleteValue(RunValueName, false);
        }
        catch { /* registry unavailable — non-fatal */ }
    }

    // --- first-run flag (HKCU) so the Welcome screen shows only once ---
    const string AppKeyPath = @"Software\ClaudeRTL";

    public bool HasOnboarded()
    {
        try { using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(AppKeyPath); return k?.GetValue("Onboarded") != null; }
        catch { return false; }
    }

    public void MarkOnboarded()
    {
        try { using var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(AppKeyPath); k?.SetValue("Onboarded", "1"); }
        catch { }
    }

    // --- update check (GitHub Releases API; user-initiated, GET-only, the one network call) ---
    const string Repo = "liorshaya/claude-desktop-rtl";
    public string AppVersion =>
        GetType().Assembly.GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "0.1.0";

    public async Task<UpdateInfo> CheckForUpdatesAsync()
    {
        var info = new UpdateInfo();
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(12) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd("ClaudeRtl-Updater");
            var json = await http.GetStringAsync($"https://api.github.com/repos/{Repo}/releases/latest").ConfigureAwait(false);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            info.Latest = (root.GetProperty("tag_name").GetString() ?? "").TrimStart('v', 'V');
            if (root.TryGetProperty("body", out var b)) info.Notes = b.GetString() ?? "";
            if (root.TryGetProperty("html_url", out var h)) info.ReleaseUrl = h.GetString() ?? info.ReleaseUrl;
            if (root.TryGetProperty("assets", out var assets))
                foreach (var a in assets.EnumerateArray())
                {
                    var name = a.GetProperty("name").GetString() ?? "";
                    if (name.Contains("win", StringComparison.OrdinalIgnoreCase) && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        info.WinAssetUrl = a.GetProperty("browser_download_url").GetString();
                }
            info.IsNewer = IsNewer(info.Latest, AppVersion);
            info.Checked = true;
        }
        catch (HttpRequestException) { info.Error = "couldn't reach GitHub"; }
        catch (Exception) { info.Error = "offline?"; }
        return info;
    }

    // Download the Windows installer asset and launch it (it replaces the running app).
    public async Task<bool> DownloadAndRunInstallerAsync(string url)
    {
        try
        {
            var dest = Path.Combine(Path.GetTempPath(), "ClaudeRTL-Setup.exe");
            using (var http = new HttpClient { Timeout = TimeSpan.FromMinutes(5) })
            {
                http.DefaultRequestHeaders.UserAgent.ParseAdd("ClaudeRtl-Updater");
                var bytes = await http.GetByteArrayAsync(url).ConfigureAwait(false);
                await File.WriteAllBytesAsync(dest, bytes).ConfigureAwait(false);
            }
            Process.Start(new ProcessStartInfo(dest) { UseShellExecute = true });
            return true;
        }
        catch { return false; }
    }

    static bool IsNewer(string a, string b)
    {
        int[] pa = ParseVer(a), pb = ParseVer(b);
        for (int i = 0; i < Math.Max(pa.Length, pb.Length); i++)
        {
            int x = i < pa.Length ? pa[i] : 0, y = i < pb.Length ? pb[i] : 0;
            if (x != y) return x > y;
        }
        return false;
    }
    static int[] ParseVer(string s) => s.Split('.').Select(p => int.TryParse(p, out var n) ? n : 0).ToArray();

    async Task<int> RunElevatedAsync(InstallKind k, string args)
    {
        try { File.Delete(LogFile); } catch { /* ignore */ }
        var cmd = $"& '{ScriptFor(k)}' {args} *> '{LogFile}'";
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{cmd}\"",
            UseShellExecute = true,
            Verb = "runas",
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        try
        {
            var p = Process.Start(psi);
            if (p is null) return -1;
            await p.WaitForExitAsync();
            return p.ExitCode;
        }
        catch (System.ComponentModel.Win32Exception) { return 1223; } // ERROR_CANCELLED (UAC declined)
    }

    /// <summary>Tail of the elevated log, for live progress in the dashboard.</summary>
    public string ReadLog()
    {
        try
        {
            using var fs = new FileStream(LogFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs);
            return sr.ReadToEnd();
        }
        catch { return ""; }
    }

    // --- process helpers ---
    static async Task<(string, int)> RunCapturedAsync(string file, string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = file, Arguments = args,
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
        };
        try
        {
            using var p = Process.Start(psi);
            if (p is null) return ("", -1);
            var outp = await p.StandardOutput.ReadToEndAsync().ConfigureAwait(false);
            var err  = await p.StandardError.ReadToEndAsync().ConfigureAwait(false);
            await p.WaitForExitAsync().ConfigureAwait(false);
            return (outp + err, p.ExitCode);
        }
        catch (Exception ex) { return ("launch failed: " + ex.Message, -1); }
    }

    // --- parsing ---
    static bool ParseBool(string text, string contains)
    {
        foreach (var line in text.Split('\n'))
            if (line.Contains(contains))
                return line.TrimEnd().EndsWith("True", StringComparison.OrdinalIgnoreCase);
        return false;
    }

    static string Field(string text, string key, string fallback)
    {
        foreach (var line in text.Split('\n'))
        {
            var t = line.Trim();
            if (t.StartsWith(key, StringComparison.OrdinalIgnoreCase))
                return t.Substring(key.Length).Trim();
        }
        return fallback;
    }
}
