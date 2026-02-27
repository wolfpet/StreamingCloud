const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const dynamodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamodbClient);

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
    const requestEmail = body.email;

    console.log("Received history reset request for email:", requestEmail);

    // Validate that the request email matches the authenticated email
    if (!requestEmail) {
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

    if (requestEmail !== authenticatedEmail) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          message: "Forbidden: Cannot reset history for a different user",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    const email = authenticatedEmail;

    const tableName = process.env.PLAYBACK_HISTORY_TABLE_NAME;
    let deletedCount = 0;

    try {
      // Query all records for this email
      const queryParams = {
        TableName: tableName,
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email,
        },
      };

      console.log(`Querying records for email: ${email}`);
      const queryResult = await docClient.send(new QueryCommand(queryParams));
      const records = queryResult.Items || [];

      console.log(`Found ${records.length} records to delete`);

      // Delete each record
      for (const record of records) {
        const deleteParams = {
          TableName: tableName,
          Key: {
            email: record.email,
            podcastId: record.podcastId,
          },
        };

        await docClient.send(new DeleteCommand(deleteParams));
        deletedCount++;
        console.log(`Deleted record: email=${record.email}, podcastId=${record.podcastId}`);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Playback history reset successfully",
          email: email,
          recordsDeleted: deletedCount,
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    } catch (error) {
      console.error(`Error resetting history for email ${email}:`, error);
      throw error;
    }
  } catch (error) {
    console.error("Error processing history reset:", error);
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
