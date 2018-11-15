var recentMessages = [
  {
    project: 'buildSlave',
    info: 'System loaded.',
    successful: true,
    timestamp: new Date().toLocaleString(),
    message: ""
  }
];

const util = require('util');
const exec = util.promisify(require('child_process').exec);

var Config = require('./config');
var configClass = new Config();
var config;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

var readlineSync = require('readline-sync');
var github = require('octonode');
var githubClient = undefined;

app.use(bodyParser.json());

app.get('/builds', async (req, res) => {
  res.json(recentMessages);
});

app.post('/build/:id', async (req, res) => {
  var appID = req.params.id;
  var appInfo = config.repos[appID];
  var isRelease = (req.body.action === "release");
  var commit = req.body.after;

  if (appInfo !== undefined) {

    if (req.body.ref === appInfo.ref || isRelease) {
      
      if (!isRelease)
        updateStatus(appInfo.repo, commit, "pending", "Building application");

      res.json({message: 'Build for ' + appInfo.repo + ' starting.'});
      console.log('Build for ' + appInfo.repo + ' starting.');

      var info = req.body.ref + ' - ' + commit;

      var stdout, stderr;
      try {
        var { stdout, stderr } = await exec('git pull', {cwd: appInfo.localRepo });
        var { stdout, stderr } = await exec('gmake ' + appInfo.makeParms, {cwd: appInfo.localRepo });
        stderr = undefined; //No error?
      } catch (err) {
        stderr = err;
      }

      console.log('Build finished for ' + appInfo.repo + '.');

      if (stdout) {
        stdout = stdout.split(/(\r?\n)/g);
        stdout = stdout.filter(v=>v!='\n');
      }

      if (typeof stderr === 'object') {
        stderr = stderr.message;
      } else if (stderr) {
        console.log(stderr);
        stderr = stderr.split(/(\r?\n)/g);
        stderr = stderr.filter(v=>v!='\n');
      }

      var messageResult = {
        project: appInfo.repo,
        info: info,
        successful: false,
        timestamp: new Date().toLocaleString(),
        message: ''
      }
      
      if (stderr) {
        messageResult.successful = false;
        messageResult.message = stderr; 
      } else {
        messageResult.successful = true;
        messageResult.message = stdout; 
      }

      recentMessages.push(messageResult);

      if (!isRelease)
        updateStatus(appInfo.repo, commit, (messageResult.successful ? "success" : "failure"), "Build " + (messageResult.successful ? "successful" : "failed") + '.');
    }

  } else {
    res.json({message: 'Local repo not found.'});
  }
});

configClass.setDefaults(require('./defaultConfig'));
configClass.loadConfig('config.json');
config = configClass.dataSet;

if (config.github.username !== "username") {
  githubClient = github.client(config.github);
}

app.listen(config.port, () => console.log(`buildSave listening on port ${config.port}!`));

async function updateStatus(repo, commit, status, text) {
  if (githubClient !== undefined) {
    var ghrepo = githubClient.repo(repo);
    try {
      await ghrepo.statusAsync(commit, {
        "state": status,
        "target_url": "https://github.com/" + repo,
        "description": text
      });
    } catch (error) {
      console.log('Did not update commit status on repo ' + repo + '.');
      console.log(error);
    }
  }
}