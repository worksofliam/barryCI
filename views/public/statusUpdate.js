
window.onload = function () { 
  console.log('Page loaded, contacting socket server.');

  var wsPort = Number(location.port) + 1;
  var ws = new WebSocket("ws://" + window.location.hostname + ':' + wsPort);

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
    var statuses = document.getElementById("statuses");
    
    //First update our cards
    var card = document.getElementById(appID + 'card');

    //Delete the old card
    if (card !== null) card.parentNode.removeChild(card);

    //Add the new status to the top
    statuses.innerHTML = 
    '<div class="card mb-3" id="' + appID + 'card">'
      + '<div class="card-body">'
        + '<div class="container">'
          + '<div class="row">'
            + '<div class="col">'
               + ''
               + '<h4 class="card-title" id="' + appID + 'text"></h4>'
               + '<p class="card-text mb-1" id="' + appID + 'title"></p>'
               + '<p class="card-text mb-0" id="' + appID + 'time"></p>'
            + '</div>'
            + '<div class="col-3">'
              + '<div class="mx-auto text-center p-3">'
                + '<i class="" id="' + appID + 'icon" style="font-size:3.5em"></i>'
              + '</div>'
            + '</div>'
          + '</div>'
        + '</div>' 
      + '</div>'
    + '</div>' 
    + statuses.innerHTML;

    card = document.getElementById(appID + 'card');
    
    var row = {
      icon: document.getElementById(appID + 'icon'),
      title: document.getElementById(appID + 'title'),
      text: document.getElementById(appID + 'text'),
      time: document.getElementById(appID + 'time')
    };

    var tableInsertClass = '';
    switch (status.status) {
      case 'cloning':
      case 'middle':
        tableInsertClass = 'fa fa-wrench text-blue';
        row.text.classList.value = 'card-title text-blue';
        row.icon.classList.value = 'fa fa-circle-o-notch fa-spin text-blue';
        break;

      case 'pending':
        tableInsertClass = 'fa fa-wrench text-blue';
        row.text.classList.value = 'card-title text-blue';
        row.icon.classList.value = 'fa fa-circle-o-notch fa-spin text-blue';
        break;

      case 'success':
        tableInsertClass = 'fa fa-check text-green';
        row.text.classList.value = 'card-title text-green';
        row.icon.classList.value = 'fa fa-check text-green';
        break;
        
      case 'failure':
        tableInsertClass = 'fa fa-times text-red';
        row.text.classList.value = 'card-title text-red';
        row.icon.classList.value = 'fa fa-times text-red';
        break;
      
      case 'not-started':
        tableInsertClass = 'fa fa-times text-black';
        row.text.classList.value = 'card-title text-black';
        row.icon.classList.value = 'fa fa-times text-black';
        break;
    }

    row.title.innerText = status.name + ' (' + status.repo + ')';
    row.text.innerText = status.text;
    row.time.innerText = status.time;

    if (status.url !== "") {
      card.innerHTML = '<a href="' + status.url + '" target="_target">' + card.innerHTML + '</a>';
    }

    //Now we also need to insert into the updates table!

    var table = document.getElementById("latest");

    tableRow = table.insertRow(0);
    
    var cell;

    cell = tableRow.insertCell(0);
    cell.innerHTML = '<div class="' + tableInsertClass + '" />';
    cell = tableRow.insertCell(1);
    cell.innerText = status.name;
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