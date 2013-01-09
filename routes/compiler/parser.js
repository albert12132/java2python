/*--------------------------------------------------------------------*
 * PARSER
 *
 * This module parses Java code into an internal representation of
 * classes (see interface.js). The primary function used by external
 * applications is {parse}, which will return an {Array} of Class
 * {Object}s.
 *
 * A command line interface is provided for quick testing. Run the CLI
 * with
 *    node parser
 * The CLI does not accept newlines.
 *-------------------------------------------------------------------*/

var interface = require('./interface')
  , KEYWORDS = interface.KEYWORDS
  , DATATYPES = interface.DATATYPES
  , validate = interface.validate
  , Tokens = interface.Tokens
  , Class = interface.Class
  , Variable = interface.Variable
  , Method = interface.Method
  , Exception = interface.ParseException;


/*---------*
 * EXPORTS *
 *---------*/

/**
 * Primary function used by external applications. Parses a document of
 * Java code into an Array of Class objects (see interface.js).
 *
 * @param code {string} can contain newlines
 *
 * @returns {Array} of Class objects
 *
 * @throws ParseException
 */
function parse(code) {
  if (!code) return [];
  var buffer = new Tokens(code), classes = [];
  while (!buffer.empty()) {
    var cls = readClass(buffer);
    classes.forEach(function(x) {
      if (x.name == cls.name)
        throw new Exception(cls.name, null, 'Class already defined');
    });
    classes.push(cls);
  }
  return classes;
}

exports.parse = parse;


/*---------------------*
 * CLASS LEVEL PARSERS *
 *---------------------*/

/**
 * Reads a class declaration, which has the following syntax:
 *  [protection] class [name] [extends superclass] { [body] }
 *
 * MODIFIERS:
 *  - 'private' and 'static' are illegal class modifiers
 *  - all modifiers are assumed to still be present in the buffer
 *
 * @param buffer {Tokens} of strings
 *
 * @returns {Class} object (see interface.js)
 *
 * @throws ParseException
 */
function readClass(buffer, modifiers) {
  // modifier checks
  var mods = modifiers || parseModifiers(buffer);
  if (!mods.public)
    throw new Exception('private', null, "Classes can't be private");
  else if (mods.static)
    throw new Exception('static', null, "Classes can't be static");

  var token = buffer.shift('class');
  if (token != 'class') throw new Exception(token, 'class');

  // validate name
  var cls = new Class(buffer.shift('<identifier>'));
  validate(cls.name, true);
  token = buffer.shift('{');

  // check inheritance
  if (token == 'extends') {
    cls.super = buffer.shift('<superclass>');
    validate(cls.super, true);
    token = buffer.shift('{');
  }

  // parse class body
  if (token != '{') throw new Exception(token, '{');
  while (buffer.get(0, '}') != '}') readDeclare(buffer, cls);
  buffer.shift('}');
  return cls;
}

/**
 * Reads a single complete declaraton found in the body of a class
 * (NOT a method). Valid declarations include:
 *  - class declarations
 *      [public|protected] class [extends superclass] { <body> }
 *  - method declarations
 *      [protect] [static] <datatype> <name> ([type1] [name1], ...) {}
 *  - constructor declarations
 *      [protect] [static] <class name> ([type1] [name1], ...) {}
 *  - variable declarations
 *      [protect] [static] <datatype> <name> [, ...] ;
 *  - variable assignments
 *      [protect] [static] <datatype> <name> = <value> [, ...] ;
 *
 * @param buffer {Tokens} of strings
 * @param cls {Class} object, which will be modified
*
 * @returns nothing; instead, it mutates {cls}
 *
 * @throws ParseException
 */
function readDeclare(buffer, cls) {
  var mods = parseModifiers(buffer);

  if (buffer.get(0) == 'class')
    return cls.add(readClass(buffer, mods));

  var datatype = buffer.shift();
  validate(datatype);

  if (buffer.get(0, '(') == '(') { // expect it to be a constructor
    if (datatype != cls.name) throw new Exception('(');
    else var name = '__init__';
  } else var name = buffer.shift('<identifier>');

  if (buffer.get(0) == '(') {
    validate(name, true);
    return cls.add(new Method(mods, name,
          parseArgs(buffer), parseBody(buffer)));
  }

  do {
    validate(name, true);
    var token = buffer.shift();

    var value = token == '=' ? readExpr(buffer) : null;
    if (token == '=') token = buffer.shift(';');
    cls.add(new Variable(mods, name, value));
    if (token == ',') name = buffer.shift('<identifier>');
  } while (token == ',');
  if (token != ';') throw new Exception(token, ';');
}

