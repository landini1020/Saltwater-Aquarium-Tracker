<#
.SYNOPSIS
    Serves this folder over http://localhost:8080 so Reef Log can be opened in a browser.

.DESCRIPTION
    Browsers refuse to load ES modules and service workers from file:// URLs, so the app
    needs a real HTTP origin. This uses .NET's built-in HttpListener - no Node, no Python,
    no installs required.

.EXAMPLE
    .\serve.ps1
    .\serve.ps1 -Port 3000
#>
[CmdletBinding()]
param(
    [int]$Port = 8080,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.ico'  = 'image/x-icon'
    '.txt'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/markdown; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Could not bind $prefix" -ForegroundColor Red
    Write-Host "Port $Port may already be in use. Try: .\serve.ps1 -Port 8081" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "  Reef Log dev server" -ForegroundColor Cyan
Write-Host "  Serving $root"
Write-Host "  $prefix" -ForegroundColor Green
Write-Host "  Press Ctrl+C to stop."
Write-Host ""

if (-not $NoBrowser) { Start-Process $prefix | Out-Null }

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response

        try {
            $relative = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $relative = $relative -replace '/', [IO.Path]::DirectorySeparatorChar

            $full = [IO.Path]::GetFullPath((Join-Path $root $relative))

            # Refuse anything that escapes the served folder.
            if (-not $full.StartsWith([IO.Path]::GetFullPath($root), [StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 403
                $res.Close()
                continue
            }

            if ((Test-Path -LiteralPath $full -PathType Container)) {
                $full = Join-Path $full 'index.html'
            }

            if (Test-Path -LiteralPath $full -PathType Leaf) {
                $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
                $type = $mime[$ext]
                if (-not $type) { $type = 'application/octet-stream' }

                $bytes = [IO.File]::ReadAllBytes($full)
                $res.StatusCode = 200
                $res.ContentType = $type
                # No caching, so edits show up on refresh during development.
                $res.Headers.Add('Cache-Control', 'no-store, must-revalidate')
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host ("  200  /{0}" -f $relative.Replace('\', '/')) -ForegroundColor DarkGray
            } else {
                $body = [Text.Encoding]::UTF8.GetBytes("404 Not Found: /$relative")
                $res.StatusCode = 404
                $res.ContentType = 'text/plain; charset=utf-8'
                $res.ContentLength64 = $body.Length
                $res.OutputStream.Write($body, 0, $body.Length)
                Write-Host ("  404  /{0}" -f $relative.Replace('\', '/')) -ForegroundColor DarkYellow
            }
        } catch {
            $res.StatusCode = 500
            Write-Host ("  500  {0}" -f $_.Exception.Message) -ForegroundColor Red
        } finally {
            try { $res.Close() } catch { }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "Server stopped."
}
