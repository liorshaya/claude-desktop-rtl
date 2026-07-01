using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;

namespace ClaudeRtl;

public partial class DashboardWindow : Window
{
    private static DashboardWindow? _instance;
    private readonly PatchService _svc;
    private AppStatus _st = new();
    private UpdateInfo? _upd;
    private bool _busy;

    private DateTime _lastRefresh;

    public DashboardWindow(PatchService svc)
    {
        InitializeComponent();
        _svc = svc;
        VersionLine.Text = $"App version {_svc.AppVersion}";
        // Re-check status whenever the user returns to the window (debounced), so it's never stale.
        Activated += async (_, _) =>
        {
            if (_busy || (DateTime.UtcNow - _lastRefresh).TotalSeconds < 1.5) return;
            await RefreshAsync();
        };
    }

    public static void ShowSingleton(PatchService svc)
    {
        if (_instance == null)
        {
            _instance = new DashboardWindow(svc);
            _instance.Closed += (_, _) => _instance = null;
        }
        _instance.Show();
        if (_instance.WindowState == WindowState.Minimized) _instance.WindowState = WindowState.Normal;
        _instance.Activate();
        _ = _instance.RefreshAsync();
    }

    public async Task RefreshAsync()
    {
        _st = await _svc.RefreshAsync();
        ApplyStatus();
        RefreshLog();
        _lastRefresh = DateTime.UtcNow;
    }

    private void ApplyStatus()
    {
        bool none = _st.Kind == InstallKind.None;
        bool active = _st.FullyPatched;

        // Hero: one reassuring glance (green = set, amber = action needed, gray = no install).
        (string badge, string icon, string title, string sub) =
            none   ? ("GrayDot", "–", "No Claude install found", "Install Claude Desktop first, then reopen this.") :
            active ? ("OkGreen", "✓", "You're all set", "RTL is active on Claude.") :
                     ("Amber",   "!",      "RTL not applied", "Click “Install RTL” below to enable it.");
        HeroBadge.Background = (Brush)FindResource(badge);
        HeroIcon.Text  = icon;
        HeroTitle.Text = title;
        HeroSub.Text   = sub;
        InstallLine.Text = none ? "" : $"{(_st.Kind == InstallKind.Msix ? "MSIX" : "Squirrel")} · v{_st.Version}";
        InstallLine.Visibility = none ? Visibility.Collapsed : Visibility.Visible;

        SetDot(DotRtl, ValRtl, _st.RtlActive);
        SetDot(DotCowork, ValCowork, _st.CoworkOk, na: _st.Kind == InstallKind.Squirrel);
        SetDot(DotAuto, ValAuto, _st.AutoUpdateOn);

        StartupToggle.IsChecked = _svc.IsStartupEnabled();
        StartupToggle.IsEnabled = !_busy;
        AutoToggle.IsChecked = _st.AutoUpdateOn;
        AutoToggle.IsEnabled = !none && !_busy;
        PrimaryBtn.Content   = none ? "No Claude install" : active ? "Re-apply RTL" : "Install RTL";
        PrimaryBtn.IsEnabled = !none && !_busy;
    }

    private void SetDot(Ellipse dot, TextBlock val, bool ok, bool na = false)
    {
        if (na) { dot.Fill = (Brush)FindResource("GrayDot"); val.Text = "n/a"; return; }
        dot.Fill = (Brush)FindResource(ok ? "OkGreen" : "GrayDot");
        val.Text = ok ? "On" : "Off";
    }

    // --- status actions (elevated, with a live log tail) ---
    private async void OnPrimary(object s, RoutedEventArgs e)
        => await RunOp(() => _svc.ApplyAsync(_st.Kind), _st.FullyPatched ? "Re-applying RTL… (admin)" : "Installing RTL… (admin)");

    private async void OnRestore(object s, RoutedEventArgs e)
        => await RunOp(() => _svc.RestoreAsync(_st.Kind), "Restoring original… (admin)");

    private void OnStartupToggle(object s, RoutedEventArgs e)
        => _svc.SetStartup(StartupToggle.IsChecked == true);   // HKCU Run key — instant, no admin

