
/*
 * Converter code
 */

$(document).ready(function() {
  $('#compile').click(function() {
    var jcode = getValue('jcode');
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
          setValue('pycode', data);
      });
    }
    return false;
  });

  var optionsOff = true;
  $('#options').click(function() {
    if (optionsOff) {
      $('#jcode').fadeOut(200, function() {
        $('#options-div').fadeIn(200);
      });
    } else {
      $('#options-div').fadeOut(200, function() {
        $('#jcode').fadeIn(200)
      });
    }
    optionsOff = !optionsOff;
  });
});

