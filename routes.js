
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const crypto = require('crypto');
const path = require('path');

var express = require('express'), router = express.Router();

var tmp = require('tmp');
var tmpDir = util.promisify(tmp.dir);

var fs = require('fs');
const readFileAsync = util.promisify(fs.readFile);

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

router.post('/login', function (req, res) {

  // you might like to do a database look-up or something more scalable here
  if (req.body.username && req.body.username === config.login.user && req.body.password && req.body.password === config.login.pass) {
    req.session.authenticated = true;
    req.session.username = req.body.username;
    res.redirect('/app/list');
  } else {
    res.redirect('/login');
  }

});

router.get('/app/logout', function (req, res) {
  delete req.session.authenticated;
  delete req.session.username;
  
  res.redirect('/login');
});

router.get('/login', async (req, res) => {
  res.render('login');
});

router.get('/app/list', async (req, res) => {
  res.render('list', { username: req.session.username, repos: config.repos });
});

router.post(['/app/edit/:id', '/app/edit', '/app/create'], async (req, res) => {
  var id = req.body.id;

  if (req.body.auth === "") req.body.auth = undefined;
  if (req.body.secret === "") req.body.secret = undefined;

  var repo = {
    name: req.body.name,
    github: req.body.auth,
    secret: req.body.secret
  }

  if (id === "" || repo.name === "") {
    res.redirect('/app/create');
  } else {
    Config.dataSet.repos[id] = repo;
    await Config.saveConfigAsync();

    res.redirect('/app/list');
  }
});

router.get(['/app/edit/:id', '/app/edit', '/app/create'], async (req, res) => {
  var id = req.params.id;

  var params = { username: req.session.username, id: id, repo: config.repos[id] || {}, flash: [] };

  if (id !== undefined) {
    params.pushurl = config.address + ':' + config.port + '/push/' + id;
  }

  res.render('edit', params);
});

router.get(['/app/delete/:id'], async (req, res) => {
  var id = req.params.id;

  delete Config.dataSet.repos[id];
  await Config.saveConfigAsync();

  res.redirect('/app/list');
});

router.post('/push/:id', async (req, res) => {
  var appID = req.params.id;
  /**
   * appInfo {<github>, <secret>, <ref>, <makefile>, <make_parameters>, <repo>, <clone_url>, <repoDir>}
   */
  var appInfo = Object.assign({}, config.repos[appID]);
  var commit = req.body.after;

  if (appInfo !== undefined) {
    appInfo.repo = req.body.repository.full_name;
    appInfo.clone_url = req.body.repository.clone_url;

    var isAllowed = true;
    var secret = appInfo.secret || "";
    var request = JSON.stringify(req.body);

    //If key is provided in header, check against local key.
    if (req.headers['x-hub-signature'] !== undefined) {
      var signed = 'sha1=' + crypto.createHmac('sha1', secret).update(request).digest('hex');
      var calculated_signature = new Buffer(signed);

      if (new Buffer(req.headers['x-hub-signature']).equals(calculated_signature) === false) {
        console.log('X-Hub-Signature does not match request signature: ' + appInfo.repo);
        isAllowed = false;
      }
    }

    if (isAllowed) {

      res.json({message: 'Build for ' + appInfo.repo + ' starting.'});

      try {
        appInfo.repoDir = await cloneRepo(appInfo.clone_url, appInfo.repo.split('/')[1]);
      } catch (error) {
        console.log('----------------');
        console.log('Unable to clone repo: ' + appInfo.clone_url);
        console.log(error);
        console.log('----------------');
        appInfo.repoDir = undefined;
      }

      if (appInfo.repoDir !== undefined) {
        try {
          await addRepoSetup(appInfo);
        } catch (error) {
          console.log('----------------');
          console.log('No barryci.json file found in ' + appInfo.repo);
          console.log(error);
          console.log('----------------');
        }

        if (req.body.ref === appInfo.ref) {
          updateStatus(appInfo, appID, commit, "pending", "Building application");

          var result = await buildLocal(appInfo, appID, req.body.ref, commit);

          updateStatus(appInfo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), "Build " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
        } else {
          console.log('Build for ' + appInfo.repo + ' not starting. Incorrect ref: ' + req.body.ref);
        }
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

async function buildLocal(appInfo, appID, ref, commit) {
  
  console.log('Build for ' + appInfo.repo + ' starting.');
  var messageResult = {
    project: appInfo.repo,
    status: IN_PROGRESS,
    ref: ref,
    commit: commit,
    timestamp: new Date().toLocaleString(),
    message: 'Building application.',
    panel: 'warning'
  }

  buildMessages[appID + commit] = messageResult;

  var command, stdout, stderr;
  try {
    if (appInfo.pre_make !== undefined) {
      for (var i in appInfo.pre_make) {
        command = appInfo.pre_make[i];
        stdout = await execPromise(command.command, command.args || [], { cwd: appInfo.repoDir });
      }
    }
    stdout = await execPromise('gmake', appInfo.make_parameters, { cwd: appInfo.repoDir });
    stderr = undefined; //No error?
  } catch (err) {
    stderr = err;
  }
  
  console.log('Build finished for ' + appInfo.repo + ': ' + (stderr ? "failed" : "successful"));

  if (typeof stderr === 'object') {
    stderr = stderr.message + '\n\r' + stderr.stack;
  }

  if (stderr) {
    messageResult.status = FAILED;
    messageResult.message = stderr;
    messageResult.panel = 'danger';
  } else {
    messageResult.status = SUCCESSFUL;
    if (config.store_stdout === true)
      messageResult.message = stdout;
    else
      messageResult.message = 'Build successful. Standout out removed.';
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

async function addRepoSetup(appInfo) {
  var data = JSON.parse(await readFileAsync(path.join(appInfo.repoDir, 'barryci.json'), 'utf8'));

  appInfo.ref = data.ref || 'refs/heads/master';
  appInfo.makefile = data.makefile;
  appInfo.make_parameters = data.make_parameters || [];

  if (appInfo.makefile !== undefined) {
    appInfo.make_parameters.push('-f' + appInfo.makefile);
  }

  appInfo.pre_make = data.pre_make;
}

module.exports = router;