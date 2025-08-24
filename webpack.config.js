const path = require('path');

module.exports = {
  mode: 'development',
  devtool: false,
  entry: './src/turnkey-bundle.js',
  output: {
    filename: 'turnkey.bundle.js',
    path: path.resolve(__dirname, 'lib')
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
