/**
 * Site Configuration Loader
 *
 * Loads site.config.json and provides validated config to the CDK stack,
 * deploy scripts, and build tooling.
 *
 * For a new deployment:
 *   1. Copy site.config.example.json → site.config.json
 *   2. Fill in your values (domain, brand name, colors, etc.)
 *   3. Run `cdk deploy`
 */

const fs = require("fs");
const path = require("path");

const CONFIG_FILENAME = "site.config.json";
const EXAMPLE_FILENAME = "site.config.example.json";

/**
 * Load and validate site configuration.
 * @returns {object} The parsed site config
 * @throws {Error} If site.config.json is missing or invalid
 */
function loadSiteConfig() {
  const configPath = path.resolve(__dirname, "..", CONFIG_FILENAME);

  if (!fs.existsSync(configPath)) {
    const examplePath = path.resolve(__dirname, "..", EXAMPLE_FILENAME);
    throw new Error(
      `${CONFIG_FILENAME} not found.\n` +
        `Copy ${EXAMPLE_FILENAME} to ${CONFIG_FILENAME} and fill in your values:\n` +
        `  cp ${EXAMPLE_FILENAME} ${CONFIG_FILENAME}\n` +
        (fs.existsSync(examplePath) ? "" : `  (${EXAMPLE_FILENAME} is also missing!)\n`)
    );
  }

  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read ${CONFIG_FILENAME}: ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${err.message}`);
  }

  // Validate required fields
  const required = [
    ["site.domainName", config.site?.domainName],
    ["site.title", config.site?.title],
    ["site.contactEmail", config.site?.contactEmail],
    ["brand.accentColor", config.brand?.accentColor],
    ["rss.title", config.rss?.title],
    ["rss.description", config.rss?.description],
    ["rss.author", config.rss?.author],
    ["rss.category", config.rss?.category],
  ];

  const missing = required
    .filter(([, value]) => !value || (typeof value === "string" && value.trim() === ""))
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `${CONFIG_FILENAME} is missing required fields:\n` +
        missing.map((k) => `  - ${k}`).join("\n")
    );
  }

  // Validate accent color format
  if (!/^#[0-9a-fA-F]{6}$/.test(config.brand.accentColor)) {
    throw new Error(
      `brand.accentColor must be a 6-digit hex color (e.g. "#ff5500"), got: "${config.brand.accentColor}"`
    );
  }

  // Derive convenience values
  // Strip common TLDs, then replace dots with hyphens so the prefix is safe
  // for AWS resource names (Step Functions, Cognito, etc.)
  const rawPrefix = config.site.domainName.replace(/\.(com|org|net|io|dev|app)$/, "");
  const safePrefix = rawPrefix.replace(/\./g, "-");
  config._derived = {
    domainPrefix: safePrefix,
    siteUrl: `https://${config.site.domainName}`,
    ssmPrefix: `/${safePrefix}/secrets`,
  };

  return config;
}

/**
 * Flatten the config into the CDK stack's existing `config` object shape,
 * so the stack refactoring can be done incrementally.
 *
 * @param {object} siteConfig - The loaded site config
 * @returns {object} Flat config matching the current stack's `config` const shape
 */
function toStackConfig(siteConfig) {
  return {
    // Cognito
    REFRESH_TOKEN_VALIDITY_DAYS: siteConfig.cognito?.refreshTokenValidityDays ?? 365,
    MIN_PASSWORD_LENGTH: siteConfig.cognito?.minPasswordLength ?? 7,
    // Scheduling
    RSS_SCHEDULE_MINUTES: siteConfig.rss?.scheduleMinutes ?? 120,
    // Lambda memory
    VOLUME_LEVELS_MEMORY_MB: siteConfig.lambda?.volumeLevelsMemoryMb ?? 3008,
    // Lambda runtime constants
    PLAYBACK_HISTORY_TTL_DAYS: siteConfig.playback?.historyTtlDays ?? 100,
    RSS_FEED_LIMIT: siteConfig.rss?.feedLimit ?? 50,
    MAX_MESSAGE_LENGTH: siteConfig.messages?.maxLength ?? 5000,
    PRESIGNED_URL_EXPIRY_SECONDS: siteConfig.upload?.presignedUrlExpirySeconds ?? 3600,
    WAVEFORM_WIDTH: siteConfig.waveform?.width ?? 800,
    WAVEFORM_HEIGHT: siteConfig.waveform?.height ?? 100,
    EXPIRED_MARKER_TTL_DAYS: siteConfig.playback?.expiredMarkerTtlDays ?? 7,
  };
}

module.exports = { loadSiteConfig, toStackConfig };
