# Load SSM prefix from site.config.json
$config = Get-Content "site.config.json" -ErrorAction Stop | ConvertFrom-Json
$ssmPrefix = $config._derived.ssmPrefix 2>$null
if (-not $ssmPrefix) {
    # Derive prefix from domainName if _derived is not in JSON (it's computed at runtime by the loader)
    $domainName = $config.site.domainName
    $ssmPrefix = "/" + (($domainName -replace '\.(com|org|net|io|dev|app)$', '') -replace '\.', '-') + "/secrets"
}

Write-Host "Using SSM prefix: $ssmPrefix"

# Fetch Google OAuth credentials from SSM Parameter Store
$env:GOOGLE_CLIENT_ID = aws ssm get-parameter --name "$ssmPrefix/google-client-id" --with-decryption --query "Parameter.Value" --output text
$env:GOOGLE_CLIENT_SECRET = aws ssm get-parameter --name "$ssmPrefix/google-client-secret" --with-decryption --query "Parameter.Value" --output text

Write-Host "Deploying (Google OAuth credentials read from SSM)..."
cdk deploy --require-approval never