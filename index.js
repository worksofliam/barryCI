var config = {
  port: 6123,
  repos: {
    1: {
      name: 'noxDB',
      localRepo: '/home/liama/noxdb',
      buildLibrary: 'NOXDB'
    }
  }
}

var recentMessages = [
  {
    project: 'buildSlave',
    message: 'System loaded.',
    successful: true
  }
];

const util = require('util');
const exec = util.promisify(require('child_process').exec);

const express = require('express');
const app = express();

app.get('/builds', async (req, res) => {
  res.json(recentMessages);
});

app.get('/build/:id', async (req, res) => {
  var appID = req.params.id;
  var app = config.repos[appID];

  if (app !== undefined) {
    var stdout, stderr;
    try {
      var { stdout, stderr } = await exec('git pull', {cwd: app.localRepo });
      var { stdout, stderr } = await exec('gmake', {cwd: app.localRepo });
      stderr = undefined; //No error?
    } catch (err) {
      stderr = err;
    }

    if (stderr) {
      recentMessages.push({
        project: app.name,
        message: 'Something about a release or commit ID here',
        successful: false
      });
      res.json({success: false, stderr: stderr});
      
    } else {
      recentMessages.push({
        project: app.name,
        message: 'Something about a release or commit ID here',
        successful: true
      });
      res.json({success: true, stdout: stdout});
    }

  } else {
    res.json({message: 'Local repo not found.'});
  }
});

app.listen(config.port, () => console.log(`Example app listening on port ${config.port}!`));