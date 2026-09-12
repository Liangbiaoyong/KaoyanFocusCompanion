# 精确探针：常驻循环，读前台窗口标题与浏览器地址栏内容。
# 只读：查询无障碍树，不发送任何输入、不修改任何系统设置。
#
# 输出每行一个 JSON：{ title, url, at }
# process / idleMs 由基础探针 foreground.ps1 提供，由 probe.mjs 的 mergeSample 合并。
param(
  [int]$Interval = 3000,
  [int]$MaxIterations = 0
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr h);
  public static string Title(IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    if (len <= 0) return "";
    StringBuilder sb = new StringBuilder(len + 1);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
"@

# 中文系统是「地址和搜索栏」，英文是「Address and search bar」。
# AutomationId 每次都会变，只有控件名稳定，所以按 Name 找。
$ADDRESS_NAMES = @('地址和搜索栏', 'Address and search bar')

$iterations = 0
while ($true) {
  $hWnd = [WinFg]::GetForegroundWindow()
  $title = [WinFg]::Title($hWnd)
  $url = $null

  if ($hWnd -ne [IntPtr]::Zero) {
    try {
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($hWnd)
      if ($root) {
        foreach ($name in $ADDRESS_NAMES) {
          $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $name)
          $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
          if ($el) {
            $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            $value = $vp.Current.Value
            if ($value) { $url = $value; break }
          }
        }
      }
    } catch { $url = $null }
  }

  [ordered]@{
    title = $title
    url   = $url
    at    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress

  $iterations++
  if ($MaxIterations -gt 0 -and $iterations -ge $MaxIterations) { break }
  Start-Sleep -Milliseconds $Interval
}
