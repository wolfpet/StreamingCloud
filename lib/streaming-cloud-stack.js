//const { Stack, Duration } = require('aws-cdk-lib/core');
const fs = require("fs");
const path = require("path");
const cdk = require("aws-cdk-lib");
const { Stack, RemovalPolicy, CfnOutput } = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const s3deploy = require("aws-cdk-lib/aws-s3-deployment");
const lambda = require("aws-cdk-lib/aws-lambda");
const lambdaEventSources = require("aws-cdk-lib/aws-lambda-event-sources");
const sfn = require("aws-cdk-lib/aws-stepfunctions");
const tasks = require("aws-cdk-lib/aws-stepfunctions-tasks");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const cf = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const route53 = require("aws-cdk-lib/aws-route53");
const route53targets = require("aws-cdk-lib/aws-route53-targets");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const scheduler = require("aws-cdk-lib/aws-scheduler");
const schedulerTargets = require("aws-cdk-lib/aws-scheduler-targets");
const { loadSiteConfig, toStackConfig } = require("./load-site-config");

class StreamingCloudStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */

  constructor(scope, id, props) {
    super(scope, id, props);

    // Load site configuration from site.config.json
    const siteConfig = loadSiteConfig();

    // Domain configuration - driven by site.config.json
    const domainName = siteConfig.site.domainName;
    const domainPrefix = siteConfig._derived.domainPrefix;

    // Tunable constants - driven by site.config.json
    const config = toStackConfig(siteConfig);

    // 0. Cognito User Pool for Authentication
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${domainPrefix}-pool`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },      autoVerify: {
        email: false,
      },      passwordPolicy: {
        minLength: config.MIN_PASSWORD_LENGTH,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Create User Pool Client (for your frontend)
    const userPoolClient = userPool.addClient("UserPoolClient", {
      userPoolClientName: `${domainPrefix}-client`,
      generateSecret: false,  // No secret for browser-based OAuth flow
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true,  
        allowUserPasswordAuth: true,
      },
      // Token validity - refresh token lasts 365 days
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(config.REFRESH_TOKEN_VALIDITY_DAYS),
      enableTokenRevocation: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          `https://${domainName}/`,
          `https://www.${domainName}/`,
          "http://localhost:3000/",
        ],
        logoutUrls: [
          `https://${domainName}/`,
          `https://www.${domainName}/`,
          "http://localhost:3000/",
        ],
      },
    });

    // Create User Pool Domain
    const userPoolDomain = userPool.addDomain("UserPoolDomain", {
      cognitoDomain: {
        domainPrefix: domainPrefix,
      },
    });

    // Add Google Identity Provider
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      "GoogleProvider",
      {
        userPool,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecretValue: cdk.SecretValue.unsafePlainText(
          process.env.GOOGLE_CLIENT_SECRET
        ),
        scopes: ["profile", "email"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
        },
      }
    );

    userPoolClient.node.addDependency(googleProvider);

    // 1. DynamoDB Table for Podcasts
    const podcastTable = new dynamodb.Table(this, "PodcastTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
    });

    // Add GSI for artist search
    podcastTable.addGlobalSecondaryIndex({
      indexName: "ArtistIndex",
      partitionKey: { name: "artist", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    // Add GSI for title search
    podcastTable.addGlobalSecondaryIndex({
      indexName: "TitleIndex",
      partitionKey: { name: "title", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // 1.5. DynamoDB Table for Users
    const usersTable = new dynamodb.Table(this, "ProcastUsersTable", {
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 1.6. DynamoDB Table for Messages
    const messagesTable = new dynamodb.Table(this, "MessagesTable", {
      partitionKey: { name: "from", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "when", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Add Global Secondary Index on "to" attribute for querying messages by recipient
    messagesTable.addGlobalSecondaryIndex({
      indexName: "to-index",
      partitionKey: { name: "to", type: dynamodb.AttributeType.STRING },
    });

    // 1.7. DynamoDB Table for Playback History
    const playbackHistoryTable = new dynamodb.Table(this, "PlaybackHistoryTable", {
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "podcastId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    // 1.8. DynamoDB Table for Bookmarks
    const bookmarksTable = new dynamodb.Table(this, "BookmarksTable", {
      partitionKey: { name: "email", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 2. Lambda function for Cognito Post-Confirmation trigger
    const postSignUpLambda = new lambda.Function(this, "PostSignUpFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "postSignUp.handler",
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });

    // Grant Lambda permission to write to users table
    usersTable.grantWriteData(postSignUpLambda);

    // Add Lambda trigger to Cognito User Pool
    userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, postSignUpLambda);

    // 2b. Lambda function for PreSignUp trigger (auto-confirm users)
    const preSignUpLambda = new lambda.Function(this, "PreSignUpFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "preSignUp.handler",
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
    });

    // Add PreSignUp trigger to auto-confirm users
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUpLambda);

    // 2c. Lambda function for Adding Messages
    const addMessageLambda = new lambda.Function(this, "AddMessageHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "add_message.handler",
      environment: {
        MESSAGES_TABLE_NAME: messagesTable.tableName,
        MAX_MESSAGE_LENGTH: String(config.MAX_MESSAGE_LENGTH),
      },
    });

    // Grant Lambda permissions to write to messages table
    messagesTable.grantWriteData(addMessageLambda);

    // 2d. Lambda function for Syncing Playback History
    const historysSyncLambda = new lambda.Function(this, "HistorySyncHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "history_sync.handler",
      environment: {
        PLAYBACK_HISTORY_TABLE_NAME: playbackHistoryTable.tableName,
        PLAYBACK_HISTORY_TTL_DAYS: String(config.PLAYBACK_HISTORY_TTL_DAYS),
      },
    });

    // Grant Lambda permissions to write to playback history table
    playbackHistoryTable.grantReadWriteData(historysSyncLambda);

    // 2e. Lambda function for Syncing Single Track Playback
    const trackSyncLambda = new lambda.Function(this, "TrackSyncHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "track_sync.handler",
      environment: {
        PLAYBACK_HISTORY_TABLE_NAME: playbackHistoryTable.tableName,
        PLAYBACK_HISTORY_TTL_DAYS: String(config.PLAYBACK_HISTORY_TTL_DAYS),
      },
    });

    // Grant Lambda permissions to read/write to playback history table
    playbackHistoryTable.grantReadWriteData(trackSyncLambda);

    // 2f. Lambda function for Resetting Playback History
    const historyResetLambda = new lambda.Function(this, "HistoryResetHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "history_reset.handler",
      environment: {
        PLAYBACK_HISTORY_TABLE_NAME: playbackHistoryTable.tableName,
      },
    });

    // Grant Lambda permissions to read/write to playback history table
    playbackHistoryTable.grantReadWriteData(historyResetLambda);

    // 3. S3 Bucket for Static Website
    const websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      websiteIndexDocument: "index.html",
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
    });

    // 2b. ACM Certificate for CloudFront
    // First, look up the hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: domainName,
    });

    const certificate = new acm.Certificate(this, "WebsiteCertificate", {
      domainName: domainName,
      subjectAlternativeNames: [`www.${domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // 2c. CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, "WebsiteDistribution", {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      domainNames: [domainName, `www.${domainName}`],
      certificate: certificate,
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    });

    // 2d. Route 53 Alias Records
    new route53.ARecord(this, "RootAliasRecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
      recordName: domainName,
    });

    new route53.ARecord(this, "WwwAliasRecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution)),
      recordName: `www.${domainName}`,
    });

    // 2d2. Lambda@Edge for Open Graph Tags
    // Note: Lambda@Edge doesn't support environment variables
    // The function will discover the table dynamically
    const ogTagsEdgeFunction = new cf.experimental.EdgeFunction(this, "OgTagsEdgeFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "lambdaEdgeOpenGraph.handler",
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
    });
    
    // 2d3. Lambda@Edge for URL Rewriting (Viewer Request)
    // Rewrites /track/* requests to /index.html so S3 can serve the file
    const rewriteEdgeFunction = new cf.experimental.EdgeFunction(this, "RewriteEdgeFunction", {
      runtime: lambda.Runtime.NODEJS_24_X,
      handler: "lambdaEdgeRewrite.handler",
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      timeout: cdk.Duration.seconds(5),
      memorySize: 128,
    });

    // Grant the edge function permission to read from DynamoDB
    podcastTable.grantReadData(ogTagsEdgeFunction);
    
    // Grant permission to list tables (for dynamic table discovery)
    ogTagsEdgeFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:ListTables'],
      resources: ['*'],
    }));

    // Add behavior for /track/* paths with Lambda@Edge
    distribution.addBehavior("/track/*", new origins.S3Origin(websiteBucket), {
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED, // Disable caching for dynamic OG tags
      edgeLambdas: [
        {
          functionVersion: rewriteEdgeFunction.currentVersion,
          eventType: cf.LambdaEdgeEventType.ORIGIN_REQUEST,
        },
        {
          functionVersion: ogTagsEdgeFunction.currentVersion,
          eventType: cf.LambdaEdgeEventType.ORIGIN_RESPONSE,
        },
      ],
    });

    // 2e. Route 53 MX Records for Email Forwarding (optional — configured in site.config.json)
    if (siteConfig.email?.provider && siteConfig.email.provider !== "none" && siteConfig.email.mxRecords?.length > 0) {
      new route53.MxRecord(this, "MxRecord", {
        zone: hostedZone,
        values: siteConfig.email.mxRecords.map((rec) => ({
          hostName: rec.hostName,
          priority: rec.priority,
        })),
      });

      // 2f. Route 53 TXT Record for email SPF
      if (siteConfig.email.spfRecord) {
        new route53.TxtRecord(this, "ForwardEmailRecord", {
          zone: hostedZone,
          values: [siteConfig.email.spfRecord],
        });
      }
    }

    // 3. Add Podcast Lambda Function
    const addPodcastLambda = new lambda.Function(this, "AddPodcastHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "add_podcast.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        BUCKET_NAME: websiteBucket.bucketName,
      },
    });
    // Grant Lambda permissions to access DynamoDB and S3
    podcastTable.grantReadWriteData(addPodcastLambda);
    usersTable.grantReadData(addPodcastLambda);
    websiteBucket.grantReadWrite(addPodcastLambda);

    // 3c. S3 Upload Lambda Function
    const s3UploadLambda = new lambda.Function(this, "S3UploadHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "s3_upload.handler",
      environment: {
        BUCKET_NAME: websiteBucket.bucketName,
        PRESIGNED_URL_EXPIRY_SECONDS: String(config.PRESIGNED_URL_EXPIRY_SECONDS),
      },
      timeout: cdk.Duration.seconds(30),
    });
    // Grant Lambda permissions to S3
    websiteBucket.grantReadWrite(s3UploadLambda);

    // 3d. Get Music Lambda Function
    const getMusicLambda = new lambda.Function(this, "GetMusicHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "get_music.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
      },
    });
    // Grant Lambda permissions to read from DynamoDB
    podcastTable.grantReadData(getMusicLambda);

    // 3d2. Get Pending Music Lambda Function
    const getPendingMusicLambda = new lambda.Function(this, "GetPendingMusicHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "get_pending_music.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });
    // Grant Lambda permissions to read from DynamoDB
    podcastTable.grantReadData(getPendingMusicLambda);
    usersTable.grantReadData(getPendingMusicLambda);

    // 3d3. Approve Upload Lambda Function
    const approveUploadLambda = new lambda.Function(this, "ApproveUploadHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "approve_upload.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });
    // Grant Lambda permissions to read from DynamoDB
    podcastTable.grantReadWriteData(approveUploadLambda);
    usersTable.grantReadData(approveUploadLambda);

    // 3e. Search Lambda Function
    const searchLambda = new lambda.Function(this, "SearchHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "search.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
      },
    });
    // Grant Lambda permissions to read from DynamoDB
    podcastTable.grantReadData(searchLambda);

    // 3f. My Podcasts Lambda Function
    const myPodcastsLambda = new lambda.Function(this, "MyPodcastsHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "myPodcasts.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
      },
    });
    // Grant Lambda permissions to read from DynamoDB
    podcastTable.grantReadData(myPodcastsLambda);

    // 3g. Add Bookmark Lambda Function
    const addBookmarkLambda = new lambda.Function(this, "AddBookmarkHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "add_bookmark.handler",
      environment: {
        BOOKMARKS_TABLE_NAME: bookmarksTable.tableName,
      },
    });
    // Grant Lambda permissions to read/write to Bookmarks table
    bookmarksTable.grantReadWriteData(addBookmarkLambda);

    // 3h. Get Bookmarks Lambda Function
    const getBookmarksLambda = new lambda.Function(this, "GetBookmarksHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "get_bookmarks.handler",
      environment: {
        BOOKMARKS_TABLE_NAME: bookmarksTable.tableName,
      },
    });
    // Grant Lambda permissions to read from Bookmarks table
    bookmarksTable.grantReadData(getBookmarksLambda);

    // 3i. Delete Bookmark Lambda Function
    const deleteBookmarkLambda = new lambda.Function(this, "DeleteBookmarkHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "delete_bookmark.handler",
      environment: {
        BOOKMARKS_TABLE_NAME: bookmarksTable.tableName,
      },
    });
    // Grant Lambda permissions to delete from Bookmarks table
    bookmarksTable.grantWriteData(deleteBookmarkLambda);

    // 3j. RSS Feed Lambda Function
    const rssLambda = new lambda.Function(this, "RSSHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "rss.handler",
      environment: {
        TABLE_NAME: podcastTable.tableName,
        BUCKET_NAME: websiteBucket.bucketName,
        DISTRIBUTION_ID: distribution.distributionId,
        SITE_URL: `https://${domainName}`,
        RSS_FEED_LIMIT: String(config.RSS_FEED_LIMIT),
        RSS_TITLE: siteConfig.rss.title,
        RSS_DESCRIPTION: siteConfig.rss.description,
        RSS_AUTHOR: siteConfig.rss.author,
        RSS_CATEGORY: siteConfig.rss.category,
        RSS_LANGUAGE: siteConfig.rss?.language || "en-us",
      },
      timeout: cdk.Duration.seconds(30),
    });
    // Grant Lambda permissions to read from DynamoDB, write to S3, and invalidate CloudFront
    podcastTable.grantReadData(rssLambda);
    websiteBucket.grantReadWrite(rssLambda);
    rssLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ["cloudfront:CreateInvalidation"],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
    }));

    // 3k. EventBridge Scheduler to trigger RSS Lambda periodically
    const rssSchedule = new scheduler.Schedule(this, "RSSSchedule", {
      schedule: scheduler.ScheduleExpression.rate(cdk.Duration.minutes(config.RSS_SCHEDULE_MINUTES)),
      target: new schedulerTargets.LambdaInvoke(rssLambda, {
        roleArn: new iam.Role(this, "RSSSchedulerRole", {
          assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
        }).roleArn,
      }),
      description: `Trigger RSS feed generation every ${config.RSS_SCHEDULE_MINUTES} minutes`,
      enabled: true,
    });

    // 3l. Get Volume Levels Lambda Function
    const ffmpegLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "FFmpegLayer",
      `arn:aws:lambda:${this.region}:${this.account}:layer:ffmpeg-layer:1`
    );

    const getVolumeLevelsLambda = new lambda.Function(this, "GetVolumeLevelsHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "get_volume_levels.handler",
      timeout: cdk.Duration.seconds(300),
      memorySize: config.VOLUME_LEVELS_MEMORY_MB,
      layers: [ffmpegLayer],
      description: "Analyzes audio files and returns volume levels at specific time points",
    });

    // 3m. Generate Waveform Lambda Function
    const generateWaveformLambda = new lambda.Function(this, "GenerateWaveformHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "generate_waveform.handler",
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        TABLE_NAME: podcastTable.tableName,
        WAVEFORM_WIDTH: String(config.WAVEFORM_WIDTH),
        WAVEFORM_HEIGHT: String(config.WAVEFORM_HEIGHT),
        ACCENT_COLOR: siteConfig.brand.accentColor,
      },
      description: "Generates waveform PNG from volume levels",
    });

    // Grant S3 write permissions
    websiteBucket.grantWrite(generateWaveformLambda);
    
    // Grant DynamoDB write permissions
    podcastTable.grantWriteData(generateWaveformLambda);

    // 3n. Waveform Generation Step Function
    const waveformStateMachine = new sfn.StateMachine(this, "WaveformStateMachine", {
      stateMachineName: `${domainPrefix}-WaveformGeneration`,
      definitionBody: sfn.DefinitionBody.fromChainable(
        new tasks.LambdaInvoke(this, "CallVolumeLevels", {
          lambdaFunction: getVolumeLevelsLambda,
          payload: sfn.TaskInput.fromObject({
            url: sfn.JsonPath.stringAt("$.audioUrl"),
            timePoints: sfn.JsonPath.listAt("$.timePoints"),
          }),
          resultSelector: {
            "parsedBody.$": "States.StringToJson($.Payload.body)",
          },
          resultPath: "$.volumeResult",
        }).next(
          new tasks.LambdaInvoke(this, "GenerateWaveform", {
            lambdaFunction: generateWaveformLambda,
            payload: sfn.TaskInput.fromObject({
              volumeLevels: sfn.JsonPath.objectAt("$.volumeResult.parsedBody.volumeLevels"),
              s3Key: sfn.JsonPath.stringAt("$.s3Key"),
              s3Bucket: sfn.JsonPath.stringAt("$.s3Bucket"),
              pk: sfn.JsonPath.stringAt("$.pk"),
              timestamp: sfn.JsonPath.stringAt("$.timestamp"),
            }),
          })
        )
      ),
      timeout: cdk.Duration.minutes(10),
    });

    // 3o. DynamoDB Stream Trigger Lambda
    const triggerWaveformLambda = new lambda.Function(this, "TriggerWaveformHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "trigger_waveform_generation.handler",
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        STATE_MACHINE_ARN: waveformStateMachine.stateMachineArn,
        S3_BUCKET: websiteBucket.bucketName,
      },
      description: "Triggers waveform generation when new podcast is added",
    });

    // Grant permissions
    waveformStateMachine.grantStartExecution(triggerWaveformLambda);

    // Add DynamoDB stream trigger
    triggerWaveformLambda.addEventSource(
      new lambdaEventSources.DynamoEventSource(podcastTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 1,
        retryAttempts: 2,
      })
    );

    // 3k. Get User Attributes Lambda Function
    const getUserAttributesLambda = new lambda.Function(this, "GetUserAttributesHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "get_user_attributes.handler",
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });
    // Grant Lambda permissions to read/write Users table (write needed for auto-creating federated users)
    usersTable.grantReadWriteData(getUserAttributesLambda);

    // 3l. Get User List Lambda Function
    const getUserListLambda = new lambda.Function(this, "GetUserListHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "get_user_list.handler",
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });
    // Grant Lambda permissions to read from Users table
    usersTable.grantReadData(getUserListLambda);

    // 3l.5. Set User Attribute Lambda Function
    const setUserAttributeLambda = new lambda.Function(this, "SetUserAttributeHandler", {
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset("lambda", { assetHashType: cdk.AssetHashType.SOURCE }),
      handler: "set_user_attribute.handler",
      environment: {
        USERS_TABLE_NAME: usersTable.tableName,
      },
    });
    // Grant Lambda permissions to read and write to Users table
    usersTable.grantReadWriteData(setUserAttributeLambda);

    // 3m. Get Admin Messages Lambda Function
    const getAdminMessagesLambda = new lambda.Function(
      this,
      "GetAdminMessagesHandler",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset("lambda", {
          assetHashType: cdk.AssetHashType.SOURCE,
        }),
        handler: "get_admin_messages.handler",
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          MESSAGES_TABLE_NAME: messagesTable.tableName,
        },
      },
    );
    // Grant Lambda permissions to read from Users and Messages tables
    usersTable.grantReadData(getAdminMessagesLambda);
    messagesTable.grantReadData(getAdminMessagesLambda);

    // 3n. Delete Message Lambda Function
    const deleteMessageLambda = new lambda.Function(
      this,
      "DeleteMessageHandler",
      {
        runtime: lambda.Runtime.NODEJS_24_X,
        code: lambda.Code.fromAsset("lambda", {
          assetHashType: cdk.AssetHashType.SOURCE,
        }),
        handler: "delete_message.handler",
        environment: {
          USERS_TABLE_NAME: usersTable.tableName,
          MESSAGES_TABLE_NAME: messagesTable.tableName,
        },
      },
    );
    // Grant Lambda permissions to read from Users table and write to Messages table
    usersTable.grantReadData(deleteMessageLambda);
    messagesTable.grantReadWriteData(deleteMessageLambda);

    // 4. API Gateway (Rest API)
    const api = new apigateway.RestApi(this, "hello-api", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    // Create Cognito Authorizer for protected endpoints
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "PodcastsCognitoAuthorizer",
      {
        cognitoUserPools: [userPool],
        identitySource: apigateway.IdentitySource.header("Authorization"),
      }
    );

    const integrationOptions = {
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            // This is the magic header that tells the browser it's okay
            "method.response.header.Access-Control-Allow-Origin": "'*'",
          },
        },
      ],
    };
    // Create /podcasts resource
    const podcastsResource = api.root.addResource("podcasts", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    // POST /podcasts - Add a new podcast
    podcastsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(addPodcastLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /s3-sign resource for S3 multipart uploads
    const s3SignResource = api.root.addResource("s3-sign", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    s3SignResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(s3UploadLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /s3-sign-part resource
    const s3SignPartResource = api.root.addResource("s3-sign-part", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    s3SignPartResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(s3UploadLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /s3-complete resource
    const s3CompleteResource = api.root.addResource("s3-complete", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    s3CompleteResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(s3UploadLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /music resource for fetching podcasts
    const musicResource = api.root.addResource("music", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    musicResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getMusicLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /search resource for searching podcasts by artist
    const searchResource = api.root.addResource("search", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    searchResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(searchLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /my-podcasts resource for fetching user's podcasts
    const myPodcastsResource = api.root.addResource("my-podcasts", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    myPodcastsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(myPodcastsLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /pending-music resource for fetching pending podcasts (admin only)
    const pendingMusicResource = api.root.addResource("pending-music", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    pendingMusicResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getPendingMusicLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /approve-upload resource for approving uploads
    const approveUploadResource = api.root.addResource("approve-upload", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    approveUploadResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(approveUploadLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /add-bookmark resource for adding bookmarks
    const addBookmarkResource = api.root.addResource("add-bookmark", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    addBookmarkResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(addBookmarkLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /get-bookmarks resource for retrieving bookmarks
    const getBookmarksResource = api.root.addResource("get-bookmarks", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    getBookmarksResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getBookmarksLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /delete-bookmark resource for deleting bookmarks
    const deleteBookmarkResource = api.root.addResource("delete-bookmark", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    deleteBookmarkResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(deleteBookmarkLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /rss resource for generating RSS feed
    const rssResource = api.root.addResource("rss", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    rssResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(rssLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /volume-levels resource for analyzing audio volume
    const volumeLevelsResource = api.root.addResource("volume-levels", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    volumeLevelsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(getVolumeLevelsLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /messages resource for adding messages
    const messagesResource = api.root.addResource("messages", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    messagesResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(addMessageLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /history-sync resource for syncing playback history
    const historySyncResource = api.root.addResource("history-sync", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    historySyncResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(historysSyncLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /track-sync resource for syncing individual track playback
    const trackSyncResource = api.root.addResource("track-sync", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    trackSyncResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(trackSyncLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /history-reset resource for resetting playback history
    const historyResetResource = api.root.addResource("history-reset", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    historyResetResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(historyResetLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /user-attributes resource for retrieving user attributes
    const userAttributesResource = api.root.addResource("user-attributes", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    userAttributesResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getUserAttributesLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /user-list resource for retrieving all users with pagination
    const userListResource = api.root.addResource("user-list", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    userListResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getUserListLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /set-user-attribute resource for updating user attributes
    const setUserAttributeResource = api.root.addResource("set-user-attribute", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    setUserAttributeResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(setUserAttributeLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /admin-messages resource for retrieving messages sent to admin
    const adminMessagesResource = api.root.addResource("admin-messages", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    adminMessagesResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getAdminMessagesLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // Create /admin-messages/{id} resource for deleting a specific message
    const adminMessageByIdResource = adminMessagesResource.addResource("{id}", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
        ],
      },
    });

    adminMessageByIdResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(deleteMessageLambda, {
        integrationResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": "'*'",
            },
          },
        ],
      }),
      {
        authorizer: cognitoAuthorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          {
            statusCode: "200",
            responseParameters: {
              "method.response.header.Access-Control-Allow-Origin": true,
            },
          },
        ],
      },
    );

    // 5. Deploy Frontend to S3 with CloudFront Invalidation
    // Brand-override sources (if the directory exists) are added AFTER the
    // base frontend source so that they overwrite defaults in a single
    // atomic deployment — no ordering race between separate constructs.
    const brandOverridePath = path.resolve(__dirname, "..", "brand-override");
    const frontendSources = [s3deploy.Source.asset("./frontend")];
    if (fs.existsSync(brandOverridePath)) {
      frontendSources.push(s3deploy.Source.asset(brandOverridePath));
    }

    const frontendDeployment = new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: frontendSources,
      destinationBucket: websiteBucket,
      distribution: distribution,
      distributionPaths: ["/*"],
      prune: false,
    });

    // 6b. Deploy dynamically-generated env.js with resolved API URL, Cognito config, and brand values
    // Must run after DeployWebsite so the CDK-generated env.js overwrites the local dev copy
    const cognitoDomainFull = `${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;
    const envConfigDeployment = new s3deploy.BucketDeployment(this, "DeployEnvConfig", {
      sources: [
        s3deploy.Source.data(
          "scripts/env.js",
          [
            '// Auto-generated by CDK at deploy time - do not edit',
            `window.APP_CONFIG = {`,
            `  API_URL: "${api.url}",`,
            `  AWS_REGION: "${this.region}",`,
            `  USER_POOL_ID: "${userPool.userPoolId}",`,
            `  CLIENT_ID: "${userPoolClient.userPoolClientId}",`,
            `  COGNITO_DOMAIN: "${cognitoDomainFull}",`,
            `  PLAYBACK_HISTORY_TTL_DAYS: ${config.PLAYBACK_HISTORY_TTL_DAYS},`,
            `  EXPIRED_MARKER_TTL_DAYS: ${config.EXPIRED_MARKER_TTL_DAYS},`,
            `  SITE_NAME: "${siteConfig.site.title}",`,
            `  SITE_TAGLINE: "${siteConfig.site.tagline || ''}",`,
            `  SITE_PLAYER_SUBTITLE: "${siteConfig.site.playerSubtitle || ''}",`,
            `  ACCENT_COLOR: "${siteConfig.brand.accentColor}",`,
            `  ACCENT_COLOR_LIGHT: "${siteConfig.brand.accentColorLight || siteConfig.brand.accentColor}",`,
            `  CONTACT_EMAIL: "${siteConfig.site.contactEmail}",`,
            `  CONSOLE_BANNER_EMOJI: "${siteConfig.brand.consoleBannerEmoji || '🎵'}",`,
            `  GOOGLE_SITE_VERIFICATION: "${siteConfig.seo?.googleSiteVerification || ''}"`,
            `};`,
          ].join('\n') + '\n'
        ),
      ],
      destinationBucket: websiteBucket,
      distribution: distribution,
      distributionPaths: ["/scripts/env.js"],
      prune: false,
    });
    envConfigDeployment.node.addDependency(frontendDeployment);
    // Outputs
    new CfnOutput(this, "ApiUrl", { value: api.url });
    new CfnOutput(this, "WebsiteUrl", {
      value: websiteBucket.bucketWebsiteUrl,
    });
    new CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront distribution URL",
    });
    new CfnOutput(this, "CustomDomainUrl", {
      value: `https://${domainName}`,
      description: "Production domain URL",
    });
    new CfnOutput(this, "TableName", { value: podcastTable.tableName });
    
    // Cognito Outputs
    new CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito User Pool Client ID",
    });
    new CfnOutput(this, "CognitoDomain", {
      value: userPoolDomain.domainName,
      description: "Cognito Domain for OAuth",
    });
    new CfnOutput(this, "CognitoAuthUrl", {
      value: `https://${userPoolDomain.domainName}/login?client_id=${userPoolClient.userPoolClientId}&response_type=code&redirect_uri=https://${domainName}/`,
      description: "Cognito login URL",
    });
  }
}

module.exports = { StreamingCloudStack };