/**
 * Parses modifer tokens and removes them from the buffer. The returned
 * Object has the following properties:
 *  - public: {bool}
 *  - static: {bool}
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Object}
 */
function parseModifiers(buffer) {
  var mods = {public: true, static: false};
  var token = buffer.get(0);
  if ('public protected private'.indexOf(token) != -1) {
    mods.public = token != 'private';
    buffer.shift();
    token = buffer.get(0);
  }
  if (token == 'static') {
    mods.static = true;
    buffer.shift();
  }
  return mods;
}


/*----------------------*
 * METHOD LEVEL PARSERS *
 *----------------------*/

/**
 * Parses the arguments of a constructor or method. Assumes the opening
 * parenthesis is STILL IN THE BUFFER; i.e. the buffer should have
 * the following format:
 *  ['(', type1, name1, ',', type2, name2, ..., ')' ...]
 * The closing ')' will be remove from the buffer.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array} of parameter names (datatypes are discarded)
 *
 * @throws ParseException
 */
function parseArgs(buffer) {
  var token = buffer.shift('(');
  if (token != '(') throw new Exception(token, '(');

  if (buffer.get(0, ')') == ')') { buffer.shift(); return []; }

  var args = [];
  while (token != ')') {
    if (token != '(' && token != ',') throw new Exception(token);
    validate(buffer.shift('<datatype>')); // datatype

    name = buffer.shift('<identifier>');
    if (args.indexOf(name) != -1) 
      throw new Exception(name, null, 'Already defined');
    validate(name, true);
    args.push(name);

    token = buffer.shift();
  }
  return args;
}

/**
 * Parses the body of a constructor or method. Assumes the opening
 * brace is STILL IN THE BUFFER; i.e. the buffer should have the
 * following format:
 *  ['{', ... '}' ...]
 * The closing '}' will be removed from teh buffer.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array}
 */
function parseBody(buffer) {
  var token = buffer.shift('{');
  if (token != '{') throw new Exception(token, '{');

  var body = [];
  while (buffer.get(0, '}') != '}') {
    body.push(readStatement(buffer));
  }

  buffer.shift('}'); // discard '}'
  return body;
}

/**
 * Reads a single statement found in a method/constructor. This differs
 * from reading class-level declarations:
 *
 *  VALID:
 *    - variable declarations/assignments
 *      - datatype not necessary for instance/static variables
 *    - method/constructor calls
 *    - control structures (if/else, while/for)
 *    - ++ or -- operations
 *
 *  INVALID:
 *    - expressions (like '3 + 4' or 'foo() + 4')
 *    - method/constructor/class declarations
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array} of strings (tokens)
 */
function readStatement(buffer) {
  var stmt = [], token = buffer.shift(';');
  while (token != ';') {
    if (token == '}') throw new Exception('}');
    stmt.push(token);
    token = buffer.shift();
  }
  return new Tokens(stmt);
}


/*-------------*
 * SUBROUTINES *
 *-------------*/

/**
 * Reads a complete expression, which is expected to terminate only
 * when a ';' is reached. The ';' will NOT be removed from the buffer.
 *
 * readExpr performs further parsing for operators before publishing
 * the expression. Other than that, tokens remain in the same order
 * in which they came in.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array} of strings (tokens)
 *
 * @throws ParseException
 * TODO
 */
function readExpr(buffer) {
  var operators = ['+', '-', '*', '/'];
  var expr = [];
  while (buffer.get(0, ';') != ';' && buffer.get(0) != ',') {
    var token = buffer.shift();
    token = token.replace(/\+\+/g, ' ++ ').replace(/--/g, ' -- ');
    token.split(' ').forEach(function(str) {
      if (str == '') return;
      else if (str == '++' || str == '--') expr.push(str);
      else {
        operators.forEach(function(op) {
          str=str.replace(new RegExp('\\' + op, 'g'), ' ' + op + ' ');
        });
        str.split(' ').forEach(function(tok) {
          if (tok != '') expr.push(tok);
        });
      }
    });
  }
  return new Tokens(expr);
}


/*--------------------*
 * INTERACTIVE PROMPT *
 *--------------------*/

function run() {
  var rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.setPrompt('\033[33m>\033[0m ', 2);
  rl.prompt();

  rl.on('line', function(code) {
    console.log(parse(code));
    rl.prompt();
  });
}

if (require.main == module) {
  run();
}