    private async void OnToggle(object s, RoutedEventArgs e)
    {
        // The click already flipped the checkbox visually; if the operation is refused
        // (busy, or no install), snap it back so it never shows a state that isn't real.
        if (_busy || _st.Kind == InstallKind.None) { AutoToggle.IsChecked = _st.AutoUpdateOn; return; }
        bool want = AutoToggle.IsChecked == true;
        await RunOp(() => _svc.SetAutoUpdateAsync(_st.Kind, want), want ? "Enabling auto-update… (admin)" : "Disabling auto-update… (admin)");
    }

    private async Task RunOp(Func<Task<int>> op, string label)
    {
        if (_busy || _st.Kind == InstallKind.None) return;
        _busy = true;
        BusyText.Text = label;
        BusyText.Visibility = Visibility.Visible;
        PrimaryBtn.IsEnabled = false;
        AutoToggle.IsEnabled = false;
        DetailsExpander.IsExpanded = true;   // show the live log while the operation runs

        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        timer.Tick += (_, _) =>
        {
            var log = _svc.ReadLog();
            if (!string.IsNullOrEmpty(log)) { LogText.Text = log; LogScroll.ScrollToEnd(); }
        };
        timer.Start();

        int code = await op();

        timer.Stop();
        _busy = false;
        if (code == 1223)      BusyText.Text = "Cancelled (admin prompt declined).";
        else if (code != 0)    BusyText.Text = "Something went wrong — see the log below.";
        else                   BusyText.Visibility = Visibility.Collapsed;

        await RefreshAsync();
    }

    // --- updates ---
    private async void OnCheck(object s, RoutedEventArgs e)
    {
        CheckBtn.IsEnabled = false;
        UpdateLine.Visibility = Visibility.Visible;
        UpdateLine.Text = "Checking…";
        NotesBox.Visibility = Visibility.Collapsed;
        DownloadBtn.Visibility = Visibility.Collapsed;

        _upd = await _svc.CheckForUpdatesAsync();
        CheckBtn.IsEnabled = true;

        if (_upd.Error != null) { UpdateLine.Text = $"Couldn't check ({_upd.Error})."; return; }
        if (!_upd.Checked || string.IsNullOrEmpty(_upd.Latest)) { UpdateLine.Text = "No releases published yet."; return; }
        if (!_upd.IsNewer) { UpdateLine.Text = $"You're up to date (v{_svc.AppVersion})."; return; }

        UpdateLine.Text = $"Version {_upd.Latest} is available.";
        if (!string.IsNullOrWhiteSpace(_upd.Notes)) { NotesText.Text = _upd.Notes; NotesBox.Visibility = Visibility.Visible; }
        DownloadBtn.Content = _upd.WinAssetUrl != null ? "Download & Install" : "Open release page";
        DownloadBtn.Visibility = Visibility.Visible;
    }

    private async void OnDownload(object s, RoutedEventArgs e)
    {
        if (_upd == null) return;
        if (_upd.WinAssetUrl != null)
        {
            DownloadBtn.IsEnabled = false;
            DownloadBtn.Content = "Downloading…";
            var ok = await _svc.DownloadAndRunInstallerAsync(_upd.WinAssetUrl);
            if (ok) { Application.Current.Shutdown(); }   // the installer takes over
            else { DownloadBtn.Content = "Download failed — open page"; DownloadBtn.IsEnabled = true; _upd.WinAssetUrl = null; }
        }
        else Open(_upd.ReleaseUrl);
    }

    // --- footer / log ---
    private void RefreshLog()
    {
        var log = _svc.ReadLog();
        LogText.Text = string.IsNullOrWhiteSpace(log) ? "(no recent operation)" : log;
    }

    private void OnRefreshLog(object s, RoutedEventArgs e) { RefreshLog(); LogScroll.ScrollToEnd(); }

    private void OnCopyLog(object s, RoutedEventArgs e)
    {
        var log = LogText.Text;
        if (string.IsNullOrWhiteSpace(log)) return;
        try { Clipboard.SetText(log); } catch { return; }
        CopyLogBtn.Content = "Copied";
        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1200) };
        t.Tick += (_, _) => { CopyLogBtn.Content = "Copy"; t.Stop(); };
        t.Start();
    }
    private void OnGitHub(object s, RoutedEventArgs e) => Open("https://github.com/liorshaya/claude-desktop-rtl");
    private void OnQuit(object s, RoutedEventArgs e) => Application.Current.Shutdown();

    private static void Open(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }
}
