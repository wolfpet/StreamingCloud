// lambda/rss.js
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { CloudFrontClient, CreateInvalidationCommand } = require("@aws-sdk/client-cloudfront");

const dynamodb = new DynamoDBClient({});
const s3Client = new S3Client({});
const cloudfront = new CloudFrontClient({});
const tableName = process.env.TABLE_NAME;
const bucketName = process.env.BUCKET_NAME;
const distributionId = process.env.DISTRIBUTION_ID;
const siteUrl = process.env.SITE_URL || 'https://example.com';

exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        // Query music from DynamoDB - get 50 most recent approved tracks
        const params = {
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: {
                ':pk': { S: 'PODCASTS' },
                ':status': { S: 'approved' }
            },
            FilterExpression: 'attribute_not_exists(#status) OR #status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            Limit: parseInt(process.env.RSS_FEED_LIMIT, 10) || 50,
            ScanIndexForward: false, // Sort by most recent first (descending timestamp)
        };
        
        const command = new QueryCommand(params);
        const result = await dynamodb.send(command);
        
        // Unmarshall the items
        const podcasts = result.Items.map(item => unmarshall(item));
        
        // Generate RSS feed
        const rssContent = generateRSSFeed(podcasts);
        
        // Save to S3
        const s3Params = {
            Bucket: bucketName,
            Key: 'rss/rss.xml',
            Body: rssContent,
            ContentType: 'application/rss+xml'
        };
        
        const putCommand = new PutObjectCommand(s3Params);
        await s3Client.send(putCommand);
        
        console.log("RSS feed successfully saved to S3");
        
        // Invalidate CloudFront cache for the RSS feed
        if (distributionId) {
            try {
                const invalidationParams = {
                    DistributionId: distributionId,
                    InvalidationBatch: {
                        Paths: {
                            Quantity: 1,
                            Items: ['/rss/rss.xml']
                        },
                        CallerReference: Date.now().toString()
                    }
                };
                
                const invalidationCommand = new CreateInvalidationCommand(invalidationParams);
                await cloudfront.send(invalidationCommand);
                console.log("CloudFront cache invalidated for /rss/rss.xml");
            } catch (invalidationError) {
                console.error("CloudFront invalidation error:", invalidationError);
                // Continue even if invalidation fails - RSS was still saved
            }
        }
        
        return formatResponse(200, {
            message: 'RSS feed generated and saved successfully',
            podcastCount: podcasts.length,
            location: `s3://${bucketName}/rss/rss.xml`
        });
    } catch (error) {
        console.error("Error:", error);
        return formatResponse(500, { error: error.message });
    }
};

function generateRSSFeed(podcasts) {
    // Start with XML declaration and root element
    let rss = '<?xml version="1.0" encoding="UTF-8"?>\n';
    rss += '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">\n';
    rss += '  <channel>\n';
    
    // Channel metadata
    const rssTitle = process.env.RSS_TITLE || 'Streaming Cloud';
    const rssDescription = process.env.RSS_DESCRIPTION || 'Community-driven music streaming platform.';
    const rssAuthor = process.env.RSS_AUTHOR || 'Streaming Cloud';
    const rssCategory = process.env.RSS_CATEGORY || 'Music';
    const rssLanguage = process.env.RSS_LANGUAGE || 'en-us';

    rss += `    <title>${rssTitle}</title>\n`;
    rss += `    <link>${siteUrl}</link>\n`;
    rss += `    <description>${rssDescription}</description>\n`;
    rss += `    <itunes:author>${rssAuthor}</itunes:author>\n`;
    rss += `    <itunes:category text="${rssCategory}"/>\n`;
    rss += `    <itunes:image href="${siteUrl}/img/rss-logo.png"/>\n`;
    rss += `    <language>${rssLanguage}</language>\n`;
    
    // Add podcast items
    for (const podcast of podcasts) {
        rss += '    <item>\n';
        rss += `      <title>${escapeXml(podcast.title || '')}</title>\n`;
        rss += `      <description>${escapeXml(podcast.description || podcast.title || '')}</description>\n`;
        
        // Format pubDate
        const pubDate = formatPubDate(podcast.timestamp);
        rss += `      <pubDate>${pubDate}</pubDate>\n`;
        
        // Add enclosure if audio URL exists
        if (podcast.audioUrl) {
            rss += `      <enclosure url="${escapeXml(podcast.audioUrl)}" length="0" type="audio/mpeg"/>\n`;
        }
        
        // Add duration if available
        if (podcast.duration) {
            rss += `      <itunes:duration>${podcast.duration}</itunes:duration>\n`;
        }
        
        rss += '    </item>\n';
    }
    
    // Close channel and rss
    rss += '  </channel>\n';
    rss += '</rss>\n';
    
    return rss;
}

function escapeXml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function formatPubDate(timestamp) {
    // timestamp is likely ISO string or epoch
    let date;
    
    if (typeof timestamp === 'number') {
        date = new Date(timestamp);
    } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
    } else {
        date = new Date();
    }
    
    // Format as RFC 2822: "Mon, 01 Jan 2024 10:00:00 GMT"
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dayName = days[date.getUTCDay()];
    const monthName = months[date.getUTCMonth()];
    const dateNum = String(date.getUTCDate()).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${dayName}, ${dateNum} ${monthName} ${year} ${hours}:${minutes}:${seconds} GMT`;
}

function formatResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(body),
    };
}
