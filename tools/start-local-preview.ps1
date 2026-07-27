param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$previewUrl = "http://127.0.0.1:$Port/tests/dratek-eink-panel-harness.html"
$server = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)

$mimeTypes = @{
    ".html"  = "text/html; charset=utf-8"
    ".js"    = "text/javascript; charset=utf-8"
    ".css"   = "text/css; charset=utf-8"
    ".json"  = "application/json; charset=utf-8"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".svg"   = "image/svg+xml"
    ".ttf"   = "font/ttf"
    ".woff2" = "font/woff2"
}

try {
    $server.Start()
    Write-Host ""
    Write-Host "DRATEK eInk local preview" -ForegroundColor Cyan
    Write-Host $previewUrl -ForegroundColor Green
    Write-Host "Server ukoncite klavesami Ctrl+C." -ForegroundColor DarkGray
    Write-Host ""

    if (-not $NoBrowser) {
        Start-Process $previewUrl
    }

    while ($true) {
        $client = $server.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [IO.StreamReader]::new(
                $stream,
                [Text.Encoding]::ASCII,
                $false,
                1024,
                $true
            )
            $requestLine = $reader.ReadLine()
            while ($reader.ReadLine()) {}

            $requestParts = $requestLine -split " "
            $method = $requestParts[0]
            $requestPath = if ($requestParts.Count -ge 2) {
                ($requestParts[1] -split "\?", 2)[0]
            } else {
                "/"
            }

            $relativePath = [Uri]::UnescapeDataString($requestPath).TrimStart("/")
            if (-not $relativePath) {
                $relativePath = "tests/dratek-eink-panel-harness.html"
            }

            $requestedPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $relativePath))
            $insideRepository = $requestedPath.StartsWith(
                $repoRoot + [IO.Path]::DirectorySeparatorChar,
                [StringComparison]::OrdinalIgnoreCase
            )

            if ($method -notin @("GET", "HEAD")) {
                $status = "405 Method Not Allowed"
                $contentType = "text/plain; charset=utf-8"
                $payload = [Text.Encoding]::UTF8.GetBytes("Method not allowed")
            } elseif (-not $insideRepository -or -not (Test-Path -LiteralPath $requestedPath -PathType Leaf)) {
                $status = "404 Not Found"
                $contentType = "text/plain; charset=utf-8"
                $payload = [Text.Encoding]::UTF8.GetBytes("Not found")
            } else {
                $status = "200 OK"
                $extension = [IO.Path]::GetExtension($requestedPath).ToLowerInvariant()
                $contentType = if ($mimeTypes.ContainsKey($extension)) {
                    $mimeTypes[$extension]
                } else {
                    "application/octet-stream"
                }
                $payload = [IO.File]::ReadAllBytes($requestedPath)
            }

            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($payload.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($headers)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne "HEAD") {
                $stream.Write($payload, 0, $payload.Length)
            }
            $stream.Flush()
        } finally {
            $client.Close()
        }
    }
} finally {
    $server.Stop()
}
