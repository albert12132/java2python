/*--------------------------------------------------------------------*
 * TRANSLATOR
 *
 * This module translates class {Object}s (see interface.js) into
 * Python code. This module mainly consists of 2 types of functions:
 * translators and writers.
 *
 * Translators are used for larger, 'complete' sections of code:
 *    - entire Class
 *    - Class variables
 *    - Constructor
 *    - Method
 * They also have the invariant that the code they return contains 2
 * newlines (so as to leave a blank line between the returned code and
 * the next block).
 *
 * Writers are used for smaller sections of code, and usually do not
 * return a 'complete' code block. Instead, they are designed to
 * improve modularity and are combined in translators.
 *    - method/constructor signature
 *    - method/constructor body
 *    - method/constructor call
 *    - variable assignment
 * They also have the invariant that the code they return contains 0
 * newlines.
 *-------------------------------------------------------------------*/

var interface = require('./interface')
  , Tokens = interface.Tokens
  , isNumber = interface.isNumber
  , validate = interface.validate
  , logError = interface.logError;
var TAB = '    ';
var CONTROLS = [];
var OPERATORS = ['+', '-', '*', '/', '('];
var FATAL, privMod = false;

/*---------*
 * EXPORTS *
 *---------*/

/**
 * Primary function used by external applictions. Translates an {Array}
 * of {Class} objects (see interface.js) into Python code.
 *
 * @param classes {Array} of {Class} objects
 *
 * @return {string} Python code
 */
function translate(classes, fatal, private) {
  FATAL = fatal;
  privMod = private;
  var pycode = '';
  classes.forEach(function(cls) {
    pycode += translateClass(cls);
  });
  return pycode;
}

exports.translate = translate;


/*-------------*
 * TRANSLATORS *
 *-------------*/

/**
 * Translates a single {Class} object into Python code. The body of the
 * class is indented one tab to the right of the class signature.
 *
 * @param cls {Class} object
 *
 * @return {string} Python code -- ends with 2 newlines
 */
function translateClass(cls) {
  var signature = 'class ' + cls.name + '(' + cls.super + '):';
  var body = ''
  body += translateClassVariables(cls);
  body += translateConstructors(cls);
  cls.getAll('methods').forEach(function(method) {
    body += translateMethod(method, cls);
  });
  body = body.trim();
  if (body == '') body = 'pass';
  return signature + '\n' + tab(body) + '\n\n';
}

/**
 * Translates the class (static) variables of the given {Class} object.
 * Since Python does not allow variable declarations without
 * assign values to them, static variables that are not initialized
 * with values will not be present in the returned code.
 *
 * @param cls {Class} object
 *
 * @return {string} Python code -- ends with 2 newlines
 */
function translateClassVariables(cls) {
  var classVars = cls.getAll('variables', {static: true});
  code = [];
  classVars.forEach(function(variable) {
    if (variable.value == null) return;
    var line = !variable.mods.public && privMod ? '_' : '';
    line += variable.name + ' = ' + writeExpr(variable.value, [], cls);
    code.push(line);
  });
  return code.join('\n') + '\n\n';
}


/**
 * Translates constructors of a {Class} object into the __init__ method
 * of the class. If the class contains instance variables that are
 * initialized, the constructor writes those first.
 *
 * If the class only has one constructor, the body of that constructor
 * is written next -- its arguments are also written in the signature.
 * If the class has overloaded constructors, the bodies of its
 * constructors are written in an if/elif block.
 *
 * @param cls {Class} object
 *
 * @return {string} of code -- ends with 2 newlines
 */
