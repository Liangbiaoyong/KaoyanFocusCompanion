# 前台窗口 + 全局空闲时间探针。
# 每 $Interval 毫秒往 stdout 打一行 JSON，父进程读 stdout 即可。
# 由 Electron 主进程拉起，父进程退出时用 Kill 结束它。
param(
  [int]$Interval = 1000,
  [int]$MaxIterations = 0
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class WinProbe {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO {
    public uint cbSize;
    public uint dwTime;
  }

  public static string Title(IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    if (len <= 0) return "";
    StringBuilder sb = new StringBuilder(len + 1);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }

  public static uint IdleMs() {
    LASTINPUTINFO info = new LASTINPUTINFO();
    info.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref info)) return 0;
    return (uint)Environment.TickCount - info.dwTime;
  }
}
"@

$iterations = 0
while ($true) {
  $hWnd = [WinProbe]::GetForegroundWindow()
  $pid_ = 0
  [void][WinProbe]::GetWindowThreadProcessId($hWnd, [ref]$pid_)

  $processName = ""
  try {
    $processName = (Get-Process -Id $pid_ -ErrorAction Stop).ProcessName
  } catch {
    $processName = ""
  }

  $payload = [ordered]@{
    title       = [WinProbe]::Title($hWnd)
    process     = $processName
    pid         = $pid_
    minimized   = [WinProbe]::IsIconic($hWnd)
    idleMs      = [WinProbe]::IdleMs()
    at          = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }

  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
  [Console]::Out.Flush()

  $iterations++
  if ($MaxIterations -gt 0 -and $iterations -ge $MaxIterations) { break }
  Start-Sleep -Milliseconds $Interval
}
