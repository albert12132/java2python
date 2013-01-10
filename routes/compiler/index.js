
/*
 * COMPILER
 */

var parse = require('./parser').parse;
var translate = require('./translator').translate;

exports.compile = function(req, res) {
  var fatal = req.param('fatal') == 'true' ? true : false;
  var private = req.param('private') == 'true' ? true : false;
  try {
    var jcode = req.param('jcode');
    var result = translate(parse(jcode, fatal), fatal, private);
    res.send(result);
  } catch(err) {
    res.send(err.toString());
  }
};


