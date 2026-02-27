// lambda/get_user_list.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USERS_TABLE_NAME;

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

// Sanitize string inputs to prevent XSS
const sanitizeString = (str) => {
  if (!str) return str;
  return str.replace(/[<>]/g, ''); // Remove angle brackets
};

// Sanitize user object to remove XSS risks
const sanitizeUser = (user) => {
  return {
    ...user,
    name: user.name ? sanitizeString(user.name) : user.name,
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
        TableName: tableName,
        Key: {
          email: email,
        },
      }),
    );

    if (!userResponse.Item || userResponse.Item.admin !== true) {
      console.log(`User ${email} does not have admin access`);
      return formatResponse(403, { error: "Forbidden: Admin access required" });
    }

    console.log(`User ${email} is admin, fetching user list`);

    // Parse pagination parameters
    const queryParams = event.queryStringParameters || {};
    const limit = 50; // Fixed page size of 50
    const lastEvaluatedKey = queryParams.lastKey 
      ? JSON.parse(decodeURIComponent(queryParams.lastKey)) 
      : undefined;

    // Scan Users table with pagination
    const scanParams = {
      TableName: tableName,
      Limit: limit,
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const response = await docClient.send(new ScanCommand(scanParams));

    // Sanitize user data to prevent XSS
    const sanitizedUsers = (response.Items || []).map(sanitizeUser);

    // Prepare paginated response
    const paginatedResponse = {
      users: sanitizedUsers,
      count: sanitizedUsers.length,
      scannedCount: response.ScannedCount,
      lastEvaluatedKey: response.LastEvaluatedKey || null,
    };

    console.log(
      `Successfully retrieved user list with ${paginatedResponse.count} users`,
    );

    return formatResponse(200, paginatedResponse);
  } catch (error) {
    console.error("Error retrieving user list:", error);
    return formatResponse(500, {
      error: "Failed to retrieve user list",
      message: error.message,
    });
  }
};
