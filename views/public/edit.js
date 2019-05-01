
window.onload = function () { 
  handle_dirs();
}

function handle_dirs() {
  var display = (document.getElementById('specific_dirs').checked ? '' : 'display: none');
  document.getElementById('deploy_dirs').style = display;
}

function add_branch_dir() {
  var table = document.getElementById("branch_dirs");
  var tableRows = table.getElementsByTagName('tr').length;
  var tableRow = table.insertRow(tableRow);

  tableRow.id = 'b' + tableRows;
  
  var cell;

  cell = tableRow.insertCell(0);
  cell.innerHTML = '<input class="form-control" type="text" name="db-' + tableRows + '" value="branch">';
  cell = tableRow.insertCell(1);
  cell.innerHTML = '<input class="form-control" type="text" name="dp-' + tableRows + '" value="/repos/dir">';
  cell = tableRow.insertCell(2);
  cell.innerHTML = '<button class="btn btn-outline-secondary btn-sm" type="button" onclick="remove_branch(\'' + tableRows + '\')"><i class="fa fa-times mr-2"></i>Remove</button>';
}

function remove_branch(branch) {
  var row = document.getElementById("b" + branch);
  row.remove();
}