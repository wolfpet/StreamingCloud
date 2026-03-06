# Production Google OAuth setup script
# This script configures Google OAuth credentials in AWS SSM Parameter Store.
# Run this BEFORE deploy.ps1 if you need Google OAuth enabled.

$env:AWS_PROFILE = "default"

Write-Host "Production Google OAuth Configuration Setup" -ForegroundColor Cyan
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

# Check if credentials already exist
Write-Host "`nChecking for existing Google OAuth credentials in SSM..." -ForegroundColor Cyan
$existingClientId = aws ssm get-parameter --name "$ssmPrefix/google-client-id" --with-decryption --query "Parameter.Value" --output text --profile default 2>$null
if ($LASTEXITCODE -eq 0 -and $existingClientId) {
    Write-Host "Google OAuth credentials already configured." -ForegroundColor Green
    $continue = Read-Host "Do you want to update them? (yes/no)"
    if ($continue -ne "yes") {
        Write-Host "No changes made. Exiting." -ForegroundColor Yellow
        exit 0
    }
}

# Prompt user for Google OAuth credentials
Write-Host "`nEnter your Google OAuth credentials from Google Cloud Console." -ForegroundColor Yellow
Write-Host "Get them from: https://console.cloud.google.com/apis/credentials" -ForegroundColor Yellow
Write-Host ""

$googleClientId = Read-Host "Google Client ID"
$googleClientSecret = Read-Host "Google Client Secret" -AsSecureString
$googleClientSecretPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($googleClientSecret))

# Validate inputs
if ([string]::IsNullOrWhiteSpace($googleClientId) -or [string]::IsNullOrWhiteSpace($googleClientSecretPlain)) {
    Write-Host "ERROR: Google Client ID and Secret are required." -ForegroundColor Red
    exit 1
}

# Store in SSM Parameter Store
Write-Host "`nStoring Google OAuth credentials in SSM Parameter Store..." -ForegroundColor Cyan

aws ssm put-parameter `
  --name "$ssmPrefix/google-client-id" `
  --value "$googleClientId" `
  --type SecureString `
  --overwrite `
  --profile default
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to store Google Client ID." -ForegroundColor Red
    exit 1
}

aws ssm put-parameter `
  --name "$ssmPrefix/google-client-secret" `
  --value "$googleClientSecretPlain" `
  --type SecureString `
  --overwrite `
  --profile default
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to store Google Client Secret." -ForegroundColor Red
    exit 1
}

Write-Host "Google OAuth credentials stored successfully!" -ForegroundColor Green

# Now you need to enable it in the site config
Write-Host "`nIMPORTANT: You must enable Google OAuth in site.config.json:" -ForegroundColor Yellow
Write-Host '  "cognito": {' -ForegroundColor Yellow
Write-Host '    "googleOAuth": true,' -ForegroundColor Yellow
Write-Host '    ...' -ForegroundColor Yellow
Write-Host '  }' -ForegroundColor Yellow
Write-Host "" -ForegroundColor Yellow
Write-Host "After updating site.config.json, run ./deploy.ps1 to deploy with Google OAuth enabled." -ForegroundColor Yellow
