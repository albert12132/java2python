/*--------------------------------------------------------------------*
 * INTERFACE
 *
 * Contents:
 *  - {Tokens} class: used by Parser
 *  - DELIMS, KEYWORDS, DATATYPES:
 *      arrays of Java language-related tokens
 *  - Exceptions:
 *      ParseException: thrown by Parser
 *  - Abstract Data Types
 *      - Class
 *      - Method: used for both methods and constructors
 *      - Variable
 *-------------------------------------------------------------------*/

var DELIMS = ['{', '}', '(', ')', '[', ']', ';', ',', '=', 
    '"', '*', '/'];
var KEYWORDS = [
  'public', 'private', 'protected',
  'static', // 'abstract', 'final',
  'class', // 'interface', 'enum',
  'extends', // 'implements', 'throws',
  'return', 'new', // 'instanceof',
  'this', // 'super',
  'if', 'else', // 'switch', 'case', 'default',
  'while', 'for', // 'do', 'break', 'continue',
  // 'try', 'catch', 'finally',
  'true', 'false', 'null',
]
var DATATYPES = [
  'boolean', 'byte', 'char', 'double', 'float', 'int', 'long', 'short',
]

/*-------------*
 * SUBROUTINES *
 *-------------*/

/**
 * Validates an identifier. A valid Java identifer must:
 *  - start with [a-zA-Z_]
 *  - thereafter consist of [a-zA-Z_0-9]
 *  - not be a keyword (see interface.js)
 *
 * @param name {string}
 * @param identifier {bool} true if validating an identifier
 *
 * @return {bool} true if {name} if valid
 *
 * @throws ParseException
 */
function validate(name, identifier, fatal) {
  var msg;
  if (typeof name == 'undefined')
    msg = 'Expected name';
  else if (KEYWORDS.indexOf(name) != -1)
    msg = name + ' is a keyword';
  else if (identifier && DATATYPES.indexOf(name) != -1)
    msg = name + ' is a keyword (datatype)';
  else if (name.search(/^[a-zA-Z_]\w*$/) == -1)
    msg = name + ' is an invalid name';
  if (fatal && msg) logError(msg);
  return msg ? false : true;
}

/**
 * @returns {bool} true if the token is a valid integer or decimal
 */
function isNumber(token) {
  return token.search(/\d+/) == 0 || token.search(/\d*\.\d+/) == 0;
}


/*------------*
 * Exceptions *
 *------------*/

/**
 * Logs an error.
 *
 * @param fatal {bool} if true, throw an exception. Otherwise just log
 *              to terminal
 * @param msg {string} error message
 */
function logError(fatal, msg) {
  if (fatal) throw msg;
  else console.log('WARNING: ' + msg);
}

/**
 * Logs a Parsing error.
 *
 * @param fatal {bool} if true, throw an exception. Otherwise, just log
 *              to terminal
 * @param actual {string} actual token encountered
 * @param expected {string} expected token
 * @param msg {string} error message
 */
function logParseError(fatal, actual, expected, msg) {
  var message = '';
  if (actual) message += 'Unexpected "' + actual + '". ';
  if (expected) message += 'Expected "' + expected + '". ';
  if (msg) message += msg;
  logError(fatal, message);
}


/*--------------*
 * TOKEN BUFFER *
 *--------------*/

/**
 * Buffer containing tokens. Converts a string of Java code into
 * tokens and stores it. Alternatively, takes an Array and makes it a
 * buffer. {shift} and {get} operations will take care of unexpected
 * EOF by throwing ParseExceptions.
 *
 * @param code {string} or {Array}
 */
function Tokens(code) {
  if (typeof code == 'string') this.tokens = Tokens.tokenize(code);
  else if (Array.isArray(code)) this.tokens = code;
}


/**
 * Same as {string} version of {join}
 *
 * @param delim delimiter placed in between each element
 *
 * @return {string}
 */
Tokens.prototype.join = function(delim) {
  return this.tokens.join(delim);
}

