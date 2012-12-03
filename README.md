# glslify-stream

given a file path, create a readable stream of [glsl-parser](https://github.com/chrisdickinson/glsl-parser) AST nodes that represent the complete dependency tree of a glsl program.

```javascript
// usage: node test.js main.glsl > output.glsl
var glslify = require('./index')
  , deparser = require('glsl-deparser')

var file = require('path').resolve(process.argv[process.argv.length - 1])

glslify(file)
  .pipe(deparser())
  .pipe(process.stdout)
```

```c
// main.glsl
precision highp float;
uniform float time;
uniform vec2 mouse;
uniform vec2 resolution;

#pragma glslify: program_one = require(./file1, time=time, mouse=mouse, resolution=resolution)
#pragma glslify: program_two = require(./file2, time=time, mouse=mouse, resolution=resolution)

int modulo(float x, float y) {
  return int(x - y * floor(x / y));
}

void main(void) {
  ivec2 m = ivec2(modulo(gl_FragCoord.x, 2.), modulo(gl_FragCoord.y, 2.));

  if(m.x == 0 || m.y == 0) {
    program_one();
  } else { 
    program_two();
  }
}
```

```c
// file1.glsl
void main(void) {
  gl_FragColor = vec4(1., 0., 0., 1.);
}

#pragma glslify: export(main)
```

```c
// file2.glsl
void main(void) {
  gl_FragColor = vec4(0., 0., 1., 1.);
}

#pragma glslify: export(main)
```

# GLSL API

GLSLify works by mangling top-level identities in non-root modules.

Exported variables will be aliased on requirement.

### \#pragma glslify: VARIABLE = require(MODULE[, NAME=EXPR])

Import a module and assign it the name `VARIABLE` in the local program.

`MODULE` may be located within `node_modules/` or relative to the current file.

**Quotes are not allowed.**

If the target module defines `attribute`, `varying`, or `uniform` global variables,
you may map those to a local definition or expression:

```c

attribute vec4 position;
#pragma glslify: x = require(./takes_vec2, module_variable=position.xy)

```

If a mapping is not defined, those requirements are forwarded on to the module requiring
the current module -- if no mappings are found for a definition, an error is raised.

### \#pragma glslify: export(NAME)

Exports a local name from the current module. If the current module is the root, this is
a no-op. There may be only one exported `NAME` per module. The `NAME` may represent a
type, function, or variable.

# JS API

### glslify(path_to_file) -> readable stream

Return a readable stream of AST nodes representing the complete program.

# License

MIT
