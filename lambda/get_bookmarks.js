// lambda/get_bookmarks.js
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const tableName = process.env.BOOKMARKS_TABLE_NAME;

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Get email from authenticated Cognito token
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;

    if (!email) {
      return formatResponse(400, { error: "Missing email in authentication token" });
    }

    // Parse query parameters for pagination only
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const direction = queryParams.direction || 'first'; // 'first', 'next'
    const lastEvaluatedKey = queryParams.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : undefined;

    console.log(`Retrieving bookmarks for email: ${email}`);

    const params = {
      TableName: tableName,
      KeyConditionExpression: 'email = :email',
      ProjectionExpression: 'email, sk, id, artist, title, artwork, #d, waveformUrl, audioUrl, audioUrlRelative',
      ExpressionAttributeValues: {
        ':email': { S: email }
      },
      ExpressionAttributeNames: {
        '#d': 'duration'
      },
      Limit: limit,
      ScanIndexForward: false, // Sort by most recent first (descending)
    };

    // Handle pagination
    if (direction === 'next' && lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const command = new QueryCommand(params);
    const result = await dynamodb.send(command);

    // Unmarshall the items
    const items = result.Items.map(item => unmarshall(item));

    console.log(`Retrieved ${items.length} bookmarks for email: ${email}`);

    // Prepare response
    const response = {
      items: items,
      count: result.Items.length,
      lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey : null,
      scannedCount: result.ScannedCount
    };

    return formatResponse(200, response);
  } catch (error) {
    console.error("Error retrieving bookmarks:", error);
    return formatResponse(500, {
      error: "Failed to retrieve bookmarks",
      message: error.message,
    });
  }
};

function formatResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
