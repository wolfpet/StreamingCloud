# Ensure Lambda dependencies are installed
Write-Host "Installing Lambda dependencies..."
Push-Location lambda
npm install --omit=dev
Pop-Location

# Load SSM prefix from site.config.json
$config = Get-Content "site.config.json" -ErrorAction Stop | ConvertFrom-Json
$ssmPrefix = $config._derived.ssmPrefix 2>$null
if (-not $ssmPrefix) {
    # Derive prefix from domainName if _derived is not in JSON (it's computed at runtime by the loader)
    $domainName = $config.site.domainName
    $ssmPrefix = "/" + (($domainName -replace '\.(com|org|net|io|dev|app)$', '') -replace '\.', '-') + "/secrets"
}

Write-Host "Using SSM prefix: $ssmPrefix"

# Fetch Google OAuth credentials from SSM if enabled in site config
$googleOAuth = $config.cognito.googleOAuth
if ($googleOAuth -eq $true) {
    Write-Host "Google OAuth enabled - fetching credentials from SSM..." -ForegroundColor Cyan
    $env:GOOGLE_CLIENT_ID = aws ssm get-parameter --name "$ssmPrefix/google-client-id" --with-decryption --query "Parameter.Value" --output text
    $env:GOOGLE_CLIENT_SECRET = aws ssm get-parameter --name "$ssmPrefix/google-client-secret" --with-decryption --query "Parameter.Value" --output text
    if (-not $env:GOOGLE_CLIENT_ID -or -not $env:GOOGLE_CLIENT_SECRET) {
        Write-Host "ERROR: Google OAuth is enabled but credentials not found in SSM." -ForegroundColor Red
        exit 1
    }
    Write-Host "Google OAuth credentials loaded." -ForegroundColor Green
} else {
    $env:GOOGLE_CLIENT_ID = ""
    $env:GOOGLE_CLIENT_SECRET = ""
    Write-Host "Google OAuth not enabled - deploying with Cognito-only login." -ForegroundColor Yellow
}

Write-Host "Deploying..."
$env:CDK_SITE_CONFIG = "site.config.json"
cdk deploy --require-approval never

# Apply Cognito Hosted UI customization
Write-Host "`nApplying Cognito UI customization..." -ForegroundColor Cyan
.\apply-cognito-ui.ps1