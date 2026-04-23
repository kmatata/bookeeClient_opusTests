const path = require('path');
const { merge } = require('webpack-merge');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const base = require('./base.config');

module.exports = merge(base, {
  name: 'web',
  mode: 'production',
  entry: { app: path.resolve(__dirname, '../src/web/index.js') },
  output: {
    path: path.resolve(__dirname, '../dist/web'),
    filename: '[name].[contenthash:8].js',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/web/index.html'),
      filename: 'index.html',
    }),
    // Copy sqlite-wasm worker/wasm assets so they're available at the same origin
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, '../node_modules/@sqlite.org/sqlite-wasm/dist'),
          to: 'sqlite-wasm',
        },
      ],
    }),
  ],
});
