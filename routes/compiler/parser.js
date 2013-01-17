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
  , Tokens = interface.Tokens
  , Class = interface.Class
  , Variable = interface.Variable
  , Method = interface.Method
  , OPERATORS = interface.OPERATORS
  , CONTROLS = interface.CONTROLS;

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
function parse(code) {
  if (!code) return [];
  var buffer = new Tokens(code), classes = [];
  while (!buffer.empty()) {
    var cls = readClass(buffer);
    classes.forEach(function(x) {
      if (x.name == cls.name)
        buffer.logError('Class ' + cls.name + ' already exists');
    });
    classes.push(cls);
  }
  if (buffer.errors.length != 0) buffer.publishErrors();
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
 * All modifiers are assumed to still be present in the buffer.
 * Removes all tokens up until the closing '}'.
 *
 * @param buffer {Tokens} of strings
 *
 * @returns {Class} object (see interface.js)
 */
function readClass(buffer, modifiers) {
  var mods = modifiers || parseModifiers(buffer);
  var token = buffer.shift('class', true);

  var cls = new Class(buffer.shift('<identifier>'));
  buffer.validate(cls.name);
  token = buffer.shift('{');

  if (token == 'extends') {
    cls.super = buffer.shift('<superclass>');
    buffer.validate(cls.super);
    token = buffer.shift('{');
  }

  buffer.expect('{', token);
  while (buffer.current('}') != '}') readDeclare(buffer, cls);
  buffer.shift('}');
  return cls;
}


/**
 * Reads a single complete declaraton found in the body of a class.
 * Removes all tokens up until the ending delimiter, which is either
 * a ';' or a '}' depending on the type of declaration.
 *
 * Valid declarations include:
 *  - class declarations
 *      [protect] class [extends superclass] { <body> }
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

  if (buffer.current() == 'class')
    return cls.add(readClass(buffer, mods));

  var datatype = parseIdentifier(buffer);
  parseArray(buffer, '(');

  if (buffer.current() == '(') { // expect it to be a constructor
    if (datatype.join('.') != cls.name)
      buffer.logError('Unexpected "("');
    else var name = '__init__';
  } else var name = buffer.shift('<identifier>');

  if (buffer.current() == '(') {
    buffer.validate(name);
    return cls.add(new Method(mods, name,
          parseArgs(buffer), parseBody(buffer)));
  }

  buffer.unshift(name);
  var variables = parseVariables(buffer);
  variables.forEach(function(variable) {
    cls.add(new Variable(mods, variable.name, variable.value));
  });
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
  var token = buffer.current();
  if ('public protected private'.indexOf(token) != -1) {
    mods.public = token != 'private';
    buffer.shift();
    token = buffer.current();
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
 * Tokens will be removed up until the closing ')'.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array} of parameter names (datatypes are discarded)
 */
function parseArgs(buffer) {
  var token = buffer.shift('(', true);
  if (buffer.current(')') == ')') { buffer.shift(); return []; }

  var args = [];
  do {
    parseIdentifier(buffer); // datatype
    parseArray(buffer, '<identifier>');

    var name = buffer.shift('<identifier>');
    if (args.indexOf(name) != -1)
      buffer.logError(name + ' is already a parameter');
    else buffer.validate(name);
    parseArray(buffer, ')');
    args.push(name);
    token = buffer.shift(')');
  } while (token == ',');
  buffer.expect(')', token);
  return args;
}

/**
 * Parses the body of a constructor or method. Assumes the opening
 * brace is STILL IN THE BUFFER; i.e. the buffer should have the
 * following format:
 *  ['{', ... '}' ...]
 * Tokens will be removed up until the closing '}'.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array}
 */
function parseBody(buffer) {
  var token = buffer.shift('{', true);
  var body = [];
  while (buffer.current('}') != '}') {
    var stmt = readStatement(buffer);
    if (typeof stmt != 'undefined') body.push(stmt);
  }
  buffer.shift('}', true); // discard '}'
  return body;
}

/**
 * Reads a single statement found in a method/constructor. This differs
 * from reading class-level declarations:
 *
 *  VALID:
 *    - variable declarations/assignments
 *        <datatype> <name> [= <expr>] [, ...] ;
 *    - return statements
 *        return [expr] ;
 *    - control structures
 *    - method/constructor calls
 *        [new] [identifier][attribute] ;
 *    - attribute assignment
 *        [new] [identifier][attribute] = <expr> ;
 *
 *  INVALID:
 *    - expressions (like '3 + 4' or 'foo() + 4')
 *    - method/constructor/class declarations
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Object}:
 *        type: 'return', expr: {Array}
 *        type: 'assign', name: {string}, expr: {Array}
 *        type: 'declare', variables: {Array} of {Object}s
 *        type: 'call', line: {Array}
 */
function readStatement(buffer) {
  var token = buffer.current(';');
  if (token == '{') {
    buffer.shift();
    var stmts = [];
    while (buffer.current() != '}') {
      stmts.push(readStatement(buffer));
    }
    buffer.shift('}', true);
    return {type: 'block', stmts: stmts};
  } else if (token == 'return') {
    buffer.shift('return', true);
    var expr = parseExpr(buffer);
    buffer.shift(';', true);
    return {type: 'return', expr: expr};
  } else if (CONTROLS.indexOf(token) != -1) {
    switch(token) {
      case 'if':
        buffer.shift();
        buffer.shift('(', true);
        var expr = parseExpr(buffer);
        buffer.shift(')', true);
        var stmt = readStatement(buffer);
        var elseClause;
        if (buffer.current() == 'else') {
          buffer.shift();
          elseClause = readStatement(buffer);
        }
        return {type: 'if', pred: expr, suite: stmt, else: elseClause};
        break;
    }
    return;
  } else if (token == 'new') {
    token = buffer.shift();
  }
  var identifier = parseIdentifier(buffer);
  if (parseArray(buffer) || buffer.validate(buffer.current(), true)) {
    return {type: 'declare', variables: parseVariables(buffer)};
  } else if (buffer.current(';') == '=') {
    buffer.shift('=', true);
    var expr = parseExpr(buffer);
    buffer.shift(';', true);
    return {type: 'assign', name: identifier, expr: expr};
  } else {
    parseAttribute(identifier, buffer);
    if (buffer.current(';') == '=') {
      buffer.shift('=', true);
      var expr = parseExpr(buffer);
      buffer.shift(';', true);
      return {type: 'assign', name: identifier, expr: expr};
    } else {
      buffer.shift(';', true);
      return {type: 'call', line: identifier};
    }
  }
}


/*-------------*
 * SUBROUTINES *
 *-------------*/

/**
 * Parses variables declarations, of the following format
 *    <datatype> <name> [= <expr>] [, ...] ;
 *
 * This method assumes the datatype has already been removed from the
 * buffer, and should begin with the first identifier.
 *
 * Tokens will be removed up until the ';'.
 *
 * @param buffer {Tokens}
 *
 * @returns {Array} of {Object}s, with these properties:
 *          name: {string}
 *          value: {Array} or null if no value assigned;
 */
function parseVariables(buffer) {
  var name = buffer.shift('<identifier>');
  var variables = [];
  do {
    buffer.validate(name);
    parseArray(buffer);

    var token = buffer.shift();
    var value = token == '=' ? parseExpr(buffer) : null;
    if (token == '=') token = buffer.shift(';');

    variables.push({name: name, value: value});
    if (token == ',') name = buffer.shift('<identifier>');
  } while (token == ',');
  return variables;
}

/**
 * Parses an identifier, which may contain 0 or more '.'s.
 *    <name>[.<attr1>][.<attr2>][...]
 *
 * EXAMPLES of VALID IDENTIFIERS:
 *    - foo
 *    - java.lang.String
 * INVALID IDENTIFIERS:
 *    - foo[3]
 *    - foo()
 *    - foo[]   (syntactically valid, but this method doesn't parse [])
 *
 * @param buffer {Tokens}
 *
 * @return {Array} of {string}s. All tokens are pushed onto the {Array}
 *          including '.'s
 */
function parseIdentifier(buffer) {
  if (!buffer.validate(buffer.current(), true)) return [];
  var identifier = [buffer.shift('<identifier>')];
  buffer.validate(identifier[0]);
  while (buffer.current() == '.') {
    identifier.push(buffer.shift('.', true));
    token = buffer.shift();
    buffer.validate(token);
    identifier.push(token);
  }
  return identifier;
}

/**
 * Parses the buffer for any number of '[]'. The buffer should look
 * like this:
 *    [ '[', ']', ... ]
 *
 * The method will remove the braces from the buffer. If the buffer
 * does not start with a '[' and a ']', parseArray will not do
 * anything.
 *
 * If there is an expression between any pair of '[' and ']', the
 * return value will be false (i.e. no valid array declaration).
 *
 * @param buffer {Tokens}
 * @param expect {string}, the expected token in case of an EOF
 *
 * @return {bool} true if the buffer starts with a valid array
 *          declaration, false otherwise
 */
function parseArray(buffer, expect) {
  if (buffer.current(expect) != '[') return false;
  var token = buffer.shift();
  if (buffer.current() != ']') {
    buffer.unshift(token);
    return false;
  }
  buffer.shift();
  while (buffer.current() == '[') {
    buffer.shift();
    buffer.shift(']', true);
  }
  return true;
}

/**
 * Parses the buffer for any number of attributes. This method
 * supplements parseIdentifier, and in fact assumes that the result of
 * parseIdentifier is passed in as the first argument.
 *
 * This method parses the front of the buffer for attributes and
 * APPENDS all the tokens to the given identifier (which should be an
 * {Array}). This includes any '.', '(', ')', '[', or ']'.
 *
 * Expressions found between parentheses and brackets will be appended
 * to the identifier as {Array}s (see parseExpr).
 *
 * @param identifier {Array} returned by parseIdentifier
 * @param buffer {Tokens}
 *
 * @return {Array}, the updated identifier
 */
function parseAttribute(identifier, buffer) {
  var token = buffer.current();
  while (token == '.' || token == '(' || token == '[') {
    identifier.push(token);
    switch(buffer.shift()) {
      case '.':
        var name = buffer.shift('<identifier>');
        buffer.validate(name);
        identifier.push(name);
        break;
      case '[':
        var expr = parseExpr(buffer);
        if (expr.length == 0)
          buffer.logError('Expected expression after "["');
        identifier.push(expr);
        identifier.push(buffer.shift(']', true));
        break;
      case '(':
        if (buffer.current() == ')') {
          identifier.push(buffer.shift());
          break;
        }
        do {
          var arg = parseExpr(buffer);
          if (arg.length == 0) buffer.logError('Expected argument');
          identifier.push(arg);
          token = buffer.shift(')');
          identifier.push(token);
        } while (token == ',');
        buffer.expect(')', token);
        break;
      default:
        buffer.logError('Unexpected ' + token);
        break;
    }
    token = buffer.current();
  }
  return identifier;
}


/**
 * Recursively parses a complete expression. The method will continue
 * as long as the token following the parsed expression is a valid
 * operator. The delimiter that stops the method will NOT be removed
 * from the buffer.
 *
 * @param buffer {Tokens} of strings
 *
 * @return {Array}
 */
function parseExpr(buffer) {
  var token = buffer.current(';'), expr = [];
  if (Tokens.isNumber(token) || token == 'true' || token == 'false'
      || token == 'null') {
    expr.push(buffer.shift());
  } else if (token == '-' || token == '+' || token == '!') {
    expr.push(buffer.shift());
    expr.push(parseExpr(buffer));
  } else if (token == 'new') {
    buffer.shift();
    var identifier = parseIdentifier(buffer);
    parseAttribute(identifier, buffer);
    expr.push(identifier);
  } else if (token == '"') {
    buffer.shift();
    var str = [];
    do {
      token = buffer.shift('"');
      str.push(token);
    } while (token != '"');
    str.pop();
    expr.push('"' + str.join(' ') + '"');
  } else if (token == '{') {
    buffer.shift();
    var array = [];
    if (buffer.current('}') != '}') {
      do {
        var elem = parseExpr(buffer);
        if (elem.length > 0) array.push(elem);
        else buffer.log('Invalid expression');
      } while (buffer.shift('}') == ',');
    } else buffer.shift('}', true);
    expr.push(['array', array]);
  } else if (token == '(') {
    expr.push(buffer.shift());
    expr.push(parseExpr(buffer));
    expr.push(buffer.shift(')', true));
  } else {
    var identifier = parseIdentifier(buffer);
    if (identifier.length == 0) return [];
    parseAttribute(identifier, buffer);
    expr.push(identifier);
  }
  if (OPERATORS.indexOf(buffer.current()) != -1) {
    expr.push(buffer.shift());
    expr.push(parseExpr(buffer)); // concat?
  }
  return expr;
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
