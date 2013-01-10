Java To Python
==============

Hosted on Heroku:

[http://java2python.herokuapp.com/](http://java2python.herokuapp.com/)

A small web app that translates Java into Python code. Built on
`node.js`. To start the app, you have to install dependencies first:

    $ npm install
    $ node app.js

[Jade](http://naltatis.github.com/jade-syntax-docs/) is the templating
engine.

Issues and improvements
-----------------------
* Code cleanup
* String and character parsing
    * String method parsing
* Protection modifiers
    * implement for methods
* `main` method translation into Python `main`
* Control structures
    * `if`/`else`
    * `while`
    * `for`
    * ` ? : `
* Data Structures:
    * Arrays -> lists
    * Hashtables -> dictionaries
* Web interface options:
    * optimizations (e.g. method overloading)
* Syntax highlighting
