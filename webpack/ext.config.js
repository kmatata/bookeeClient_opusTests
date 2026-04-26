const path = require('path');
const { merge } = require('webpack-merge');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const base = require('./base.config');

module.exports = merge(base, {
  name: 'ext',
  mode: 'production',
  entry: {
    background: path.resolve(__dirname, '../src/ext/background.js'),
    popup:      path.resolve(__dirname, '../src/ext/popup/popup.js'),
  },
  output: {
    path: path.resolve(__dirname, '../dist/ext'),
    filename: '[name].js',
    clean: true,
  },
  // MV2 background page must be self-contained — no shared runtime chunk
  optimization: { runtimeChunk: false },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/ext/popup/popup.html'),
      filename: 'popup.html',
      chunks: ['popup'],
    }),
  ],
});
