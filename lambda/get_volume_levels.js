// lambda/get_volume_levels.js
const { spawn } = require("child_process");
const https = require("https");

/**
 * Lambda function to get volume levels at specific time points in an MP3 file
 * 
 * Expected input:
 * {
 *   "url": "https://example.com/podcast.mp3",
 *   "timePoints": [0, 100, 500, 4000]  // seconds
 * }
 * 
 * Returns:
 * {
 *   "statusCode": 200,
 *   "volumeLevels": [
 *     { "time": 0, "volume": 0.45 },
 *     { "time": 100, "volume": 0.45 },
 *     ...
 *   ]
 * }
 */
exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        const { url, timePoints } = event;
        
        // Validation
        if (!url) {
            return formatResponse(400, { 
                error: 'Missing required parameter: url' 
            });
        }
        
        if (!Array.isArray(timePoints) || timePoints.length === 0) {
            return formatResponse(400, { 
                error: 'timePoints must be a non-empty array of numbers' 
            });
        }
        
        // Sort time points for efficient processing
        const sortedTimePoints = [...timePoints].sort((a, b) => a - b);
        
        console.log(`Fetching audio from ${url}`);
        const audioStream = await getAudioStream(url);
        
        // Analyze audio and get volume levels
        const volumeLevels = await analyzeAudioVolume(audioStream, sortedTimePoints);
        
        return formatResponse(200, { 
            volumeLevels,
            timePointsAnalyzed: sortedTimePoints.length 
        });
        
    } catch (error) {
        console.error("Error:", error);
        return formatResponse(500, { 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Get readable stream from URL
 */
function getAudioStream(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to fetch URL: HTTP ${response.statusCode}`));
            } else {
                resolve(response);
            }
        }).on('error', reject);
    });
}

/**
 * Analyze audio using ffmpeg to extract volume levels at specific time points
 * Uses the 'volumedetect' filter on segments around each time point
 */
function analyzeAudioVolume(audioStream, timePoints) {
    return new Promise((resolve, reject) => {
        // For each time point, we'll extract and analyze a 1-second window
        const windowSize = 0.5;
        
        // Create asplit filter to duplicate the audio stream for each segment
        const numSegments = timePoints.length;
        const splitOutputs = Array.from({length: numSegments}, (_, i) => `[a${i}]`).join('');
        
        const filterSegments = timePoints.map((time, idx) => {
            const start = Math.max(0, time - windowSize);
            const end = time + windowSize;
            return `[a${idx}]atrim=start=${start}:end=${end},volumedetect`;
        });
        
        const filterChain = `[0:a]asplit=${numSegments}${splitOutputs};${filterSegments.join(';')}`;
        
        console.log("Filter chain:", filterChain);
        
        // Use full path for ffmpeg from Lambda layer
        const ffmpegPath = '/opt/bin/ffmpeg';
        
        const ffmpegCommand = [
            '-i', 'pipe:0',           // Read from stdin
            '-filter_complex', filterChain,  // Use complex filter for multiple outputs
            '-f', 'null',              // Output format
            '-'                        // Output to stdout
        ];
        
        const ffmpeg = spawn(ffmpegPath, ffmpegCommand, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        
        let errorOutput = '';
        
        // Capture stderr for volumedetect output
        ffmpeg.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        ffmpeg.on('error', (err) => {
            reject(new Error(`FFmpeg spawn error: ${err.message}`));
        });
        
        ffmpeg.on('close', (code) => {
            if (code !== 0 && !errorOutput.includes('mean_volume')) {
                console.error('FFmpeg stderr:', errorOutput);
                reject(new Error(`FFmpeg exited with code ${code}`));
                return;
            }
            
            // Parse volumedetect output for each segment
            const volumes = extractVolumesFromOutput(errorOutput, timePoints);
            resolve(volumes);
        });
        
        // Handle pipe error gracefully
        ffmpeg.stdin.on('error', () => {
            // FFmpeg may close stdin early, which is fine
        });
        
        // Pipe the stream to ffmpeg
        audioStream.pipe(ffmpeg.stdin);
        
        audioStream.on('error', (err) => {
            ffmpeg.kill();
            reject(new Error(`Stream error: ${err.message}`));
        });
    });
}

/**
 * Extract volume levels from ffmpeg output for each segment
 */
function extractVolumesFromOutput(output, timePoints) {
    console.log("Parsing ffmpeg output for per-point volume analysis...");
    
    // Find all mean_volume values in the output
    const meanVolumeMatches = output.match(/mean_volume:\s*([-\d.]+)\s*dB/g) || [];
    
    if (meanVolumeMatches.length === 0) {
        console.warn("No volume data found, returning defaults");
        return timePoints.map(time => ({
            time,
            volume: 0.5
        }));
    }
    
    const volumes = timePoints.map((time, idx) => {
        let meanVolume = -40;  // Default
        
        if (idx < meanVolumeMatches.length) {
            const match = meanVolumeMatches[idx].match(/([-\d.]+)/);
            if (match) {
                meanVolume = parseFloat(match[1]);
            }
        }
        
        // Convert dB to normalized 0-1 scale
        // Using a range of -60dB (silent) to 0dB (full scale)
        const normalized = Math.max(0, Math.min(1, (meanVolume + 60) / 60));
        
        return {
            time,
            volume: parseFloat(normalized.toFixed(4))
        };
    });
    
    return volumes;
}

function formatResponse(statusCode, body) {
    return {
        statusCode,
        body: JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json'
        }
    };
}
