// lambda/get_pending_music.js
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.TABLE_NAME;
const usersTableName = process.env.USERS_TABLE_NAME;

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

        console.log(`Checking admin/approver status for email: ${email}`);

        // Check if user is admin in PodcastUsers table
        const userResponse = await docClient.send(
            new GetCommand({
                TableName: usersTableName,
                Key: {
                    email: email,
                },
            })
        );

        // If user not found return 401
        if (!userResponse.Item) {
            console.log(`User ${email} is missing`);
            console.log(`userResponse: ${JSON.stringify(userResponse)}`);
            return formatResponse(401, { error: "Unauthorized: User not found."  });
        }
        //check the permissions
        if(userResponse.Item.admin !== true) {
            console.log(`User ${email} is not admin. checkin if approver`);
            if(userResponse.Item.approver !== true) {
                console.log(`User ${email} is not approver either`);
                return formatResponse(403, { error: "Unauthorized: User is neither an admin nor an approver." });
            }            
        }

        console.log(`User ${email} is admin, fetching pending podcasts`);

        // Parse pagination parameters from query string
        const queryParams = event.queryStringParameters || {};
        const limit = parseInt(queryParams.limit) || 50;
        const direction = queryParams.direction || 'first'; // 'first', 'next'
        const lastEvaluatedKey = queryParams.lastKey ? JSON.parse(decodeURIComponent(queryParams.lastKey)) : undefined;

        const params = {
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk',
            ProjectionExpression: 'pk, sk, id, artist, title, artwork, #d, waveformUrl, audioUrl, audioUrlRelative',
            ExpressionAttributeValues: {
                ':pk': { S: 'PODCASTS' },
                ':pending': { S: 'pending' },
                ':empty': { S: '' }
            },
            FilterExpression: '#status = :pending OR #status = :empty OR attribute_not_exists(#status)',
            ExpressionAttributeNames: {
                '#status': 'status',
                '#d': 'duration'
            },
            Limit: limit,
            ScanIndexForward: false, // Sort by most recent first (descending timestamp)
        };

        // Handle pagination
        if (direction === 'next' && lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const command = new QueryCommand(params);
        const result = await client.send(command);

        // Unmarshall the items
        const items = result.Items.map(item => unmarshall(item));

        // Prepare response
        const response = {
            items: items,
            count: result.Items.length,
            lastEvaluatedKey: result.LastEvaluatedKey ? result.LastEvaluatedKey : null,
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
