// lambda/add_bookmark.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.BOOKMARKS_TABLE_NAME;

// Add logging to verify environment variables
console.log("Environment variables:");
console.log("BOOKMARKS_TABLE_NAME:", tableName);

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Get email from authenticated Cognito token
    const claims = event.requestContext.authorizer.claims;
    const authenticatedEmail = claims.email;

    if (!authenticatedEmail) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Missing email in authentication token",
        }),
      };
    }

    // Parse the body from API Gateway event
    let parsedBody = event;
    if (typeof event.body === "string") {
      parsedBody = JSON.parse(event.body);
    }

    // Extract bookmark data from parsed body
    const { artist, title, artwork, audioUrl, waveformUrl, email, duration, id } =
      parsedBody;

    // Validate that the request email matches the authenticated email
    if (!email) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Missing required field: email",
        }),
      };
    }

    if (email !== authenticatedEmail) {
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Forbidden: Cannot add bookmark for a different user",
        }),
      };
    }

    // Calculate relative audio path if audioUrl is a full S3 URL

    let audioUrlRelative = null;
    if (audioUrl) {
      try {
        // If audioUrl is a full URL, extract the path after the bucket domain
        // e.g., https://bucket.s3.amazonaws.com/uploads/filename.mp3 => uploads/filename.mp3
        const urlObj = new URL(audioUrl, 'http://dummy-base');
        // Remove leading slash if present
        audioUrlRelative = urlObj.pathname.replace(/^\//, '');
      } catch (e) {
        // If audioUrl is not a valid URL, fallback to original value
        audioUrlRelative = audioUrl;
      }
    }

    // Validate required fields
    if (!artist || !title || !audioUrl || !parsedBody.id) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Missing required fields: artist, title, audioUrl, id",
        }),
      };
    }

    // Put the bookmark item in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          email: email,
          id: id,
          timestamp: new Date().toISOString(),
          artist: artist,
          artist_lowercase: artist.toLowerCase(),
          title: title,
          title_lowercase: title.toLowerCase(),
          artwork: artwork || null,
          audioUrl: audioUrl,
          audioUrlRelative: audioUrlRelative,
          waveformUrl: waveformUrl || null,
          duration: duration || null,
        },
      }),
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: id,
        message: "Bookmark added successfully",
        data: {
          id: id,
          email: email,
          timestamp: new Date().toISOString(),
          artist: artist,
          title: title,
        },
      }),
    };
  } catch (error) {
    console.error("Error adding bookmark:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }
};


