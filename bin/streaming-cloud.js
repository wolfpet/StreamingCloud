#!/usr/bin/env node

const cdk = require('aws-cdk-lib/core');
const { StreamingCloudStack } = require('../lib/streaming-cloud-stack');
const { loadSiteConfig } = require('../lib/load-site-config');

// Derive a unique stack name from the domain so that multiple deployments
// (e.g. techno-podcasts.com vs test.techno-podcasts.com) never share the
// same CDK support stack in us-east-1 and thus never clobber each other's
// Lambda@Edge functions.
const siteConfig = loadSiteConfig();
const stackName = `StreamingCloudStack-${siteConfig._derived.domainPrefix}`;

const app = new cdk.App();
new StreamingCloudStack(app, stackName, {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});
