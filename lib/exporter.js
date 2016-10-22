'use strict';

var Plugin = require('broccoli-plugin'),
    FSTree = require('fs-tree-diff'),
    mergeTrees = require('broccoli-merge-trees'),
    path = require('path'),
    fs = require('fs'),
    ts = require('typescript'),
    traverseImports = function(node, cb) {
      var visit = function(node) {
        if (node.kind === ts.SyntaxKind.ImportDeclaration) {
            cb(node);
          }
      };
      ts.forEachChild(node, visit);
    };


module.exports = Exporter;

Exporter.prototype = Object.create(Plugin.prototype);
Exporter.prototype.constructor = Exporter;
function Exporter(inputNode, options) {

  if (!options || !options.build || !options.project) {
    throw new Error("options are required with properties build, project");
  }

  Plugin.call(this, [inputNode], {
    annotation: options.annotation,
    persistentOutput: true
  });

  this.options = options;
  this._previousSourceTree = new FSTree();
  this._parsed = {};
  this._modules = {};

}

Exporter.prototype.build = function() {

  var walkSync = require('walk-sync'),
      options = this.options,
      trace = options.build.trace,
      parsed = this._parsed;

  /* making diff -- faster rebuild */
  var inputPaths,
      currentSourceTree = new FSTree({
        entries: (inputPaths = walkSync.entries(path.join(this.options.project.root, 'app'), [ '**/*.js', '**/*.ts' ]))
      });

  this._previousSourceTree
    .calculatePatch(currentSourceTree)
    .forEach(function(args) {
        var op = args[0],
            path = args[1];
        switch (op) {
          case 'mkdir':
            /* full rebuild */
            parsed = {};
            break;
          case 'rmdir':
            /* full rebuild */
            parsed = {};
            break;
          case 'unlink':
            delete parsed[path];
            break;
          case 'create': break;
          case 'change':
            trace && "[Rollup] file changed "+path;
            delete parsed[path];
            break;
        }
      });

  this._previousSourceTree = currentSourceTree;

  this._modules = this._buildModuleMap(inputPaths);

};


Exporter.prototype._buildModuleMap = function(inputPaths) {

  var options = this.options,
      trace = this.options.build.trace,
      parsed = this._parsed,
      envConfig = options.project.config(process.env.EMBER_ENV),
      reservedPaths = [envConfig.modulePrefix, "ember", "config"]
        .concat(Object.keys(options.project.addonPackages))
        .concat(options.build.excludes || []),
      modules = {};

  inputPaths.forEach(function(fd) {

    var filePath = path.join(fd.basePath, fd.relativePath);
    
    if (parsed[filePath]) {
      trace && console.log("[Rollup] restoring "+filePath+" with modules:\n"+JSON.stringify(parsed[filePath], null, 4));
      Object.assign(modules, parsed[filePath]);
    } else {

      var src = fs.readFileSync(filePath);
      trace && console.log("[Rollup] traversing "+filePath);

      let sourceFile = ts.createSourceFile(
          path.join(fd.basePath, fd.relativePath), src.toString(), ts.ScriptTarget.ES6, /*setParentNodes */ true
        );

      traverseImports(sourceFile, function(node) {
        var moduleName = node.moduleSpecifier.text;
        if (/^[\.\/]/.test(moduleName) 
          || reservedPaths.some(function(p) { return moduleName === p || moduleName.indexOf(p+"/") === 0;})) { //skip relative paths
          return;
        }
        !modules[moduleName] && (modules[moduleName] = parsed[filePath] = {});
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

    }

  });

  return modules;

};

Exporter.prototype.modules = function() {
  return this._modules;
};
