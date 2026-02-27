// lambda/generate_waveform.js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { PNG } = require("pngjs");

const s3Client = new S3Client({});
const dynamoClient = new DynamoDBClient({});

/**
 * Lambda function to generate waveform PNG from volume levels
 * 
 * Expected input:
 * {
 *   "volumeLevels": [{"time": 0, "volume": 0.8}, ...],
 *   "s3Key": "uploads/1768873893818-podcast.mp3",
 *   "s3Bucket": "my-bucket"
 * }
 */
exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        const { volumeLevels, s3Key, s3Bucket, pk, timestamp } = event;
        
        // Validation
        if (!volumeLevels || !Array.isArray(volumeLevels)) {
            throw new Error("volumeLevels array is required");
        }
        
        if (!s3Key || !s3Bucket) {
            throw new Error("s3Key and s3Bucket are required");
        }
        
        // Generate base filename (remove .mp3 extension)
        const baseName = s3Key.replace(/\.mp3$/i, '');
        
        // Generate accent-color PNG
        const accentColor = process.env.ACCENT_COLOR || '#ff5500';
        const orangePngBuffer = generateWaveformPNG(volumeLevels, accentColor);
        const orangePngKey = `${baseName}_orange.png`;
        
        await s3Client.send(new PutObjectCommand({
            Bucket: s3Bucket,
            Key: orangePngKey,
            Body: orangePngBuffer,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000'
        }));
        
        console.log(`Orange waveform PNG uploaded to s3://${s3Bucket}/${orangePngKey}`);
        
        // Generate black PNG
        const blackPngBuffer = generateWaveformPNG(volumeLevels, '#000000');
        const blackPngKey = `${baseName}_black.png`;
        
        await s3Client.send(new PutObjectCommand({
            Bucket: s3Bucket,
            Key: blackPngKey,
            Body: blackPngBuffer,
            ContentType: 'image/png',
            CacheControl: 'public, max-age=31536000'
        }));
        
        console.log(`Black waveform PNG uploaded to s3://${s3Bucket}/${blackPngKey}`);
        
        const blackPngUrl = `https://${s3Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${blackPngKey}`;
        
        // Update DynamoDB with waveform URL and volume values
        if (pk && timestamp) {
            const tableName = process.env.TABLE_NAME;
            
            // Serialize volume levels array to JSON string for storage
            const volumeValuesJson = JSON.stringify(volumeLevels);
            
            await dynamoClient.send(new UpdateItemCommand({
                TableName: tableName,
                Key: {
                    pk: { S: pk },
                    timestamp: { S: timestamp }
                },
                UpdateExpression: 'SET waveformUrl = :url, volumeValues = :values',
                ExpressionAttributeValues: {
                    ':url': { S: blackPngUrl },
                    ':values': { S: volumeValuesJson }
                }
            }));
            
            console.log(`Updated DynamoDB record ${pk}/${timestamp} with waveformUrl: ${blackPngUrl}`);
            console.log(`Saved ${volumeLevels.length} volume values to volumeValues attribute`);
        }
        
        return {
            statusCode: 200,
            orangePngKey,
            blackPngKey,
            orangePngUrl: `https://${s3Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${orangePngKey}`,
            blackPngUrl
        };
        
    } catch (error) {
        console.error("Error generating waveform:", error);
        throw error;
    }
};

/**
 * Generate waveform PNG from volume levels using pngjs
 * Each bar represents volume at a time point
 * @param {Array} volumeLevels - Array of {time, volume} objects
 * @param {string} color - Hex color string (e.g., '#ff5500' or '#000000')
 */
function generateWaveformPNG(volumeLevels, color) {
    const width = parseInt(process.env.WAVEFORM_WIDTH, 10) || 800;
    const height = parseInt(process.env.WAVEFORM_HEIGHT, 10) || 100;
    const barCount = volumeLevels.length;
    const barWidth = Math.floor(width / barCount);
    
    // Parse hex color
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    const a = 255; // Full opacity
    
    // Create PNG
    const png = new PNG({ width, height });
    
    // Fill with transparent background
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (width * y + x) << 2;
            png.data[idx] = 0;     // Red
            png.data[idx + 1] = 0; // Green
            png.data[idx + 2] = 0; // Blue
            png.data[idx + 3] = 0; // Alpha (transparent)
        }
    }
    
    // Analyze all volume values for percentiles
    const volumes = volumeLevels.map(p => p.volume || 0);
    const sorted = [...volumes].sort((a, b) => a - b);
    const n = volumes.length;
    const getPercentileValue = (percent) => {
        const idx = Math.floor(percent * n);
        return sorted[idx] || 0;
    };
    const p10 = getPercentileValue(0.10);
    const p20 = getPercentileValue(0.20);

    volumeLevels.forEach((point, index) => {
        let volume = point.volume || 0;
        // Apply percentile-based scaling
        if (volume <= p10) {
            volume = volume / 2;
        } else if (volume > p10 && volume <= p20) {
            volume = volume / 1.5;
        }
        const barHeight = Math.max(2, Math.floor(volume * height));
        const x = index * barWidth;
        const y = Math.floor((height - barHeight) / 2);
        // Draw vertical bar
        for (let by = 0; by < barHeight; by++) {
            for (let bx = 0; bx < barWidth; bx++) {
                const px = x + bx;
                const py = y + by;
                if (px < width && py < height) {
                    const idx = (width * py + px) << 2;
                    png.data[idx] = r;
                    png.data[idx + 1] = g;
                    png.data[idx + 2] = b;
                    png.data[idx + 3] = a;
                }
            }
        }
    });
    
    return PNG.sync.write(png);
}
