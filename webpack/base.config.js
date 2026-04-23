const path = require('path');

module.exports = {
  resolve: {
    alias: {
      '@sync': path.resolve(__dirname, '../src/sync'),
      '@db':   path.resolve(__dirname, '../src/db'),
      '@ui':   path.resolve(__dirname, '../src/ui'),
    },
    extensions: ['.js', '.svelte'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
    // 'svelte' must come first so svelte-loader picks up the Svelte-specific export;
    // remaining conditions are webpack-5 browser defaults required for ESM packages
    conditionNames: ['svelte', 'browser', 'module', 'import', 'default'],
  },

  module: {
    rules: [
      {
        test: /\.svelte$/,
        use: {
          loader: 'svelte-loader',
          options: {
            compilerOptions: { dev: false },
            emitCss: false,
          },
        },
      },
      {
        test: /\.css$/,
        use: ['css-loader'],
      },
      {
        // sqlite-wasm ships a .wasm file — emit it as asset
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },

  experiments: {
    asyncWebAssembly: true,
  },
};
