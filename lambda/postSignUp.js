const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USERS_TABLE_NAME;

exports.handler = async (event) => {
  console.log("Post signup event:", JSON.stringify(event, null, 2));
  
  const userAttributes = event.request.userAttributes;
  const email = userAttributes.email;
  const picture = userAttributes.picture || null;
  const givenName = userAttributes.given_name || "User";
  
  try {
    await docClient.send(new PutCommand({
      TableName: tableName,
      Item: {
        email: email,
        given_name: givenName,
        picture: picture,
        admin: false,
        approver: false,
        uploadPreapproval: false,        
        createdAt: new Date().toISOString(),
      }
    }));
    
    console.log("User added to DynamoDB:", email);
    return event;
  } catch (error) {
    console.error("Error adding user to DynamoDB:", error);
    throw error;
  }
};
