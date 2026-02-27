const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.BOOKMARKS_TABLE_NAME;

exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        // Get email from authenticated Cognito token
        const claims = event.requestContext.authorizer.claims;
        const authenticatedEmail = claims.email;

        if (!authenticatedEmail) {
            return formatResponse(400, { error: "Missing email in authentication token" });
        }

        const body = JSON.parse(event.body);
        const { email, id } = body;
        
        // Validate that the request email matches the authenticated email
        if (!email) {
            return formatResponse(400, { error: "Email is required" });
        }

        if (email !== authenticatedEmail) {
            return formatResponse(403, { error: "Forbidden: Cannot delete bookmark for a different user" });
        }

        if (!id) {
            return formatResponse(400, { error: "ID is required" });
        }
        
        // Delete the bookmark by email (partition key) and id (sort key)
        const deleteParams = {
            TableName: tableName,
            Key: { 
                email: authenticatedEmail,
                id: id
            }
        };
        
        await docClient.send(new DeleteCommand(deleteParams));
        
        console.log(`Deleted bookmark with ID ${id} for email ${authenticatedEmail}`);
        
        return formatResponse(200, { 
            message: "Bookmark deleted successfully",
            email: authenticatedEmail,
            id
        });
    } catch (error) {
        console.error("Error deleting bookmark:", error);
        return formatResponse(500, { error: "Failed to delete bookmark", message: error.message });
    }
};

function formatResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}