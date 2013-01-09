/*--------------------------------------------------------------------*
 * TRANSLATOR
 *
 * This module translates class {Object}s (see interface.js) into
 * Python code.
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
    pycode += translateClass(cls).trim();
  });
  return pycode;
}

exports.translate = translate;


/*-------------*
 * SUBROUTINES *
 *-------------*/

/**
 * Translates a single {Class} object into Python code.
 *
 * @param cls {Class} object
 *
 * @return {string} Python code
 */
function translateClass(cls) {
  var signature = 'class ' + cls.name + '(' + cls.super + '):\n';
  var body = ''
  body += translateClassVariables(cls) + '\n';
  body += translateConstructors(cls) + '\n';
  cls.getAll('methods').forEach(function(method) {
    body += translateMethod(method, cls) + '\n\n';
  });
  if (body.trim() == '') body = 'pass';
  return signature + tab(body);
}

/**
 * Translates the class (static) variables of the given {Class} object.
 * Since Python does not allow variable declarations without
 * assign values to them, static variables that are not initialized
 * with values will not be present in the returned code.
 *
 * @param cls {Class} object
 *
 * @return {string} Python code
 */
function translateClassVariables(cls) {
  var classVars = cls.getAll('variables', {static: true});
  code = '';
  classVars.forEach(function(variable) {
    if (variable.value == null) return;
    if (!variable.mods.public) code += '_';
    code += variable.name;
    code += ' = ' + writeExpr(variable.value, [], cls) + '\n';
  });
  return code;
}

/**
 * Translates a single method. If the method is overloaded, an if/else
 * block that checks for the number of parameters is written.
 *
 * @param method {string} name of method
 * @param cls {Class} object
 *
 * @return {string} Python code
 */
function translateMethod(method, cls) {
  var methods = cls.get('methods', method).filter(function(x) {
    return true;
  });
  var signature = writeSignature(method, methods) + '\n';

  var body = '';
  if (methods.length == 1) {
    body += writeBody(methods[0].body, methods[0].args, cls);
  } else {
    body += writeOverloadBody(methods, cls);
  }
  if (body.trim() == '') body = 'pass';
  return signature + tab(body);
}


/**
 * Translates constructors of a {Class} object into the __init__ method
 * of the class.
 */
function translateConstructors(cls) {
  var constructors = cls.getAll('constructors').filter(function(x) {
    return true;
  });
  var signature = writeSignature('__init__', constructors) + '\n';

  body = '';
  var instanceVars = cls.getAll('variables', {static: false});
  instanceVars.forEach(function(variable) {
    if (variable.value == null) return;
    body += 'self.';
    if (!variable.mods.public) body += '_';
    body += variable.name  + ' = ' + writeExpr(variable.value, [], cls);
    body += '\n';
  });

  if (constructors.length == 1) {
    body += writeBody(constructors[0].body, constructors[0].args, cls);
  } else if (constructors.length > 1) {
    body += writeOverloadBody(constructors, cls);
  }
  if (body.trim() == '') return '';
  return signature + tab(body);
}

/**
 * Subroutine that writes the signature of the specified method. 'self'
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
 * Writes the body of an overloaded function. For each method, the
 * arguments ('args') are unpacked into the parameter names.
 *
 * @param methods {Array} of {Method} objects
 * @param cls {Class} object
 *
 * @return {string} of code
 */
function writeOverloadBody(methods, cls) {
  var first = true, body = '';
  methods.forEach(function(method) {
    body += first ? 'if ' : 'elif ';
    body += 'len(args) == ' + method.args.length + ':\n';
    var suite = '';
    if (method.args.length > 0) {
      suite += '(' + method.args.join(', ') + ',) = args\n';
    }
    suite += writeBody(method.body, method.args, cls);
    body += tab(suite) + '\n'
    first = false;
  });
  return body;
}


/**
 * Writes the body of a single method.
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
    return line.join(' ');
  });
  return body.join('\n');
}

/**
 * Writes a variable assignment.
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

  var identifier = translateIdentifier(identifier, locals, cls, 'var');
  if (!identifier) throw 'Invaild identifier';
  else if (identifier == 'this') throw "Can't reassign 'this'";
  return identifier + ' = ' + value;
}

/**
 * Writes a method call.
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
  else identifier = translateIdentifier(identifier, locals, cls, 'method');
  if (!identifier) throw 'Invalid method';
  var args = translateArgs(line, locals, cls);
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
  var args = translateArgs(line, locals, cls);
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
function translateArgs(line, locals, cls) {
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
 * Translates a Java identifier into its Python equivalent.
 *
 * @param identifier {string}
 * @param locals {Array} of {string}s, local variables
 * @param cls {Class} object
 * @param type {string} type of class element that is translated
 *
 * @returns {string}
 */
function translateIdentifier(identifier, locals, cls, type) {
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
      var identifier = translateIdentifier(token, locals, cls, 'var');
      if (identifier) expr.push(identifier);
      else if (OPERATORS.indexOf(token) != -1
          && OPERATORS.indexOf(expr[expr.length - 1] == -1))
          expr.push(token)
      else throw 'invalid expression: ' + expr + token;
    }
  }
  if (expr.length == 0) return '';
  return expr.join(' ');
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