function translateConstructors(cls) {
  var constructors = cls.getAll('constructors').filter(function(x) {
    return true;
  });
  var signature = writeSignature('__init__', constructors);

  var instanceVars = [];
  cls.getAll('variable', {static: false}).forEach(function(variable) {
    if (variable.value == null) return;
    var line = !variable.mods.public && privMod ? 'self._' : 'self.';
    line += variable.name  + ' = ' + writeExpr(variable.value, [], cls);
    instanceVars.push(line);
  });
  var body = instanceVars.join('\n') + '\n';

  if (constructors.length == 1) {
    body += writeBody(constructors[0].body, constructors[0].args, cls);
  } else if (constructors.length > 1) {
    body += writeOverloadBody(constructors, cls);
  }
  body = body.trim();
  if (body == '') return '';
  return signature + '\n' + tab(body) + '\n\n';
}

/**
 * Translates a single method. If the method is overloaded, an if/elif
 * block that checks for the number of parameters is written. The
 * method bodies are then placed in the suites of their respective
 * if/elif block.
 *
 * @param method {string} name of method
 * @param cls {Class} object
 *
 * @return {string} Python code -- ends with 2 newlines
 */
function translateMethod(method, cls) {
  var methods = cls.get('methods', method).filter(function(x) {
    return true;
  });
  var signature = writeSignature(method, methods);

  if (methods.length == 1) {
    var body = writeBody(methods[0].body, methods[0].args, cls);
  } else {
    var body = writeOverloadBody(methods, cls);
  }
  body = body.trim();
  if (body == '') body = 'pass';
  return signature + '\n' + tab(body) + '\n\n';
}


/*---------*
 * WRITERS *
 *---------*/

/**
 * Writes the signature of the specified method. 'self'
 * is always the first parameter. If the method (or constructor) is
 * overloaded, the only argument other parameter is '*args'). If it is
 * not overloaded, the arguments of that method are written in the
 * signature.
 *
 * @param name {string} name of the method (should be '__init__' for
 *             constructors)
 * @param methods {Array} of {Method} objects
 *
 * @return {string} a function signature in Python
 */
function writeSignature(name, methods) {
  var signature = 'def ' + name + '(self';
  if (methods.length == 1) {
    methods[0].args.forEach(function(arg) {
      signature += ', ' + arg;
    });
  } else if (methods.length > 1) {
    signature += ', *args';
  }
  return signature + '):';
}

/**
 * Writes the body of an overloaded method. For each method, the
 * arguments ('args') are unpacked into the parameter names, e.g.
 *    (x, y,) = args
 *
 * @param methods {Array} of {Method} objects
 * @param cls {Class} object
 *
 * @return {string} of code
 */
function writeOverloadBody(methods, cls) {
  var first = true, body = [];
  methods.forEach(function(method) {
    var clause = 'len(args) == ' + method.args.length + ':\n';
    if (method.args.length > 0) {
      clause += tab('(' + method.args.join(', ') + ',) = args') + '\n';
    }
    clause += tab(writeBody(method.body, method.args, cls));
    body.push(clause);
  });
  return 'if ' + body.join('\nelif ').trim();
}


/**
 * Writes the body of a single method. This method handles several
 * types of Java statements:
 *    - Returns
 *        return [expr];
 *    - Control statements
 *    - Constructor calls
 *        new <Class name>( [arg1] [, arg2] [, ...] );
 *    - Method calls
 *        [object.]<method>( [arg1] [, arg2] [, ...] );
 *    - Variable assignment
 *        [datatype] <identifier> = <expression>;
 *
 *
 * @param stmts {Array} of {Tokens} buffers.
 * @param params {Array} of {strings}, the parameters to the method
 * @param cls {Class} object
 *
 * @returns {string} of code
 */
