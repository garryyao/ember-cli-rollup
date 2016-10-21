
ember-cli-rollup
==============================================================================

EXPERIMENTAL : Build custom rollup bundles with Ember CLI - Fork from the original addon that auto-discover modules to import


Installation
------------------------------------------------------------------------------

```
npm install --save-dev github:apezel/ember-cli-rollup
```

Usage
------------------------------------------------------------------------------

This section is using [D3](https://github.com/d3/d3) as an example of how
to build custom bundles for your app.

1.  Install the packages that you want to use via NPM and save them as
    dependencies in your `package.json` file:

    ```
    npm install --save-dev d3-selection d3-scale d3-axis
    ```

2.  Import your module in your app

    ```js
    export { scaleLinear, scaleTime } from 'd3-scale';
    export { axisBottom, axisLeft } from 'd3-axis';
    export { select } from 'd3-selection';
    ```

3.  And that's it ! All modules will be imported into a single self executing function. It prevents code duplication. In your `ember-cli-build.js` file you can configure the rollup general build options or isolate a module and pass specific options to it.

    ```js
    var app = new EmberApp(defaults, {
      'ember-cli-rollup': {
		    excludes: ["some module to exclude from bundle"],
        trace: false, //writes generated exports to console
        global: {
		      sourceMap: true
		      /* global build settings */
        },
        isolate: {
          d3: { //d3 will be bundled apart : define('d3', ...) { ... }
            /* d3 specific build settings */
          }
        }
      }
    });
    ```

    `ember-cli-rollup` will process all modules imported form your app except :
	- ember cli addons
	- everything that has a relative or absolute path
	- modules declared in "excludes"


License
------------------------------------------------------------------------------
This project is licensed under the [MIT License](LICENSE.md).
