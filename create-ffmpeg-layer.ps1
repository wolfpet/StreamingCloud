# Create FFmpeg Lambda Layer
# This script copies ffmpeg binaries and publishes them as a Lambda layer

$ErrorActionPreference = "Stop"

# Configuration
$extractedDir = "ffmpeg-layer/bin/ffmpeg-7.0.2-amd64-static"
$layerDir = "lambda-layer-final"
$layerName = "ffmpeg-layer"
$region = "us-east-1"

Write-Host "Creating FFmpeg Lambda Layer..." -ForegroundColor Green

# Step 1: Create layer directory structure
Write-Host "Step 1: Setting up directory structure..."
if (Test-Path $layerDir) {
    Remove-Item -Recurse -Force $layerDir
}
New-Item -ItemType Directory -Path "$layerDir/bin" -Force | Out-Null

# Step 2: Copy ffmpeg and ffprobe binaries
Write-Host "Step 2: Copying ffmpeg and ffprobe..."
if (Test-Path "$extractedDir/ffmpeg") {
    Copy-Item "$extractedDir/ffmpeg" "$layerDir/bin/ffmpeg" -Force
    Write-Host "  [+] Copied ffmpeg"
} else {
    Write-Host "  [!] ffmpeg not found at $extractedDir/ffmpeg" -ForegroundColor Red
    exit 1
}

if (Test-Path "$extractedDir/ffprobe") {
    Copy-Item "$extractedDir/ffprobe" "$layerDir/bin/ffprobe" -Force
    Write-Host "  [+] Copied ffprobe"
} else {
    Write-Host "  [!] ffprobe not found at $extractedDir/ffprobe" -ForegroundColor Red
    exit 1
}

# Step 3: Create zip file
Write-Host "Step 3: Creating zip file..."
$zipFile = "$layerName.zip"
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}

Compress-Archive -Path "$layerDir/bin" -DestinationPath $zipFile -Force
Write-Host "  [+] Created $zipFile"

# Step 4: Upload to S3 (layer is >70MB, exceeds direct upload limit)
Write-Host "Step 4: Uploading to S3..."
$bucketName = "ffmpeg-layer-temp-$(Get-Date -Format 'yyyyMMddHHmmss')"
try {
    aws s3 mb "s3://$bucketName" --region $region | Out-Null
    Write-Host "  [+] Created temporary S3 bucket: $bucketName"
    
    aws s3 cp $zipFile "s3://$bucketName/$zipFile" | Out-Null
    Write-Host "  [+] Uploaded $zipFile to S3"
} catch {
    Write-Host "  [!] Failed to upload to S3: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Publish to Lambda
Write-Host "Step 5: Publishing to AWS Lambda..."
try {
    $result = aws lambda publish-layer-version `
        --layer-name $layerName `
        --content "S3Bucket=$bucketName,S3Key=$zipFile" `
        --compatible-runtimes nodejs24.x `
        --region $region | ConvertFrom-Json
    
    $layerArn = $result.LayerVersionArn
    Write-Host "  [+] Layer published successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Layer ARN: $layerArn" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Update your CDK stack with this ARN:" -ForegroundColor Yellow
    Write-Host "  arn:aws:lambda:$region`:*:layer:$layerName" -ForegroundColor Cyan
    
    # Copy ARN to clipboard
    Set-Clipboard -Value $layerArn
    Write-Host "[+] ARN copied to clipboard!" -ForegroundColor Green
    
} catch {
    Write-Host "  [!] Failed to publish layer: $_" -ForegroundColor Red
    Write-Host "Make sure AWS CLI is installed and configured." -ForegroundColor Yellow
    exit 1
}

# Step 6: Clean up temporary S3 bucket
Write-Host ""
Write-Host "Step 6: Cleaning up temporary S3 bucket..."
try {
    aws s3 rm "s3://$bucketName/$zipFile" | Out-Null
    aws s3 rb "s3://$bucketName" | Out-Null
    Write-Host "  [+] Cleaned up temporary bucket" -ForegroundColor Green
} catch {
    Write-Host "  [!] Failed to clean up bucket $bucketName" -ForegroundColor Yellow
    Write-Host "      You may want to delete it manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! You can now update your CDK stack." -ForegroundColor Green
