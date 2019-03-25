
window.onload = function () { 
  console.log('Page loaded, contacting socket server.');

  var ws = new WebSocket("ws://" + window.location.hostname + ':9124');

  ws.onopen = function() {
    var path = window.location.pathname.split('/');

    // Web Socket is connected, send data using send()
    var data = {page: path[path.length-2], commit: path[path.length-1]};
    ws.send(JSON.stringify(data));
  };

  ws.onmessage = function (evt) {
    evt = JSON.parse(evt.data);

    var consoleBox = document.getElementById('console');
    var infocard = document.getElementById('infocard');
    var timeUpdated = document.getElementById('timeUpdated');
    var timeLength = document.getElementById('timeLength');

    switch (true) {
      case evt.append !== undefined:
        consoleBox.innerHTML += evt.append;
        consoleBox.scrollTop = consoleBox.scrollHeight;
        break;

      case evt.set !== undefined:
        consoleBox.innerHTML = evt.set;
        break;

      case evt.status !== undefined:
        infocard.classList.remove('border-success');
        infocard.classList.remove('border-warning');
        infocard.classList.remove('border-danger');

        infocard.classList.add('border-' + evt.status);
        timeUpdated.innerText = evt.time;

        timeLength.innerText = evt.time_length;
        break;
    }
  };
}