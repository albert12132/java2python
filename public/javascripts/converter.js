
/*
 * Converter code
 */

$(document).ready(function() {
  $('#converter').submit(function() {
    var jcode = $('textarea[name="jcode"]').val();
    if (!jcode) {
      alert('nothing to compile!');
    } else {
      $.post('/compile', { jcode: jcode }, function(data) {
        $('textarea[name="pycode"]').text(data);
      });
    }
    return false;
  });
});

