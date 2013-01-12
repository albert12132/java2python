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
  , logError = interface.logError
  , logParseError = interface.logParseError;
var FATAL;

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
 */
function parse(code, fatal) {
  FATAL = fatal;
  if (!code) return [];
  var buffer = new Tokens(code), classes = [];
  while (!buffer.empty()) {
    var cls = readClass(buffer);
    classes.forEach(function(x) {
      if (x.name == cls.name)
        logError(true, 'Class ' + cls.name + ' already exists');
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
 */
function readClass(buffer, modifiers) {
  // modifier checks
  var mods = modifiers || parseModifiers(buffer);
  if (!mods.public)
    logParseError(FATAL, 'private', null, "Classes can't be private");
  else if (mods.static)
    logParseError(FATAL, 'static', null, "Classes can't be static");

  var token = buffer.shift('class');
  if (token != 'class') logParseError(true, token, 'class');

  var cls = new Class(buffer.shift('<identifier>'));
  validate(cls.name, true);
  token = buffer.shift('{');

  if (token == 'extends') {
    cls.super = buffer.shift('<superclass>');
    validate(cls.super, true);
    token = buffer.shift('{');
  }

  // parse class body
  if (token != '{') logParseError(true, token, '{');
  while (buffer.get(0, '}') != '}') readDeclare(buffer, cls);
  buffer.shift('}');
  return cls;
}

/**
 * Reads a single complete declaraton found in the body of a class.
 * Valid declarations include:
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
 */
function readDeclare(buffer, cls) {
  var mods = parseModifiers(buffer);

  if (buffer.get(0) == 'class')
    return cls.add(readClass(buffer, mods));

  var datatype = buffer.shift();
  validate(datatype);

  var isArray = parseArray(buffer, '(');
  if (buffer.get(0, '(') == '(') { // expect it to be a constructor
    if (datatype != cls.name) logParseError(true, '(');
    else if (isArray) logParseError(FATAL, '[');
    else var name = '__init__';
  } else var name = buffer.shift('<identifier>');

  if (buffer.get(0) == '(') {
    validate(name, true);
    return cls.add(new Method(mods, name,
          parseArgs(buffer), parseBody(buffer)));
  }

  do {
    validate(name, true);
    var thisArray = parseArray(buffer) || isArray;

    var token = buffer.shift();
    var value = token == '=' ? readExpr(buffer) : null;
    if (token == '=') token = buffer.shift(';');

    cls.add(new Variable(mods, name, value));
    if (token == ',') name = buffer.shift('<identifier>');
  } while (token == ',');
  if (token != ';') logParseError(true, token, ';');
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
 */
function parseArgs(buffer) {
  var token = buffer.shift('(');
  if (token != '(') logParseError(true, token, '(');

  if (buffer.get(0, ')') == ')') { buffer.shift(); return []; }

  var args = [];
  while (token != ')') {
    if (token != '(' && token != ',') logParseError(true, token);
    var datatype = buffer.shift('<datatype>');
    validate(datatype);
    parseArray(buffer, '<identifier>');
    var name = buffer.shift('<identifier>');

    if (args.indexOf(name) != -1)
      logParseError(true, name, null, 'Already defined');
    validate(name, true);
    parseArray(buffer, ')');

    token = buffer.shift();
    args.push(name);
  }
  return args;
}

/**
 * Parses the body of a constructor or method. Assumes the opening
 * brace is STILL IN THE BUFFER; i.e. the buffer should have the
 * following format:
 *  ['{', ... '}' ...]
 * The closing '}' will be removed from the buffer.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array}
 */
function parseBody(buffer) {
  var token = buffer.shift('{');
  if (token != '{') logParseError(true, token, '{');

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
    if (token == '}') logParseError(true, '}');
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
 */
function readExpr(buffer) {
  var expr = [];
  while (buffer.get(0, ';') != ';' && buffer.get(0) != ',') {
    expr.push(buffer.shift());
  }
  return new Tokens(expr);
}

/**
 * Pares the buffer for array syntax. The buffer should look like this:
 *    [ '[', ']', ... ]
 *
 * The method will remove the braces from the buffer. If the buffer
 * does not start with a '[', parseArray will not do anything.
 *
 * parseArray should only be used for class level declarations -- it
 * does NOT parse method-level or expression-level array syntax. As
 * such, it does NOT expect an index between the braces.
 *
 * @param buffer {Tokens}
 * @param expect {string}, the expected token in case of an EOF
 */
function parseArray(buffer, expect) {
  if (buffer.get(0, expect) != '[') return false;
  buffer.shift();
  if (buffer.shift(']') != ']') logParseError(null, ']');
  else return true;
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
    console.log(parse(code, true));
    rl.prompt();
  });
}

if (require.main == module) {
  run();
}

