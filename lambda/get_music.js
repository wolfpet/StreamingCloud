// lambda/get_music.js
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

const dynamodb = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME;

exports.handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    try {
        // Parse query parameters
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
                ':status': { S: 'approved' }
            },
            FilterExpression: 'attribute_not_exists(#status) OR #status = :status',
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
        const result = await dynamodb.send(command);
        
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
