<#
.SYNOPSIS
    Builds ReefLog.exe, a single-file Windows app around the published site.

.DESCRIPTION
    Requires the .NET SDK. If it is missing, install it once with:

        winget install Microsoft.DotNet.SDK.8

    That needs an administrator prompt, so it has to be run by you rather than
    from an automated session.

    The result is a self-contained executable: no .NET installation needed on
    whatever machine it ends up on. Rendering uses the Edge WebView2 runtime,
    which ships with Windows 11 and with Edge.

.EXAMPLE
    .\build.ps1
    .\build.ps1 -Output "C:\Users\me\Desktop"
#>
[CmdletBinding()]
param(
    [string]$Output = "$PSScriptRoot\dist",
    [switch]$Framework   # smaller exe, but the target machine needs .NET 8
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Host "The .NET SDK is not installed." -ForegroundColor Red
    Write-Host "Install it once with:  winget install Microsoft.DotNet.SDK.8"
    exit 1
}

$sdks = & dotnet --list-sdks 2>$null
if (-not $sdks) {
    Write-Host "dotnet is present but no SDK is installed (runtime only)." -ForegroundColor Red
    Write-Host "Install the SDK with:  winget install Microsoft.DotNet.SDK.8"
    exit 1
}

Write-Host ""
Write-Host "  Building Reef Log for Windows" -ForegroundColor Cyan
Write-Host "  SDK: $((($sdks | Select-Object -First 1) -split ' ')[0])"
Write-Host "  Out: $Output"
Write-Host ""

$args = @(
    'publish', "$PSScriptRoot\ReefLog.csproj",
    '-c', 'Release',
    '-o', $Output,
    '--nologo'
)
if ($Framework) {
    $args += @('-p:SelfContained=false', '-p:PublishSingleFile=true')
}

& dotnet @args
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; exit $LASTEXITCODE }

$exe = Join-Path $Output 'ReefLog.exe'
if (Test-Path $exe) {
    Write-Host ""
    Write-Host ("  Built {0} ({1:N1} MB)" -f $exe, ((Get-Item $exe).Length / 1MB)) -ForegroundColor Green
    Write-Host ""
    Write-Host "  It is unsigned, so the first run shows 'Windows protected your PC'."
    Write-Host "  Choose More info, then Run anyway. A signing certificate is the only"
    Write-Host "  way to remove that, and it is a paid yearly thing."
} else {
    Write-Host "Build reported success but ReefLog.exe was not found in $Output" -ForegroundColor Yellow
}
