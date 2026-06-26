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
            BadgeSub.Text = $"{KindName(_st.Kind)} · v{_st.Version}";
            SetBadge(0xF1, 0xFA, 0xF3, 0xD8, 0xEF, 0xDD);
        }
        else
        {
            BadgeTitle.Text = "RTL not applied";
            BadgeSub.Text = $"{KindName(_st.Kind)} · v{_st.Version}";
            SetBadge(0xFD, 0xF5, 0xE9, 0xF2, 0xE2, 0xC3);
        }

        SetDot(DotRtl, ValRtl, _st.RtlActive);
        SetDot(DotCowork, ValCowork, _st.CoworkOk, na: _st.Kind == InstallKind.Squirrel);
        SetDot(DotAuto, ValAuto, _st.AutoUpdateOn);

        AutoToggle.IsChecked = _st.AutoUpdateOn;
        AutoToggle.IsEnabled = !none && !_busy;

        PrimaryBtn.Content = none ? "No Claude install" : _st.FullyPatched ? "Re-apply RTL" : "Install RTL";
        PrimaryBtn.IsEnabled = !none && !_busy;

        Reposition();
    }

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
        bool want = AutoToggle.IsChecked == true;
        await RunOp(() => _svc.SetAutoUpdateAsync(_st.Kind, want),
                    want ? "Enabling auto-update… (admin)" : "Disabling auto-update… (admin)");
    }

    private void OnDashboard(object sender, RoutedEventArgs e)
    {
        // TODO: real dashboard window. For now, open the last operation log.
        try { Process.Start(new ProcessStartInfo("notepad.exe", _svc.LogFile) { UseShellExecute = true }); }
        catch { }
    }

    private void OnDeactivated(object? sender, EventArgs e)
    {
        if (!_busy) Hide();
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
