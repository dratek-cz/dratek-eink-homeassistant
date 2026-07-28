param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$previewUrl = "http://127.0.0.1:$Port/tests/dratek-eink-panel-harness.html"
$server = [Net.HttpListener]::new()
$server.Prefixes.Add("http://127.0.0.1:$Port/")

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
        $context = $server.GetContext()
        try {
            $request = $context.Request
            $response = $context.Response
            $method = $request.HttpMethod
            $requestPath = $request.Url.AbsolutePath

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

            $response.StatusCode = [int]($status -split " ", 2)[0]
            $response.ContentType = $contentType
            $response.ContentLength64 = $payload.Length
            $response.Headers["Cache-Control"] = "no-store"
            if ($method -ne "HEAD") {
                $response.OutputStream.Write($payload, 0, $payload.Length)
            }
            $response.OutputStream.Close()
        } finally {
            $context.Response.Close()
        }
    }
} finally {
    $server.Stop()
}
