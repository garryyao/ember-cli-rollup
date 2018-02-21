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

function createModuleDef() {
  var def = {};
  Object.defineProperty(def, 'id', {
    writable: false,
    enumerable: false,
    value: Array.prototype.concat.apply(['m'], arguments).join('_')
  });
  return def;
}

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

  var self = this,
      walkSync = require('walk-sync'),
      options = this.options,
      trace = options.build.trace,
      parsed = this._parsed;

  /* making diff -- faster rebuild */
  var inputPaths,
      currentSourceTree = new FSTree({
        entries: (inputPaths = walkSync.entries(this.inputPaths[0], [ '**/*.js'] ))
      });

  this._previousSourceTree
    .calculatePatch(currentSourceTree)
    .forEach(function(args) {
        var op = args[0],
            path = args[1];
        switch (op) {
          case 'mkdir':
            /* full rebuild */
            self.parsed = {};
            break;
          case 'rmdir':
            /* full rebuild */
            self.parsed = {};
            break;
          case 'unlink':
            parsed[path] = undefined;
            break;
          case 'create': break;
          case 'change':
            trace && "[Rollup] file changed "+path;
            parsed[path] = undefined;
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
      reservedPaths = [envConfig.modulePrefix, "ember", "config", "@ember"]
        .concat(Object.keys(options.project.addonPackages))
        .concat(options.build.excludes || []),
      modules = {};

  inputPaths.forEach(function(fd, pathIndex) {

    var filePath = path.join(fd.basePath, fd.relativePath);

    if (parsed[fd.relativePath]) {
      //trace && console.log("[Rollup] restoring "+filePath+" with modules:\n"+JSON.stringify(parsed[filePath], null, 4));
      Object.keys(parsed[fd.relativePath]).forEach(
        function(moduleName, moduleIndex) {
          !modules[moduleName] && (modules[moduleName] = createModuleDef(pathIndex, moduleIndex));
          Object.assign(modules[moduleName], parsed[fd.relativePath][moduleName]);
        });
    } else {

      !parsed[fd.relativePath] && (parsed[fd.relativePath] = {});

      var src = fs.readFileSync(filePath);
      //trace && console.log("[Rollup] traversing "+filePath);



      // Optimization, avoid parsing the source file
      if(!/from ['"]npm\:/.test(src)) {
        return
      }

      let sourceFile = ts.createSourceFile(
          path.join(fd.basePath, fd.relativePath), src.toString(), ts.ScriptTarget.ES6, /*setParentNodes */ true
        );


      let moduleIndex = 0;
      traverseImports(sourceFile, function(node) {

        var moduleName = node.moduleSpecifier.text;
        // skip non-npm imports
        if (moduleName.slice(0, 4) !== 'npm:') {
          return;
        }
        !modules[moduleName] && (modules[moduleName] = createModuleDef(pathIndex, moduleIndex));
        !parsed[fd.relativePath][moduleName] && (parsed[fd.relativePath][moduleName] = modules[moduleName]);

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

        moduleIndex++;
      });

    }

  });

  return modules;

};

Exporter.prototype.modules = function() {
  return this._modules;
};
