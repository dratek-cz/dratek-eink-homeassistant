# Publish both releases in one go, so HACS can actually see them.
#
#   v1.0.1        retail build from main            -> latest, HACS stable
#   v1.0.0-rc.1   internal / showroom build         -> prerelease
#
# Each one needs its OWN dratek_eink.zip, because the two builds differ: the
# showroom one carries the "Logo Drátek" broadcast and the retail one does not.
# So the archive is rebuilt from each tag rather than uploaded twice.
#
# hacs.json sets "zip_release": true, which is why a pushed tag on its own
# changes nothing - HACS looks for a Release carrying that asset.
#
# Run from the repository root:
#
#   powershell -ExecutionPolicy Bypass -File scripts\publish-all-releases.ps1
#
# The token is read from disk by publish_github_release.ps1 and sent straight
# to GitHub, exactly as when publishing a single release by hand.

[CmdletBinding()]
param(
  [string] $TokenFile = (Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) "github\accesstoken.txt")
)

$ErrorActionPreference = "Stop"

function Publish([string] $Ref, [string] $Version, [switch] $Prerelease) {
  Write-Host ""
  Write-Host "=== $Version (from $Ref) ===" -ForegroundColor Cyan
  git checkout --quiet $Ref
  if ($LASTEXITCODE -ne 0) { throw "Could not check out $Ref" }
  python scripts\build_release.py dratek_eink.zip
  if ($LASTEXITCODE -ne 0) { throw "Building the archive for $Version failed" }
  # Not $args - that is an automatic variable in PowerShell.
  $publishArgs = @("-ExecutionPolicy", "Bypass", "-File", "scripts\publish_github_release.ps1",
                   "-Version", $Version, "-TokenFile", $TokenFile)
  if ($Prerelease) { $publishArgs += "-Prerelease" }
  & powershell @publishArgs
  if ($LASTEXITCODE -ne 0) { throw "Publishing $Version failed" }
}

# A dirty tree would make the tag checkout below fail half way through.
# Only tracked changes matter: an untracked file (these scripts, if they have
# not been committed) travels across a checkout untouched, and dratek_eink.zip
# is gitignored anyway.
$dirty = (git status --porcelain) | Where-Object { $_ -notmatch "^\?\?" -and $_ -notmatch "dratek_eink\.zip" }
if ($dirty) {
  Write-Host "Working tree is not clean:" -ForegroundColor Yellow
  $dirty | ForEach-Object { Write-Host "  $_" }
  throw "Commit or stash first - this script moves between main and a tag."
}

$startingBranch = (git rev-parse --abbrev-ref HEAD).Trim()

try {
  Publish -Ref "main"        -Version "1.0.1"
  Publish -Ref "v1.0.0-rc.1" -Version "1.0.0-rc.1" -Prerelease
}
finally {
  # Always come back, including after a failure part way through - a detached
  # HEAD left behind is the kind of thing that bites an hour later.
  Write-Host ""
  Write-Host "Returning to $startingBranch ..."
  git checkout --quiet $startingBranch
  python scripts\build_release.py dratek_eink.zip
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "In Home Assistant: HACS -> the three dots -> Reload data, then open DRATEK eInk."
Write-Host "1.0.1 is the one to install; 1.0.0-rc.1 shows only with beta versions enabled."
