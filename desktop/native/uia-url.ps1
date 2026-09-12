# 探针 v2：唤醒 Chromium 无障碍树后再试读地址栏。
# 只读：查询无障碍树，不发送任何输入、不修改任何设置。
param(
  [int]$MaxWindows = 3,
  [int]$SettleMs = 2500
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$browsers = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne 0 -and $_.ProcessName -match '^(msedge|chrome|firefox)$' } |
  Select-Object -First $MaxWindows

if (-not $browsers) {
  '{"note":"没有找到带窗口的浏览器进程"}'
  exit 0
}

$roots = @()
foreach ($p in $browsers) {
  try {
    $roots += [pscustomobject]@{
      proc = $p
      root = [System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle)
    }
  } catch { }
}

# 第一次触碰会向 Chromium 发 WM_GETOBJECT，促使它开始构建无障碍树
Start-Sleep -Milliseconds $SettleMs

foreach ($item in $roots) {
  $root = $item.root
  if (-not $root) { continue }

  $edits = @()
  try {
    $cond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit)
    $found = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cond)
    foreach ($el in $found) {
      $value = ''
      try {
        $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $value = $vp.Current.Value
      } catch { $value = '<无 ValuePattern>' }
      $edits += [ordered]@{
        name         = $el.Current.Name
        automationId = $el.Current.AutomationId
        value        = $value
      }
    }
  } catch { }

  [ordered]@{
    process     = $item.proc.ProcessName
    pid         = $item.proc.Id
    windowTitle = $item.proc.MainWindowTitle
    editCount   = $edits.Count
    edits       = $edits
  } | ConvertTo-Json -Compress -Depth 5
}
