using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using H.NotifyIcon;

namespace ClaudeRtl;

public partial class App : Application
{
    private PatchService _svc = null!;
    private TaskbarIcon _tray = null!;
    private PopupWindow? _popup;
    private Color _lastColor = Color.Empty;

    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr handle);

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _svc = new PatchService();

        _tray = new TaskbarIcon { ToolTipText = "Claude RTL" };
        SetIcon(Color.Gray);

        var menu = new ContextMenu();
        var miOpen = new MenuItem { Header = "Open" };
        miOpen.Click += (_, _) => ShowPopup();
        var miDash = new MenuItem { Header = "Dashboard…" };
        miDash.Click += (_, _) => DashboardWindow.ShowSingleton(_svc);
        var miQuit = new MenuItem { Header = "Quit" };
        miQuit.Click += (_, _) => Shutdown();
        menu.Items.Add(miOpen);
        menu.Items.Add(miDash);
        menu.Items.Add(new Separator());
        menu.Items.Add(miQuit);
        _tray.ContextMenu = menu;
        _tray.TrayLeftMouseUp += (_, _) => ShowPopup();
        _tray.ForceCreate();

        _ = RefreshIconAsync();

        var timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(60) };
        timer.Tick += async (_, _) => await RefreshIconAsync();
        timer.Start();
    }

    private void ShowPopup()
    {
        _popup ??= new PopupWindow(_svc);
        _ = _popup.ShowNearTrayAsync();
        _ = RefreshIconAsync();
    }

    private async Task RefreshIconAsync()
    {
        var st = await _svc.RefreshAsync();
        bool active = st.FullyPatched;
        var color = active ? Color.FromArgb(0xD6, 0x66, 0x4A)    // brand orange = active
                           : Color.FromArgb(0x9A, 0xA0, 0xA6);   // gray = not active
        var tip = active ? "Claude RTL - active"
                : st.Kind == InstallKind.None ? "Claude RTL - no Claude found"
                : "Claude RTL - not active";
        Dispatcher.Invoke(() =>
        {
            SetIcon(color);
            _tray.ToolTipText = tip;
        });
    }

    // Only rebuild the tray icon when the state colour actually changes (avoids HICON churn).
    private void SetIcon(Color c)
    {
        if (c == _lastColor) return;
        _lastColor = c;
        var old = _tray.Icon;
        _tray.Icon = MakeIcon(c);
        old?.Dispose();
    }

    private static Bitmap? _glyph;
    private static Bitmap Glyph()
    {
        if (_glyph != null) return _glyph;
        using var s = GetResourceStream(new Uri("pack://application:,,,/Assets/glyph.png"))!.Stream;
        _glyph = new Bitmap(s);
        return _glyph;
    }

    // The brand glyph alone, tinted to the state colour (orange = active, gray = not), 32x32 tray icon.
    private static Icon MakeIcon(Color c)
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.Clear(Color.Transparent);
            var m = new ColorMatrix(new[]
            {
                new float[] { 0, 0, 0, 0, 0 },
                new float[] { 0, 0, 0, 0, 0 },
                new float[] { 0, 0, 0, 0, 0 },
                new float[] { 0, 0, 0, 1, 0 },
                new float[] { c.R / 255f, c.G / 255f, c.B / 255f, 0, 1 },
            });
            using var ia = new ImageAttributes();
            ia.SetColorMatrix(m);
            var src = Glyph();
            int sx = 3, sy = 8, sw = 39, sh = 28;   // crop to the glyph's content bounds, fill the width
            int dw = 30, dh = dw * sh / sw;
            int dx = (32 - dw) / 2, dy = (32 - dh) / 2;
            g.DrawImage(src, new Rectangle(dx, dy, dw, dh), sx, sy, sw, sh, GraphicsUnit.Pixel, ia);
        }
        IntPtr h = bmp.GetHicon();
        var icon = (Icon)Icon.FromHandle(h).Clone();
        DestroyIcon(h);
        return icon;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        base.OnExit(e);
    }
}
