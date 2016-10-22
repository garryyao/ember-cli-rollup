
ember-cli-rollup
==============================================================================

Say goobye to shims !
Automatically embed modules imported from your source code. No need to prefix imports like ember-browserify does.
*This addon is still experimental and may need more tests and optimizations.*

Installation
------------------------------------------------------------------------------

```
npm install --save-dev ember-cli-rollup
```

What it does
------------------------------------------------------------------------------

`ember-cli-rollup` :
- parses sources under app/ and detects imports that are not ember's aliases or yet installed addons
- supports namespace, default and named imports
- exports everything into a single self executing module that will re-exports everything into separate modules
- prevent code duplication through exported modules

Usage
------------------------------------------------------------------------------

This section is using [D3](https://github.com/d3/d3) as an example of how
to build custom bundles for your app.

1.  Install the packages that you want to use via NPM and save them as
    dependencies in your `package.json` file:

    ```
    npm install --save-dev d3-selection d3-scale d3-axis
    ```

2.  Use d3 in your app

    ```js
    import { scaleLinear, scaleTime } from 'd3-scale';
    import { axisBottom, axisLeft } from 'd3-axis';
    import { select } from 'd3-selection';
    ```

3.  And that's it ! All required modules parts will be bundled

4.  Configure. In your `ember-cli-build.js` file you can configure the rollup general build options or isolate a module and pass specific options to it.

    ```js
    var app = new EmberApp(defaults, {
      'ember-cli-rollup': {

		    excludes: ["some module to exclude from bundle"],
        trace: true, //writes generated exports to console, default false

        global: {
          sourceMap: false //default: true
		      /* global build settings */
        },

        standalone: {
          "d3-scale": { //d3-scale will be bundled apart : define('d3-scale', ...) { ... }
            /* module specific build settings */
          }
        }
      }
    });
    ```

History
------------------------------------------------------------------------------

This addon is inspired by Turbo87/ember-cli-rollup

License
------------------------------------------------------------------------------
This project is licensed under the [MIT License](LICENSE.md).
