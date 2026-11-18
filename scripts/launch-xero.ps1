$ErrorActionPreference = 'SilentlyContinue'
$TargetUrl = 'http://localhost:3000'

for ($i = 0; $i -lt 30; $i++) {
  try {
    $res = Invoke-WebRequest -Uri "$TargetUrl/api/health" -TimeoutSec 2 -UseBasicParsing
    if ($res.StatusCode -eq 200) { break }
  } catch {}
  Start-Sleep -Milliseconds 500
}

$Edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$Chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"

if (Test-Path $Edge) {
  Start-Process $Edge "--app=$TargetUrl --window-size=1280,820"
} elseif (Test-Path $Chrome) {
  Start-Process $Chrome "--app=$TargetUrl --window-size=1280,820"
} else {
  Start-Process $TargetUrl
}
