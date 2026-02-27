const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { PutItemCommand } = require("@aws-sdk/client-dynamodb");

const dynamodbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  try {
    // Parse the request body
    const body = JSON.parse(event.body || "{}");
    const { from, to, message } = body;

    // Validation
    if (!from || !to || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Missing required fields: from, to, message",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(from)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid email format for 'from' field",
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Validate message length
    const maxMessageLength = parseInt(process.env.MAX_MESSAGE_LENGTH, 10) || 5000;
    if (message.length > maxMessageLength) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Message is too long (max ${maxMessageLength} characters)`,
        }),
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };
    }

    // Generate timestamp for 'when' field and unique id
    const when = new Date().toISOString();
    const id = String(Date.now());

    // Put item into DynamoDB
    const params = {
      TableName: process.env.MESSAGES_TABLE_NAME,
      Item: {
        id: { S: id },
        from: { S: from },
        when: { S: when },
        to: { S: to },
        message: { S: message },
      },
    };

    await dynamodbClient.send(new PutItemCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Message stored successfully",
        when: when,
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (error) {
    console.error("Error processing message:", error);
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