function writeBody(stmts, params, cls) {
  var locals = params;
  body = stmts.map(function(line) {
    var first = line.shift();
    if (first == 'return') {
      if (line.empty()) return 'return'
      else return 'return ' + writeExpr(line, locals, cls);
    } else if (CONTROLS.indexOf(first) != -1) {
      // TODO
      return;
    }

    var declare = false;
    if (first == 'new') {
      first = line.shift('<constructor>');
      cons = true;
    } else if (validate(line.get(0), true, false)) {
      validate(first);
      first = line.shift('<identifier>');
      locals.push(first);
      declare = true;
    }
    if (!declare)
      first = writeIdentifier(first, line, locals, cls);

    var special = writeSpecial(first);
    if (special) return special;
    if (!line.empty() && line.get(0, '=') == '=') {
      line.shift('=');
      var value = writeExpr(line, locals, cls);
      if (value && value != '') return first + ' = ' + value;
      else logError('writeBody'); // TODO
    } else if (!line.empty() && declare) {
      logError('writeBody2');
    } else if (!line.empty()) {
      logError('writeBody3');
    } else {
      return first;
    }
  });
  return body.join('\n');
}

function writeIdentifier(first, line, locals, cls) {
  validate(first);
  if (first == 'this') first = 'self';
  else if (locals.indexOf(first) == -1) {
    var attr = cls.get('v', first) || cls.get('m', first);
    if (attr) {
      if (attr.mods.static) first = cls.name + '.' + first;
      else first = 'self.' + first;
    }
  }
  if (line.empty()) return first;
  var identifier = [];
  var next = line.shift();
  while (next == '.' || next == '(' || next == '[') {
    if (next == '.') {
      identifier.push(first);
      first = line.shift();
      validate(first);
    } else if (next == '(') {
      var args = []; line.unshift('(');
      while (line.get(0, ')') != ')') {
        var token = line.shift(',');
        if (token != '(' && token != ',') logError('writeIdentifier'); // TODO
        if (line.get(0) == ')') break;
        args.push(writeExpr(line, locals, cls));
      }
      line.shift();
      first += '(' + args.join(', ') + ')';
    } else if (next == '[') {
      var index = writeExpr(line);
      line.shift(']');
      first += '[' + index + ']';
    }
    if (line.empty()) {
      identifier.push(first);
      return identifier.join('.');
    }
    else next = line.shift();
  }
  identifier.push(first);
  line.unshift(next);
  return identifier.join('.');
}


/**
 * Writes a complete expression.
 *
 * @param line {Tokens}
 * @param locals {Array} of local parameters
 * @param cls {Class} object
 *
 * @return {string} of code
 */
function writeExpr(line, locals, cls) {
  var token = line.shift(), expr;
  if (isNumber(token)) {
    expr = token;
  } else if (token == '"') {
    var str = [];
    token = line.shift();
    while (token != '"') {
      str.push(token);
      token = line.shift();
    }
    expr = '"' + str.join(' ') + '"';
  } else if (token == 'true') {
    expr = 'True';
  } else if (token == 'false') {
    expr = 'False';
  } else if (token == 'new') {
    expr = writeIdentifier(line.shift(), line, locals, cls);
  } else {
    expr = writeIdentifier(token, line, locals, cls);
  }
  if (!line.empty() && OPERATORS.indexOf(line.get(0)) != -1) {
    var op = line.shift();
    expr += ' ' + op + ' ' + writeExpr(line);
  }
  return expr;
}

function writeSpecial(stmt) {
  if (stmt.indexOf('System.out.println') == 0) {
    return stmt.replace('System.out.println', 'print');
  }
}



/*-------------*
 * SUBROUTINES *
 *-------------*/

/**
 * Indents the entire codeblock provided by one 'TAB', as defined at
 * the top of the module. Tabs along newlines.
 *
 * @param code {string} Python code
 *
 * @return {string} indented code
 */
function tab(code) {
  return TAB + code.replace(/\n/g, '\n' + TAB);
}


/*--------------------*
 * INTERACTIVE PROMPT *
 *--------------------*/

function run() {
  var parse = require('./parser').parse;
  var rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.setPrompt('\033[33m>\033[0m ', 2);
  rl.prompt();

  rl.on('line', function(code) {
    var classes = parse(code, true);
    console.log(translate(classes, true));
    rl.prompt();
  });
}

if (require.main == module) {
  run();
}
