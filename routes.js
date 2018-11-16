
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const crypto = require('crypto');
const path = require('path');

var express = require('express'), router = express.Router();

var tmp = require('tmp');
var tmpDir = util.promisify(tmp.dir);

//**********************************************

var ConfigClass = require('./config');
var Config = new ConfigClass();
Config.loadConfig('config.json');
var config = Config.dataSet;

//**********************************************

var github = require('octonode');
var githubClient = undefined;
var githubClient;

if (config.github !== "PERSONAL-ACCESS-TOKEN-HERE") {
  githubClient = github.client(config.github);
}

//**********************************************

var buildMessagesConfig = new ConfigClass();
buildMessagesConfig.loadConfig('buildMessages.json');
var buildMessages = buildMessagesConfig.dataSet;

//**********************************************

const IN_PROGRESS = 0, FAILED = 1, SUCCESSFUL = 2;

//**********************************************

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

router.post('/pr/:id', async (req, res) => {
  var appID = req.params.id;
  var appInfo = config.repos[appID];

  if (appInfo !== undefined) {
    var isAllowed = true;
    var secret = appInfo.secret || "";
    var request = JSON.stringify(req.body);

    //If key is provided in header, check against local key.
    if (req.headers['x-hub-signature'] !== undefined) {
      var signed = 'sha1=' + crypto.createHmac('sha1', secret).update(request).digest('hex');
      var calculated_signature = new Buffer(signed);

      if (new Buffer(req.headers['x-hub-signature']).equals(calculated_signature) === false) {
        console.log('X-Hub-Signature does not match request signature.');
        isAllowed = false;
      }
    }

    if (isAllowed) {
      var httpsURI = req.body.pull_request.head.repo.clone_url;
      var prNumber = req.body.number;
      var prCommit = req.body.pull_request.head.sha;
      var prAction = req.body.action;

      if (prAction === "opened" || prAction === "edited" || prAction === "synchronize") {
        res.json({message: 'Starting build for PR.'});

        var localRepo = await cloneRepo(httpsURI, appInfo.repo);
        var result = await buildLocal(localRepo, appInfo.makeParms.pr, appID, appInfo.repo, "PR", "PR");

        await updatePR(appInfo.repo, prNumber, prCommit, result.status == SUCCESSFUL);
      } else {
        res.json({message: 'Not valid action for build.'});
      }
    } else {
      res.json({message: 'Secrets do not match.'});
    }

  } else {
    res.json({message: 'Local info not found.'});
  }
});

router.post('/push/:id', async (req, res) => {
  var appID = req.params.id;
  var appInfo = config.repos[appID];
  var commit = req.body.after;

  if (appInfo !== undefined) {
    var isAllowed = true;
    var secret = appInfo.secret || "";
    var request = JSON.stringify(req.body);

    //If key is provided in header, check against local key.
    if (req.headers['x-hub-signature'] !== undefined) {
      var signed = 'sha1=' + crypto.createHmac('sha1', secret).update(request).digest('hex');
      var calculated_signature = new Buffer(signed);

      if (new Buffer(req.headers['x-hub-signature']).equals(calculated_signature) === false) {
        console.log('X-Hub-Signature does not match request signature.');
        isAllowed = false;
      }
    }

    if (isAllowed) {
      if (req.body.ref === appInfo.ref) {
        updateStatus(appInfo.repo, appID, commit, "pending", "Building application");

        res.json({message: 'Build for ' + appInfo.repo + ' starting.'});

        var result = await buildLocal(appInfo.localRepo, appInfo.makeParms.push, appID, appInfo.repo, req.body.ref, commit);

        updateStatus(appInfo.repo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), "Build " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
      }
    } else {
      res.json({message: 'Secrets do not match.'});
    }

  } else {
    res.json({message: 'Local repo not found.'});
  }
});

async function cloneRepo(httpsURI, repoName) {

  if (repoName.indexOf('/') >= 0)
    repoName.split('/')[0];

  console.log('Clone for ' + repoName + ' PR starting.');
  var repoDir = await tmpDir();

  try {
    var { stdout, stderr } = await exec('git clone ' + httpsURI, { cwd: repoDir });
    repoDir = path.join(repoDir, repoName);
    
    console.log('Cloned ' + repoName + ' PR: ' + repoDir);
    return Promise.resolve(repoDir);
    
  } catch (error) {
    console.log('Clone failed for ' + repoName + ' PR: ');
    console.log(stderr);
    return Promise.reject(stderr);
  }
}

async function buildLocal(localDir, makeParms, appID, repo, ref, commit) {
  
  console.log('Build for ' + repo + ' starting.');
  var messageResult = {
    project: repo,
    status: IN_PROGRESS,
    ref: ref,
    commit: commit,
    timestamp: new Date().toLocaleString(),
    message: 'Building application.',
    panel: 'warning'
  }

  buildMessages[appID + commit] = messageResult;

  var stdout, stderr;
  try {
    var { stdout, stderr } = await exec('git pull', { cwd: localDir });
    var { stdout, stderr } = await exec('gmake ' + makeParms, { cwd: localDir });
    stderr = undefined; //No error?
  } catch (err) {
    stderr = err;
  }

  console.log('Build finished for ' + repo + '.');

  if (typeof stderr === 'object') {
    stderr = stderr.message;
  } else if (stderr) {
    console.log(stderr);
  }
  
  if (stderr) {
    messageResult.status = FAILED;
    messageResult.message = stderr;
    messageResult.panel = 'danger';
  } else {
    messageResult.status = SUCCESSFUL;
    messageResult.message = stdout;
    messageResult.panel = 'success';
  }

  buildMessages[appID + commit] = messageResult;
  await buildMessagesConfig.saveConfigAsync();

  return Promise.resolve({
    status: messageResult.status
  });
}

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

async function updatePR(repo, number, commit, success) {
  //Updating the repo actually just adds/removes a label

  var remove = (success ? 'not-building' : 'building');
  var add = (success ? 'building' : 'not-building');

  var ghissue = githubClient.issue(repo, number);

  try {
    await ghissue.removeLabelAsync(remove);
  } catch (error) {}
  
  try {
    await ghissue.addLabelsAsync([add]);
  } catch (error) {
    console.log('Did not add ' + add + ' label to ' + repo + ' repo.');
  }
}

module.exports = router;