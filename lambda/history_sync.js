const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const dynamodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamodbClient);

// TTL configuration: days from env var (default 100)
const TTL_DAYS = parseInt(process.env.PLAYBACK_HISTORY_TTL_DAYS, 10) || 100;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

const calculateTTL = () => {
  return Math.floor(Date.now() / 1000) + TTL_SECONDS;
};

exports.handler = async (event) => {
  try {
    // Get email from authenticated Cognito token
    const claims = event.requestContext.authorizer.claims;
    const authenticatedEmail = claims.email;

    if (!authenticatedEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing email in authentication token",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Parse the request body
    const body = JSON.parse(event.body || "{}");
    
    // Log the received payload for debugging
    console.log("Received history sync payload:", JSON.stringify(body, null, 2));
    
    const { email, playbackHistory } = body;

    // Validate that the request email matches the authenticated email
    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required field: email",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    if (email !== authenticatedEmail) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "Forbidden: Cannot sync history for a different user",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Validate playback history
    if (!playbackHistory || !Array.isArray(playbackHistory)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required field: playbackHistory (array)",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    console.log(`Processing ${playbackHistory.length} podcast entries for user: ${authenticatedEmail}`);
    
    const backendTracks = [];
    const tableName = process.env.PLAYBACK_HISTORY_TABLE_NAME;

    // Process each entry in the payload
    for (const entry of playbackHistory) {
      const { trackId, time } = entry;

      if (!trackId) {
        console.log("Skipping entry with missing trackId");
        continue;
      }

      try {
        // Check if record exists in DynamoDB
        const getParams = {
          TableName: tableName,
          Key: {
            email: authenticatedEmail,
            podcastId: trackId,
          },
        };

        const getResult = await docClient.send(new GetCommand(getParams));
        const existingRecord = getResult.Item;

        if (!existingRecord) {
          // Record doesn't exist
          if (time > 0) {
            // Add new record to database
            const putParams = {
              TableName: tableName,
              Item: {
                email: authenticatedEmail,
                podcastId: trackId,
                time: time,
                lastUpdated: new Date().toISOString(),
                ttl: calculateTTL(),
              },
            };
            await docClient.send(new PutCommand(putParams));
            console.log(`Added new record for trackId: ${trackId}, time: ${time}`);
          }
        } else {
          // Record exists - compare time values
          const dbTime = existingRecord.time || 0;

          if (time > dbTime) {
            // Payload time is higher - update database
            const updateParams = {
              TableName: tableName,
              Key: {
                email: authenticatedEmail,
                podcastId: trackId,
              },
              UpdateExpression: "SET #time = :time, #lastUpdated = :lastUpdated",
              ExpressionAttributeNames: {
                "#time": "time",
                "#lastUpdated": "lastUpdated",
              },
              ExpressionAttributeValues: {
                ":time": time,
                ":lastUpdated": new Date().toISOString(),
              },
            };
            await docClient.send(new UpdateCommand(updateParams));
            console.log(`Updated trackId: ${trackId} from ${dbTime} to ${time}`);
          } else if (dbTime > time) {
            // Database time is higher - add to return payload
            backendTracks.push({
              trackId: trackId,
              time: dbTime,
            });
            console.log(`Backend has newer time for trackId: ${trackId} (${dbTime} > ${time})`);
          }
        }
      } catch (error) {
        console.error(`Error processing trackId ${trackId}:`, error);
        // Continue processing other entries even if one fails
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Playback history synced successfully",
        entriesProcessed: playbackHistory.length,
        backendTracks: backendTracks,
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error processing history sync:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error",
        error: error.message,
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
  }
};