/**
 * Tokenizes a string of code. The process:
 *  - replace all newlines with spaces
 *  - pad delimiters with spaces
 *  - split string along spaces
 *
 * @param code {string} can contain newlines
 *
 * @returns {Array} of strings, referred to as 'tokens'
 */
Tokens.tokenize = function(code) {
  code = code.replace(/\/\/.*\n/g, '');
  code = code.replace(/\n/g, ' ');
  code = code.replace(/\+\+/g, ' ++ ').replace(/--/g, ' -- ');
  code = code.replace(/([^+])\+([^+])/g, function(match, p1, p2) {
    return p1 + ' + ' + p2;
  });
  code = code.replace(/([^-])-([^-])/g, function(match, p1, p2) {
    return p1 + ' - ' + p2;
  });
  code = code.replace(/([^\d])\.([^\d])/, function(match, p1, p2) {
    return p1 + ' . ' + p2;
  });
  DELIMS.forEach(function(delim) {
    var regex = new RegExp('\\' + delim, 'g');
    code = code.replace(regex, ' ' + delim + ' ');
  });
  return code.split(' ').filter(function(x) { return x != ''; });
};


/**
 * @returns {bool} true if buffer is empty
 */
Tokens.prototype.empty = function() {
  return this.tokens.length == 0;
};

/**
 * Gets the token in the buffer at the specified index, but does NOT
 * remove it fromt he buffer.
 *
 * @param index {number}
 * @param expect {string}, optional; used in error message in case of
 *               unexpected EOF (i.e. index is out of range)
 *
 * @returns {string}, the token
 */
Tokens.prototype.get = function(index, expect) {
  if (typeof this.tokens[index] == 'undefined')
    logParseError(true, 'EOF', expect);
  return this.tokens[index];
};

/**
 * Removes and returns the first token in the buffer.
 *
 * @param expect {string}, optional; used in error message if no more
 *               tokens are in the buffer
 *
 * @returns {string}, token
 *
 * @throws ParseException
 */
Tokens.prototype.shift = function(expect) {
  if (this.tokens.length == 0)
    logParseError(true, 'EOF', expect);
  return this.tokens.shift();
};

/**
 * @param item will be added to front of the buffer.
 */
Tokens.prototype.unshift = function(item) {
  return this.tokens.unshift(item);
};


/*---------------------*
 * ABSTRACT DATA TYPES *
 *---------------------*/

/**
 * Represents a Java class
 *
 * @param name {string} the name of the Class
 */
function Class(name) {
  this.name = name;
  this.super = 'object';
  this.variables = {};
  this.methods = {};
  this.constructors = [];
  this.nested = {};
}

/**
 * Gets a single Class element of the specified type and identifier.
 * For variables, methods, and nested classes, the identifier is the
 * name. For constructors, the identifier is the number of arguments.
 *
 * @param type {string}, with the following options:
 *             variables: anything starting with 'v'
 *             methods: anything starting with 'm'
 *             constructors: anything starting with 'co'
 *             nested classes: anything starting with 'cl' or 'n'
 * @param identifier {string} for variables, methods, and nested
 *                   classes; {number} of args for constructors
 * @param mods, optional {Object} of modifieres that the returned item
 *              must satisfy
 *
 * @returns variables: a {Variable} object
 *          methods: an {Array} of {Method} objects
 *          constructors: a single {Method} object
 *          nested classes: a {Class} object
 */
Class.prototype.get = function(type, identifier, mods) {
  if (type.charAt(0) == 'v') {
    var result = this.variables[identifier];
  } else if (type.charAt(0) == 'm') {
    return this.methods[identifier];
  } else if (type.slice(0, 2) == 'co') {
    var result = this.constructors[identifier];
  } else if (type.slice(0, 2) == 'cl' || type.charAt(0) == 'n') {
    var result = this.nested[identifier];
  } else return undefined;
  if (result && mods) {
    var modifiers = Object.keys(mods);
    for (var i = 0; i < modifiers.length; i++) {
      if (result.mods[modifiers[i]] != mods[modifiers[i]])
        return undefined;
    }
  }
  return result;
};

