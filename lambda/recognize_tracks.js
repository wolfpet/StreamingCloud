// lambda/recognize_tracks.js
const { spawn, execFileSync } = require("child_process");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME;
const AUDD_API_TOKEN = process.env.AUDD_API_TOKEN;
const CHUNK_DURATION = 300; // seconds
const FFMPEG_PATH = "/opt/bin/ffmpeg";
const TMP_BASE = "/tmp";

/**
 * Lambda: Recognize tracks in a podcast audio file using audd.io
 *
 * Input (from Step Function):
 * {
 *   "audioUrl": "https://...",
 *   "podcastId": "podcast-1234567890",
 *   "pk": "PODCASTS",
 *   "timestamp": "2026-03-24T..."
 * }
 */
exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  const { audioUrl, podcastId, pk, timestamp } = event;

  if (!audioUrl || !podcastId || !pk || !timestamp) {
    throw new Error("Missing required fields: audioUrl, podcastId, pk, timestamp");
  }

  if (!AUDD_API_TOKEN) {
    throw new Error("AUDD_API_TOKEN environment variable is not set");
  }

  // Use podcastId as temp directory name for easy debugging identification
  const tmpDir = path.join(TMP_BASE, podcastId);

  try {
    // 1. Create temp directory
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log(`Created temp directory: ${tmpDir}`);

    // 2. Download and split audio into chunks using ffmpeg
    console.log(`Splitting audio from ${audioUrl} into ${CHUNK_DURATION}s chunks...`);
    await splitAudioIntoChunks(audioUrl, tmpDir);

    // 3. Get list of chunk files, sorted by name
    const chunkFiles = fs.readdirSync(tmpDir)
      .filter(f => f.endsWith(".mp3"))
      .sort();

    console.log(`Generated ${chunkFiles.length} chunk(s)`);

    if (chunkFiles.length === 0) {
      throw new Error("ffmpeg produced no chunk files");
    }

    // 4. Send chunks to audd.io in parallel batches
    //    - Parallel batches keep us within Lambda timeout
    //    - Deleting each chunk after processing reclaims /tmp space
    const BATCH_SIZE = 5;
    const recognizedTracks = [];
    const seenTracks = new Set();

    for (let i = 0; i < chunkFiles.length; i += BATCH_SIZE) {
      const batch = chunkFiles.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.join(", ")}`);

      const batchResults = await Promise.allSettled(
        batch.map(async (chunkFile) => {
          const chunkPath = path.join(tmpDir, chunkFile);
          try {
            const result = await recognizeWithAudd(chunkPath);
            return { chunkFile, result };
          } finally {
            // Delete chunk immediately to free /tmp space
            try { fs.unlinkSync(chunkPath); } catch (_) {}
          }
        })
      );

      for (const settled of batchResults) {
        if (settled.status === "rejected") {
          console.warn(`  -> Batch error: ${settled.reason?.message}`);
          continue;
        }
        const { chunkFile, result } = settled.value;
        if (result && result.artist && result.title) {
          const dedupeKey = `${result.artist.toLowerCase()}|${result.title.toLowerCase()}`;
          if (!seenTracks.has(dedupeKey)) {
            seenTracks.add(dedupeKey);
            recognizedTracks.push({
              "#": recognizedTracks.length + 1,
              "Track Name": result.title,
              "Artist": result.artist,
            });
            console.log(`  -> Found: ${result.artist} - ${result.title}`);
          } else {
            console.log(`  -> Duplicate, skipping: ${result.artist} - ${result.title}`);
          }
        } else {
          console.log(`  -> No match for ${chunkFile}`);
        }
      }
    }

    console.log(`Recognition complete. ${recognizedTracks.length} unique track(s) found.`);

    // 5. Write tracklist attribute to DynamoDB
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, timestamp },
      UpdateExpression: "SET tracklist = :tracklist",
      ExpressionAttributeValues: {
        ":tracklist": JSON.stringify(recognizedTracks),
      },
    }));

    console.log("Tracklist saved to DynamoDB");

    return {
      statusCode: 200,
      body: JSON.stringify({
        tracklist: recognizedTracks,
        chunksProcessed: chunkFiles.length,
      }),
    };
  } finally {
    // 6. Cleanup: remove temp directory and all chunks
    cleanup(tmpDir);
  }
};

/**
 * Download audio from URL and split into CHUNK_DURATION-second MP3 segments
 */
function splitAudioIntoChunks(audioUrl, outputDir) {
  return new Promise((resolve, reject) => {
    const args = [
      "-i", audioUrl,
      "-f", "segment",
      "-segment_time", String(CHUNK_DURATION),
      "-c", "copy",
      "-reset_timestamps", "1",
      path.join(outputDir, "chunk_%03d.mp3"),
    ];

    console.log(`Running: ${FFMPEG_PATH} ${args.join(" ")}`);

    const proc = spawn(FFMPEG_PATH, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error("ffmpeg stderr:", stderr);
        reject(new Error(`ffmpeg exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Send an audio file to audd.io Standard Recognition API and return the result
 * https://docs.audd.io/
 */
function recognizeWithAudd(filePath) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = `----FormBoundary${Date.now()}`;

    // Build multipart/form-data body
    const parts = [];

    // api_token field
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="api_token"\r\n\r\n` +
      `${AUDD_API_TOKEN}\r\n`
    );

    // return parameter
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="return"\r\n\r\n` +
      `apple_music,spotify\r\n`
    );

    // file field
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\n` +
      `Content-Type: audio/mpeg\r\n\r\n`
    );

    const header = Buffer.from(parts.join(""));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileData, footer]);

    const options = {
      hostname: "api.audd.io",
      port: 443,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      res.on("data", (chunk) => { responseData += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.status === "error") {
            reject(new Error(`audd.io error: ${parsed.error?.error_message || "unknown"}`));
            return;
          }
          // result is null when no match found
          resolve(parsed.result || null);
        } catch (e) {
          reject(new Error(`Failed to parse audd.io response: ${e.message}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`audd.io request error: ${err.message}`));
    });

    req.write(body);
    req.end();
  });
}

/**
 * Recursively delete a directory and its contents
 */
function cleanup(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`Cleaned up temp directory: ${dirPath}`);
    }
  } catch (err) {
    console.warn(`Warning: failed to clean up ${dirPath}: ${err.message}`);
  }
}
