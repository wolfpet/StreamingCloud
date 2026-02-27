// Lambda@Edge function to inject Open Graph tags for track sharing
// Triggered on CloudFront Viewer Response for /track/* URLs
// Must be deployed to us-east-1 and published as a version

const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

// Cache the table name after first lookup
let cachedTableName = null;

// Helper function to find the podcast table
async function getPodcastTableName() {
  if (cachedTableName) {
    return cachedTableName;
  }
  
  try {
    const result = await client.send(new ListTablesCommand({}));
    const tables = result.TableNames || [];
    
    // Find table that contains "PodcastTable" in the name
    const podcastTable = tables.find(name => name.includes('PodcastTable'));
    
    if (!podcastTable) {
      console.error('No PodcastTable found');
      return null;
    }
    
    cachedTableName = podcastTable;
    return podcastTable;
  } catch (error) {
    console.error('Error finding table:', error);
    return null;
  }
}

// Helper function to escape HTML special characters
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Helper function to fetch track data from DynamoDB
async function getTrackData(podcastId) {
  try {
    const tableName = await getPodcastTableName();
    if (!tableName) {
      throw new Error('Could not find podcast table');
    }
    
    console.log(`Querying table ${tableName} for podcast ${podcastId}`);
    
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: 'id = :id',
        ExpressionAttributeValues: {
          ':pk': 'PODCASTS',
          ':id': podcastId,
        },
        // Removed Limit: 1 because FilterExpression is applied after the query
        // Need to scan all items in the partition to find the matching id
      })
    );

    console.log(`Query result - Count: ${result.Count}, ScannedCount: ${result.ScannedCount}`);
    
    if (result.Items && result.Items.length > 0) {
      console.log(`Found track: ${result.Items[0].title || 'Unknown'}`);
      return result.Items[0];
    }
    
    console.log(`No matching track found for ID: ${podcastId}`);
    return null;
  } catch (error) {
    console.error(`Error fetching track ${podcastId}:`, error);
    return null;
  }
}

// Helper function to generate HTML with OG tags
function generateHtmlWithOgTags(track, trackUrl, podcastId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(track.title || 'Podcast Track')}</title>
  
  <!-- Open Graph tags for social media -->
  <meta property="og:title" content="${escapeHtml(track.title || 'Podcast Track')}" />
  <meta property="og:description" content="${escapeHtml(track.artist || 'Unknown Artist')}" />
  <meta property="og:image" content="${escapeHtml(track.artwork || '')}" />
  <meta property="og:url" content="${escapeHtml(trackUrl)}" />
  <meta property="og:type" content="music.song" />
  
  <!-- Twitter Card tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(track.title || 'Podcast Track')}" />
  <meta name="twitter:description" content="${escapeHtml(track.artist || 'Unknown Artist')}" />
  <meta name="twitter:image" content="${escapeHtml(track.artwork || '')}" />
  
  <!-- Redirect to main SPA with track parameter (for crawlers and users) -->
  <meta http-equiv="refresh" content="0;url=/?track=${podcastId}" />
  
  <script>
    // Redirect immediately for regular users to show the specific track
    window.location.href = '/?track=${podcastId}';
  </script>
</head>
<body>
  <h1>${escapeHtml(track.title || 'Podcast Track')}</h1>
  <p>by ${escapeHtml(track.artist || 'Unknown Artist')}</p>
  <p>Redirecting to player...</p>
</body>
</html>`;
}

exports.handler = async (event) => {
  try {
    const response = event.Records[0].cf.response;
    const request = event.Records[0].cf.request;
    const host = request.headers.host[0].value;

    // Extract podcast ID from custom header (set by Viewer Request Lambda)
    console.log(`Request URI: ${request.uri}`);
    console.log(`Request headers: ${JSON.stringify(Object.keys(request.headers))}`);
    
    let podcastId = null;
    if (request.headers['x-podcast-id']) {
      podcastId = request.headers['x-podcast-id'][0].value;
      console.log(`Extracted podcastId from header: ${podcastId}`);
    } else {
      console.log(`No x-podcast-id header found in request`);
    }

    console.log(`Processing request with podcast ID: ${podcastId}`);
    console.log(`Response status: ${response.status}`);

    // Only process requests with a podcast ID
    if (podcastId) {
      console.log(`Found podcast ID: ${podcastId}, fetching data...`);

      // Fetch track data from DynamoDB
      const trackData = await getTrackData(podcastId);

      if (trackData) {
        console.log(`Found track: ${trackData.title} by ${trackData.artist}`);

        // Build the track URL
        const trackUrl = `https://${host}/track/${podcastId}`;

        // Generate HTML with OG tags and redirect
        const html = generateHtmlWithOgTags(trackData, trackUrl, podcastId);

        // Replace the response with our custom HTML
        response.status = '200';
        response.statusDescription = 'OK';
        response.body = html;
        response.headers['content-type'] = [{ key: 'Content-Type', value: 'text/html; charset=utf-8' }];

        console.log('Generated HTML with OG tags');
      } else {
        console.log(`Track ${podcastId} not found in database`);
      }
    } else {
      console.log(`No podcast ID found, returning original response`);
    }

    return response;
  } catch (error) {
    console.error('Error in Lambda@Edge handler:', error);
    // Return original response on error to avoid breaking the site
    return event.Records[0].cf.response;
  }
};
