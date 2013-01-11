$(document).ready(function() {
  var java = ace.edit("jcode");
  java.setTheme("ace/theme/tomorrow");
  java.getSession().setMode("ace/mode/java");
  document.getElementById('jcode').style.fontSize='18px';

  var editor = ace.edit("pycode");
  editor.setTheme("ace/theme/tomorrow");
  document.getElementById('pycode').style.fontSize='18px';
  editor.getSession().setMode("ace/mode/python");
});

function getValue(editor) {
  return ace.edit(editor).getValue();
}

function setValue(editor, txt) {
  ace.edit(editor).setValue(txt);
}
