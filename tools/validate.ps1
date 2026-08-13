param(
    [string]$PythonPath = "python",
    [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

# Windows PowerShell 5.1 turns any stderr output from a native program into a
# terminating NativeCommandError while $ErrorActionPreference is "Stop". Python's
# unittest runner writes its progress to stderr, so the checks below have to run
# with the preference relaxed and report failure through $LASTEXITCODE instead.
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Executable,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$FailureMessage
    )

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Executable @Arguments
    } finally {
        $ErrorActionPreference = $previous
    }

    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

if (-not (Get-Command $PythonPath -ErrorAction SilentlyContinue)) {
    throw "Python nebyl nalezen ($PythonPath). Predejte cestu prepinacem -PythonPath."
}
if (-not (Get-Command $NodePath -ErrorAction SilentlyContinue)) {
    throw "Node.js nebyl nalezen ($NodePath). Nainstalujte jej (winget install OpenJS.NodeJS.LTS) nebo predejte cestu prepinacem -NodePath."
}

# Several Python regression tests execute small JavaScript reference snippets
# through the plain `node` command. When -NodePath points to a bundled runtime
# outside PATH, make that same runtime visible to those child processes too.
$nodeCommand = Get-Command $NodePath -ErrorAction Stop
$nodeDirectory = Split-Path -Parent $nodeCommand.Source
if ($nodeDirectory -and (($env:PATH -split ";") -notcontains $nodeDirectory)) {
    $env:PATH = "$nodeDirectory;$env:PATH"
}

Invoke-Native -Executable $PythonPath `
    -Arguments @("-m", "compileall", "-q", (Join-Path $repoRoot "custom_components\dratek_eink")) `
    -FailureMessage "Kompilace Python souboru selhala."

Invoke-Native -Executable $PythonPath `
    -Arguments @("-m", "unittest", "discover", "-s", (Join-Path $repoRoot "tests"), "-p", "test_*.py", "-v") `
    -FailureMessage "Unit testy selhaly."

Invoke-Native -Executable $NodePath `
    -Arguments @("--check", (Join-Path $repoRoot "custom_components\dratek_eink\frontend\dratek-eink-panel.js")) `
    -FailureMessage "Kontrola hlavniho JavaScript panelu selhala."

Invoke-Native -Executable $NodePath `
    -Arguments @("--check", (Join-Path $repoRoot "custom_components\dratek_eink\frontend\dratek-eink-overview-card.js")) `
    -FailureMessage "Kontrola JavaScript dashboardove karty selhala."

Write-Output "Vsechny kontroly projektu prosly."
