/* jshint node: true */
'use strict';

var mergeTrees = require('broccoli-merge-trees'),
    concat = require('broccoli-concat'),
    Funnel = require('broccoli-funnel');

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
      this._bundler = new Bundler(tree, {
          build: this.app.options['ember-cli-rollup'],
          modulesFn: this._exporter.modules.bind(this._exporter)
        });

      var outTree = concat(
        new Funnel(this._bundler, {srcDir: 'out'}),
        {outputFile: "vendor/rollup-out.js", inputFiles: ['*.js']}
      );

      return mergeTrees((tree ? [tree]:[]).concat([outTree]), {
        annotation: 'TreeMerger (ember-cli-rollup)'
      });

    }

    return tree;

  }

};
