// lambda/trigger_waveform_generation.js
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN;

/**
 * Triggered by DynamoDB stream when new podcast is added
 * Starts Step Function to generate waveform
 */
exports.handler = async (event) => {
    console.log("DynamoDB Stream event:", JSON.stringify(event, null, 2));
    
    const promises = event.Records.map(async (record) => {
        // Only process INSERT events
        if (record.eventName !== 'INSERT') {
            console.log(`Skipping ${record.eventName} event`);
            return;
        }
        
        const newImage = record.dynamodb.NewImage;
        
        // Extract required fields - adjust to match your schema
        const pk = newImage.pk?.S;
        const timestamp = newImage.timestamp?.S;
        const audioUrl = newImage.audioUrl?.S;
        const duration = parseFloat(newImage.Duration?.N || newImage.duration?.N || '0');
        
        // Extract s3Key from audioUrl if not directly available
        let s3Key = newImage.s3Key?.S;
        if (!s3Key && audioUrl) {
            // Extract key from URL: https://bucket.s3.region.amazonaws.com/uploads/file.mp3
            const urlMatch = audioUrl.match(/amazonaws\.com\/(.+)$/);
            if (urlMatch) {
                // Decode URL-encoded characters (%20, %28, %29, etc.)
                s3Key = decodeURIComponent(urlMatch[1]);
            }
        }
        
        const s3Bucket = process.env.S3_BUCKET;
        
        console.log("Extracted fields:", { pk, timestamp, audioUrl, duration, s3Key, s3Bucket });
        
        // Validation
        if (!pk || !audioUrl || !duration || !s3Key) {
            console.log("Missing required fields, skipping:", { pk, audioUrl, duration, s3Key });
            return;
        }
        
        // Only process PODCASTS entries (not metadata/other types)
        if (pk !== 'PODCASTS') {
            console.log(`Skipping non-podcast entry: ${pk}`);
            return;
        }
        
        // Generate 100 evenly-spaced time points
        const timePoints = generateTimePoints(duration, 100);
        
        // Start Step Function
        const executionInput = {
            pk,
            timestamp,
            audioUrl,
            duration,
            s3Key,
            s3Bucket,
            timePoints
        };
        
        console.log("Starting Step Function execution with input:", executionInput);
        
        // Sanitize timestamp for execution name (remove invalid characters)
        const sanitizedTimestamp = timestamp.replace(/[^a-zA-Z0-9-_]/g, '-');
        
        try {
            await sfnClient.send(new StartExecutionCommand({
                stateMachineArn: STATE_MACHINE_ARN,
                input: JSON.stringify(executionInput),
                name: `waveform-${sanitizedTimestamp}-${Date.now()}`
            }));
            
            console.log(`Step Function started for podcast ${timestamp}`);
        } catch (error) {
            console.error("Error starting Step Function:", error);
            throw error;
        }
    });
    
    await Promise.all(promises);
    
    return { statusCode: 200, message: 'Processed stream records' };
};

/**
 * Generate evenly-spaced time points across duration
 */
function generateTimePoints(duration, count) {
    const interval = duration / count;
    const points = [];
    
    for (let i = 0; i < count; i++) {
        points.push(Math.round(i * interval));
    }
    
    return points;
}
