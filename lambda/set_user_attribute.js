// lambda/set_user_attribute.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
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

// Validate attribute name to prevent injection
const isValidAttributeName = (name) => {
  // Allow alphanumeric, underscore, and dot notation for nested attributes
  return /^[a-zA-Z0-9_\.]+$/.test(name);
};

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Get email from authenticated Cognito token
    const claims = event.requestContext.authorizer.claims;
    const requestingEmail = claims.email;

    if (!requestingEmail) {
      return formatResponse(400, { error: "Missing email in authentication token" });
    }

    console.log(`Checking admin status for email: ${requestingEmail}`);

    // Check if user is admin
    const adminCheckResponse = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          email: requestingEmail,
        },
      }),
    );

    if (!adminCheckResponse.Item || adminCheckResponse.Item.admin !== true) {
      console.log(`User ${requestingEmail} does not have admin access`);
      return formatResponse(403, { error: "Forbidden: Admin access required" });
    }

    console.log(`User ${requestingEmail} is admin, proceeding with attribute update`);

    // Parse request body
    let body;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (parseError) {
      return formatResponse(400, { error: "Invalid JSON in request body" });
    }

    const { email, attributeName, value } = body;

    // Validation
    if (!email) {
      return formatResponse(400, { error: "Missing required parameter: email" });
    }
    if (!attributeName) {
      return formatResponse(400, { error: "Missing required parameter: attributeName" });
    }
    if (value === undefined) {
      return formatResponse(400, { error: "Missing required parameter: value" });
    }

    // Validate attribute name
    if (!isValidAttributeName(attributeName)) {
      return formatResponse(400, { error: "Invalid attribute name: must be alphanumeric with underscores and dots" });
    }

    // Prevent modification of email key
    if (attributeName === "email") {
      return formatResponse(400, { error: "Cannot modify email attribute" });
    }

    console.log(`Updating attribute '${attributeName}' for user ${email}`);

    // Update the attribute in DynamoDB
    // Using SET clause to either create or update the attribute
    const updateParams = {
      TableName: tableName,
      Key: {
        email: email,
      },
      UpdateExpression: `SET #attr = :val`,
      ExpressionAttributeNames: {
        "#attr": attributeName,
      },
      ExpressionAttributeValues: {
        ":val": value,
      },
      ReturnValues: "ALL_NEW", // Return the updated item
    };

    const updateResponse = await docClient.send(new UpdateCommand(updateParams));

    console.log(`Successfully updated attribute for user ${email}`);

    return formatResponse(200, {
      message: `Successfully updated attribute '${attributeName}' for user ${email}`,
      updatedUser: updateResponse.Attributes,
    });
  } catch (error) {
    console.error("Error setting user attribute:", error);
    return formatResponse(500, {
      error: "Failed to set user attribute",
      message: error.message,
    });
  }
};
