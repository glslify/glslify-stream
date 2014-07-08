var glslify = require('./index')
  , deparser = require('glsl-deparser')

var file = require('path').resolve(process.argv[process.argv.length - 1])

glslify(file)
  .on('error', function(xs) {
    console.log(xs.file, xs.line, xs.column, xs.message)
  })
  .pipe(deparser())
  .pipe(process.stdout)
