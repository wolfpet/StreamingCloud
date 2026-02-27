// lambda/get_admin_messages.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const usersTableName = process.env.USERS_TABLE_NAME;
const messagesTableName = process.env.MESSAGES_TABLE_NAME;

const formatResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
};

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Get email from authenticated Cognito token
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;

    if (!email) {
      return formatResponse(400, { error: "Missing email in authentication token" });
    }

    console.log(`Checking admin status for email: ${email}`);

    // Check if user is admin
    const userResponse = await docClient.send(
      new GetCommand({
        TableName: usersTableName,
        Key: {
          email: email,
        },
      }),
    );

    if (!userResponse.Item || userResponse.Item.admin !== true) {
      console.log(`User ${email} does not have admin access`);
      return formatResponse(403, { error: "Forbidden: Admin access required" });
    }

    console.log(`User ${email} is admin, fetching admin messages`);

    // Parse pagination parameters
    const queryParams = event.queryStringParameters || {};
    const limit = 50; // Fixed page size of 50
    const lastEvaluatedKey = queryParams.lastKey 
      ? JSON.parse(decodeURIComponent(queryParams.lastKey)) 
      : undefined;

    // Query Messages table for messages where "to" == "admin"
    const queryParams_ddb = {
      TableName: messagesTableName,
      IndexName: "to-index", // Assumes a GSI with "to" as partition key
      KeyConditionExpression: "#to = :adminValue",
      ExpressionAttributeNames: {
        "#to": "to",
      },
      ExpressionAttributeValues: {
        ":adminValue": "admin",
      },
      ProjectionExpression: "id, #from, #when, message",
      ExpressionAttributeNames: {
        "#from": "from",
        "#when": "when",
        "#to": "to",
      },
      Limit: limit,
    };

    if (lastEvaluatedKey) {
      queryParams_ddb.ExclusiveStartKey = lastEvaluatedKey;
    }

    const response = await docClient.send(new QueryCommand(queryParams_ddb));

    // Prepare paginated response
    const paginatedResponse = {
      messages: response.Items || [],
      count: response.Items ? response.Items.length : 0,
      scannedCount: response.ScannedCount,
      lastEvaluatedKey: response.LastEvaluatedKey || null,
    };

    console.log(
      `Successfully retrieved admin messages with ${paginatedResponse.count} messages`,
    );

    return formatResponse(200, paginatedResponse);
  } catch (error) {
    console.error("Error retrieving admin messages:", error);
    return formatResponse(500, {
      error: "Failed to retrieve admin messages",
      message: error.message,
    });
  }
};
