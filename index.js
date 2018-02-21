/* jshint node: true */
'use strict';

var mergeTrees = require('broccoli-merge-trees'),
    concat = require('broccoli-concat'),
    Funnel = require('broccoli-funnel'),
    Rollup = require('broccoli-rollup');

//var debug = require('broccoli-stew').debug;

module.exports = {

  name: 'ember-cli-rollup',

  included: function(app) {
    this._super.included.apply(this, arguments);
    var options = this.app.options['ember-cli-rollup'];
    if (((options.global && options.global.format) || "iife") !== "iife") {
      throw new Error("unsupported format defined on rollup config > global : only 'iife' is supported");
    }
    app.import('vendor/rollup-out.js');
  },

  preprocessTree: function(type, tree) {

    if (type === "js") {
      var Exporter = new require('./lib/exporter');
      this._exporter = new Exporter(tree, {
        build: this.app.options['ember-cli-rollup'],
        project: this.app.project
      });

      return mergeTrees((tree ? [tree]:[]).concat([this._exporter]), {
        annotation: 'TreeMerger (ember-cli-rollup)'
      });

    }

    return tree;

  },

  postprocessTree: function(type, tree) {

    if (type === "js") {
      var Bundler = new require('./lib/bundler');
      var buildOpts = this.app.options['ember-cli-rollup'];
      var modulesFn = this._exporter.modules.bind(this._exporter);

      var rollupTree = this._bundler = new Bundler(tree, {
        name: 'Bundler:Rollup',
        build: buildOpts,
        modulesFn: modulesFn
      });

      rollupTree = this._createRollupTree(rollupTree, buildOpts);
      var outTree = concat(
        new Funnel(rollupTree, { srcDir: 'out' }),
        { outputFile: 'vendor/rollup-out.js', inputFiles: ['*.js'] }
      );

      //outTree = debug(outTree, { name: 'rollup-output' });

      return mergeTrees((tree ? [tree]:[]).concat([outTree]), {
        annotation: 'TreeMerger (ember-cli-rollup)'
      });

    }

    return tree;

  },

  _createRollupTree: function (tree, options) {

    // Unwrap module exports to amd definition with original module name
    const unwrapOutro = () => {
      var discovered = this._exporter.modules();
      return Object.keys(discovered).map(function (mod) {
        var module_id = discovered[mod].id;
        return `define('${mod}', [\'exports\'], function(exp) { return  Object.assign(exp, exports.${module_id}); });`;
      }).join('\n');
    }

    /* plugins added by default */
    var builtins = require('rollup-plugin-node-builtins');
    var globals = require('rollup-plugin-node-globals');
    var json = require('rollup-plugin-json');
    var replace = require('rollup-plugin-re');
    var commonjs = require('rollup-plugin-commonjs');
    var nodeResolve = require('rollup-plugin-node-resolve');
    var plugins = [
      replace({
        // https://github.com/rollup/rollup-plugin-commonjs/issues/166
        patterns: [
          {
            // regexp match with resolved path
            match: /formidable(\/|\\)lib/,
            // string or regexp
            test: 'if (global.GENTLY) require = GENTLY.hijack(require);',
            // string or function to replaced with
            replace: ''
          }
        ]
      }),
      builtins(),
      json(),
      nodeResolve({
        jsnext: true,
        main: true,
        preferBuiltins: true
      }),
      commonjs({
        include: 'node_modules/**',
        ignoreGlobal: true
      }),
      globals()
    ];
    var defaultModuleOptions = {
      format: 'iife',
      sourceMap: true,
      plugins: plugins,
      context: 'window',
      moduleName: '__rollup__'
    };
    var def = this._bundler.getModuleDefinition();
    var rollupOptions = Object.assign({}, defaultModuleOptions, options.global || {}, def.opts);
    // defer reading of "outro" til build time
    Object.defineProperty(rollupOptions, 'outro', {
      enumerable: true,
      get() {
        return unwrapOutro();
      }
    });

    return new Rollup(tree, {
      rollup: rollupOptions
    });
  }
};
