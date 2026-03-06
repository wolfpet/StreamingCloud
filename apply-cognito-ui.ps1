# Apply Cognito Hosted UI Customization
# Reads site configuration, CDK outputs, and applies custom CSS and logo to Cognito hosted login pages
# This must run AFTER cdk deploy completes successfully

param(
    [string]$ConfigFile = "site.config.json"
)

Write-Host "`n=== Applying Cognito Hosted UI Customization ===" -ForegroundColor Cyan

# 1. Load site configuration
if (!(Test-Path $ConfigFile)) {
    Write-Host "ERROR: Config file not found: $ConfigFile" -ForegroundColor Red
    exit 1
}

$config = Get-Content $ConfigFile | ConvertFrom-Json
$accentColor = $config.brand.accentColor
$siteName = $config.site.title

Write-Host "Site: $siteName" -ForegroundColor Green
Write-Host "Accent Color: $accentColor" -ForegroundColor Green

# 2. Get CDK Stack outputs
Write-Host "`nFetching CDK stack outputs..." -ForegroundColor Yellow

# Derive stack name from domain (same logic as bin/streaming-cloud.js)
$domainName = $config.site.domainName
$domainPrefix = ($domainName -replace '\.(com|org|net|io|dev|app)$', '') -replace '\.', '-'
$stackName = "StreamingCloudStack-$domainPrefix"

Write-Host "Stack Name: $stackName" -ForegroundColor Green

try {
    $outputs = aws cloudformation describe-stacks --stack-name $stackName --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
} catch {
    Write-Host "ERROR: Failed to get CDK stack outputs. Make sure 'cdk deploy' completed successfully." -ForegroundColor Red
    exit 1
}

$userPoolId = ($outputs | Where-Object { $_.OutputKey -eq "UserPoolId" }).OutputValue
$clientId = ($outputs | Where-Object { $_.OutputKey -eq "UserPoolClientId" }).OutputValue

if (!$userPoolId -or !$clientId) {
    Write-Host "ERROR: Could not find UserPoolId or UserPoolClientId in stack outputs" -ForegroundColor Red
    exit 1
}

Write-Host "User Pool ID: $userPoolId" -ForegroundColor Green
Write-Host "Client ID: $clientId" -ForegroundColor Green

# 3. Prepare CSS with color substitution
Write-Host "`nPreparing custom CSS..." -ForegroundColor Yellow
$cssTemplate = Get-Content "cognito-ui-customization.css" -Raw

# Convert hex color to RGB for box-shadow
$hex = $accentColor -replace '#', ''
$r = [Convert]::ToInt32($hex.Substring(0, 2), 16)
$g = [Convert]::ToInt32($hex.Substring(2, 2), 16)
$b = [Convert]::ToInt32($hex.Substring(4, 2), 16)
$rgbColor = "$r, $g, $b"

# Replace placeholders
$css = $cssTemplate -replace '{{ACCENT_COLOR}}', $accentColor
$css = $css -replace '{{ACCENT_COLOR_RGB}}', $rgbColor

# Save processed CSS to temp file
$tempCssFile = [System.IO.Path]::GetTempFileName() + ".css"
Set-Content -Path $tempCssFile -Value $css -NoNewline
Write-Host "CSS prepared at: $tempCssFile" -ForegroundColor Green

# 4. Prepare logo image (prefer brand-override only for production config)
if ($ConfigFile -eq "site.config.json" -and (Test-Path "brand-override/img/Player_logo-192x192.png")) {
    $logoPath = "brand-override/img/Player_logo-192x192.png"
} else {
    $logoPath = "frontend/img/Player_logo-192x192.png"
}
if (!(Test-Path $logoPath)) {
    Write-Host "WARNING: Logo file not found, will upload CSS only" -ForegroundColor Yellow
    $logoPath = $null
}

# 5. Apply UI customization using AWS CLI
Write-Host "`nApplying Cognito UI customization..." -ForegroundColor Yellow

try {
    # Build AWS CLI command with properly quoted CSS
    $cssContent = Get-Content $tempCssFile -Raw
    
    if ($logoPath) {
        Write-Host "Including logo: $logoPath" -ForegroundColor Green
        $result = aws cognito-idp set-ui-customization `
            --user-pool-id $userPoolId `
            --css $cssContent `
            --image-file "fileb://$logoPath" 2>&1
    } else {
        $result = aws cognito-idp set-ui-customization `
            --user-pool-id $userPoolId `
            --css $cssContent 2>&1
    }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`nCognito UI customization applied successfully!" -ForegroundColor Green
        Write-Host "Changes will be visible on the hosted login page immediately." -ForegroundColor Cyan
    } else {
        Write-Host "ERROR: AWS CLI command failed" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "ERROR: Failed to apply customization" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Clean up temp file
    if (Test-Path $tempCssFile) {
        Remove-Item $tempCssFile -ErrorAction SilentlyContinue
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan
