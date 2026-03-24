# Production audd.io API token setup script
# This script configures the audd.io API token in AWS SSM Parameter Store.
# Run this BEFORE deploy.ps1 if you need track recognition enabled.

$env:AWS_PROFILE = "default"

Write-Host "Production audd.io API Token Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Test AWS CLI connectivity
Write-Host "`nTesting AWS CLI connectivity (Production)..." -ForegroundColor Cyan
aws sts get-caller-identity --profile default
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cannot connect to AWS. Please configure your credentials." -ForegroundColor Red
    exit 1
}

# Load site configuration to get SSM prefix
$config = Get-Content "site.config.json" -ErrorAction Stop | ConvertFrom-Json
$ssmPrefix = $config._derived.ssmPrefix 2>$null
if (-not $ssmPrefix) {
    # Derive prefix from domainName if _derived is not in JSON
    $domainName = $config.site.domainName
    $ssmPrefix = "/" + (($domainName -replace '\.(com|org|net|io|dev|app)$', '') -replace '\.', '-') + "/secrets"
}

Write-Host "Using SSM prefix: $ssmPrefix" -ForegroundColor Cyan

# Check if token already exists
Write-Host "`nChecking for existing audd.io API token in SSM..." -ForegroundColor Cyan
$existingToken = aws ssm get-parameter --name "$ssmPrefix/audd-api-token" --with-decryption --query "Parameter.Value" --output text --profile default 2>$null
if ($LASTEXITCODE -eq 0 -and $existingToken) {
    Write-Host "audd.io API token already configured." -ForegroundColor Green
    $continue = Read-Host "Do you want to update it? (yes/no)"
    if ($continue -ne "yes") {
        Write-Host "No changes made. Exiting." -ForegroundColor Yellow
        exit 0
    }
}

# Prompt user for audd.io API token
Write-Host "`nEnter your audd.io API token." -ForegroundColor Yellow
Write-Host "Get one from: https://dashboard.audd.io/" -ForegroundColor Yellow
Write-Host ""

$auddApiToken = Read-Host "audd.io API Token" -AsSecureString
$auddApiTokenPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($auddApiToken))

# Validate input
if ([string]::IsNullOrWhiteSpace($auddApiTokenPlain)) {
    Write-Host "ERROR: audd.io API token is required." -ForegroundColor Red
    exit 1
}

# Store in SSM Parameter Store
Write-Host "`nStoring audd.io API token in SSM Parameter Store..." -ForegroundColor Cyan

aws ssm put-parameter `
  --name "$ssmPrefix/audd-api-token" `
  --value "$auddApiTokenPlain" `
  --type SecureString `
  --overwrite `
  --profile default
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to store audd.io API token." -ForegroundColor Red
    exit 1
}

Write-Host "audd.io API token stored successfully!" -ForegroundColor Green

# Now you need to enable it in the site config
Write-Host "`nIMPORTANT: You must enable track recognition in site.config.json:" -ForegroundColor Yellow
Write-Host '  "audd": {' -ForegroundColor Yellow
Write-Host '    "trackRecognition": true' -ForegroundColor Yellow
Write-Host '  }' -ForegroundColor Yellow
Write-Host "" -ForegroundColor Yellow
Write-Host "After updating site.config.json, run ./deploy.ps1 to deploy with track recognition enabled." -ForegroundColor Yellow
