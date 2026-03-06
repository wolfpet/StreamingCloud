# Production deployment script with integrated pre-deployment setup
# This script deploys to production automatically.
# To set up Google OAuth separately, run ./setup-google-oauth-prod.ps1

# --- One-time setup (uncomment, run once, then comment out again) ---
# aws configure --profile default
# ./create-ffmpeg-layer.ps1
# cdk bootstrap aws://YOUR_PROD_ACCOUNT_ID/us-east-1 --profile default
# -------------------------------------------------------------------

$env:AWS_PROFILE = "default"

# Test AWS CLI connectivity
Write-Host "Testing AWS CLI connectivity (Production)..." -ForegroundColor Cyan
aws sts get-caller-identity --profile default
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cannot connect to AWS. Please configure your credentials." -ForegroundColor Red
    exit 1
}

# Ensure CDK / project dependencies are installed
Write-Host "`nInstalling project dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install project dependencies." -ForegroundColor Red
    exit 1
}

# Ensure Lambda dependencies are installed
Write-Host "`nInstalling Lambda dependencies..." -ForegroundColor Cyan
Push-Location lambda
npm install --omit=dev
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install Lambda dependencies." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Load site configuration
$config = Get-Content "site.config.json" -ErrorAction Stop | ConvertFrom-Json
$ssmPrefix = $config._derived.ssmPrefix 2>$null
if (-not $ssmPrefix) {
    # Derive prefix from domainName if _derived is not in JSON
    $domainName = $config.site.domainName
    $ssmPrefix = "/" + (($domainName -replace '\.(com|org|net|io|dev|app)$', '') -replace '\.', '-') + "/secrets"
}

Write-Host "Using SSM prefix: $ssmPrefix" -ForegroundColor Cyan

# Fetch Google OAuth credentials from SSM if enabled in site config
$googleOAuth = $config.cognito.googleOAuth
if ($googleOAuth -eq $true) {
    Write-Host "Google OAuth enabled - fetching credentials from SSM..." -ForegroundColor Cyan
    $env:GOOGLE_CLIENT_ID = aws ssm get-parameter --name "$ssmPrefix/google-client-id" --with-decryption --query "Parameter.Value" --output text 2>$null
    $env:GOOGLE_CLIENT_SECRET = aws ssm get-parameter --name "$ssmPrefix/google-client-secret" --with-decryption --query "Parameter.Value" --output text 2>$null
    if (-not $env:GOOGLE_CLIENT_ID -or -not $env:GOOGLE_CLIENT_SECRET) {
        Write-Host "ERROR: Google OAuth is enabled but credentials not found in SSM." -ForegroundColor Red
        Write-Host "Run ./setup-google-oauth-prod.ps1 to configure Google OAuth." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Google OAuth credentials loaded." -ForegroundColor Green
} else {
    $env:GOOGLE_CLIENT_ID = ""
    $env:GOOGLE_CLIENT_SECRET = ""
    Write-Host "Google OAuth not enabled - deploying with Cognito-only login." -ForegroundColor Yellow
}

# Deploy with CDK
Write-Host "`nDeploying to Production..." -ForegroundColor Cyan
$env:CDK_SITE_CONFIG = "site.config.json"
cdk deploy --require-approval never
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: CDK deployment failed." -ForegroundColor Red
    exit 1
}

# Apply Cognito Hosted UI customization
Write-Host "`nApplying Cognito UI customization..." -ForegroundColor Cyan
.\apply-cognito-ui.ps1
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nProduction deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Cognito UI customization had issues, but deployment completed." -ForegroundColor Yellow
}