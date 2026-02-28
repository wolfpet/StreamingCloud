// lambda/get_user_attributes.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
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
      // User not in table — auto-create for federated (Google) users
      // who may have missed the PostConfirmation trigger
      console.log(`User not found in table, auto-creating: ${email}`);
      const givenName = claims.given_name || claims.name || "User";
      const picture = claims.picture || null;

      const newUser = {
        email: email,
        given_name: givenName,
        picture: picture,
        admin: false,
        approver: false,
        uploadPreapproval: false,
        createdAt: new Date().toISOString(),
      };

      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: newUser,
          ConditionExpression: "attribute_not_exists(email)",
        })
      );

      console.log(`Auto-created user: ${email}`);

      const attributes = {
        email: newUser.email,
        admin: newUser.admin,
        approver: newUser.approver,
        uploadPreapproval: newUser.uploadPreapproval,
      };
      return formatResponse(200, attributes);
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
