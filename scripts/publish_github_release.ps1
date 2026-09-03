# Publish a GitHub Release for an already-pushed tag, with the HACS ZIP attached.
#
# HACS is configured with "zip_release": true and "filename": "dratek_eink.zip"
# (see hacs.json), so it looks for a *Release* carrying that asset. A pushed tag
# on its own is invisible to it - which is exactly how v0.1.352 first went out.
#
# Run from the repository root:
#
#   powershell -ExecutionPolicy Bypass -File scripts\publish_github_release.ps1 -Version 0.1.352
#
# The token is read from a file and sent straight to GitHub; it is never echoed,
# logged, or written anywhere by this script.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string] $Version,
  [string] $TokenFile = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "github\accesstoken.txt"),
  [string] $Repo = "dratek-cz/dratek-eink-homeassistant",
  [string] $ZipPath = "dratek_eink.zip",
  # A build nobody should be updated onto by accident - a demo build with
  # invented data, say. HACS offers prereleases only to users who have turned
  # beta versions on for this repository, so the stable channel never sees it.
  [switch] $Prerelease
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"

if (-not (Test-Path $TokenFile)) { throw "Token file not found: $TokenFile" }
if (-not (Test-Path $ZipPath))   { throw "Release archive not found: $ZipPath. Run: python scripts\build_release.py dratek_eink.zip" }

# The archive must be the one built from the tagged commit, not a stale copy.
$manifestVersion = (& python -c @"
import json, sys
from zipfile import ZipFile
print(json.loads(ZipFile(sys.argv[1]).read('manifest.json'))['version'])
"@ $ZipPath).Trim()
if ($manifestVersion -ne $Version) {
  throw "$ZipPath contains version $manifestVersion, not $Version. Rebuild it first."
}

$token = (Get-Content $TokenFile -Raw).Trim()
$headers = @{
  Authorization          = "Bearer $token"
  Accept                 = "application/vnd.github+json"
  "User-Agent"           = "dratek-eink-release"
  "X-GitHub-Api-Version" = "2022-11-28"
}

# The changelog section for this version becomes the release notes, so the
# release page says the same thing CHANGELOG.md does.
$notesLines = & python -c @"
import re, sys
text = open('CHANGELOG.md', encoding='utf-8').read()
match = re.search(r'^## \[' + re.escape(sys.argv[1]) + r'\].*?(?=^## \[|\Z)', text, re.S | re.M)
sys.stdout.write(match.group(0).strip() if match else '')
"@ $Version
$notes = [string]::Join("`n", $notesLines)

if ($Prerelease) { Write-Host "Marking $tag as a PRERELEASE - HACS stable will not offer it." }
Write-Host "Creating release $tag on $Repo ..."
$body = @{ tag_name = $tag; name = $tag; body = $notes; draft = $false; prerelease = [bool]$Prerelease } | ConvertTo-Json -Depth 3
try {
  $release = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$Repo/releases" `
    -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json"
} catch {
  # Already there (a re-run, or a release made in the web UI): reuse it rather
  # than failing, so the asset upload below can still complete.
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$tag" -Headers $headers
  Write-Host "Release already existed; reusing it."
}

# A half-uploaded asset from an interrupted run would shadow the good one.
foreach ($asset in $release.assets) {
  if ($asset.name -eq "dratek_eink.zip") {
    Write-Host "Removing the existing dratek_eink.zip asset ..."
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" -Headers $headers | Out-Null
  }
}

$uploadUrl = $release.upload_url -replace '\{.*\}', '?name=dratek_eink.zip'
Write-Host "Uploading $ZipPath ($([math]::Round((Get-Item $ZipPath).Length / 1MB, 2)) MB) ..."
$uploaded = Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers $headers `
  -InFile $ZipPath -ContentType "application/zip"

Write-Host ""
Write-Host "Published: $($release.html_url)"
Write-Host "Asset:     $($uploaded.name)  $([math]::Round($uploaded.size / 1MB, 2)) MB  state=$($uploaded.state)"
Write-Host ""
Write-Host "In Home Assistant: HACS -> the three dots -> Reload data, then look at DRATEK eInk."
