param(
    [string]$PythonPath = "python",
    [string]$NodePath = "node"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

& $PythonPath -m compileall -q (Join-Path $repoRoot "custom_components\dratek_eink")
if ($LASTEXITCODE -ne 0) {
    throw "Kompilace Python souborů selhala."
}

& $PythonPath -m unittest discover -s (Join-Path $repoRoot "tests") -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) {
    throw "Unit testy selhaly."
}

& $NodePath --check (Join-Path $repoRoot "custom_components\dratek_eink\frontend\dratek-eink-panel.js")
if ($LASTEXITCODE -ne 0) {
    throw "Kontrola hlavního JavaScript panelu selhala."
}

& $NodePath --check (Join-Path $repoRoot "custom_components\dratek_eink\frontend\dratek-eink-overview-card.js")
if ($LASTEXITCODE -ne 0) {
    throw "Kontrola JavaScript dashboardové karty selhala."
}

Write-Output "Všechny kontroly projektu prošly."
