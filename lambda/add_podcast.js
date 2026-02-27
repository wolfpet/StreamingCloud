// lambda/add_podcast.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.TABLE_NAME;
const usersTableName = process.env.USERS_TABLE_NAME;

// Add logging to verify environment variables
console.log("Environment variables:");
console.log("TABLE_NAME:", tableName);
console.log("USERS_TABLE_NAME:", usersTableName);

// Sanitize string inputs to prevent XSS
const sanitizeString = (str) => {
  if (!str) return str;
  return str.replace(/[<>]/g, ''); // Remove angle brackets
};

const checkUserInPodcastUsers = async (email) => {
  try {
    console.log(`Attempting to query PodcastUsers table for email: ${email}`);
    const response = await docClient.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          email: email,
        },
      }),
    );

    if (response.Item) {
      console.log(
        `SUCCESS: Found user in PodcastUsers table:`,
        JSON.stringify(response.Item),
      );
      return response.Item.uploadPreapproval === true;
    } else {
      console.log(
        `INFO: User with email ${email} not found in PodcastUsers table`,
      );
      return false;
    }
  } catch (error) {
    console.error(
      `FAILURE: Error querying PodcastUsers table for email ${email}:`,
      error,
    );
    return false;
  }
};

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


    // Extract podcast data from parsed body
    const { artist, title, artwork, audioUrl, waveformUrl, email, duration } = parsedBody;

    // Validate that if email is provided in the request, it matches the authenticated email
    if (email && email !== authenticatedEmail) {
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Forbidden: Cannot add podcast for a different user",
        }),
      };
    }

    // Use authenticated email for the podcast
    const podcastEmail = email || authenticatedEmail;

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
    if (!artist || !title || !audioUrl) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          error: "Missing required fields: artist, title, audioUrl",
        }),
      };
    }
    // check if the user has preapproval to add podcasts
    let podcastStatus = "pending";

    const isPreapproved = await checkUserInPodcastUsers(podcastEmail);
    if (isPreapproved) {
      podcastStatus = "approved";
    }
    
    const podcastId = `podcast-${Date.now()}`;

    // Sanitize text inputs
    let sanitizedArtist = sanitizeString(artist);
    let sanitizedTitle = sanitizeString(title);
    // Normalize text inputs to ASCII ( to remove accents (diacritics) from a string, turning characters like é into e or ñ into n)
    let normalizedArtist = sanitizedArtist.replace(/[øØ]/g, "o").replace(/[łŁ]/g, "l").replace(/[æÆ]/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let normalizedTitle = sanitizedTitle.replace(/[øØ]/g, "o").replace(/[łŁ]/g, "l").replace(/[æÆ]/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Put the podcast item in DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: "PODCASTS",
          id: podcastId,
          timestamp: new Date().toISOString(),
          artist: sanitizedArtist,
          artist_lowercase: normalizedArtist.toLowerCase(),
          title: sanitizedTitle,
          title_lowercase: normalizedTitle.toLowerCase(),
          artwork: artwork || null,
          audioUrl: audioUrl,
          audioUrlRelative: audioUrlRelative,
          waveformUrl: waveformUrl || null,
          email: podcastEmail,
          duration: duration || null,
          status: podcastStatus,
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
        id: podcastId,
        message: "Podcast added successfully",
        data: {
          id: podcastId,
          timestamp: new Date().toISOString(),
          artist: sanitizedArtist,
          title: sanitizedTitle,
          email: podcastEmail,
          status: podcastStatus,
        },
      }),
    };
  } catch (error) {
    console.error("Error adding podcast:", error);
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
