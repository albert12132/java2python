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
  , CONTROLS = interface.CONTROLS
  , OPERATORS = interface.OPERATORS;
var TAB = '    ';

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
  pycode += translateMain(classes);
  return pycode.trim() + '\n';
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
    var line = ''; // private modifier here
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
    var line = 'self.'; // private modifier here
    line += variable.name  + ' = '
        + writeExpr(variable.value, [], cls);
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
 * NOT OVERLOADED:
 *    def <name>(self [, arg1] [, arg2]):
 *        <body>
 *
 * OVERLOADED:
 *    def <name>(self, *args):
 *        if len(args) == <num>:
 *            (arg1, arg2) = args
 *            <body>
 *        elif len(args) == <num>:
 *            (arg1, arg2) = args
 *            <body>
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

/**
 * Translates the main methods into a Python if block at the end of the
 * document. Classes that have main methods will be included in this
 * suite.
 *
 *    if __name__ == '__main__':
 *        import sys
 *        assert len(sys.argv) > 1
 *        if sys.argv[1] == <class name>:
 *            <class name>.main(sys.argv[2:])
 *
 * The code implies that, when calling the Python script, the class
 * names should be passed as the first command line argument (after
 * the script name).
 *    python3 <script> <class name>
 *
 * @param classes {Array} of {Class} objects
 *
 * @returns {string} code
 */
function translateMain(classes) {
  var signature = 'if __name__ == "__main__":' + '\n';
  signature += tab('import sys') + '\n';
  signature += tab('assert len(sys.argv) > 1') + '\n';
  var clauses = [];
  classes.forEach(function(cls) {
    if (cls.get('method', 'main')){
      var clause = 'sys.argv[1] == "' + cls.name + '":' + '\n';
      clause += tab(cls.name + '.main(sys.argv[2:])');
      clauses.push(clause);
    }
  });
  clauses = clauses.join('\nelif ');
  if (clauses.trim() == '') return '';
  return signature + tab('if ' + clauses);
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
  var signature = '';
  if (name == 'main') signature += '@classmethod\n';
  else if (name == 'equals') name = '__eq__';

  signature += 'def ' + name + '(self';
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
  var body = [];
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
 * This method directly corresponds to the readStatement function in
 * the parser.js module.
 *
 *
 * @param stmts {Array} of {Object}s (see parser.js for properties)
 * @param params {Array} of {strings}, the parameters to the method
 * @param cls {Class} object
 *
 * @returns {string} of code
 */
function writeBody(stmts, params, cls) {
  var locals = params;
  body = stmts.map(function(stmt) {
    switch(stmt.type) {
      case 'return':
        if (stmt.expr.length == 0) return 'return';
        else return 'return ' + writeExpr(stmt.expr, locals, cls);
      case 'call':
        var identifier = writeIdentifier(stmt.line, locals, cls);
        return identifier;
      case 'declare':
        var code = [];
        stmt.variables.forEach(function(variable) {
          if (locals.indexOf(variable.name) != -1)
            throw variable.name + ' is already a local variable';
          else locals.push(variable.name);
          if (variable.value != null) code.push(variable.name + ' = '
              + writeExpr(variable.value, locals, cls));
        });
        return code.join('\n');
      case 'assign':
        return writeIdentifier(stmt.name, locals, cls) + ' = '
          + writeExpr(stmt.expr, locals, cls);
    }
  });
  return body.join('\n');
}

/**
 * Writes an identifier, as well as any attributes it may have.
 * Directly corresponds to the parseIdentifier and parseAttribute
 * functions in the parser.js module.
 *
 * @param line {Array}
 * @param locals {Array} of local variables (strings)
 * @param cls {Class} object
 *
 * @returns {string} code
 */
function writeIdentifier(line, locals, cls) {
  var name = [];
  if (locals.indexOf(line[0]) == -1) {
    var attr = cls.get('v', line[0]) || cls.get('m', line[0]);
    if (attr) {
      if (attr.mods && attr.mods.static)
        name.push(cls.name + '.');
      else name.push('self.');
    }
  }
  while (line.length > 0) {
    var token = line.shift();
    if (Array.isArray(token)) {
      name.push(writeExpr(token, locals, cls));
    } else if (token == ',') {
      name.push(', ');
    } else if (token == 'this') {
      name.push('self');
    } else if(token == 'length' && name[name.length - 1] == '.') {
      name.pop();
      name = ['len(', name.join(''), ')'];
    } else if (token == 'equals' && name[name.length - 1] == '.') {
      name.pop();
      name = [name.join(''), ' == ', line.shift(),
           writeExpr(line.shift(), locals, cls), line.shift()];
    } else {
      name.push(token);
    } // SPECIALs, like length and equals
  }
  name = name.join('');
  name = name.replace('System.out.println', 'print');
  return name;
}


/**
 * Writes a complete expression. Directly corresponds to the
 * parseExpr function in the parser.js module.
 *
 * @param line {Array}
 * @param locals {Array} of local parameters
 * @param cls {Class} object
 *
 * @return {string} of code
 */
function writeExpr(line, locals, cls) {
  var token = line[0], expr;
  if (Array.isArray(token) && token[0] == 'array') {
    expr = '[' + token[1].map(function(elem) {
      return writeExpr(elem, locals, cls);
    }).join(', ') + ']';
  } else if (Array.isArray(token)) {
    expr = writeIdentifier(token, locals, cls);
  } else if (token == 'true') {
    expr = 'True';
  } else if (token == 'false') {
    expr = 'False';
  } else if (token == 'null') {
    expr = 'None';
  } else if (token == '(') {
    expr = line.shift() + writeExpr(line.shift(), locals, cls)
        + ')';
  } else {
    expr = token;
  }
  if (OPERATORS.indexOf(line[1]) != -1) {
    var op = line[1];
    if (op == '==') op = 'is';
    else if (op == '&&') op = 'and';
    else if (op == '||') op = 'or';
    expr += ' ' + op + ' ' + writeExpr(line[2], locals, cls);
  }
  return expr;
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
