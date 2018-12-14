
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
    
    //First update our cards

    var card = document.getElementById(appID + 'card');

    if (card === null) {
      //If it doesn't exist, create the row!
      var statuses = document.getElementById("statuses");

      statuses.innerHTML += '<div class="card mb-3" id="' + appID + 'card"><div class="card-body text-white"><div class="container"><div class="row"><div class="col-3"><div class="mx-auto text-center p-3"><i class="" id="' + appID + 'icon" style="font-size:6em"></i></div></div><div class="col"><h4 class="card-title" id="' + appID + 'title"></h4><h6 class="mb-2" id="' + appID + 'time"></h6><p class="card-text" id="' + appID + 'text"></p><div id="' + appID + 'viewBtn"></div></div></div></div></div></div>';
      card = document.getElementById(appID + 'card');
    }
    
    var row = {
      icon: document.getElementById(appID + 'icon'),
      title: document.getElementById(appID + 'title'),
      text: document.getElementById(appID + 'text'),
      time: document.getElementById(appID + 'time'),
      viewBtn: document.getElementById(appID + 'viewBtn'),
    };

    var tableInsertClass = '';
    switch (status.status) {
      case 'middle':
        tableInsertClass = 'table-dark';
        card.classList.value = 'card bg-dark mb-3';
        row.icon.classList.value = 'fa fa-circle-o-notch fa-spin';
        break;
      case 'pending':
        tableInsertClass = 'table-warning';
        card.classList.value = 'card bg-warning mb-3';
        row.icon.classList.value = 'fa fa-circle-o-notch fa-spin';
        break;
      case 'success':
        tableInsertClass = 'table-success';
        card.classList.value = 'card bg-success mb-3';
        row.icon.classList.value = 'fa fa-check';
        break;
      case 'failure':
        tableInsertClass = 'table-danger';
        card.classList.value = 'card bg-danger mb-3';
        row.icon.classList.value = 'fa fa-times';
        break;
    }

    row.title.innerText = status.name + ' (' + status.repo + ')';
    row.text.innerText = status.text;
    row.time.innerText = status.time;

    if (status.url !== "") {
      row.viewBtn.innerHTML = '<a href="' + status.url + '" target="_target"><button class="btn btn-active btn-sm" type="button">View</button></a>';
    } else {
      row.viewBtn.innerHTML = '';
    }

    //Now we also need to insert into the updates table!

    var table = document.getElementById("latest");

    tableRow = table.insertRow(0);
    tableRow.classList.value = tableInsertClass + ' mt-3';
    
    var cell;

    cell = tableRow.insertCell(0);
    cell.innerText = status.name;
    cell = tableRow.insertCell(1);
    cell.innerText = status.repo;
    cell = tableRow.insertCell(2);
    cell.innerText = status.text;
    cell = tableRow.insertCell(3);
    cell.innerText = status.time;
    cell.align = 'right';

    //Then also remove items if there are too many
    
    var tableRows = table.getElementsByTagName('tr');
    if (tableRows.length > 12) {
      table.deleteRow(tableRows.length-1);
    }
  };
}