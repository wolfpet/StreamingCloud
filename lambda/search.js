// lambda/search.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");

const dynamodb = new DynamoDBClient({});
const tableName = process.env.TABLE_NAME;
const indexName = "ArtistIndex";

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Get search keyword from query parameters
    let keyword = event.queryStringParameters?.keyword;

    // Validate keyword
    if (!keyword || keyword.trim() === "") {
      return formatResponse(400, { error: "Keyword is required" });
    }

    let searchKeyword = keyword.trim();

    //Normalize search keyword to ASCII ( to remove accents (diacritics) from a string, turning characters like é into e or ñ into n)
    searchKeyword = searchKeyword.replace(/[øØ]/g, "o").replace(/[łŁ]/g, "l").replace(/[æÆ]/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Check if this is a multi-artist search (starts with "_artt15sts:")
    let isMultiArtistSearch = false;
    let artistNames = [];
    
    if (searchKeyword.toLowerCase().startsWith("_artt15sts:")) {
      isMultiArtistSearch = true;
      const artistsString = searchKeyword.substring(11).trim(); // Remove "_artt15sts:" prefix
      artistNames = artistsString.split(",").map(name => name.trim().toLowerCase()).filter(name => name.length > 0);
      
      if (artistNames.length === 0) {
        return formatResponse(400, { error: "At least one artist name required after '_artt15sts:'" });
      }
      
      console.log(`Multi-artist search for: ${artistNames.join(", ")}`);
    }

    // Perform the scan
    const params = {
      TableName: tableName,
      IndexName: indexName,
      ProjectionExpression: 'pk, sk, id, artist, title, artwork, #d, waveformUrl, audioUrl, audioUrlRelative',
      FilterExpression: buildFilterExpression(searchKeyword, isMultiArtistSearch, artistNames.length),
      ExpressionAttributeValues: buildExpressionValues(searchKeyword, artistNames, isMultiArtistSearch),
      ExpressionAttributeNames: {
        '#d': 'duration'
      }
    };
    
    const command = new ScanCommand(params);
    const result = await dynamodb.send(command);

    // Prepare response
    const response = {
      items: result.Items || [],
      count: result.Count || 0,
      keyword: searchKeyword,
      searchType: isMultiArtistSearch ? "multi-artist" : "standard",
      matchedArtists: isMultiArtistSearch ? artistNames : undefined,
      scannedCount: result.ScannedCount,
    };

    return formatResponse(200, response);
  } catch (error) {
    console.error("Error:", error);
    return formatResponse(500, { error: error.message });
  }
};

/**
 * Build filter expression based on search type
 */
function buildFilterExpression(searchKeyword, isMultiArtistSearch, artistCount) {
  if (isMultiArtistSearch) {
    // For multi-artist: match ANY artist in the list using contains (partial match, lowercase)
    return "(" + Array(artistCount)
      .fill(0)
      .map((_, i) => `contains(artist_lowercase, :artist${i})`)
      .join(" OR ") + ")";
  } else {
    // Standard search: keyword in artist, title, or id (commas treated as literal part of search)
    return 'contains(artist_lowercase, :keyword) OR contains(title_lowercase, :keyword) OR contains(id, :keyword)';
  }
}

/**
 * Build expression attribute values based on search type
 */
function buildExpressionValues(searchKeyword, artistNames, isMultiArtistSearch) {
  if (isMultiArtistSearch) {
    const values = {};
    artistNames.forEach((artist, i) => {
      values[`:artist${i}`] = artist;
    });
    return values;
  } else {
    return {
      ':keyword': searchKeyword.toLowerCase(),
    };
  }
}

function formatResponse(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
