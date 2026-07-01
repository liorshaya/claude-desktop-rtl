using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace ClaudeRtl;

public partial class PopupWindow : Window
{
    private readonly PatchService _svc;
    private AppStatus _st = new();
    private bool _busy;

    public PopupWindow(PatchService svc)
    {
        InitializeComponent();
        _svc = svc;
    }

    public async Task ShowNearTrayAsync()
    {
        Show();
        Reposition();
        Activate();
        await RefreshAsync();
        Reposition();
    }

    private void Reposition()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Right - Width - 6;
        Top = Math.Max(8, area.Bottom - ActualHeight - 6);
    }

    public async Task RefreshAsync()
    {
        _st = await _svc.RefreshAsync();
        ApplyStatus();
    }

    private void ApplyStatus()
    {
        bool none = _st.Kind == InstallKind.None;
        if (none)
        {
            BadgeTitle.Text = "No Claude install found";
            BadgeSub.Text = "Install Claude Desktop first";
            SetBadge(0xF4, 0xF4, 0xF5, 0xE5, 0xE5, 0xE8);
        }
        else if (_st.FullyPatched)
        {
            BadgeTitle.Text = "RTL is active";
            BadgeSub.Text = KindVer();
            SetBadge(0xF1, 0xFA, 0xF3, 0xD8, 0xEF, 0xDD);
        }
        else if (_st.RtlActive)
        {
            // MSIX: the payload IS in the asar but the Cowork cert step is broken —
            // "RTL not applied / Install RTL" was telling that user the wrong story.
            BadgeTitle.Text = "Cowork needs repair";
            BadgeSub.Text = "RTL is on; the signing step must be re-run";
            SetBadge(0xFD, 0xF5, 0xE9, 0xF2, 0xE2, 0xC3);
        }
        else
        {
            BadgeTitle.Text = "RTL not applied";
            BadgeSub.Text = KindVer();
            SetBadge(0xFD, 0xF5, 0xE9, 0xF2, 0xE2, 0xC3);
        }

        SetDot(DotRtl, ValRtl, _st.RtlActive);
        SetDot(DotCowork, ValCowork, _st.CoworkOk, na: _st.Kind == InstallKind.Squirrel);
        SetDot(DotAuto, ValAuto, _st.AutoUpdateOn);

        // Applying the patch stops a running Claude (patch scripts' Stop-Claude) — say so
        // BEFORE the click, like the macOS panel does, instead of silently closing their app.
        RunWarn.Visibility = !none && _st.ClaudeRunning ? Visibility.Visible : Visibility.Collapsed;

        AutoToggle.IsChecked = _st.AutoUpdateOn;
        AutoToggle.IsEnabled = !none && !_busy;

        PrimaryBtn.Content = none ? "No Claude install"
            : _st.FullyPatched ? "Re-apply RTL"
            : _st.RtlActive ? "Repair RTL"   // apply re-runs the whole pipeline incl. the cert step
            : "Install RTL";
        PrimaryBtn.IsEnabled = !none && !_busy;

        Reposition();
    }

    // "Squirrel · v1.15200.0" — or just the kind when the version is unknown ("Squirrel · v" read broken).
    private string KindVer() =>
        string.IsNullOrEmpty(_st.Version) || _st.Version == "-"
            ? KindName(_st.Kind)
            : $"{KindName(_st.Kind)} · v{_st.Version}";

    private void SetBadge(byte br, byte bg, byte bb, byte sr, byte sg, byte sb)
    {
        Badge.Background = new SolidColorBrush(Color.FromRgb(br, bg, bb));
        Badge.BorderBrush = new SolidColorBrush(Color.FromRgb(sr, sg, sb));
    }

    private void SetDot(Ellipse dot, TextBlock val, bool ok, bool na = false)
    {
        if (na) { dot.Fill = (Brush)FindResource("GrayDot"); val.Text = "n/a"; return; }
        dot.Fill = (Brush)FindResource(ok ? "OkGreen" : "GrayDot");
        val.Text = ok ? "On" : "Off";
    }

    private static string KindName(InstallKind k) =>
        k == InstallKind.Msix ? "MSIX" : k == InstallKind.Squirrel ? "Squirrel" : "none";

    private async void OnPrimary(object sender, RoutedEventArgs e)
        => await RunOp(() => _svc.ApplyAsync(_st.Kind),
                       _st.FullyPatched ? "Re-applying RTL… (admin)" : "Installing RTL… (admin)");

    private async void OnRestore(object sender, RoutedEventArgs e)
        => await RunOp(() => _svc.RestoreAsync(_st.Kind), "Restoring original… (admin)");

    private async void OnToggle(object sender, RoutedEventArgs e)
    {
        // The click already flipped the checkbox visually; if the operation is refused
        // (busy, or no install), snap it back so it never shows a state that isn't real.
        if (_busy || _st.Kind == InstallKind.None) { AutoToggle.IsChecked = _st.AutoUpdateOn; return; }
        bool want = AutoToggle.IsChecked == true;
        await RunOp(() => _svc.SetAutoUpdateAsync(_st.Kind, want),
                    want ? "Enabling auto-update… (admin)" : "Disabling auto-update… (admin)");
    }

    private void OnDashboard(object sender, RoutedEventArgs e)
    {
        Hide();
        DashboardWindow.ShowSingleton(_svc);
    }

    private void OnDeactivated(object? sender, EventArgs e)
    {
        if (!_busy) Hide();
    }

    // Esc dismisses, like any transient popup — the only pointer-free way out was Alt+F4.
    // (A running operation keeps the popup up, same rule as Deactivated.)
    private void OnKeyDown(object sender, System.Windows.Input.KeyEventArgs e)
    {
        if (e.Key == System.Windows.Input.Key.Escape && !_busy) { e.Handled = true; Hide(); }
    }

    private async Task RunOp(Func<Task<int>> op, string label)
    {
        if (_busy || _st.Kind == InstallKind.None) return;
        _busy = true;
        BusyText.Text = label;
        BusyText.Visibility = Visibility.Visible;
        PrimaryBtn.IsEnabled = false;
        AutoToggle.IsEnabled = false;
        Reposition();

        int code = await op();

        _busy = false;
        if (code == 1223) BusyText.Text = "Cancelled (admin prompt declined).";
        else if (code != 0) BusyText.Text = "Something went wrong — open Dashboard for the log.";
        else BusyText.Visibility = Visibility.Collapsed;

        await RefreshAsync();
    }
}
