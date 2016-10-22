'use strict';

var Plugin = require('broccoli-plugin'),
    writeFile = require('broccoli-file-creator'),
    unwrapOutro = function() {
      return "Object.keys(exports).forEach(function(mod) { "+
        "define(mod.replace(/\\${2}/g, '-'), ['exports'], function(exp) { return  Object.assign(exp, exports[mod]); }) "+
      "});";
    },
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

  !Rollup && (Rollup = require('broccoli-rollup'));

  // read list of rollup modules
  var options = this.options.build;

  var discovered = this.options.modulesFn();
  var exportedFilesTree = [];
  var moduleDefs = Object.assign(
    {"__global__": {js: "", opts: {entry: "rollup-global-in.js", dest: "out/rollup-global.js", format: ((options.global && options.global.format) || "iife")}}},
    Object.keys(options.standalone || {}).reduce(function(out, k) {
      out[k] = {
        js: "",
        opts: Object.assign({moduleId: k, format: "amd"}, options.standalone[k], {entry: k+".js", dest: "out/"+k+".js"})
      };
      return out;
    }, {})
  );

  Object.keys(discovered).forEach( function(mod) {
    var def = moduleDefs[(moduleDefs[mod] && mod) || "__global__"],
        name = mod.replace(/\-/g, function() { return "$$"; }),
        eoi = options.trace ? ";\n" : ";",
        owner = "";
    
    if (def.opts.format !== "iife") {
      def.js = Object.keys(discovered[mod]).reduce(function(out, key) {
        if (key === "__namespace__") {
          out += "export * from '"+mod+"'"+eoi;
        } else {
          out += "export {"+key+"} from '"+mod+"'"+eoi;
        }
        return out;
      }, def.js);
    } else { //exported under a global module
      def.js = Object.keys(discovered[mod]).reduce(function(out, key) {
        if (key === "__namespace__") {
          owner = "import * as "+name+" from '"+mod+"'"+eoi;
        } else {
          !owner && (owner = "var "+name+" = {}"+eoi);
          var alias = name+"_"+key;
          out += "import {"+key+" as "+alias+"} from '"+mod+"'"+eoi;
          owner += "Object.defineProperty("+name+",'"+key+"', {value: "+alias+", enumerable: true})"+eoi;
        }
        return out;
      }, def.js) + owner + "export {"+name+"}"+eoi;
    }

  });

  options.trace && console.log("[ROLLUP] Exporting: \n"+Object.keys(moduleDefs).map(
    function(k) { return moduleDefs[k].opts.entry + "\n" + moduleDefs[k].js; }
    ).join("\n\n"));

  /* plugins added by default */
  var builtins = require('rollup-plugin-node-builtins');
  var globals = require('rollup-plugin-node-globals');
  var commonjs = require('rollup-plugin-commonjs');
  var nodeResolve = require('rollup-plugin-node-resolve');
  var plugins = [
    builtins(),
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
  
  if (options.es6) {
    console.log("ES6");
    plugins.push(require("rollup-plugin-babel")(options.es6 === true ? undefined : options.es6));
  }

  var babel = require('rollup-plugin-babel');
  var outputTree = [],
      defaultModuleOptions = {
        format: 'iife',
        sourceMap: true,
        plugins: plugins,
        context: 'window',
        moduleName: "__rollup__"
      };

  var build = this.buildTree.bind(this),
      builds = [],
      inputPaths = this.inputPaths,
      outputPath = this.outputPath;

  Object.keys(moduleDefs).forEach(function(k) {

    var moduleOptions = Object.assign({}, defaultModuleOptions, options.global || {}, moduleDefs[k].opts),
        inputTree = writeFile(moduleDefs[k].opts.entry, moduleDefs[k].js);
    
    moduleOptions.outro = (moduleOptions.outro || "") + (moduleOptions.format === "iife" ? unwrapOutro() : "");

    builds.push(
      build(inputTree).then(function() {
        return build(new Rollup(inputTree, { rollup: moduleOptions }), {in: outputPath})
      })
    );

  });

  return Promise.all(builds);
  
};

Bundler.prototype.buildTree = function(tree, paths) {
  paths = paths || {}; 
  var inputPath = paths.in || this.inputPaths[0],
      outputPath = paths.out || this.outputPath;

  tree.inputPaths = [inputPath];
  tree.outputPath = outputPath;
  return Promise.resolve().then(function() {
    return tree.build();
  });
};
