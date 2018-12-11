
window.onload = function () { 
  console.log('Page loaded, contacting socket server.');

  var ws = new WebSocket("ws://" + window.location.hostname + ':6124');

  ws.onopen = function() {
    var path = window.location.pathname.split('/');

    // Web Socket is connected, send data using send()
    var data = {page: 'status'};
    ws.send(JSON.stringify(data));
  };

  ws.onmessage = function (evt) {
    evt = JSON.parse(evt.data);

    var appID = evt.id;
    var status = evt.data;
    
    var tableRow = document.getElementById(appID + 'tr');

    if (tableRow === null) {
      //If it doesn't exist, create the row!
      var table = document.getElementById("statuses");

      tableRow = table.insertRow();
      tableRow.id = appID + 'tr';
      
      var cell;

      cell = tableRow.insertCell(0);
      cell.id = appID + 'name';
      cell = tableRow.insertCell(1);
      cell.id = appID + 'repo';
      cell = tableRow.insertCell(2);
      cell.id = appID + 'text';
      cell = tableRow.insertCell(3);
      cell.id = appID + 'time';
      cell = tableRow.insertCell(4);
      cell.id = appID + 'viewBtn';
    }

    switch (status.status) {
      case 'middle':
        tableRow.classList.value = 'table-active';
        break;
      case 'pending':
        tableRow.classList.value = 'table-warning';
        break;
      case 'success':
        tableRow.classList.value = 'table-success';
        break;
      case 'failure':
        tableRow.classList.value = 'table-danger';
        break;
    }

    var row = {
      name: document.getElementById(appID + 'name'),
      repo: document.getElementById(appID + 'repo'),
      text: document.getElementById(appID + 'text'),
      time: document.getElementById(appID + 'time'),
      viewBtn: document.getElementById(appID + 'viewBtn'),
    };

    row.name.innerText = status.name;
    row.repo.innerText = status.repo;
    row.text.innerText = status.text;
    row.time.innerText = status.time;

    if (status.url !== "") {
      row.viewBtn.innerHTML = '<a href="' + status.url + '" target="_target"><button class="btn btn-primary btn-sm" type="button">View</button></a>';
    } else {
      row.viewBtn.innerHTML = '';
    }
  };
}