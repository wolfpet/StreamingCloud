// lambda/delete_message.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  DeleteCommand,
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

    // Get message ID from path parameter
    const messageId = event.pathParameters?.id;

    if (!messageId) {
      return formatResponse(400, { error: "Missing message ID in path" });
    }

    console.log(`User ${email} is admin, deleting message with ID: ${messageId}`);

    // Scan for message with matching ID
    const scanResponse = await docClient.send(
      new ScanCommand({
        TableName: messagesTableName,
        FilterExpression: "id = :id",
        ExpressionAttributeValues: {
          ":id": messageId,
        },
      }),
    );

    if (!scanResponse.Items || scanResponse.Items.length === 0) {
      return formatResponse(404, { error: "Message not found" });
    }

    const messageToDelete = scanResponse.Items[0];

    // Delete the message using the composite key (from, when)
    await docClient.send(
      new DeleteCommand({
        TableName: messagesTableName,
        Key: {
          from: messageToDelete.from,
          when: messageToDelete.when,
        },
      }),
    );

    console.log(`Successfully deleted message with ID: ${messageId}`);

    return formatResponse(200, {
      message: "Message deleted successfully",
      id: messageId,
    });
  } catch (error) {
    console.error("Error deleting message:", error);
    return formatResponse(500, {
      error: "Failed to delete message",
      message: error.message,
    });
  }
};
