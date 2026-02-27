const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
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
            return formatResponse(401, { error: "Unauthorized: Missing email in authentication token" });
        }

        console.log(`Checking admin/approver status for email: ${email}`);

        // Check if user is admin or approver in PodcastUsers table
        const userResponse = await docClient.send(
            new GetCommand({
                TableName: usersTableName,
                Key: {
                    email: email,
                },
            })
        );

        // If user not found or neither admin nor approver, return 403
        if (!userResponse.Item || (userResponse.Item.admin !== true && userResponse.Item.approver !== true)) {
            console.log(`User ${email} is not admin or approver`);
            return formatResponse(403, { error: "Forbidden: User is not an admin or approver" });
        }

        console.log(`User ${email} is authorized, processing upload approval`);

        // Get id and verdict from query parameters
        const queryParams = event.queryStringParameters || {};
        const id = queryParams.id;
        const verdict = queryParams.verdict;

        if (!id || !verdict) {
            return formatResponse(400, { error: "Missing required parameters: id, verdict" });
        }

        console.log(`Updating podcast ${id} with status: ${verdict}`);

        // Query podcasts table to find the item by id
        const queryParams2 = {
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk',
            FilterExpression: 'id = :id',
            ExpressionAttributeValues: {
                ':pk': { S: 'PODCASTS' },
                ':id': { S: id }
            }
        };

        const command = new QueryCommand(queryParams2);
        const result = await client.send(command);

        if (!result.Items || result.Items.length === 0) {
            console.log(`Podcast with id ${id} not found`);
            return formatResponse(404, { error: "Podcast not found" });
        }

        const podcast = unmarshall(result.Items[0]);
        const timestamp = podcast.timestamp;

        // Update the podcast status
        const updateParams = {
            TableName: tableName,
            Key: {
                pk: 'PODCASTS',
                timestamp: timestamp
            },
            UpdateExpression: 'SET #status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': verdict
            },
            ReturnValues: 'ALL_NEW'
        };

        const updateCommand = new UpdateCommand(updateParams);
        const updateResult = await docClient.send(updateCommand);

        console.log(`Successfully updated podcast ${id} with status: ${verdict}`);

        return formatResponse(200, {
            message: "Upload approved successfully",
            id: id,
            status: updateResult.Attributes.status
        });
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
