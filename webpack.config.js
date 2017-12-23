const pkgJson = require('./package.json');
const path = require('path');
const webpack = require('webpack');

const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const uglifyJsOptions = {
  screwIE8: true,
  stats: true,
  compress: {
    warnings: false
  },
  mangle: {
    toplevel: true,
    eval: true
  }
};

const commonConfig = {
  entry: './src/hls.js',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: [
          path.resolve(__dirname, 'node_modules')
        ],
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  }
};

/* Allow to customise builds through env-vars */
const env = process.env;

const addSubtitleSupport = !!env.SUBTITLE;
const addAltAudioSupport = !!env.ALT_AUDIO;
const addEMESupport = !!env.EME_DRM;
const runAnalyzer = !!env.ANALYZE;

function getPluginsForConfig(type, minify = false) {
  // common plugins.

  const defineConstants = getConstantsForConfig(type);

  console.log(
    `Building <${ minify ? 'minified' : 'non-minified / debug' }> distro-type "${type}" with compile-time defined constants:`,
    JSON.stringify(defineConstants, null, 4),
    '\n'
  );

  const plugins = [
    new webpack.optimize.OccurrenceOrderPlugin(),
    new webpack.DefinePlugin(defineConstants)
  ];

  if (minify) {
    // minification plugins.
    return plugins.concat([
      new webpack.optimize.UglifyJsPlugin(uglifyJsOptions),
      new webpack.LoaderOptionsPlugin({
        minimize: true,
        debug: false
      })
    ]);
  }

  if (runAnalyzer && !minify) {
    plugins.push(new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: `bundle-analyzer-report.${type}.html`
    }));
  } else {
    // https://github.com/webpack-contrib/webpack-bundle-analyzer/issues/115
    plugins.push(new webpack.optimize.ModuleConcatenationPlugin())
  }

  return plugins;
}

function getConstantsForConfig(type) {
  // By default the "main" dists (hls.js & hls.min.js) are full-featured.
  return {
    __VERSION__: JSON.stringify(pkgJson.version),
    __USE_SUBTITLES__: JSON.stringify(type === 'main' || addSubtitleSupport),
    __USE_ALT_AUDIO__: JSON.stringify(type === 'main' || addAltAudioSupport),
    __USE_EME_DRM__: JSON.stringify(type === 'main' || addEMESupport)
  };
}

function getAliasesForLightDist() {
  let aliases = {};

  if (!addEMESupport) {
    aliases = Object.assign({}, aliases, {
      './controller/eme-controller': './empty.js'
    });
  }

  if (!addSubtitleSupport) {
    aliases = Object.assign({}, aliases, {
      './utils/cues': './empty.js',
      './controller/timeline-controller': './empty.js',
      './controller/subtitle-track-controller': './empty.js',
      './controller/subtitle-stream-controller': './empty.js'
    });
  }

  if (!addAltAudioSupport) {
    aliases = Object.assign({}, aliases, {
      './controller/audio-track-controller': './empty.js',
      './controller/audio-stream-controller': './empty.js'
    });
  }

  return aliases;
}

const multiConfig = [
  {
    name: 'debug',
    output: {
      filename: 'hls.js',
      chunkFilename: '[name].js',
      sourceMapFilename: 'hls.js.map',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/dist/',
      library: 'Hls',
      libraryTarget: 'umd',
      libraryExport: 'default'
    },
    plugins: getPluginsForConfig('main'),
    devtool: 'source-map',
  },
  {
    name: 'dist',
    output: {
      filename: 'hls.min.js',
      chunkFilename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/dist/',
      library: 'Hls',
      libraryTarget: 'umd',
      libraryExport: 'default'
    },
    plugins: getPluginsForConfig('main', true)
  },
  {
    name: 'light',
    output: {
      filename: 'hls.light.js',
      chunkFilename: '[name].js',
      sourceMapFilename: 'hls.light.js.map',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/dist/',
      library: 'Hls',
      libraryTarget: 'umd',
      libraryExport: 'default'
    },
    resolve: {
      alias: getAliasesForLightDist()
    },
    plugins: getPluginsForConfig('light'),
    devtool: 'source-map'
  },
  {
    name: 'light-dist',
    output: {
      filename: 'hls.light.min.js',
      chunkFilename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      publicPath: '/dist/',
      library: 'Hls',
      libraryTarget: 'umd',
      libraryExport: 'default'
    },
    resolve: {
      alias: getAliasesForLightDist()
    },
    plugins: getPluginsForConfig('light', true)
  }
].map(fragment => Object.assign({}, commonConfig, fragment));

// webpack matches the --env arguments to a string; for example, --env.debug.min translates to { debug: true, min: true }
module.exports = (envArgs) => {
  if (!envArgs) {
    // If no arguments are specified, return every configuration
    return multiConfig;
  }

  // Find the first enabled config within the arguments array
  const enabledConfigName = Object.keys(envArgs).find(envName => envArgs[envName]);
  let enabledConfig = multiConfig.find(config => config.name === enabledConfigName);

  if (!enabledConfig) {
    console.error(`Couldn't find a valid config with the name "${enabledConfigName}". Known configs are: ${multiConfig.map(config => config.name).join(', ')}`);
    return;
  }

  return enabledConfig;
};
