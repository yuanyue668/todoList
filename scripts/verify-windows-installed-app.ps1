param(
  [string]$InstallDir = "E:\Projects\todoList\local-install\EdgeTodos-1.0.4",
  [string]$ExpectedVersion = "1.0.4",
  [int]$TimeoutSeconds = 15,
  [switch]$KeepRunning,
  [switch]$KeepSmokeData
)

$ErrorActionPreference = "Stop"

$exe = Join-Path $InstallDir "edge-todos.exe"
if (-not (Test-Path -LiteralPath $exe)) {
  throw "Installed executable not found: $exe"
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Net.Http

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Win32WindowProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  public static extern short VkKeyScan(char ch);

  public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  public const uint MOUSEEVENTF_LEFTUP = 0x0004;
  public const uint MOUSEEVENTF_MOVE = 0x0001;
  public const uint KEYEVENTF_KEYUP = 0x0002;
}
"@

$script:cdpId = 0
$script:cdpClient = $null
$script:appDataBackup = $null
$script:isolatedProfile = $null
$script:cleanupDone = $false

function Write-Step($message) {
  Write-Host "[verify] $message"
}

function Wait-Until([scriptblock]$Predicate, [string]$Description, [int]$Timeout = $TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($Timeout)
  do {
    if (& $Predicate) { return }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)

  throw "Timed out waiting for: $Description"
}

function Get-AppProcesses {
  @(Get-Process -Name "edge-todos" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -eq [System.IO.Path]::GetFullPath($exe)) })
}

function Get-AppProcess {
  Get-AppProcesses | Select-Object -First 1
}

function Stop-TestInstance {
  $running = Get-AppProcesses
  if (-not $running.Count) { return }

  foreach ($process in $running) {
    Write-Step "Closing test instance pid=$($process.Id)"
    try { $process.CloseMainWindow() | Out-Null } catch {}
  }

  try {
    Wait-Until { (Get-AppProcesses).Count -eq 0 } "test instance shutdown" 5
  } catch {
    foreach ($process in (Get-AppProcesses)) {
      Stop-Process -Id $process.Id -Force
    }
  }
}

