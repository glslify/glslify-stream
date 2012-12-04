module.exports = function(path) { return glslify(path) }

var through = require('through')

var Path = require('path')
  , fs = require('fs')


var lang = require('cssauron-glsl')
  , tokenizer = require('glsl-tokenizer')
  , parser = require('glsl-parser')

var mangle = [
  lang(':root > stmt > decl > decllist > ident')
, lang(':root > stmt > decl > struct > ident')
, lang(':root > stmt > decl > function > ident')
]

var remove_stmt = [
  lang(':root > stmt > precision')
, lang(':root > stmt > decl > :first-child + keyword ~ decllist > ident:first-child')
]

var shortest = require('shortest')

function glslify(path, module_id, mappings, define_in_parent_scope, registry, counter) {
  // "should mangle" and "should remove storagedecl" are implied by presence of mappings
  module_id = module_id || '.'

  var is_root = !mappings
    , stream = through(process)
    , this_level = Object.create(null)
    , parser_stream = parser()
    , token_stream = tokenizer()

  mappings = mappings || {}
  registry = registry || {}
  counter = counter || shortest()

  fs.createReadStream(path)
    .pipe(token_stream)
    .pipe(parser_stream)
    .pipe(stream)

  if(module_id === '.') token_stream.write('#define GLSLIFY 1\n\n\n')

  return stream

  function process(node) {
    if(node.ignore) return

    if(node.type === 'preprocessor' && /#pragma glslify:/.test(node.token.data)) {
      if(/:\s*export/.test(node.token.data)) {
        if(module_id !== '.')
          handle_export(node)
      } else {
        stream.pause()

        // physically prevent the stream from
        // resuming until *we* say so.
        var old_resume = stream.resume
        stream.resume = function(){ }
        handle_import(node, function() {
          stream.resume = old_resume
          stream.resume()
        })
      }
      return
    }


    if(module_id !== '.') {
      if(any(remove_stmt, node)) {
        // find parent scope, update to reflect mapping
        // 
        if(node.type !== 'precision' && !mappings[node.token.data]) {
          throw new Error('required to match '+node.token.data)
        }

        var current = node
          
        while(current && !current.scope) current = current.parent

        // redefined!
        current.scope[node.token.data] = mappings[node.token.data]
        if(node.type === 'precision') {
          node.parent.ignore = true       
        } else {
          node.parent.parent.parent.ignore = true
        }
      }

      if(any(mangle, node)) {
        // mangle the token data and store it in a local map
        this_level[node.data] = perform_mangle(node.data)
        node.data = this_level[node.data]
      }
    }

    stream.emit('data', node)
  }

  function perform_mangle(ident) {
    return (module_id + '_x_' + ident).replace(/__/g, '_')
  }

  function handle_import(node, ready) {
    var bits = /#pragma glslify:\s*([^=\s]+)\s*=\s*require\(([^\)]+)\)/.exec(node.token.data)
      , current = node
      , import_name
      , require_data
      , module_name

    if(!bits) throw new Error('could not match!')

    import_name = bits[1]
    require_data = bits[2]

    while(current && !current.scope) current = current.parent

    if(!current) throw new Error('could not find scope')

    bits = require_data.split(',')

    module_name = bits[0]

    bits = bits.slice(1)

    bits = bits.reduce(function(l, r) {
      r = r.split('=').map(function(x) { return x.replace(/(^\s*|\s*$)/g, '') })

      r[1] = r[1] + ';'
      var token_stream = tokenizer()
        , sub_parser_stream = token_stream.pipe(parser())

      sub_parser_stream.scope(parser_stream.scope())
      token_stream.write(r[1])

      l[r[0]] = sub_parser_stream.program.children[0].children[0].children[0]

      return l
    }, Object.create(mappings))

    locate_module(path, module_name, function(err, module_path) {
      if(err) throw err

      var new_module_id = counter()

      if(registry[module_path]) {
        if(bits.length) { throw new Error('potential redefinition of requirement') }
        define(registry[module_path])
        return ready()
      }


      glslify(module_path, new_module_id, bits, define, registry, counter)
        .on('data', function(d) { if(d.parent) stream.emit('data', d) })
        .on('close', function() { ready() })

      function define(value) {
        registry[module_path] = current.scope[import_name] = value
      }
    })
  }

  function handle_export(node) {
    var name = /export\(([^\)]+)\)/.exec(node.token.data)
      , current = node

    if(!name) throw new Error('expected to export something')
    name = name[1]

    while(current && !current.scope) current = current.parent

    if(!current) throw new Error('could not find scope')

    define_in_parent_scope(current.scope[name])
  }

}

function any(x, n) {
  for(var i = 0, len = x.length; i < len; ++i) if(x[i](n)) return true
  return false
}

function locate_module(current_path, module_name, ready) {
  if(module_name[0] === '.') return relative_module(current_path, module_name, ready)
  if(module_name[0] === '/') return ready(null, module_name)

  var dirname = Path.dirname(current_path)
    , bits = module_name.split(Path.sep)

  module_name = bits[0]

  var node_modules = Path.join(dirname, 'node_modules', module_name)
    , package_json
    , main_file

  if(fs.existsSync(node_modules)) {
    // read the package.json, find the "glslify", "main", or assume main == "index.glsl"
    try {
      package_json = fs.readFileSync(Path.join(node_modules, 'package.json'), 'utf8')
      package_json = JSON.parse(package_json)
    } catch(e) {
      package_json = {main: './index.glsl'}
    }

    if(bits.length > 1) {
      package_json.glslify = Path.join.apply(Path, ['.'].concat(bits.slice(1)))
    }
    main_file = package_json.glslify || package_json.main || './index.glsl'

    if(Path.extname(main_file) !== '.glsl')
      main_file += '.glsl'

    return ready(null, Path.join(node_modules, main_file)) 
  }

  if(dirname === '/') return ready(new Error('could not find package `'+module_name+'`'))

  dirname = Path.dirname(current_path)

  return locate_module(dirname, module_name, ready)

}

function relative_module(current_path, module_name, ready) {
  var dirname = Path.dirname(current_path)
    , module_path = Path.resolve(Path.join(dirname, module_name))

  return ready(null, module_path+'.glsl')
}
