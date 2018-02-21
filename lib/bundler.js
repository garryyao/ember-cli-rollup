'use strict';

var Plugin = require('broccoli-plugin'),
    writeFile = require('broccoli-file-creator'),
    Rollup; //lazy loaded

module.exports = Bundler;

Bundler.prototype = Object.create(Plugin.prototype);
Bundler.prototype.constructor = Bundler;
function Bundler(inputNode, options) {

  if (!options || !options.build || !options.modulesFn) {
    throw new Error("options are required with properties build, modulesFn");
  }

  Plugin.call(this, [inputNode], {
    annotation: options.annotation,
    persistentOutput: true
  });

  this.options = options;

}

Bundler.prototype.build = function() {

  var exec = require('child_process').exec;
  exec("rm -r "+this.inputPaths[0]+"/in");
  exec("rm -r "+this.outputPath+"/out");

  // read list of rollup modules
  var options = this.options.build;

  var discovered = this.options.modulesFn();
  var def = this.getModuleDefinition();
  var exportedFilesTree = [];

  Object.keys(discovered).forEach( function(mod) {
    var module_id = discovered[mod].id,
        mod_npm = mod.replace(/^npm\:/, ''),
        eoi = options.trace ? ";\n" : ";",
        owner = "";

    //exported under a global module
    def.js = Object.keys(discovered[mod]).reduce(function (out, key) {
      if (key === "__namespace__") {
        owner = "import * as " + module_id + " from '" + mod_npm + "'" + eoi;
      } else {
        !owner && (
                    owner = "var " + module_id + " = {}" + eoi
        );
        var alias = module_id + "_" + key;
        out += "import {" + key + " as " + alias + "} from '" + mod_npm + "'" + eoi;
        owner += "Object.defineProperty(" + module_id + ",'" + key + "', {value: " + alias + ", enumerable: true})" + eoi;
      }
      return out;
    }, def.js) + owner + "export {" + module_id + "}" + eoi;
  });

  options.trace && console.log("[Rollup] Exporting: \n"+ def.opts.entry + "\n" + def.js);

  var tree = writeFile(def.opts.entry, def.js);
  tree.outputPath = this.outputPath;
  return tree.build();
};

Bundler.prototype.getModuleDefinition = function () {
  var options = this.options.build;
  return {
    js: '',
    opts: {
      entry: 'in/rollup-global-in.js',
      dest: 'out/rollup-global.js',
      useStrict: false,
      format: (
        (
          options.global && options.global.format
        ) || 'iife'
      )
    }
  };
}
