const path = require('path');
const { merge } = require('webpack-merge');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const base = require('./base.config');

module.exports = merge(base, {
  name: 'telegram',
  mode: 'production',
  entry: { tg: path.resolve(__dirname, '../src/telegram/index.js') },
  output: {
    path: path.resolve(__dirname, '../dist/telegram'),
    filename: '[name].[contenthash:8].js',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/telegram/index.html'),
      filename: 'index.html',
    }),
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
