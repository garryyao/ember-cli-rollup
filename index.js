/* jshint node: true */
'use strict';

var mergeTrees = require('broccoli-merge-trees');
var unwrapOutro = function() {
      return "Object.keys(exports).forEach(function(mod) { "+
        "define(mod.replace(/\\${2}/g, '-'), ['exports'], function(exp) { return Object.assign(exp, exports[mod]); }) "+
      "});";
    };

module.exports = {

  name: 'ember-cli-rollup',

  included: function(app) {
    var options = this.app.options['ember-cli-rollup'];
    if (((options.global && options.global.format) || "iife") !== "iife") {
      throw new Error("unsupported format defined on rollup config > global : only 'iife' is supported");
    }
    app.import('vendor/rollup-out.js');
  },

  preprocessTree: function(type, tree) {

    if (type === "js") {
      var envConfig = this.project.config(process.env.EMBER_ENV);
      var options = this.app.options['ember-cli-rollup'];
      var walkSync = require('walk-sync');
      var path = require('path');
      var fs = require('fs');
      var ts = require('typescript');
      var traverseImports = function(node, cb) {
        var visit = function(node) {
          if (node.kind === ts.SyntaxKind.ImportDeclaration) {
              cb(node);
            }
        };
        ts.forEachChild(node, visit);
      };

      var input = walkSync.entries(path.join(this.project.root, 'app'), [ '**/*.js', '**/*.ts' ]);
      var reservedPaths = [envConfig.modulePrefix, "ember", "config"]
        .concat(Object.keys(this.app.project.addonPackages))
        .concat(options.excludes || []);
      var modules = {};

      input.forEach(function(fd) {

        var src = fs.readFileSync(path.join(fd.basePath, fd.relativePath));

        let sourceFile = ts.createSourceFile(
            path.join(fd.basePath, fd.relativePath), src.toString(), ts.ScriptTarget.ES6, /*setParentNodes */ true
          );
        traverseImports(sourceFile, function(node) {
          var moduleName = node.moduleSpecifier.text;
          if (/^[\.\/]/.test(moduleName) 
            || reservedPaths.some(function(p) { return moduleName === p || moduleName.indexOf(p+"/") === 0;})) { //skip relative paths
            return;
          }
          !modules[moduleName] && (modules[moduleName] = {});
          if (node.importClause) {
            if (node.importClause.namedBindings) {
              if (node.importClause.namedBindings.kind == ts.SyntaxKind.NamedImports) {
                node.importClause.namedBindings.elements.forEach( function(elem) {
                  modules[moduleName][elem.name.text] = "named";
                } );
              } else if (node.importClause.namedBindings.kind == ts.SyntaxKind.NamespaceImport) {
                modules[moduleName]["__namespace__"] = 1;
              }
            } else {
              modules[moduleName]["default"] = 1;
            }
          } else {
            //not implemented for now
          }
        });
      });

      this.app.options['ember-cli-rollup-modules-discovered'] = modules;

    }

    return tree;
  },

  treeForVendor: function(tree) {
    // require() lazily for faster CLI boot-up time
    var Rollup = require('broccoli-rollup');

    // read list of rollup modules
    var options = this.app.options['ember-cli-rollup'];

    //generate rollup exports
    var writeFile = require('broccoli-file-creator');
    var concat = require('broccoli-concat');

    var discovered = this.app.options['ember-cli-rollup-modules-discovered'];
    var exportedFilesTree = [];
    var moduleDefs = Object.assign(
      {"__global__": {js: "", opts: {entry: "rollup-global-in.js", dest: "rollup-global-out.js", format: ((options.global && options.global.format) || "iife")}}},
      Object.keys(options.isolate || {}).reduce(function(out, k) {
        out[k] = {
          js: "",
          opts: Object.assign({moduleId: k, format: "amd"}, options.isolate[k], {entry: k+".js", dest: k+"-out.js"})
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
            out += "import * as "+name+" from '"+mod+"'"+eoi;
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

    var outputTree = [],
        defaultModuleOptions = {
          format: 'iife',
          sourceMap: false,
          plugins: [
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
          ],
          context: 'window',
          moduleName: "__rollup__"
        };

    Object.keys(moduleDefs).forEach(function(k) {

      var moduleOptions = Object.assign({}, defaultModuleOptions, options.global || {}, moduleDefs[k].opts),
          inputTree = writeFile(moduleDefs[k].opts.entry, moduleDefs[k].js);
      
      moduleOptions.outro = (moduleOptions.outro || "") + (moduleOptions.format === "iife" ? unwrapOutro() : "");

      outputTree.push(new Rollup(inputTree, { rollup: moduleOptions }));

    });

    outputTree = concat(mergeTrees(outputTree), {outputFile: "rollup-out.js"});

    return mergeTrees((tree ? [tree]:[]).concat([outputTree]), {
      annotation: 'TreeMerger (ember-cli-rollup)'
    });
  }
};
