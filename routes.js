
const util = require('util');
const spawn = require('child_process').spawn;
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
        res.json({message: 'Build for ' + appInfo.repo + ' starting.'});

        updateStatus(appInfo, appID, commit, "pending", "Building application");

        var result = await buildLocal(appInfo.localRepo, appInfo.makeParms.push, appID, appInfo.repo, req.body.ref, commit);

        updateStatus(appInfo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), "Build " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
      } else {
        res.json({message: 'Build for ' + appInfo.repo + ' not starting. Incorrect ref: ' + req.body.ref});
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
  repoName = repoName.split('/')[1];

  console.log('Clone for ' + repoName + ' starting.');
  var repoDir = await tmpDir();

  try {
    var { stdout, stderr } = await exec('git clone ' + httpsURI, { cwd: repoDir });
    repoDir = path.join(repoDir, repoName);
    
    console.log('Cloned ' + repoName + ': ' + repoDir);
    return Promise.resolve(repoDir);
    
  } catch (error) {
    console.log('Clone failed for ' + repoName + ': ');
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
    stdout = await execPromise('git', ['pull'], { cwd: localDir });
    stdout = await execPromise('gmake', [makeParms], { cwd: localDir });
    stderr = undefined; //No error?
  } catch (err) {
    stderr = err;
  }
  
  console.log('Build finished for ' + repo + ': ' + (stderr ? "failed" : "successful"));

  if (typeof stderr === 'object') {
    stderr = stderr.message + '\n\r' + stderr.stack;
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

async function updateStatus(appInfo, appID, commit, status, text) {
  if (appInfo.github !== "PERSONAL-ACCESS-TOKEN-HERE") {
    var githubClient = github.client(appInfo.github);
    var ghrepo = githubClient.repo(appInfo.repo);
    try {
      await ghrepo.statusAsync(commit, {
        "state": status,
        "target_url": config.address + ':' + config.port + '/result/' + appID + '/' + commit,
        "description": text
      });
    } catch (error) {
      console.log('Did not update commit status on repo ' + appInfo.repo + ': ' + error.message);
      console.log();
    }
  }
}

function execPromise(command, args, options) {
  return new Promise((resolve, reject) => {
    var stdout = "", stderr = "";
    const child = spawn(command, args, options);

    child.stdout.on('data', (data) => {
      stdout += data;
    });

    child.stderr.on('data', (data) => {
      stderr += data;
    });

    child.on('error', (data) => {
      console.log('hard error:');
      console.log(data);
      stderr += data;
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(stderr);
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = router;