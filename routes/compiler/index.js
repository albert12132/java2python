
/*
 * COMPILER
 */

var parse = require('./parser').parse;
var translate = require('./translator').translate;

exports.compile = function(req, res) {
  try {
    var jcode = req.param('jcode');
    var result = translate(parse(jcode));
    res.send(result);
  } catch(err) {
    res.send(err.toString());
  }
};


