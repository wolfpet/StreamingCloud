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
    
    console.log("Received track sync request:", JSON.stringify(body, null, 2));
    
    const { email, trackId, time } = body;

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
          message: "Forbidden: Cannot sync track for a different user",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Validate required fields
    if (!trackId || time === undefined || time === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required fields: trackId, time",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Validate time is a number
    if (typeof time !== "number" || time < 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Time must be a non-negative number (in seconds)",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    const tableName = process.env.PLAYBACK_HISTORY_TABLE_NAME;

    try {
      // Check if record exists in DynamoDB
      const getParams = {
        TableName: tableName,
        Key: {
          email: email,
          podcastId: trackId,
        },
      };

      const getResult = await docClient.send(new GetCommand(getParams));
      const existingRecord = getResult.Item;

      if (!existingRecord) {
        // Record doesn't exist - create new one
        const putParams = {
          TableName: tableName,
          Item: {
            email: email,
            podcastId: trackId,
            time: time,
            lastUpdated: new Date().toISOString(),
            ttl: calculateTTL(),
          },
        };
        await docClient.send(new PutCommand(putParams));
        console.log(`Created new record for trackId: ${trackId}, time: ${time}`);

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: "Track record created successfully",
            trackId: trackId,
            time: time,
            action: "created",
          }),
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        };
      } else {
        // Record exists - update with new time
        const updateParams = {
          TableName: tableName,
          Key: {
            email: email,
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
        console.log(`Updated trackId: ${trackId} to time: ${time}`);

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: "Track record updated successfully",
            trackId: trackId,
            time: time,
            action: "updated",
          }),
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        };
      }
    } catch (error) {
      console.error(`Error processing trackId ${trackId}:`, error);
      throw error;
    }
  } catch (error) {
    console.error("Error processing track sync:", error);
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
