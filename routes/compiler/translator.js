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
  , validate = interface.validate;
var TAB = '    ';
var CONTROLS = [];
var OPERATORS = ['+', '-', '*', '/', '(', ')'];


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
function translate(classes) {
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
    var line = !variable.mods.public ? '_' : '';
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
  cls.getAll('variables', {static: false}).forEach(function(variable) {
    if (variable.value == null) return;
    var line = variable.mods.public ? 'self.' : 'self._';
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
    }

    var second = line.shift();
    if (first == 'new') {
      var result = writeConstructorCall(line, second, locals, cls);
      if (!line.empty()) throw 'unexpected token ' + line.get(0);
      return result;
    } else if (second == '(') {
      var result = writeMethodCall(line, first, locals, cls);
      if (!line.empty()) throw 'unexpected token ' + line.get(0);
      return result;
    } else if (second == '=') {
      return writeAssignment(line, first, locals, cls);
    } else if (line.shift('=') == '=') {
      if (locals.indexOf(second) != -1) throw second + ' exists';
      validate(first); validate(second);
      locals.push(second);
      return writeAssignment(line, second, locals, cls);
    } else {
      throw 'Not a statement'
    }
  });
  return body.join('\n');
}

/**
 * Writes a variable assignment. Invalid assignments include:
 *    - assigning to nothing
 *    - assigning to 'this'
 *    - assigning nothing (literally lack of a value)
 *
 * @param line {Tokens}
 * @param identifier {string} variable to be assigned
 * @param locals {Array} of {string}s, the local variables
 * @param cls {Class} object
 *
 * @returns {string} of code
 */
function writeAssignment(line, identifier, locals, cls) {
  var value = writeExpr(line, locals, cls);
  if (!value || value == '') throw 'Invalid expression';

  var identifier = writeIdentifier(identifier, locals, cls, 'var');
  if (!identifier) throw 'Invaild identifier';
  else if (identifier == 'this') throw "Can't reassign 'this'";
  return identifier + ' = ' + value;
}

/**
 * Writes a method call. A method call has the following format:
 *    [object.]<method name>( [arg1] [, arg2] [, ...] );
 *
 * @param line {Tokens}
 * @param identifier {string} method name
 * @param locals {Array} of {string}s, the local variables
 * @param cls {Class} object
 *
 * @returns {string} of code
 */
function writeMethodCall(line, identifier, locals, cls) {
  if (identifier == 'System.out.println') identifier = 'print';
  else identifier = writeIdentifier(identifier, locals, cls, 'method');
  if (!identifier) throw 'Invalid method';
  var args = writeArgs(line, locals, cls);
  return identifier + args;
}


/**
 * Writes a constructor call.
 *
 * @param line {Tokens}
 * @param identifier {string}, cosntructor name
 *
 * @returns {string}
 */
function writeConstructorCall(line, identifier, locals, cls) {
  validate(identifier);
  if (identifier == 'this' || identifier.indexOf('.') != -1)
    throw 'Invalid constructor';
  if (line.shift('(') != '(')
    throw 'Invalid constructor';
  var args = writeArgs(line, locals, cls);
  return identifier + args;
}


/**
 * Translates the arguments of a method or constructor call. Assumes
 * the opening ( has been removed from the line.
 *
 * @param line {Tokens}
 *
 * @return {string}
 */
function writeArgs(line, locals, cls) {
  var args = [], token = line.shift(')');
  while (token != ')') {
    var expr = [];
    while (token != ',' && token != ')') {
      expr.push(token);
      token = line.shift();
    }
    args.push(writeExpr(new Tokens(expr), locals, cls));
    if (token == ')') break;
    token = line.shift(')');
  }
  return '(' + args.join(', ') + ')';
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
  var expr = [];
  while (!line.empty()) {
    var token = line.shift();
    if (isNumber(token)) {
      if (expr.length > 0 && isNumber(expr[expr.length - 1]))
        throw 'invalid expression: ' + expr + token;
      expr.push(token);
    } else if (token == 'new') {
      expr.push(writeConstructorCall(line, line.shift(), locals, cls));
    } else if (!line.empty() && line.get(0) == '(') {
      line.shift();
      expr.push(writeMethodCall(line, token, locals, cls));
    } else if (token.search(/".*"/) == 0) {
      expr.push(token);
    } else {
      var identifier = writeIdentifier(token, locals, cls, 'var');
      if (identifier) {
        if (line.get(0) == '[' && isNumber(line.get(1)) 
            && line.get(2) == ']') {
          expr.push(identifier + line.shift() + line.shift() 
              + line.shift());
        } else {
          expr.push(identifier);
        }
      } else if (OPERATORS.indexOf(token) != -1
          && OPERATORS.indexOf(expr[expr.length - 1] == -1))
          expr.push(token)
      else throw 'invalid expression: ' + expr + token;
    }
  }
  if (expr.length == 0) return '';
  return expr.join(' ');
}

/**
 * Translates a Java identifier into its Python equivalent.
 *
 * @param identifier {string}
 * @param locals {Array} of {string}s, local variables
 * @param cls {Class} object
 * @param type {string} type of class element that is translated
 *
 * @returns {string}
 */
function writeIdentifier(identifier, locals, cls, type) {
  var dot = identifier.split('.');
  var first = dot[0];
  if (first == 'this') {
    var result = cls.get(type, dot[1], {static: false});
    if (result) dot[0] = 'self';
    else return undefined;
  } else if (first == cls.name) {
    var result = cls.get(type, dot[1], {static: true});
    if (!result) return undefined;
  } else if (locals.indexOf(first) == -1) {
    var variable = cls.get(type, first);
    if (variable) dot.unshift('self');
    else return undefined;
  }
  return dot.join('.');
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
    var classes = parse(code);
    console.log(translate(classes));
    rl.prompt();
  });
}

if (require.main == module) {
  run();
}
