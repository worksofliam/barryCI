const WebSocket = require('ws');

//**********************************************

var wss;

module.exports = {
  startServer: function(port) {
    wss = new WebSocket.Server({
      port: port
    });
    
    wss.on('connection', function connection(ws) {
    
      console.log('Client connected.');
      ws.on('message', function incoming(data) {
        data = JSON.parse(data);
        if (data.page !== undefined) {
          ws.page = data.page;
          ws.commit = data.commit;
          console.log('Client page connected: ' + data.page);
        }
      });
    
    });

    console.log('WebSocket server started on port ' + port);
  },

  results: {
    pushStandardContent: function(appID, commit, content) {
      if (appID === undefined) return;

      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          if (client.page === appID && client.commit === commit) {
            client.send(JSON.stringify({append: content}));
          }
        }
      });
    },

    setStandardContent: function(appID, commit, content) {
      if (appID === undefined) return;

      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          if (client.page === appID && client.commit === commit) {
            client.send(JSON.stringify({set: content}));
          }
        }
      });
    },

    setStatus(appID, commit, status) {
      if (appID === undefined) return;

      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          if (client.page === appID && client.commit === commit) {
            client.send(JSON.stringify({status: status, time: new Date().toLocaleString()}));
          }
        }
      });
    }
  },

  view: {
    updateStatus: function(appID, data) {
      if (appID === undefined) return;
  
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          if (client.page === "status") {
            client.send(JSON.stringify({id: appID, data: data}));
          }
        }
      });
    }
  },

  closeClient: function(appID, commit) {
    if (appID === undefined) return;

    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        if (client.page === appID && commit === client.commit) {
          client.close();
        }
      }
    });
  }

}

