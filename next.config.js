// This is needed because webpack 5 does not work remotely, only locally

let local = process.env.LOCAL ? true : false

if (local) {
  module.exports = {
    target:"serverless",
    webpack: (config, { isServer }) => {
      if (!isServer) {
        config.resolve.fallback.fs = false;
      }
      return config;
    },
  }
} else {
  module.exports = {
    // Target must be serverless
    target: "serverless",
    webpack: (config, { isServer }) => {
      // Fixes npm packages that depend on `fs` module
      if (!isServer) {
        config.node = {
          fs: 'empty'
        }
      }
  
      return config
    }
  };
}
