# Delete every GitHub Release and tag except the two that are being kept.
#
# IRREVERSIBLE. Afterwards nobody can install or roll back to any older
# version - not through HACS, not by downloading its ZIP. The commits stay in
# git history; the releases and their archives do not.
#
# Run AFTER scripts\publish-all-releases.ps1, never before: this deletes
# everything it does not recognise, and a release that has not been created
# yet is not recognised.
#
#   powershell -ExecutionPolicy Bypass -File scripts\cleanup-old-releases.ps1
#
# Add -WhatIf to list what would go without touching anything. Do that first.

[CmdletBinding()]
param(
  [string] $TokenFile = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "github\accesstoken.txt"),
  [string] $Repo = "dratek-cz/dratek-eink-homeassistant",
  [string[]] $Keep = @("v1.0.1", "v1.0.0-rc.1"),
  [switch] $WhatIf
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $TokenFile)) { throw "Token file not found: $TokenFile" }
$token = (Get-Content $TokenFile -Raw).Trim()
$headers = @{
  Authorization          = "Bearer $token"
  Accept                 = "application/vnd.github+json"
  "User-Agent"           = "dratek-eink-release"
  "X-GitHub-Api-Version" = "2022-11-28"
}

Write-Host "Keeping: $($Keep -join ', ')" -ForegroundColor Cyan

# Every release, a page at a time - there are a few hundred.
$releases = @()
for ($page = 1; ; $page++) {
  $batch = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=100&page=$page" -Headers $headers
  if (-not $batch -or $batch.Count -eq 0) { break }
  $releases += $batch
}
$doomedReleases = $releases | Where-Object { $Keep -notcontains $_.tag_name }

# Tags outlive their release, so they are collected separately rather than
# assumed to match: a tag with no release would otherwise survive the sweep.
$allTags = (git ls-remote --tags origin) |
  ForEach-Object { ($_ -split "\s+")[1] } |
  Where-Object { $_ -and $_ -notmatch "\^\{\}$" } |
  ForEach-Object { $_ -replace "^refs/tags/", "" } |
  Sort-Object -Unique
$doomedTags = $allTags | Where-Object { $Keep -notcontains $_ }

Write-Host "Releases to delete: $($doomedReleases.Count) of $($releases.Count)"
Write-Host "Tags to delete:     $($doomedTags.Count) of $($allTags.Count)"

foreach ($keeper in $Keep) {
  if ($releases.tag_name -notcontains $keeper) {
    throw "$keeper has no release yet. Run scripts\publish-all-releases.ps1 first - otherwise this would leave the repository with none at all."
  }
}

if ($WhatIf) {
  Write-Host ""
  Write-Host "-WhatIf: nothing was deleted. Would remove:" -ForegroundColor Yellow
  $doomedReleases | ForEach-Object { Write-Host "  release $($_.tag_name)" }
  Write-Host "  ... and $($doomedTags.Count) tags"
  return
}

Write-Host ""
Write-Host "This cannot be undone. No older version will be installable afterwards." -ForegroundColor Red
$answer = Read-Host "Type DELETE to continue"
if ($answer -cne "DELETE") { Write-Host "Cancelled."; return }

$done = 0
foreach ($release in $doomedReleases) {
  Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$Repo/releases/$($release.id)" -Headers $headers | Out-Null
  $done++
  if ($done % 25 -eq 0) { Write-Host "  deleted $done/$($doomedReleases.Count) releases" }
}
Write-Host "Deleted $done releases."

# In batches: one push per tag would be several hundred round trips.
$batchSize = 50
for ($i = 0; $i -lt $doomedTags.Count; $i += $batchSize) {
  $batch = $doomedTags[$i..([Math]::Min($i + $batchSize - 1, $doomedTags.Count - 1))]
  git push origin --delete @batch
  if ($LASTEXITCODE -ne 0) { throw "Deleting remote tags failed at batch starting $($batch[0])" }
  Write-Host "  deleted $([Math]::Min($i + $batchSize, $doomedTags.Count))/$($doomedTags.Count) tags"
}

git tag | Where-Object { $Keep -notcontains $_ } | ForEach-Object { git tag -d $_ | Out-Null }

Write-Host ""
Write-Host "Done. Remaining releases:" -ForegroundColor Green
(Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=100" -Headers $headers) |
  ForEach-Object { Write-Host "  $($_.tag_name)  prerelease=$($_.prerelease)" }
