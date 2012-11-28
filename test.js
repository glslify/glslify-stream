var glslify = require('./index')
  , deparser = require('glsl-deparser')

var file = require('path').resolve(process.argv[process.argv.length - 1])

glslify(file)
  .pipe(deparser())
  .pipe(process.stdout)
