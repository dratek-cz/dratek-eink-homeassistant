param(
    [string]$Remote = "origin",
    [string]$Branch = "main",
    [string]$TokenFile = $env:DRATEK_GITHUB_TOKEN_FILE,
    [string]$GitPath = "git",
    [switch]$PushTags
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $TokenFile) {
    $workspaceRoot = Split-Path -Parent $repoRoot
    $TokenFile = Join-Path $workspaceRoot "github\accesstoken.txt"
}

if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "Soubor s GitHub tokenem nebyl nalezen. Použij -TokenFile nebo DRATEK_GITHUB_TOKEN_FILE."
}

$token = (Get-Content -Raw -LiteralPath $TokenFile).Trim()
if (-not $token) {
    throw "Soubor s GitHub tokenem je prázdný."
}

$git = Get-Command $GitPath -ErrorAction Stop
$credentials = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("x-access-token:$token")
)

# 1. Determine version and tag name
$manifestPath = Join-Path $repoRoot "custom_components\dratek_eink\manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version
$tagName = "v$version"

# 2. Push branch
& $git.Source -C $repoRoot -c "http.extraHeader=AUTHORIZATION: basic $credentials" push $Remote $Branch
if ($LASTEXITCODE -ne 0) {
    throw "Push větve $Branch selhal."
}

# 3. Push tags
if ($PushTags) {
    & $git.Source -C $repoRoot -c "http.extraHeader=AUTHORIZATION: basic $credentials" push $Remote $tagName
    if ($LASTEXITCODE -ne 0) {
        throw "Push tagu $tagName selhal."
    }
}

# 4. Create zip package for HACS

$tempDir = Join-Path $env:TEMP "dratek_eink_zip_build"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
New-Item -ItemType Directory -Path $tempDir | Out-Null
# $env:TEMP can use a DOS 8.3 alias (for example ECLIPS~1), while child
# FileInfo paths use the long name. Normalize before calculating substrings.
$tempDir = (Get-Item -LiteralPath $tempDir).FullName
$targetFolder = Join-Path $tempDir "dratek_eink"
New-Item -ItemType Directory -Path $targetFolder | Out-Null
Copy-Item -Recurse -Path (Join-Path $repoRoot "custom_components\dratek_eink\*") -Destination $targetFolder
# Bytecode from the developer machine is useless to users - Home Assistant
# recompiles for its own interpreter - and a stale .pyc only adds weight to
# every download. Copy-Item has no reliable recursive -Exclude, so prune after.
Get-ChildItem -LiteralPath $targetFolder -Recurse -Directory -Filter "__pycache__" |
    Sort-Object { $_.FullName.Length } -Descending |
    Remove-Item -Recurse -Force
# -Include is silently ignored next to -LiteralPath, which made this match every
# file in the package and empty the whole zip. Filter on the extension instead.
Get-ChildItem -LiteralPath $targetFolder -Recurse -File |
    Where-Object { $_.Extension -in ".pyc", ".pyo" } |
    Remove-Item -Force

$zipPath = Join-Path $repoRoot "dratek_eink.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
    $zipPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    # HACS extracts a zip_release directly into
    # /config/custom_components/dratek_eink, so archive the integration
    # contents without another dratek_eink/ directory around them.
    Get-ChildItem -LiteralPath $targetFolder -Recurse -File | ForEach-Object {
        # ZIP uses forward slashes on every platform. Backslashes created on
        # Windows are not directory separators when HACS extracts on Linux.
        $entryName = $_.FullName.Substring($targetFolder.Length).TrimStart("\", "/").Replace("\", "/")
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $_.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}
Write-Output "Vytvořen zip balíček pro HACS: dratek_eink.zip ($(Get-Item $zipPath | Select-Object -ExpandProperty Length) bajtů)."

# 4. Extract release notes from README.md in explicit UTF-8
$readmePath = Join-Path $repoRoot "README.md"
$readmeText = Get-Content -Raw -Encoding UTF8 $readmePath
$releaseBody = "DRATEK eInk $tagName"
if ($readmeText -match "(?s)## Novinky ve verzi $version\s*\r?\n\r?\n(.*?)(?=\r?\n## |\z)") {
    $releaseBody = $matches[1].Trim()
}

# 5. Create or update GitHub Release & upload asset
$headers = @{
    "Authorization" = "token $token"
    "User-Agent"    = "PowerShell-DRATEK"
    "Accept"        = "application/vnd.github+json"
}

$releasesUrl = "https://api.github.com/repos/dratek-cz/dratek-eink-homeassistant/releases"
$existingReleases = Invoke-RestMethod -Uri $releasesUrl -Headers $headers
$release = $existingReleases | Where-Object { $_.tag_name -eq $tagName }

if (-not $release) {
    Write-Output "Vytvářím oficiální GitHub Release pro $tagName z README.md v UTF-8..."
    $payloadJson = @{
        tag_name   = $tagName
        name       = "DRATEK eInk $tagName"
        body       = $releaseBody
        draft      = $false
        prerelease = $false
    } | ConvertTo-Json

    $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($payloadJson)
    $req = [System.Net.HttpWebRequest]::Create($releasesUrl)
    $req.Method = "POST"
    $req.Headers.Add("Authorization", "token $token")
    $req.UserAgent = "PowerShell-DRATEK"
    $req.ContentType = "application/json; charset=utf-8"
    $stream = $req.GetRequestStream()
    $stream.Write($utf8Bytes, 0, $utf8Bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $responseJson = $reader.ReadToEnd()
    $resp.Close()
    $release = $responseJson | ConvertFrom-Json
    Write-Output "GitHub Release $tagName byl úspěšně vytvořen! (ID: $($release.id))"
}

# 6. Upload asset dratek_eink.zip
$existingAsset = $release.assets | Where-Object { $_.name -eq "dratek_eink.zip" }
if ($existingAsset) {
    $deleteUrl = "https://api.github.com/repos/dratek-cz/dratek-eink-homeassistant/releases/assets/$($existingAsset.id)"
    Invoke-RestMethod -Uri $deleteUrl -Method Delete -Headers $headers
}

$uploadUrl = $release.upload_url -replace '\{\?name,label\}', '?name=dratek_eink.zip'
$zipBytes = [System.IO.File]::ReadAllBytes($zipPath)
$uploadHeaders = @{
    "Authorization" = "token $token"
    "User-Agent"    = "PowerShell-DRATEK"
    "Content-Type"  = "application/zip"
}
$uploadedAsset = Invoke-RestMethod -Uri $uploadUrl -Method Post -Headers $uploadHeaders -Body $zipBytes
Write-Output "Asset dratek_eink.zip byl nahrán k GitHub Release $tagName! (Velikost: $($uploadedAsset.size) bajtů)"

Write-Output "Vydání $tagName pro HACS i Git remote bylo kompletně dokončeno."
