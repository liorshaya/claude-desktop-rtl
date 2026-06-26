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

    public DashboardWindow(PatchService svc)
    {
        InitializeComponent();
        _svc = svc;
        VersionLine.Text = $"App version {_svc.AppVersion}";
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
    }

    private void ApplyStatus()
    {
        bool none = _st.Kind == InstallKind.None;
        StatusLine.Text  = none ? "No Claude install found" : _st.FullyPatched ? "RTL is active" : "RTL not applied";
        InstallLine.Text = none ? "Install Claude Desktop first"
                         : $"{(_st.Kind == InstallKind.Msix ? "MSIX" : "Squirrel")} · v{_st.Version}";

        SetDot(DotRtl, ValRtl, _st.RtlActive);
        SetDot(DotCowork, ValCowork, _st.CoworkOk, na: _st.Kind == InstallKind.Squirrel);
        SetDot(DotAuto, ValAuto, _st.AutoUpdateOn);

        AutoToggle.IsChecked = _st.AutoUpdateOn;
        AutoToggle.IsEnabled = !none && !_busy;
        PrimaryBtn.Content   = none ? "No Claude install" : _st.FullyPatched ? "Re-apply RTL" : "Install RTL";
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

    private async void OnToggle(object s, RoutedEventArgs e)
    {
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
    private void OnGitHub(object s, RoutedEventArgs e) => Open("https://github.com/liorshaya/claude-desktop-rtl");
    private void OnQuit(object s, RoutedEventArgs e) => Application.Current.Shutdown();

    private static void Open(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }
}
