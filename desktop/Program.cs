using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ReefLog;

/// <summary>
/// A window around the published Reef Log site.
///
/// It loads the live URL rather than bundling a copy, so the app updates itself
/// the way the phone and browser installs do — otherwise every change would mean
/// downloading a new executable. The service worker caches the site on first
/// run, so it still opens without a connection afterwards.
///
/// The WebView2 profile lives under %LOCALAPPDATA%, which means this window has
/// its own IndexedDB, separate from Edge's. Data entered here does not appear in
/// the browser copy or on the phone; use Settings, Export backup to move it.
/// </summary>
internal static class Program
{
    private const string SiteUrl = "https://landini1020.github.io/Saltwater-Aquarium-Tracker/";

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(SiteUrl));
    }
}

internal sealed class MainForm : Form
{
    /// Navigations outside this host are handed to the default browser.
    private const string SiteHost = "https://landini1020.github.io/";

    private readonly WebView2 _web = new();
    private readonly string _url;

    public MainForm(string url)
    {
        _url = url;

        Text = "Reef Log";
        Width = 1180;
        Height = 860;
        MinimumSize = new Size(420, 560);
        StartPosition = FormStartPosition.CenterScreen;
        // Matches the app's dark chrome so the frame does not flash white on open.
        BackColor = ColorTranslator.FromHtml("#0e2a3d");

        try
        {
            Icon = new Icon(Path.Combine(AppContext.BaseDirectory, "ReefLog.ico"));
        }
        catch
        {
            // Running without the icon file is not worth failing over.
        }

        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = ColorTranslator.FromHtml("#0e2a3d");
        Controls.Add(_web);

        Load += OnLoadAsync;
    }

    private async void OnLoadAsync(object? sender, EventArgs e)
    {
        try
        {
            // Keep the profile beside the app's own data rather than in a temp
            // folder, so logins and cached pages survive a restart.
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ReefLog", "WebView2");
            Directory.CreateDirectory(dataDir);

            var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
            await _web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowFailure(
                "Reef Log needs the Microsoft Edge WebView2 runtime, which is missing on this PC.\n\n" +
                "It ships with Windows 11 and with Edge, so this is unusual. Install the Evergreen " +
                "runtime from Microsoft and start Reef Log again.");
            return;
        }
        catch (Exception ex)
        {
            ShowFailure("Reef Log could not start its browser component.\n\n" + ex.Message);
            return;
        }

        var core = _web.CoreWebView2;

        // It is a log, not a browser: no context menu, no dev tools, no Ctrl+F.
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;

        // Follow the page title so the window says which screen is open.
        core.DocumentTitleChanged += (_, _) =>
        {
            var t = core.DocumentTitle;
            Text = string.IsNullOrWhiteSpace(t) ? "Reef Log" : t;
        };

        // Photo credits and similar links belong in the real browser, not in a
        // second frameless window with no way back.
        core.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            OpenExternally(args.Uri);
        };
        core.NavigationStarting += (_, args) =>
        {
            if (args.Uri.StartsWith(SiteHost, StringComparison.OrdinalIgnoreCase)) return;
            if (!args.Uri.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return;
            args.Cancel = true;
            OpenExternally(args.Uri);
        };

        core.NavigationCompleted += (_, args) =>
        {
            if (args.IsSuccess) return;
            // Offline with nothing cached yet is the likely cause on a first run.
            core.NavigateToString(OfflineHtml);
        };

        _web.Source = new Uri(_url);
    }

    private static void OpenExternally(string uri)
    {
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(uri)
            {
                UseShellExecute = true,
            });
        }
        catch
        {
            // A link that will not open is not a reason to take the app down.
        }
    }

    private void ShowFailure(string message)
    {
        Controls.Remove(_web);
        Controls.Add(new Label
        {
            Dock = DockStyle.Fill,
            Text = message,
            ForeColor = Color.White,
            BackColor = ColorTranslator.FromHtml("#0e2a3d"),
            Padding = new Padding(28),
            Font = new Font("Segoe UI", 10.5f),
        });
    }

    private const string OfflineHtml = """
        <html><body style="margin:0;height:100vh;display:grid;place-content:center;
              text-align:center;font:15px 'Segoe UI',sans-serif;
              background:#10171d;color:#9fb0be">
          <h2 style="color:#e6edf3">Reef Log could not reach the site</h2>
          <p style="max-width:44ch">
            It needs a connection the first time it runs. After that the app keeps a
            copy on this PC and opens offline. Check your connection and reopen.
          </p>
        </body></html>
        """;
}
