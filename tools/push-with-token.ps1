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

& $git.Source -C $repoRoot -c "http.extraHeader=AUTHORIZATION: basic $credentials" push $Remote $Branch
if ($LASTEXITCODE -ne 0) {
    throw "Push větve $Branch selhal."
}

if ($PushTags) {
    & $git.Source -C $repoRoot -c "http.extraHeader=AUTHORIZATION: basic $credentials" push $Remote --tags
    if ($LASTEXITCODE -ne 0) {
        throw "Push tagů selhal."
    }
}

Write-Output "Push do $Remote dokončen bez uložení tokenu do Git remote URL."
