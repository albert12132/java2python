
/*
 * Converter code
 */

$(document).ready(function() {
  $('#compile').click(function() {
    var jcode = $('#jcode').val();
    if (!jcode || jcode.trim() == '') {
      alert('Nothing to compile!');
    } else {
      $.post('/compile',
        {
          jcode: jcode,
          private: $('#private:checked').val() ? true : false,
          fatal: $('#warning:checked').val() ? false : true,
        },
        function(data) {
          $('#pycode').text(data);
      });
    }
    return false;
  });

  var optionsOff = true;
  $('#options').click(function() {
    if (optionsOff) {
      $('textarea[name="jcode"]').fadeOut(200, function() {
        $('#options-div').fadeIn(200);
      });
    } else {
      $('#options-div').fadeOut(200, function() {
        $('textarea[name="jcode"]').fadeIn(200)
      });
    }
    optionsOff = !optionsOff;
  });
});

