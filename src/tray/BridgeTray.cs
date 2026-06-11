using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace BridgeTray
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayApplicationContext());
        }
    }

    public class TrayApplicationContext : ApplicationContext
    {
        private NotifyIcon trayIcon;
        private const string ProcessName = "codex-antigravity-bridge";
        private Form statusForm;
        private TableLayoutPanel grid;

        public TrayApplicationContext()
        {
            ContextMenuStrip contextMenu = new ContextMenuStrip();
            contextMenu.Items.Add("Status", null, Status_Click);
            contextMenu.Items.Add("Start Broker", null, Start_Click);
            contextMenu.Items.Add("Stop Broker", null, Stop_Click);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add("Exit", null, Exit_Click);

            trayIcon = new NotifyIcon()
            {
                Icon = SystemIcons.Information,
                ContextMenuStrip = contextMenu,
                Visible = true,
                Text = "Codex Antigravity Broker"
            };

            trayIcon.DoubleClick += Status_Click;
        }

        private void Status_Click(object sender, EventArgs e)
        {
            ShowStatusDialog();
        }

        private struct StatusItem
        {
            public bool Ok;
            public string Label;
            public string Detail;
        }

        private void ShowStatusDialog()
        {
            if (statusForm != null && !statusForm.IsDisposed)
            {
                statusForm.Focus();
                return;
            }

            statusForm = new Form();
            statusForm.Text = "Antigravity Broker Status";
            statusForm.Size = new Size(760, 600);
            statusForm.MinimumSize = new Size(600, 400);
            statusForm.StartPosition = FormStartPosition.CenterScreen;
            statusForm.BackColor = Color.FromArgb(20, 20, 30);
            statusForm.ForeColor = Color.White;
            statusForm.Font = new Font("Segoe UI", 9.5f);

            // Header Panel
            Panel headerPanel = new Panel();
            headerPanel.Dock = DockStyle.Top;
            headerPanel.Height = 60;
            headerPanel.BackColor = Color.FromArgb(15, 15, 25);
            headerPanel.Padding = new Padding(15, 12, 15, 12);

            Label titleLabel = new Label();
            titleLabel.Text = "ANTIGRAVITY BRIDGE SYSTEM STATUS";
            titleLabel.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(0, 162, 232);
            titleLabel.AutoSize = true;
            headerPanel.Controls.Add(titleLabel);
            statusForm.Controls.Add(headerPanel);

            // Main Panel with Scroll
            Panel mainPanel = new Panel();
            mainPanel.Dock = DockStyle.Fill;
            mainPanel.AutoScroll = true;
            mainPanel.Padding = new Padding(20);
            statusForm.Controls.Add(mainPanel);

            grid = new TableLayoutPanel();
            grid.ColumnCount = 4;
            grid.Dock = DockStyle.Top;
            grid.AutoSize = true;
            grid.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 35F));  // Light
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35F));  // Label
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));  // Detail
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100F)); // Action button
            mainPanel.Controls.Add(grid);

            // Bottom Panel
            Panel bottomPanel = new Panel();
            bottomPanel.Dock = DockStyle.Bottom;
            bottomPanel.Height = 55;
            bottomPanel.BackColor = Color.FromArgb(15, 15, 25);
            bottomPanel.Padding = new Padding(15, 10, 15, 10);

            Button btnRefresh = new Button();
            btnRefresh.Text = "Refresh";
            btnRefresh.FlatStyle = FlatStyle.Flat;
            btnRefresh.FlatAppearance.BorderSize = 0;
            btnRefresh.BackColor = Color.FromArgb(0, 120, 215);
            btnRefresh.ForeColor = Color.White;
            btnRefresh.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            btnRefresh.Width = 90;
            btnRefresh.Height = 35;
            btnRefresh.Dock = DockStyle.Left;
            btnRefresh.Click += (s, ev) => RefreshStatusList();
            btnRefresh.MouseEnter += (s, ev) => btnRefresh.BackColor = Color.FromArgb(0, 140, 240);
            btnRefresh.MouseLeave += (s, ev) => btnRefresh.BackColor = Color.FromArgb(0, 120, 215);
            bottomPanel.Controls.Add(btnRefresh);

            Button btnClose = new Button();
            btnClose.Text = "Close";
            btnClose.FlatStyle = FlatStyle.Flat;
            btnClose.FlatAppearance.BorderSize = 0;
            btnClose.BackColor = Color.FromArgb(48, 48, 64);
            btnClose.ForeColor = Color.White;
            btnClose.Width = 90;
            btnClose.Height = 35;
            btnClose.Dock = DockStyle.Right;
            btnClose.Click += (s, ev) => statusForm.Close();
            btnClose.MouseEnter += (s, ev) => btnClose.BackColor = Color.FromArgb(80, 80, 100);
            btnClose.MouseLeave += (s, ev) => btnClose.BackColor = Color.FromArgb(48, 48, 64);
            bottomPanel.Controls.Add(btnClose);

            statusForm.Controls.Add(bottomPanel);

            // Initial Load
            RefreshStatusList();

            statusForm.ShowDialog();
        }

        private void RefreshStatusList()
        {
            grid.Controls.Clear();
            grid.RowStyles.Clear();
            grid.RowCount = 0;

            var items = new List<StatusItem>();

            // 1. Bridge Tray App status
            items.Add(new StatusItem { Ok = true, Label = "Bridge Tray App", Detail = string.Format("running (PID {0})", Process.GetCurrentProcess().Id) });

            // 2. Bridge Daemon status
            var processes = Process.GetProcessesByName(ProcessName);
            bool isDaemonRunning = processes.Any();
            string daemonDetail = isDaemonRunning 
                ? string.Format("running (PID {0})", string.Join(", ", processes.Select(p => p.Id))) 
                : "stopped — click Start to run";
            items.Add(new StatusItem { Ok = isDaemonRunning, Label = "Bridge Daemon", Detail = daemonDetail });

            // 3. Antigravity Desktop App installed
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string agyAppDir = Path.Combine(localAppData, "Programs", "Antigravity");
            string agyAppExe = Path.Combine(agyAppDir, "Antigravity.exe");
            string agyLangSrv = Path.Combine(agyAppDir, "resources", "bin", "language_server.exe");

            bool hasAgyApp = Directory.Exists(agyAppDir);
            bool hasAgyExe = File.Exists(agyAppExe);
            bool hasAgyLangSrv = File.Exists(agyLangSrv);

            items.Add(new StatusItem { Ok = hasAgyApp, Label = "Antigravity Desktop App installed", Detail = hasAgyApp ? agyAppDir : "not found" });
            items.Add(new StatusItem { Ok = hasAgyExe, Label = "Antigravity Desktop App exe", Detail = hasAgyExe ? agyAppExe : "not found" });
            items.Add(new StatusItem { Ok = hasAgyLangSrv, Label = "Antigravity Language Server (agy)", Detail = hasAgyLangSrv ? agyLangSrv : "not found" });

            // 4. agy CLI in PATH
            string agyVer = RunAgyCommand("--version").Trim();
            bool hasAgyVer = !agyVer.StartsWith("failed") && !agyVer.Contains("timed out") && !string.IsNullOrWhiteSpace(agyVer);
            items.Add(new StatusItem { Ok = hasAgyVer, Label = "agy CLI in PATH", Detail = hasAgyVer ? agyVer : "NOT found — install Antigravity Desktop App" });

            // 5. Antigravity auth
            string agyStatus = RunAgyCommand("status").Trim();
            bool agyLoggedIn = hasAgyVer && !agyStatus.ToLower().Contains("unauthenticated") 
                                         && !agyStatus.ToLower().Contains("login required") 
                                         && !agyStatus.ToLower().Contains("not logged")
                                         && !agyStatus.StartsWith("failed");
            items.Add(new StatusItem { Ok = agyLoggedIn, Label = "Antigravity auth (agy status)", Detail = hasAgyVer ? (agyLoggedIn ? agyStatus.Split('\n')[0].Trim() : "NOT logged in — click Login") : "agy CLI not available" });

            // 6. Cascading CAM Doctor checks
            string camDoc = RunCamCommand("doctor");
            string raw = string.IsNullOrWhiteSpace(camDoc) ? "" : camDoc;
            string[] outputLines = raw.Replace("\r\n", "\n").Replace("\r", "\n").Split('\n');
            
            foreach (string line in outputLines)
            {
                if (line.StartsWith("OK ") || line.StartsWith("BAD"))
                {
                    bool ok = line.StartsWith("OK");
                    string content = line.Substring(ok ? 3 : 4).Trim();
                    int colonIdx = content.IndexOf(':');
                    string label = colonIdx >= 0 ? content.Substring(0, colonIdx).Trim() : content;
                    string detail = colonIdx >= 0 ? content.Substring(colonIdx + 1).Trim() : "";
                    items.Add(new StatusItem { Ok = ok, Label = label, Detail = detail });
                }
            }

            int rowIdx = 0;
            foreach (var item in items)
            {
                grid.RowCount++;
                grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 35F));

                // 1. Status Light
                Label light = new Label();
                light.Text = "●";
                light.Font = new Font("Segoe UI", 12f);
                light.ForeColor = item.Ok ? Color.LimeGreen : Color.OrangeRed;
                light.TextAlign = ContentAlignment.MiddleCenter;
                light.Dock = DockStyle.Fill;
                grid.Controls.Add(light, 0, rowIdx);

                // 2. Label
                Label lbl = new Label();
                lbl.Text = item.Label;
                lbl.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
                lbl.ForeColor = Color.White;
                lbl.TextAlign = ContentAlignment.MiddleLeft;
                lbl.Dock = DockStyle.Fill;
                grid.Controls.Add(lbl, 1, rowIdx);

                // 3. Detail
                Label det = new Label();
                det.Text = item.Detail;
                det.Font = new Font("Segoe UI", 9f);
                det.ForeColor = Color.LightGray;
                det.TextAlign = ContentAlignment.MiddleLeft;
                det.Dock = DockStyle.Fill;
                grid.Controls.Add(det, 2, rowIdx);

                // 4. Action Button
                if (ShouldShowButton(item.Label, item.Ok))
                {
                    Button btn = new Button();
                    btn.Text = GetButtonText(item.Label, item.Ok);
                    btn.FlatStyle = FlatStyle.Flat;
                    btn.FlatAppearance.BorderSize = 0;
                    btn.BackColor = Color.FromArgb(48, 48, 64);
                    btn.ForeColor = Color.White;
                    btn.Font = new Font("Segoe UI", 8.5f);
                    btn.Height = 25;
                    btn.Dock = DockStyle.Fill;
                    btn.Click += (s, ev) => HandleAction(item.Label, item.Ok);
                    btn.MouseEnter += (s, ev) => btn.BackColor = Color.FromArgb(80, 80, 100);
                    btn.MouseLeave += (s, ev) => btn.BackColor = Color.FromArgb(48, 48, 64);
                    grid.Controls.Add(btn, 3, rowIdx);
                }

                rowIdx++;
            }
        }

        private bool ShouldShowButton(string label, bool ok)
        {
            if (label.Contains("Bridge Daemon")) return true;
            if (label.Contains("Antigravity Desktop App")) return true;
            if (label.Contains("Antigravity Language Server")) return !ok;
            if (label.Contains("agy CLI in PATH")) return !ok;
            if (label.Contains("Antigravity auth")) return !ok;
            if (label.Contains("CAM daemon")) return true;
            if (label.Contains("Codex Desktop App")) return true;
            if (label.Contains("Codex CLI")) return true;
            if (label.Contains("Codex auth")) return !ok;
            return false;
        }

        private string GetButtonText(string label, bool ok)
        {
            if (label.Contains("Bridge Daemon")) return ok ? "Stop" : "Start";
            if (label.Contains("Antigravity Desktop App")) return ok ? "Open" : "Download";
            if (label.Contains("Antigravity Language Server")) return "Download";
            if (label.Contains("agy CLI in PATH")) return "Install";
            if (label.Contains("Antigravity auth")) return "Login";
            if (label.Contains("CAM daemon")) return ok ? "Stop" : "Start";
            if (label.Contains("Codex Desktop App")) return ok ? "Open" : "Download";
            if (label.Contains("Codex CLI")) return ok ? "Update" : "Install";
            if (label.Contains("Codex auth")) return "Login";
            return "Action";
        }

        private void HandleAction(string label, bool ok)
        {
            if (label.Contains("Bridge Daemon"))
            {
                if (ok) StopBroker();
                else StartBroker();
                RefreshStatusList();
            }
            else if (label.Contains("Antigravity Desktop App"))
            {
                if (ok)
                {
                    try
                    {
                        Process.Start("antigravity://");
                    }
                    catch
                    {
                        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                        string agyAppExe = Path.Combine(localAppData, "Programs", "Antigravity", "Antigravity.exe");
                        if (File.Exists(agyAppExe)) Process.Start(agyAppExe);
                        else Process.Start("https://antigravity.google/download");
                    }
                }
                else
                {
                    Process.Start("https://antigravity.google/download");
                }
            }
            else if (label.Contains("Antigravity Language Server") || label.Contains("agy CLI in PATH"))
            {
                if (label.Contains("agy CLI in PATH"))
                {
                    ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-NoExit -Command \"irm https://antigravity.google/cli/install.ps1 | iex\"")
                    {
                        UseShellExecute = true,
                        WindowStyle = ProcessWindowStyle.Normal
                    };
                    try { Process.Start(psi); } catch (Exception ex) { MessageBox.Show("Failed to launch installer: " + ex.Message); }
                }
                else
                {
                    Process.Start("https://antigravity.google/download");
                }
            }
            else if (label.Contains("Antigravity auth"))
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c agy login && pause")
                {
                    UseShellExecute = true,
                    WindowStyle = ProcessWindowStyle.Normal
                };
                try { Process.Start(psi); } catch (Exception ex) { MessageBox.Show("Failed to launch login: " + ex.Message); }
            }
            else if (label.Contains("CAM daemon"))
            {
                if (ok) RunCamCommand("daemon stop");
                else RunCamCommand("daemon start");
                RefreshStatusList();
            }
            else if (label.Contains("Codex Desktop App"))
            {
                if (ok)
                {
                    try
                    {
                        Process.Start("codex://");
                    }
                    catch
                    {
                        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                        string candidate = Path.Combine(localAppData, "OpenAI", "Codex", "Codex.exe");
                        if (File.Exists(candidate)) Process.Start(candidate);
                        else Process.Start("https://chatgpt.com/download");
                    }
                }
                else
                {
                    Process.Start("https://chatgpt.com/download");
                }
            }
            else if (label.Contains("Codex CLI"))
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c npm install -g @openai/codex-cli && pause")
                {
                    UseShellExecute = true,
                    WindowStyle = ProcessWindowStyle.Normal
                };
                try { Process.Start(psi); } catch (Exception ex) { MessageBox.Show("Failed to launch installer: " + ex.Message); }
            }
            else if (label.Contains("Codex auth"))
            {
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c codex login && pause")
                {
                    UseShellExecute = true,
                    WindowStyle = ProcessWindowStyle.Normal
                };
                try { Process.Start(psi); } catch (Exception ex) { MessageBox.Show("Failed to launch login: " + ex.Message); }
            }
        }

        private string RunAgyCommand(string arguments)
        {
            try
            {
                ProcessStartInfo processInfo = new ProcessStartInfo("agy.exe", arguments)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                using (Process process = Process.Start(processInfo))
                {
                    if (process.WaitForExit(5000))
                    {
                        string output = process.StandardOutput.ReadToEnd();
                        string error = process.StandardError.ReadToEnd();
                        if (!string.IsNullOrWhiteSpace(error)) return output + "\n" + error;
                        return output;
                    }
                    else
                    {
                        process.Kill();
                        return "timed out";
                    }
                }
            }
            catch (Exception ex)
            {
                return "failed: " + ex.Message;
            }
        }

        private string RunCamCommand(string arguments)
        {
            try
            {
                string camPath = "cam.exe"; // Try path first
                string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string candidate = Path.Combine(progFiles, "Codex Agent Manager", "cam.exe");
                if (File.Exists(candidate))
                {
                    camPath = candidate;
                }
                else
                {
                    string progFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                    candidate = Path.Combine(progFilesX86, "Codex Agent Manager", "cam.exe");
                    if (File.Exists(candidate))
                    {
                        camPath = candidate;
                    }
                }

                ProcessStartInfo processInfo = new ProcessStartInfo(camPath, arguments)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                using (Process process = Process.Start(processInfo))
                {
                    if (process.WaitForExit(8000))
                    {
                        string output = process.StandardOutput.ReadToEnd();
                        string error = process.StandardError.ReadToEnd();
                        if (!string.IsNullOrWhiteSpace(error))
                        {
                            return output + "\n" + error;
                        }
                        return output;
                    }
                    else
                    {
                        process.Kill();
                        return "BAD: cam command timed out after 8 seconds.";
                    }
                }
            }
            catch (Exception ex)
            {
                return "BAD Codex Agent Manager: cam.exe not found or failed to execute (" + ex.Message + "). Please install Codex Agent Manager.";
            }
        }

        private bool StartBroker()
        {
            if (Process.GetProcessesByName(ProcessName).Any())
            {
                return true;
            }

            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string brokerExe = Path.Combine(exeDir, ProcessName + ".exe");

                if (!File.Exists(brokerExe))
                {
                    return false;
                }

                ProcessStartInfo processInfo = new ProcessStartInfo(brokerExe)
                {
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };

                Process.Start(processInfo);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private bool StopBroker()
        {
            var processes = Process.GetProcessesByName(ProcessName);
            if (!processes.Any())
            {
                return true;
            }

            try
            {
                foreach (var process in processes)
                {
                    process.Kill();
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        private void Start_Click(object sender, EventArgs e)
        {
            if (StartBroker())
            {
                MessageBox.Show("Broker started successfully.", "Start Broker", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show("Failed to start broker.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void Stop_Click(object sender, EventArgs e)
        {
            if (StopBroker())
            {
                MessageBox.Show("Broker stopped successfully.", "Stop Broker", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show("Failed to stop broker.", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void Exit_Click(object sender, EventArgs e)
        {
            trayIcon.Visible = false;
            Application.Exit();
        }
    }
}