function Normalize-Path([string]$Path) {
  [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
}

function Assert-SafeAppDataPath([string]$Path) {
  $full = Normalize-Path $Path
  $allowed = @(
    (Normalize-Path (Join-Path $env:LOCALAPPDATA "com.edge.todos")),
    (Normalize-Path (Join-Path $env:APPDATA "com.edge.todos"))
  )
  if ($allowed -notcontains $full) {
    throw "Refusing to modify unexpected app data path: $Path"
  }
}

function Remove-DirectoryWithRetry([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Assert-SafeAppDataPath $Path

  for ($attempt = 1; $attempt -le 8; $attempt++) {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      if ($attempt -eq 8) { throw }
      Start-Sleep -Milliseconds (250 * $attempt)
    }
  }
}

function Backup-AppData {
  $root = Join-Path (Join-Path (Get-Location) "artifacts\smoke-backups") (Get-Date -Format "yyyyMMdd-HHmmss")
  New-Item -ItemType Directory -Force -Path $root | Out-Null

  $records = @()
  foreach ($entry in @(
    @{ Name = "Local"; Path = Join-Path $env:LOCALAPPDATA "com.edge.todos" },
    @{ Name = "Roaming"; Path = Join-Path $env:APPDATA "com.edge.todos" }
  )) {
    Assert-SafeAppDataPath $entry.Path
    $exists = Test-Path -LiteralPath $entry.Path
    $backupPath = Join-Path $root $entry.Name
    if ($exists) {
      Copy-Item -LiteralPath $entry.Path -Destination $backupPath -Recurse -Force
    }
    $records += [pscustomobject]@{
      Name = $entry.Name
      Path = $entry.Path
      Existed = $exists
      BackupPath = $backupPath
    }
  }

  [pscustomobject]@{
    Root = $root
    Records = $records
  }
}

function Restore-AppData {
  if (-not $script:appDataBackup -or $KeepSmokeData -or $KeepRunning) { return }

  Write-Step "Restoring app data from $($script:appDataBackup.Root)"
  Stop-TestInstance

  foreach ($record in $script:appDataBackup.Records) {
    Assert-SafeAppDataPath $record.Path
    Remove-DirectoryWithRetry $record.Path
    if ($record.Existed) {
      Copy-Item -LiteralPath $record.BackupPath -Destination $record.Path -Recurse -Force
    }
  }
}

function Remove-IsolatedProfile {
  if (-not $script:isolatedProfile -or $KeepSmokeData -or $KeepRunning) { return }
  $full = Normalize-Path $script:isolatedProfile
  $expectedRoot = Normalize-Path (Join-Path (Get-Location) "artifacts")
  if (-not $full.StartsWith($expectedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected smoke profile path: $script:isolatedProfile"
  }
  if (Test-Path -LiteralPath $script:isolatedProfile) {
    for ($attempt = 1; $attempt -le 8; $attempt++) {
      try {
        Remove-Item -LiteralPath $script:isolatedProfile -Recurse -Force -ErrorAction Stop
        return
      } catch {
        if ($attempt -eq 8) {
          Write-Step "WARN: could not remove smoke WebView profile '$script:isolatedProfile': $($_.Exception.Message)"
          return
        }
        Start-Sleep -Milliseconds (250 * $attempt)
      }
    }
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Get-CdpTarget([int]$Port) {
  $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json" -UseBasicParsing -TimeoutSec 2
  $targets = @($response.Content | ConvertFrom-Json)
  $pages = @($targets | Where-Object { $_.webSocketDebuggerUrl -and $_.type -eq "page" })
  $appPage = @($pages | Where-Object { $_.url -like "http://tauri.localhost*" } | Select-Object -First 1)
  if ($appPage.Count) { return $appPage[0] }
  @($pages | Select-Object -First 1)[0]
}

function Connect-Cdp([string]$WebSocketUrl) {
  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $client.ConnectAsync([Uri]$WebSocketUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  $script:cdpClient = $client
  Invoke-Cdp "Runtime.enable" @{} | Out-Null
  return $client
}

function Send-WebSocketMessage($Client, [string]$Message) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
  $segment = [ArraySegment[byte]]::new($bytes)
  $Client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-WebSocketMessage($Client) {
  $buffer = New-Object byte[] 65536
  $segment = [ArraySegment[byte]]::new($buffer)
  $stream = [System.IO.MemoryStream]::new()

  do {
    $result = $Client.ReceiveAsync($segment, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
      throw "CDP WebSocket closed"
    }
    if ($result.Count -gt 0) {
      $stream.Write($buffer, 0, $result.Count)
    }
  } while (-not $result.EndOfMessage)

  [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
}

function Invoke-Cdp([string]$Method, [hashtable]$Params) {
  if (-not $script:cdpClient) {
    throw "CDP client is not connected"
  }

  $script:cdpId += 1
  $id = $script:cdpId
  $payload = @{
    id = $id
    method = $Method
    params = $Params
  } | ConvertTo-Json -Depth 20 -Compress

  Send-WebSocketMessage $script:cdpClient $payload

  while ($true) {
    $raw = Receive-WebSocketMessage $script:cdpClient
    $message = $raw | ConvertFrom-Json
    if ($message.id -eq $id) {
      if ($message.error) {
        throw "CDP $Method failed: $($message.error.message)"
      }
      return $message.result
    }
  }
}

function Invoke-CdpExpression([string]$Expression) {
  $result = Invoke-Cdp "Runtime.evaluate" @{
    expression = $Expression
    awaitPromise = $true
    returnByValue = $true
  }
  if ($result.exceptionDetails) {
    throw "CDP expression failed: $($result.exceptionDetails.text)"
  }
  return $result.result.value
}

function Get-Rect($Handle) {
  $rect = New-Object Win32WindowProbe+RECT
  if (-not [Win32WindowProbe]::GetWindowRect($Handle, [ref]$rect)) {
    throw "GetWindowRect failed"
  }

  [pscustomobject]@{
    Left = $rect.Left
    Top = $rect.Top
    Right = $rect.Right
    Bottom = $rect.Bottom
    Width = $rect.Right - $rect.Left
    Height = $rect.Bottom - $rect.Top
  }
}

function Move-Mouse($x, $y) {
  [Win32WindowProbe]::SetCursorPos([int]$x, [int]$y) | Out-Null
  [Win32WindowProbe]::mouse_event([Win32WindowProbe]::MOUSEEVENTF_MOVE, 0, 0, 0, [UIntPtr]::Zero)
}

function Click-Point($x, $y) {
  Move-Mouse $x $y
  Start-Sleep -Milliseconds 120
  [Win32WindowProbe]::mouse_event([Win32WindowProbe]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [Win32WindowProbe]::mouse_event([Win32WindowProbe]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Send-Key([byte]$VirtualKey) {
  [Win32WindowProbe]::keybd_event($VirtualKey, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 25
  [Win32WindowProbe]::keybd_event($VirtualKey, 0, [Win32WindowProbe]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 25
}

function Send-Text([string]$Text) {
  foreach ($char in $Text.ToCharArray()) {
    $scan = [Win32WindowProbe]::VkKeyScan($char)
    if ($scan -eq -1) {
      throw "No virtual key mapping for character '$char'"
    }

    $virtualKey = [byte]($scan -band 0xff)
    $modifiers = ($scan -shr 8) -band 0xff
    $needsShift = ($modifiers -band 1) -ne 0
    if ($needsShift) {
      [Win32WindowProbe]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 10
    }

    Send-Key $virtualKey

    if ($needsShift) {
      [Win32WindowProbe]::keybd_event(0x10, 0, [Win32WindowProbe]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 10
    }
  }
}

function Drag-Window($fromX, $fromY, $toX, $toY) {
  Move-Mouse $fromX $fromY
  Start-Sleep -Milliseconds 150
  [Win32WindowProbe]::mouse_event([Win32WindowProbe]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 150

  $steps = 16
  for ($i = 1; $i -le $steps; $i++) {
    $x = $fromX + (($toX - $fromX) * $i / $steps)
    $y = $fromY + (($toY - $fromY) * $i / $steps)
    Move-Mouse $x $y
    Start-Sleep -Milliseconds 25
  }

  [Win32WindowProbe]::mouse_event([Win32WindowProbe]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
}

function Convert-CssPointToScreen($WindowRect, $CssPoint) {
  $xScale = $WindowRect.Width / [double]$CssPoint.viewportWidth
  $yScale = $WindowRect.Height / [double]$CssPoint.viewportHeight
  [pscustomobject]@{
    X = [int]($WindowRect.Left + ($CssPoint.x * $xScale))
    Y = [int]($WindowRect.Top + ($CssPoint.y * $yScale))
  }
}

function Get-ElementCenter([string]$Selector) {
  $selectorJson = $Selector | ConvertTo-Json -Compress
  $json = Invoke-CdpExpression @"
(() => {
  const selector = $selectorJson;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return JSON.stringify({
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    width: r.width,
    height: r.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    activeTag: document.activeElement ? document.activeElement.tagName : null
  });
})()
"@
  if (-not $json) { return $null }
  $json | ConvertFrom-Json
}

function Get-WindowPrefs {
  $json = Invoke-CdpExpression @"
(() => {
  const raw = localStorage.getItem('edge-todos-state-v1');
  if (!raw) return null;
  const state = JSON.parse(raw);
  return JSON.stringify(state.windowPrefs || null);
})()
"@
  if (-not $json) { return $null }
  $json | ConvertFrom-Json
}

function Get-RenderDiagnostics {
  Invoke-CdpExpression @"
(async () => {
  const scripts = [...document.scripts].map((script) => script.src).filter(Boolean);
  const scriptResponses = await Promise.all(scripts.map(async (src) => {
    try {
      const response = await fetch(src);
      const text = await response.text();
      return {
        src,
        status: response.status,
        mime: response.headers.get('content-type'),
        prefix: text.slice(0, 80),
      };
    } catch (error) {
      return { src, error: String(error) };
    }
  }));

  return JSON.stringify({
    url: location.href,
    title: document.title,
    rootHtml: document.querySelector('#root')?.innerHTML.slice(0, 200) ?? null,
    bodyText: document.body.innerText.slice(0, 200),
    scriptResponses,
  });
})()
"@
}

function Test-DragCandidate($Handle, $BaseRect, $Name, $RelativeX, $Screen) {
  $baseLeft = [Math]::Max($Screen.Left + 120, [Math]::Min($BaseRect.Left, $Screen.Right - $BaseRect.Width - 160))
  $baseTop = [Math]::Max($Screen.Top + 120, [Math]::Min($BaseRect.Top, $Screen.Bottom - $BaseRect.Height - 120))
  [Win32WindowProbe]::MoveWindow($Handle, $baseLeft, $baseTop, $BaseRect.Width, $BaseRect.Height, $true) | Out-Null
  Start-Sleep -Milliseconds 350

  $before = Get-Rect $Handle
  $candidateX = [Math]::Max($before.Left + 12, [Math]::Min([int]($before.Left + $RelativeX), $before.Right - 12))
  $candidateY = $before.Top + 18

  [Win32WindowProbe]::SetForegroundWindow($Handle) | Out-Null
  Start-Sleep -Milliseconds 150
  Drag-Window $candidateX $candidateY ($candidateX + 120) ($candidateY + 80)
  Start-Sleep -Milliseconds 500

  $after = Get-Rect $Handle
  $moved = [Math]::Abs($after.Left - $before.Left) -ge 35 -or [Math]::Abs($after.Top - $before.Top) -ge 35
  Write-Step "Drag candidate '$Name' at x=$candidateX moved=$moved; before=($($before.Left),$($before.Top)) after=($($after.Left),$($after.Top))"

  [pscustomobject]@{
    Moved = $moved
    Rect = $after
    X = $candidateX
    Name = $Name
  }
}

function Test-BasicInputPath($Handle, [System.Collections.Generic.List[string]]$Failures) {
  Write-Step "Testing basic click and keyboard todo path"

  try {
    Wait-Until {
      [bool](Invoke-CdpExpression "Boolean(document.querySelector('.priority-group .group-add-button'))")
    } "todo group add button in DOM" 10
  } catch {
    $diagnostics = Get-RenderDiagnostics
    $Failures.Add("$($_.Exception.Message). Render diagnostics: $diagnostics")
    Write-Step "FAIL: $($_.Exception.Message)"
    Write-Step "Render diagnostics: $diagnostics"
    return
  }

  $windowRect = Get-Rect $Handle
  $buttonCenter = Get-ElementCenter ".priority-group .group-add-button"
  if (-not $buttonCenter) {
    $Failures.Add("Could not locate group add button through CDP.")
    return
  }

  $screenPoint = Convert-CssPointToScreen $windowRect $buttonCenter
  [Win32WindowProbe]::SetForegroundWindow($Handle) | Out-Null
  Start-Sleep -Milliseconds 200
  Click-Point $screenPoint.X $screenPoint.Y

  try {
    Wait-Until {
      [bool](Invoke-CdpExpression "Boolean(document.querySelector('.group-composer input') && document.activeElement === document.querySelector('.group-composer input'))")
    } "composer input focus after add-button click" 4
  } catch {
    $Failures.Add($_.Exception.Message)
    Write-Step "FAIL: $($_.Exception.Message)"
    return
  }

  $randomSuffix = -join (1..12 | ForEach-Object { [char](97 + (Get-Random -Minimum 0 -Maximum 26)) })
  $smokeText = "smoke" + $randomSuffix
  Start-Sleep -Milliseconds 400
  Send-Text $smokeText
  Start-Sleep -Milliseconds 120
  Send-Key 0x0D
  Start-Sleep -Milliseconds 160
  Send-Key 0x0D

  try {
    Wait-Until {
      $textJson = $smokeText | ConvertTo-Json -Compress
      $stateJson = Invoke-CdpExpression @"
(() => {
  const text = $textJson;
  const raw = localStorage.getItem('edge-todos-state-v1');
  const state = raw ? JSON.parse(raw) : null;
  const todos = state ? state.pages.flatMap((page) => page.todos || []) : [];
  const todoCount = todos.filter((todo) => todo.text === text).length;
  const inDom = document.body.innerText.includes(text);
  return JSON.stringify({ todoCount, inDom });
})()
"@
      $state = $stateJson | ConvertFrom-Json
      $script:lastInputState = $state
      $state.todoCount -eq 1 -and $state.inDom
    } "typed todo to appear in DOM and localStorage" 6
    Write-Step "Input path added and rendered todo text: $smokeText"
  } catch {
    $textJson = $smokeText | ConvertTo-Json -Compress
    $diagnostics = Invoke-CdpExpression @"
(() => {
  const text = $textJson;
  const input = document.querySelector('.group-composer input');
  const raw = localStorage.getItem('edge-todos-state-v1');
  const state = raw ? JSON.parse(raw) : null;
  const todos = state ? state.pages.flatMap((page) => page.todos || []) : [];
  return JSON.stringify({
    activeTag: document.activeElement?.tagName ?? null,
    activeClass: document.activeElement?.className ?? null,
    activeValue: document.activeElement && 'value' in document.activeElement ? document.activeElement.value : null,
    inputValue: input?.value ?? null,
    composerOpen: Boolean(input),
    todoCount: todos.filter((todo) => todo.text === text).length,
    bodyIncludesText: document.body.innerText.includes(text),
    bodyText: document.body.innerText.slice(0, 300),
  });
})()
"@
    $Failures.Add("$($_.Exception.Message). Input diagnostics: $diagnostics")
    Write-Step "FAIL: $($_.Exception.Message)"
    Write-Step "Input diagnostics: $diagnostics"
  }
}

function Cleanup {
  if ($script:cleanupDone) { return }
  $script:cleanupDone = $true

  if ($script:cdpClient) {
    try { $script:cdpClient.Dispose() } catch {}
    $script:cdpClient = $null
  }
  if (-not $KeepRunning) {
    Stop-TestInstance
  }
  Restore-AppData
  Remove-IsolatedProfile
}

trap {
  Cleanup
  throw $_
}

$versionInfo = (Get-Item -LiteralPath $exe).VersionInfo
$failures = New-Object System.Collections.Generic.List[string]
Write-Step "Executable: $exe"
Write-Step "Version: product=$($versionInfo.ProductVersion), file=$($versionInfo.FileVersion)"
if ($versionInfo.ProductVersion -ne $ExpectedVersion -or $versionInfo.FileVersion -ne $ExpectedVersion) {
  throw "Version mismatch. Expected $ExpectedVersion."
}

$existing = Get-AppProcess
if ($existing) {
  Write-Step "Stopping existing test instance pid=$($existing.Id)"
  Stop-TestInstance
}

if (-not $KeepSmokeData) {
  Write-Step "Backing up app data before smoke test"
  $script:appDataBackup = Backup-AppData
}

$cdpPort = Get-FreeTcpPort
$script:isolatedProfile = Join-Path (Join-Path (Get-Location) "artifacts\smoke-webview-profiles") (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Force -Path $script:isolatedProfile | Out-Null

Write-Step "Launching installed app with isolated WebView profile and CDP port $cdpPort"
$oldCdpArgs = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$oldUserDataFolder = $env:WEBVIEW2_USER_DATA_FOLDER
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$cdpPort --remote-allow-origins=*"
$env:WEBVIEW2_USER_DATA_FOLDER = $script:isolatedProfile
try {
  $started = Start-Process -FilePath $exe -PassThru
} finally {
  if ($null -eq $oldCdpArgs) {
    Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  } else {
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $oldCdpArgs
  }
  if ($null -eq $oldUserDataFolder) {
    Remove-Item Env:WEBVIEW2_USER_DATA_FOLDER -ErrorAction SilentlyContinue
  } else {
    $env:WEBVIEW2_USER_DATA_FOLDER = $oldUserDataFolder
  }
}

$app = $null
Wait-Until {
  $script:app = Get-AppProcess
  $script:app -and $script:app.MainWindowHandle -ne 0
} "main window handle"

$handle = $app.MainWindowHandle
Wait-Until { [Win32WindowProbe]::IsWindowVisible($handle) } "visible window"

$initial = Get-Rect $handle
Write-Step "Initial rect: left=$($initial.Left), top=$($initial.Top), width=$($initial.Width), height=$($initial.Height)"
if ($initial.Width -lt 320 -or $initial.Height -lt 420) {
  throw "Window is smaller than configured minimum size."
}

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$stableWidth = [Math]::Min(420, $screen.Width - 160)
$stableHeight = [Math]::Min(640, $screen.Height - 160)
$stableLeft = $screen.Left + [int](($screen.Width - $stableWidth) / 2)
$stableTop = $screen.Top + [int](($screen.Height - $stableHeight) / 2)
[Win32WindowProbe]::MoveWindow($handle, $stableLeft, $stableTop, $stableWidth, $stableHeight, $true) | Out-Null
Start-Sleep -Milliseconds 500
$stable = Get-Rect $handle
Write-Step "Stable test rect: left=$($stable.Left), top=$($stable.Top), width=$($stable.Width), height=$($stable.Height)"

$target = $null
Wait-Until {
  try {
    $script:target = Get-CdpTarget $cdpPort
    [bool]$script:target -and $script:target.url -like "http://tauri.localhost*"
  } catch {
    $false
  }
} "WebView2 CDP app target" 10
Write-Step "CDP target: $($target.url)"
Connect-Cdp $target.webSocketDebuggerUrl | Out-Null
Wait-Until {
  [bool](Invoke-CdpExpression "document.readyState === 'complete' || document.readyState === 'interactive'")
} "document readiness" 10

[Win32WindowProbe]::SetForegroundWindow($handle) | Out-Null
Start-Sleep -Milliseconds 300

Test-BasicInputPath $handle $failures

Write-Step "Testing titlebar drag"
$dragBase = Get-Rect $handle
$dragCandidates = @(
  @{ Name = "dedicated-zone-estimate"; RelativeX = $dragBase.Width - 150 },
  @{ Name = "right-minus-190"; RelativeX = $dragBase.Width - 190 },
  @{ Name = "right-minus-170"; RelativeX = $dragBase.Width - 170 },
  @{ Name = "right-minus-130"; RelativeX = $dragBase.Width - 130 },
  @{ Name = "right-minus-110"; RelativeX = $dragBase.Width - 110 },
  @{ Name = "right-minus-90"; RelativeX = $dragBase.Width - 90 },
  @{ Name = "center"; RelativeX = [int]($dragBase.Width / 2) },
  @{ Name = "left-padding"; RelativeX = 24 }
)

$successfulDrag = $null
foreach ($candidate in $dragCandidates) {
  $result = Test-DragCandidate $handle $dragBase $candidate.Name $candidate.RelativeX $screen
  if ($result.Moved) {
    $successfulDrag = $result
    break
  }
}

if (-not $successfulDrag) {
  $failures.Add("Window did not move from any tested titlebar drag candidate.")
  $afterDrag = Get-Rect $handle
  Write-Step "FAIL: titlebar drag did not move the window"
} else {
  $afterDrag = $successfulDrag.Rect
  Write-Step "After drag rect: left=$($afterDrag.Left), top=$($afterDrag.Top), candidate=$($successfulDrag.Name)"
}

Write-Step "Testing left-edge hide"
$edgeY = [Math]::Max($screen.Top + 40, [Math]::Min($afterDrag.Top, $screen.Bottom - $afterDrag.Height - 40))
[Win32WindowProbe]::MoveWindow($handle, $screen.Left, $edgeY, $afterDrag.Width, $afterDrag.Height, $true) | Out-Null
Start-Sleep -Milliseconds 700

$atEdge = Get-Rect $handle
Write-Step "At-edge rect: left=$($atEdge.Left), top=$($atEdge.Top)"

try {
  Wait-Until {
    $script:windowPrefsAtEdge = Get-WindowPrefs
    $script:windowPrefsAtEdge -and $script:windowPrefsAtEdge.edge -eq "left"
  } "app state to detect left docked edge" 4
  Write-Step "Detected docked edge in app state: $($windowPrefsAtEdge.edge)"
} catch {
  $prefs = $script:windowPrefsAtEdge
  $edgeText = if ($prefs) { $prefs.edge } else { "<null>" }
  $failures.Add("$($_.Exception.Message). Current app edge=$edgeText")
  Write-Step "FAIL: $($_.Exception.Message). Current app edge=$edgeText"
}

[Win32WindowProbe]::SetForegroundWindow($handle) | Out-Null
Move-Mouse ($atEdge.Left + 24) ($atEdge.Top + 80)
Start-Sleep -Milliseconds 250
Move-Mouse ($atEdge.Right + 180) ($atEdge.Top + 80)

$hidden = $null
$hideSucceeded = $false
try {
  Wait-Until {
    $script:hidden = Get-Rect $handle
    $visibleStrip = $script:hidden.Right - $screen.Left
    $script:hidden.Left -lt $screen.Left -and $visibleStrip -gt 0 -and $visibleStrip -le 32
  } "window to auto-hide after mouse leaves left edge" 6
  $hideSucceeded = $true
  Write-Step "Hidden rect: left=$($hidden.Left), visibleStrip=$($hidden.Right - $screen.Left)"
} catch {
  $failures.Add($_.Exception.Message)
  Write-Step "FAIL: $($_.Exception.Message)"
}

if ($hideSucceeded) {
  Write-Step "Testing reveal from visible strip"
  Move-Mouse ($screen.Left + 12) ($hidden.Top + 80)

  $revealed = $null
  try {
    Wait-Until {
      $script:revealed = Get-Rect $handle
      $script:revealed.Left -ge ($screen.Left - 2) -and $script:revealed.Left -le ($screen.Left + 12)
    } "window to reveal when pointer enters visible strip" 6
    Write-Step "Revealed rect: left=$($revealed.Left), top=$($revealed.Top)"
  } catch {
    $failures.Add($_.Exception.Message)
    Write-Step "FAIL: $($_.Exception.Message)"
  }
} else {
  $failures.Add("Reveal check skipped because auto-hide did not succeed.")
  Write-Step "Skipping reveal check because auto-hide did not succeed"
}

Cleanup

if ($failures.Count -gt 0) {
  throw "FAILED window checks: $($failures -join '; ')"
}

Write-Step "PASS: installed Windows app startup, window move, hide/reveal, and basic input checks passed"
