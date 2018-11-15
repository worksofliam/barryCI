
const util = require('util');
const exec = util.promisify(require('child_process').exec);

var express = require('express'), router = express.Router();

var ConfigClass = require('./config');
var config = ConfigClass.dataSet;

var github = require('octonode');
var githubClient = undefined;
var githubClient;

if (config.github.username !== "username") {
  githubClient = github.client(config.github);
}

const IN_PROGRESS = 0, FAILED = 1, SUCCESSFUL = 2;

var buildMessages = {
  'init0': {
    project: 'buildSlave',
    commit: '0',
    ref: '0',
    successful: true,
    timestamp: new Date().toLocaleString(),
    message: "",
    panel: 'warning'
  }
};

router.get('/result/:appID/:commit', async (req, res) => {
  var id = req.params.appID;
  var commit = req.params.commit;

  var message = buildMessages[id + commit];

  if (message === undefined) {
    res.send("No way");
  } else {
    res.render('result', message);
  }
});

router.get('/builds', async (req, res) => {
  res.json(buildMessages);
});

router.post('/build/:id', async (req, res) => {
  var appID = req.params.id;
  var appInfo = config.repos[appID];
  var isRelease = (req.body.action === "release");
  var commit = req.body.after;

  if (appInfo !== undefined) {

    if (req.body.ref === appInfo.ref || isRelease) {
      
      if (!isRelease)
        updateStatus(appInfo.repo, appID, commit, "pending", "Building application");

      res.json({message: 'Build for ' + appInfo.repo + ' starting.'});
      console.log('Build for ' + appInfo.repo + ' starting.');

      var messageResult = {
        project: appInfo.repo,
        ref: req.body.ref,
        commit: commit,
        status: IN_PROGRESS,
        timestamp: new Date().toLocaleString(),
        message: '',
        panel: 'warning'
      }

      buildMessages[appID + commit] = messageResult;

      var stdout, stderr;
      try {
        var { stdout, stderr } = await exec('git pull', {cwd: appInfo.localRepo });
        var { stdout, stderr } = await exec('gmake ' + appInfo.makeParms, {cwd: appInfo.localRepo });
        stderr = undefined; //No error?
      } catch (err) {
        stderr = err;
      }

      console.log('Build finished for ' + appInfo.repo + '.');

      if (typeof stderr === 'object') {
        stderr = stderr.message;
      } else if (stderr) {
        console.log(stderr);
      }
      
      if (stderr) {
        messageResult.successful = FAILED;
        messageResult.message = stderr;
        messageResult.panel = 'success';
      } else {
        messageResult.successful = SUCCESSFUL;
        messageResult.message = stdout;
        messageResult.panel = 'warning';
      }

      buildMessages[appID + commit] = messageResult;

      if (!isRelease)
        updateStatus(appInfo.repo, appID, commit, (messageResult.successful == SUCCESSFUL ? "success" : "failure"), "Build " + (messageResult.successful == SUCCESSFUL ? "successful" : "failed") + '.');
    }

  } else {
    res.json({message: 'Local repo not found.'});
  }
});


async function updateStatus(repo, appID, commit, status, text) {
  if (githubClient !== undefined) {
    var ghrepo = githubClient.repo(repo);
    try {
      await ghrepo.statusAsync(commit, {
        "state": status,
        "target_url": config.address + ':' + config.port + '/result/' + appID + '/' + commit,
        "description": text
      });
    } catch (error) {
      console.log('Did not update commit status on repo ' + repo + '.');
      console.log(error);
    }
  }
}

module.exports = router;