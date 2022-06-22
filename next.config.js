module.exports = {
  webpack5: true,
  // Target must be serverless
  target: "serverless",
  webpack: (config, { isServer }) => {
    // Fixes npm packages that depend on `fs` module
    if (!isServer) {
      config.resolve.fallback.fs = false;
    }

    return config
  }
};