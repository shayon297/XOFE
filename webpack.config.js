const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/turnkey-bundle.js',
  output: {
    filename: 'turnkey.bundle.js',
    path: path.resolve(__dirname, 'lib'),
    library: 'TurnkeySDK',
    libraryTarget: 'window'
  },
  resolve: {
    fallback: {
      "crypto": false,
      "stream": false,
      "url": false,
      "buffer": false,
      "util": false
    }
  }
};
