param(
    [string]$StartDate,
    [string]$EndDate,
    [string]$Freq,
    [switch]$SkipDeps
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[ml-train] $Message"
}

$mlRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$venvPath = Join-Path $mlRoot ".venv"
$venvPython = Join-Path $venvPath "Scripts/python.exe"

if (-not (Test-Path $venvPath)) {
    Write-Info "Creating virtual environment at $venvPath"
    python -m venv $venvPath
}

if (-not (Test-Path $venvPython)) {
    throw "Python executable not found at $venvPython. Check your Python installation."
}

if (-not $SkipDeps.IsPresent) {
    Write-Info "Installing Python dependencies"
    & $venvPython -m pip install --upgrade pip | Out-Null
    & $venvPython -m pip install -r (Join-Path $mlRoot "requirements.txt")
}

$envPath = Join-Path $mlRoot ".env"
$envExample = Join-Path $mlRoot ".env.example"
if (-not (Test-Path $envPath) -and (Test-Path $envExample)) {
    Write-Info "Creating .env from template"
    Copy-Item $envExample $envPath
}

if (-not $Freq) {
    if ($env:ML_FEATURE_FREQ) {
        $Freq = $env:ML_FEATURE_FREQ
    } else {
        $Freq = "M"
    }
}

$arguments = @("-m", "src.train")

if ($StartDate) {
    $arguments += @("--start-date", $StartDate)
}
if ($EndDate) {
    $arguments += @("--end-date", $EndDate)
}
if ($Freq) {
    $arguments += @("--freq", $Freq)
}

Write-Info "Running training job"
& $venvPython $arguments

if ($LASTEXITCODE -ne 0) {
    throw "Training job failed with exit code $LASTEXITCODE"
}

Write-Info "Training completed successfully"
