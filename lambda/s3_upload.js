// lambda/s3_upload.js
const { S3Client, CreateMultipartUploadCommand, CompleteMultipartUploadCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3Client = new S3Client({});
const bucketName = process.env.BUCKET_NAME;

exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        // Parse the body from API Gateway event
        let parsedBody = event;
        if (typeof event.body === 'string') {
            parsedBody = JSON.parse(event.body);
        }
        
        const path = event.path || event.rawPath || '';
        
        // Route based on path
        if (path.includes('/s3-sign')) {
            return await handleCreateMultipartUpload(parsedBody);
        } else if (path.includes('/s3-sign-part')) {
            return await handleSignPart(parsedBody);
        } else if (path.includes('/s3-complete')) {
            return await handleCompleteMultipartUpload(parsedBody);
        } else {
            return formatResponse(400, { error: 'Unknown operation' });
        }
    } catch (error) {
        console.error("Error:", error);
        return formatResponse(500, { error: error.message });
    }
};

function validateFileType(filename, filetype) {
    // Define allowed extensions by type
    const ALLOWED_EXTENSIONS = {
        audio: ['.mp3'],
        image: ['.png', '.jpg', '.jpeg', '.gif']
    };

    // Get file extension
    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();

    // Check if extension is allowed (across all categories)
    const allAllowed = [
        ...ALLOWED_EXTENSIONS.audio,
        ...ALLOWED_EXTENSIONS.image
    ];

    if (!allAllowed.includes(extension)) {
        return {
            valid: false,
            error: `File type not allowed. Permitted: ${allAllowed.join(', ')}`
        };
    }

    // Optional: Validate MIME type matches extension
    const mimeToExtension = {
        'audio/mpeg': '.mp3',
        'image/png': '.png',
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/gif': '.gif'
    };

    if (filetype && mimeToExtension[filetype]) {
        const expectedExts = Array.isArray(mimeToExtension[filetype])
            ? mimeToExtension[filetype]
            : [mimeToExtension[filetype]];
        if (!expectedExts.includes(extension)) {
            return {
                valid: false,
                error: `File extension ${extension} doesn't match declared MIME type ${filetype}`
            };
        }
    }

    return { valid: true };
}

async function handleCreateMultipartUpload(body) {
    const { filename, filetype } = body;

    if (!filename) {
        return formatResponse(400, { error: 'Missing filename' });
    }

    // Validate file type before generating presigned URL
    const validation = validateFileType(filename, filetype);
    if (!validation.valid) {
        return formatResponse(400, { error: validation.error });
    }

    const key = `uploads/${Date.now()}-${filename}`;
    
    try {
        // Generate a presigned PUT URL that can be used from the browser
        const { PutObjectCommand } = require("@aws-sdk/client-s3");
        const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
        
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: filetype || 'application/octet-stream'
        });
        
        const expiresIn = parseInt(process.env.PRESIGNED_URL_EXPIRY_SECONDS, 10) || 3600;
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        
        return formatResponse(200, {
            uploadUrl: presignedUrl,
            presignedUrl: presignedUrl,
            key: key,
            bucket: bucketName
        });
    } catch (error) {
        console.error("Error creating presigned URL:", error);
        return formatResponse(500, { error: error.message });
    }
}

async function handleSignPart(body) {
    const { key, uploadId, partNumber, contentLength } = body;
    
    if (!key || !uploadId || !partNumber) {
        return formatResponse(400, { error: 'Missing required fields: key, uploadId, partNumber' });
    }
    
    try {
        // For now, return a simple response - presigned URLs are handled in createMultipartUpload
        return formatResponse(200, {
            presignedUrl: null
        });
    } catch (error) {
        console.error("Error signing part:", error);
        return formatResponse(500, { error: error.message });
    }
}

async function handleCompleteMultipartUpload(body) {
    const { key, uploadId, parts } = body;
    
    if (!key || !uploadId || !parts) {
        return formatResponse(400, { error: 'Missing required fields: key, uploadId, parts' });
    }
    
    try {
        const command = new CompleteMultipartUploadCommand({
            Bucket: bucketName,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: {
                Parts: parts.map((part, index) => ({
                    ETag: part.etag || part.ETag,
                    PartNumber: index + 1
                }))
            }
        });
        
        const response = await s3Client.send(command);
        
        return formatResponse(200, {
            location: response.Location,
            bucket: response.Bucket,
            key: response.Key,
            etag: response.ETag
        });
    } catch (error) {
        console.error("Error completing multipart upload:", error);
        return formatResponse(500, { error: error.message });
    }
}

function formatResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}
