var config = {
  port: 6123,
  repos: {
    1: {
      name: 'noxDB',
      localRepo: '/home/liama/noxdb',
      parms: 'BIN_LIB=NOXDB'
    }
  }
}

var recentMessages = [
  {
    project: 'buildSlave',
    info: 'System loaded.',
    successful: true,
    timestamp: new Date().toLocaleString()
  }
];

const util = require('util');
const exec = util.promisify(require('child_process').exec);

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.json());

app.get('/builds', async (req, res) => {
  res.json(recentMessages);
});

app.post('/build/:id', async (req, res) => {
  var appID = req.params.id;
  var appInfo = config.repos[appID];

  var info = req.body.after;

  if (appInfo !== undefined) {

    res.json({message: 'Build for ' + appInfo.name + ' starting.'});

    console.log('Build for ' + appInfo.name + ' starting.');

    var stdout, stderr;
    try {
      var { stdout, stderr } = await exec('git pull', {cwd: appInfo.localRepo });
      var { stdout, stderr } = await exec('gmake ' + appInfo.parms, {cwd: appInfo.localRepo });
      stderr = undefined; //No error?
    } catch (err) {
      stderr = err;
    }

    console.log('Build finished for ' + appInfo.name + '.');

    if (stdout)
      stdout = stdout.split(/(\r?\n)/g);

    if (typeof stderr === 'object') {
      info = stderr.message;
    } else if (stderr) {
      console.log(stderr);
      stderr = stderr.split(/(\r?\n)/g);
    }

    var messageResult = {
      project: appInfo.name,
      info: info,
      successful: false,
      timestamp: new Date().toLocaleString()
    }
    
    if (stderr) {
      messageResult.successful = false;
    } else {
      messageResult.successful = true;
    }

    recentMessages.push(messageResult);

  } else {
    res.json({message: 'Local repo not found.'});
  }
});

app.listen(config.port, () => console.log(`Example app listening on port ${config.port}!`));
