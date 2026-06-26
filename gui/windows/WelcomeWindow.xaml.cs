using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;

namespace ClaudeRtl;

/// <summary>First-run onboarding: explains what the patch does (full transparency), then installs it
/// with one admin prompt and a live log. Shown once; the flag lives in HKCU via PatchService.</summary>
public partial class WelcomeWindow : Window
{
    private readonly PatchService _svc;
    private AppStatus _st = new();
    private bool _busy;
    private bool _done;

    public WelcomeWindow(PatchService svc)
    {
        InitializeComponent();
        _svc = svc;
        Loaded += async (_, _) => await InitAsync();
    }

    private async Task InitAsync()
    {
        _st = await _svc.RefreshAsync();

        if (_st.Kind == InstallKind.None)
        {
            Subtitle.Text = "Install Claude Desktop first, then reopen Claude RTL.";
            InstallBtn.Content = "Get Claude Desktop";
            return;
        }
        if (_st.Kind == InstallKind.Squirrel)
            CoworkBullet.Text = "On this install type no certificate step is needed — just a quick admin approval to patch the files.";

        if (_st.FullyPatched) ShowDone(already: true);
    }

    private async void OnInstall(object s, RoutedEventArgs e)
    {
        if (_done) { DashboardWindow.ShowSingleton(_svc); Close(); return; }
        if (_busy) return;
        if (_st.Kind == InstallKind.None) { Open("https://claude.ai/download"); return; }

        _busy = true;
        InstallBtn.IsEnabled = false;
        LaterBtn.IsEnabled = false;
        DetailsExpander.IsExpanded = false;
        StatusMsg.Visibility = Visibility.Visible;
        StatusMsg.Text = "Installing RTL — approve the Windows admin prompt…";
        LogBox.Visibility = Visibility.Visible;

        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
        timer.Tick += (_, _) =>
        {
            var log = _svc.ReadLog();
            if (!string.IsNullOrEmpty(log)) { LogText.Text = log; LogScroll.ScrollToEnd(); }
        };
        timer.Start();

        int code = await _svc.ApplyAsync(_st.Kind);

        timer.Stop();
        _busy = false;
        InstallBtn.IsEnabled = true;
        LaterBtn.IsEnabled = true;

        if (code == 1223) { StatusMsg.Text = "Admin prompt was declined — click Install RTL to try again."; return; }
        if (code != 0)    { StatusMsg.Text = "Something went wrong. Open Details for the log, then retry or close."; DetailsExpander.IsExpanded = true; return; }

        _st = await _svc.RefreshAsync();
        ShowDone();
    }

    private void OnLater(object s, RoutedEventArgs e)
    {
        if (_done) { Close(); return; }   // LaterBtn doubles as "Done" on the success screen
        _svc.MarkOnboarded();             // shown once; the tray + dashboard remain available
        Close();
    }

    private void ShowDone(bool already = false)
    {
        _done = true;
        _svc.MarkOnboarded();

        HeroGlyph.Visibility = Visibility.Collapsed;
        HeroCheck.Visibility = Visibility.Visible;
        HeroBadge.Background = (Brush)FindResource("OkGreen");

        Headline.Text = already ? "RTL is already active" : "RTL is ready";
        Subtitle.Text = "Open Claude and type in Hebrew or Arabic — it just flows.";
        Bullets.Visibility = Visibility.Collapsed;
        DetailsExpander.Visibility = Visibility.Collapsed;
        StatusMsg.Visibility = Visibility.Collapsed;
        LogBox.Visibility = Visibility.Collapsed;

        InstallBtn.Content = "Open dashboard";
        InstallBtn.IsEnabled = true;
        LaterBtn.Content = "Done";
        LaterBtn.IsEnabled = true;
    }

    private static void Open(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { }
    }
}
