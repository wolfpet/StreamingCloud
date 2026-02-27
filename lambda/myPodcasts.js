// lambda/myPodcasts.js
const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME;

exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        // Get email from authenticated Cognito token
        const claims = event.requestContext.authorizer.claims;
        const email = claims.email;

        // Validate email from token
        if (!email) {
            return formatResponse(400, { error: "Missing email in authentication token" });
        }
        
        console.log(`Querying podcasts for email: ${email}`);
        
        const params = {
            TableName: tableName,
            FilterExpression: 'email = :email',
            ExpressionAttributeValues: {
                ':email': { S: email }
            }
        };
        
        const command = new ScanCommand(params);
        const result = await dynamodb.send(command);
        
        // Unmarshall the items
        const items = result.Items.map(item => unmarshall(item));
        // Sort by timestamp, newest first
        items.sort((a, b) => {
            const timeA = new Date(a.timestamp || 0).getTime();
            const timeB = new Date(b.timestamp || 0).getTime();
            return timeB - timeA; // Descending order (newest first)
        });
        console.log(`Found ${items.length} podcasts for email: ${email}`);
        
        // Prepare response
        const response = {
            items: items,
            count: result.Items.length,
            scannedCount: result.ScannedCount
        };
        
        return formatResponse(200, response);
    } catch (error) {
        console.error("Error:", error);
        return formatResponse(500, { error: error.message });
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
