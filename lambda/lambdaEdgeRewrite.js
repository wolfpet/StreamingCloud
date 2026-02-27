// Lambda@Edge function to rewrite /track/* requests to /index.html
// Runs on Origin Request event - right before CloudFront contacts S3
// Custom headers set here ARE visible in Origin Response Lambda

exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const uri = request.uri;

  console.log(`Origin Request - original URI: ${uri}`);

  // Match /track/podcast-* requests
  const match = uri.match(/^\/track\/(podcast-\d+)$/);
  if (match) {
    const podcastId = match[1];
    console.log(`Matched track path with podcastId: ${podcastId}`);
    
    // Rewrite to /index.html
    request.uri = '/index.html';
    
    // Add custom header with podcast ID (survives to Origin Response)
    request.headers['x-podcast-id'] = [{
      key: 'X-Podcast-Id',
      value: podcastId
    }];
    
    console.log(`Rewritten to /index.html, set header X-Podcast-Id: ${podcastId}`);
  }

  return request;
};
