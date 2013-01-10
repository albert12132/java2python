
/*
 * Converter code
 */

$(document).ready(function() {
  $('#compile').click(function() {
    var jcode = $('textarea[name="jcode"]').val();
    if (!jcode) {
      alert('Nothing to compile!');
    } else {
      $.post('/compile', { jcode: jcode }, function(data) {
        $('textarea[name="pycode"]').text(data);
      });
    }
    return false;
  });
});

