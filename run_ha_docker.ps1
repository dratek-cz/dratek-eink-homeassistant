# Helper script to run Home Assistant in Docker for testing custom_components/dratek_eink

$projectDir = $PSScriptRoot
$configDir = Join-Path $projectDir "ha_config"
$customComponentsDir = Join-Path $projectDir "custom_components"

if (!(Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
    Write-Host "Vytvořen adresář pro konfiguraci: $configDir" -ForegroundColor Green
}

Write-Host "Spouštění Home Assistant v Dockeru..." -ForegroundColor Cyan

docker run -d `
  --name homeassistant `
  --restart=unless-stopped `
  -e TZ=Europe/Prague `
  -p 8123:8123 `
  -v "${configDir}:/config" `
  -v "${customComponentsDir}:/config/custom_components" `
  ghcr.io/home-assistant/home-assistant:stable

if ($LASTEXITCODE -eq 0) {
    Write-Host "Kontejner úspěšně spuštěn!" -ForegroundColor Green
    Write-Host "Home Assistant bude za okamžik dostupný na adrese: http://localhost:8123" -ForegroundColor Yellow
} else {
    Write-Host "Chyba při spouštění Docker kontejneru. Ujistěte se, že je Docker Desktop spuštěn." -ForegroundColor Red
}