/**
 * Gets all Class elements of a specified types. If {mods} is
 * specified, filter the {Array} and keep only elements that have
 * modifier values specified by {mods}.
 *
 * @param type {string}, with the following options:
 *             variables: anything starting with 'v'
 *             methods: anything starting with 'm'
 *             constructors: anything starting with 'co'
 *             nested classes: anything starting with 'cl' or 'n'
 * @param mods {Object}, optional, containing modifiers and values
 *
 * @return variables: {Array} of {Variable} objects
 *         methods: {Array} of {string}s (method names)
 *         constructors: {Array} of {Method} objects
 *         nested classes: {Array} of {Class} objects
 */
Class.prototype.getAll = function(type, mods) {
  var list;
  if (type.charAt(0) == 'v') {
    var variables = this.variables;
    list = Object.keys(variables).map(function(variable) {
      return variables[variable];
    });
  } else if (type.charAt(0) == 'm') {
    list = Object.keys(this.methods);
  } else if (type.slice(0, 2) == 'co') {
    list = this.constructors;
  } else if (type.slice(0, 2) == 'cl' || type.charAt(0) == 'n') {
    var nested = this.nested;
    list = Object.keys(nested).map(function(cls) {
      return nested[cls];
    });
  }
  if (mods) {
    return list.filter(function(item) {
      var modifiers = Object.keys(mods);
      for (var i = 0; i < modifiers.length; i++) {
        if (item.mods[modifiers[i]] != mods[modifiers[i]]) 
          return false;
      }
      return true;
    });
  } else return list;
};

/**
 * Adds an item to the Class. The item must be an object of one of the
 * following types:
 *    - Class
 *    - Variable
 *    - Method (for methods and constructors)
 *
 * @param item
 * 
 * @returns nothing
 */
Class.prototype.add = function(item) {
  switch(item.constructor.name) {
    case 'Variable':
      if (this.variables[item.name])
        throw this.name + 'already has variable ' + item.name;
      else this.variables[item.name] = item;
      break;
    case 'Method':
      var type = item.name == '__init__' ? 'constructors' : 'methods';
      if (type == 'methods') {
        var context = this.methods[item.name] 
            = this.methods[item.name] || [];
      } else var context = this.constructors;

      if (context[item.args.length])
        throw this.name + ' already has ' + type + ' with '
            + item.args.length + ' parameters';
      else context[item.args.length] = item;
      break;
    case 'Class':
      if (this.nested[item.name])
        throw this.name + 'already has class ' + item.name;
      else this.nested[item.name] = item;
      break;
    default:
      throw "Can't add " + item + ' to a Class'
  }
};

/**
 * Represents a Variable
 *
 * @param mods {Object} modifiers, including protection and static
 * @param datatype {string}
 * @param name {string} name of variable
 * @param value {null} if variable has no value
 */
function Variable(mods, name, value) {
  this.mods = mods;
  this.name = name;
  this.value = value;
}

/**
 * Represents a Method/Constructor.
 *
 * @param mods {Object} modifiers, including protection and static
 * @param datatype {string} return type of method
 * @param name {string} name of method, or '__init__' for constructors
 * @param args {Array} of {Objects} -- name/datatype pairs
 * @param body {Array}
 */
function Method(mods, name, args, body) {
  this.mods = mods;
  this.name = name;
  this.args = args;
  this.body = body;
}


/*---------*
 * EXPORTS *
 *---------*/

exports.DELIMS = DELIMS;
exports.KEYWORDS = KEYWORDS;
exports.DATATYPES = DATATYPES;
exports.validate = validate;
exports.isNumber = isNumber;
exports.logError = logError;
exports.logParseError = logParseError;
exports.Tokens = Tokens;
exports.Class = Class;
exports.Method = Method;
exports.Variable = Variable;

