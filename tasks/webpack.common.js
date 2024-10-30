const webpack = require('webpack');

module.exports = {
  entry: [
    './elevation-profile.js'
  ],
  module: {
    rules: [{
      test: /\.js$/,
      enforce: 'pre',
      use: ['source-map-loader']
    }]
  },
  externals: ['Origo'],
  resolve: {
    extensions: ['*', '.js', '.scss']
  },
  plugins: [
  ]
};
