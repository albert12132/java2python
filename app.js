
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , compiler = require('./routes/compiler')
  , http = require('http')
  , path = require('path');

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.static(path.join(__dirname, 'prettify')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.get('/', routes.index);
app.get('/behavior', function(req, res) {
  res.render('behavior', {});
});
app.get('/about', function(req, res) {
  res.render('about', {});
});
app.post('/compile', compiler.compile);
app.post('/export', routes.exportFile);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
