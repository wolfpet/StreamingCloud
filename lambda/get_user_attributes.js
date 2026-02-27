// lambda/get_user_attributes.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
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

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Get email from authenticated Cognito token
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;

    if (!email) {
      return formatResponse(400, { error: "Missing email in authentication token" });
    }

    console.log(`Retrieving user attributes for email: ${email}`);

    const response = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          email: email,
        },
      }),
    );

    if (!response.Item) {
      return formatResponse(404, { error: "User not found" });
    }

    const user = response.Item;

    // Return only the requested attributes
    const attributes = {
      email: user.email,
      admin: user.admin || false,
      approver: user.approver || false,
      uploadPreapproval: user.uploadPreapproval || false,
    };

    console.log(
      `Successfully retrieved attributes for email: ${email}`,
      JSON.stringify(attributes),
    );

    return formatResponse(200, attributes);
  } catch (error) {
    console.error("Error retrieving user attributes:", error);
    return formatResponse(500, {
      error: "Failed to retrieve user attributes",
      message: error.message,
    });
  }
};
