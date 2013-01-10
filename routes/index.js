
/*
 * GET home page.
 */

var fs = require('fs');

exports.index = function(req, res){
  res.render('index', { title: 'Express' });
};

// TODO
exports.exportFile = function(req, res) {
  var name = req.param('name') + '.py';
  fs.writeFile('tmp/' + name, req.param('pycode'), 'utf8', function(err) {
    if (err) throw err;
    res.download('tmp/' + name, function(err) {
      if (err) throw err;
      else console.log('Success!');
    });
  });
}
