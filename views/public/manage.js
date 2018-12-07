
function dobuild(id) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/app/build/" + id, true);
  xhr.send();
  xhr.onload = function() {
    var data = JSON.parse(this.responseText);
    console.log(data);
    window.location.href = '/app/list';
  }
}