
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const crypto = require('crypto');
const path = require('path');
var fileExists = require('file-exists-promise')

var express = require('express'), router = express.Router();

var tmp = require('tmp');
var tmpDir = util.promisify(tmp.dir);

var fs = require('fs');
const readFileAsync = util.promisify(fs.readFile);

//**********************************************

var sockets = require('./sockets');

//**********************************************

/**
 * appInfo {<github>, <secret>, <ref>, <build[{command, args}]>, <release{do_build, post_commands, upload_file}> <repo>, <clone_url>, <repoDir>}
 */

var ConfigClass = require('./config');
var Config = new ConfigClass();
Config.loadConfig('config.json');
var config = Config.dataSet;

//**********************************************

var statuses = require('./statuses');

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

router.get('/login', async (req, res) => {
  res.render('login');
});

router.post(['/work/:id', '/push/:id'], async (req, res) => {
  var appID = req.params.id;
  var event_type = req.headers['x-github-event'];
  var isAllowed = true;

  if (config.repos[appID] !== undefined) {
    var secret = config.repos[appID].secret || "";
    //If key is provided in header, check against local key.
    if (req.headers['x-hub-signature'] !== undefined) {
      var request = JSON.stringify(req.body);
      var calculated_signature = 'sha1=' + crypto.createHmac('sha1', secret).update(request).digest('hex');

      if (req.headers['x-hub-signature'] !== calculated_signature) {
        console.log('X-Hub-Signature does not match request signature: ' + appInfo.repo);
        console.log(' >   Stored secret: "' + secret + '"');
        console.log(' > X-Hub-Signature: "' + req.headers['x-hub-signature'] + '"');
        console.log(' > Calc..Signature: "' + calculated_signature + '"');
        updateStatus({repo: 'N/A'}, appID, '', 'failed', 'Signature auth failed.');
        isAllowed = false;
      }
    }

    if (isAllowed) {
      switch (event_type) {
        case 'push':
          push_event(req, res);
          break;
        case 'release':
          release_event(req, res);
          break;
        default:
          res.json({message: 'Not handling ' + event_type + ' event.'});
      }
    } else {
      res.json({message: 'Secrets do not match.'});
    }
  } else {
    res.json({message: 'Local configuration not found.'});
  }
});

async function push_event(req, res) {
  var appID = req.params.id;
  var appInfo = Object.assign({}, config.repos[appID]);
  var commit = req.body.after;

  appInfo.repo = req.body.repository.full_name;
  appInfo.clone_url = req.body.repository.clone_url;

  res.json({message: 'Build for ' + appInfo.repo + ' starting.'});

  try {
    appInfo.repoDir = await cloneRepo(appInfo.clone_url, appInfo.repo.split('/')[1]);
  } catch (error) {
    await updateStatus(appInfo, appID, "", "failure", "Failed to clone.");
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
      updateGitHubStatus(appInfo, appID, commit, "pending", "Building application");

      var result = await buildLocal(appInfo, appID, req.body.ref, commit);

      updateGitHubStatus(appInfo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), "Build " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
    } else {
      console.log('Build for ' + appInfo.repo + ' not starting. Incorrect ref: ' + req.body.ref);
    }
  }

};

async function release_event(req, res) {
  var appID = req.params.id;
  var appInfo = Object.assign({}, config.repos[appID]);

  var commit = req.body.release.tag_name;

  appInfo.tag_name = commit;
  appInfo.repo = req.body.repository.full_name;
  appInfo.clone_url = req.body.repository.clone_url;
  appInfo.release_id = req.body.release.id;

  res.json({message: 'Release for ' + appInfo.repo + ' starting.'});

  await updateStatus(appInfo, appID, "", "cloning", "Cloning repository.");

  try {
    appInfo.repoDir = await cloneRepo(appInfo.clone_url, appInfo.repo.split('/')[1]);
  } catch (error) {
    await updateStatus(appInfo, appID, "", "failure", "Failed to clone.");
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

    if (appInfo.release !== undefined) {
      if (appInfo.release.upload_file !== undefined) {
        appInfo.upload_file = path.join(appInfo.repoDir, appInfo.release.upload_file);

        var result = {status: SUCCESSFUL}
        if (appInfo.release.do_build) {
          await updateStatus(appInfo, appID, commit, "pending", "Building application");
          result = await buildLocal(appInfo, appID, req.body.ref, commit);
          await updateStatus(appInfo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), "Build " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
        }

        if (result.status === SUCCESSFUL) {
          try {
            await updateStatus(appInfo, appID, "", "pending", "Release starting");
      
            if (appInfo.release.post_commands.length > 0) {
              for (var i in appInfo.release.post_commands) {
                command = appInfo.release.post_commands[i];
                await execPromise(command.command, command.args || [], { cwd: appInfo.repoDir, appID: appID, commit: commit });
              }
            }

            try {
              await fileExists(appInfo.upload_file);
              
              if (await uploadGitHubRelease(appInfo)) {
                await updateStatus(appInfo, appID, "", "success", "Release created.");
              } else {
                await updateStatus(appInfo, appID, "", "failure", "Release upload failed.");
              }
            } catch (err) {
              await updateStatus(appInfo, appID, "", "failure", "Build failed for release: no file.");
            }
          } catch (err) {
            sockets.results.pushStandardContent(appID, commit, err);
            await updateStatus(appInfo, appID, "", "failure", "Build failed for release.");
          }
        } else {
          await updateStatus(appInfo, appID, "", "failure", "Build failed for release.");
        }

      } else {
        await updateStatus(appInfo, appID, "", "failure", "Release file not defined in barryci.json.");
      }
    } else {
      await updateStatus(appInfo, appID, "", "failure", "Release not defined in barryci.json.");
    }
  }
}

async function cloneRepo(httpsURI, repoName) {

  if (repoName.indexOf('/') >= 0)
  repoName = repoName.split('/')[1];

  console.log('Clone for ' + repoName + ' starting.');
  var repoDir = await tmpDir();

  try {
    var { stdout, stderr } = await exec('git clone --depth=1 ' + httpsURI, { cwd: repoDir });
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
    message: 'Building application.\n\r',
    panel: 'warning'
  }

  buildMessages[appID + commit] = messageResult;
  sockets.results.setStatus(appID, commit, messageResult.panel);

  var command, stdout, stderr;
  try {
    if (appInfo.build !== undefined) {
      sockets.results.setStandardContent(appID, commit, "Build starting...\n\r");

      if (appInfo.build.length > 0) {

        for (var i in appInfo.build) {
          command = appInfo.build[i];
          stdout = await execPromise(command.command, command.args || [], { cwd: appInfo.repoDir, appID: appID, commit: commit });
        }
        stderr = undefined; //No error?

      } else {
        stderr = '"build" flag in barryci.json is empty. Build failed as no commands provided.';
        sockets.results.setStandardContent(appID, commit, stderr);
      }
    }
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

  sockets.results.pushStandardContent(appID, commit, "End of build.");
  sockets.results.setStatus(appID, commit, messageResult.panel);

  buildMessages[appID + commit] = messageResult;
  await buildMessagesConfig.saveConfigAsync();

  return Promise.resolve({
    status: messageResult.status
  });
}

async function updateStatus(appInfo, appID, commit, status, text) {

  var url = "";

  if (commit !== "")
    url = config.address + ':' + config.port + '/result/' + appID + '/' + commit

  statuses[appID] = {
    id: appID,
    repo: appInfo.repo,
    commit: commit,
    status: status,
    text: text,
    url: url,
    time: new Date().toLocaleString()
  };
}

async function uploadGitHubRelease(appInfo) {
  if (appInfo.github !== undefined) {
    var githubClient = github.client(appInfo.github);
    var ghrel = githubClient.release(appInfo.repo, appInfo.release_id);
    var file = await readFileAsync(appInfo.upload_file);
    try {
      await ghrel.uploadAssets(file, {
        name: path.basename(appInfo.upload_file),
        contentType: 'application/zip',
        uploadHost: 'uploads.github.com'
      });
      Promise.resolve(true);
    } catch (error) {
      console.log('Did not update commit status on repo ' + appInfo.repo + ': ' + error.message);
      Promise.resolve(false);
    }
  }
}

async function updateGitHubStatus(appInfo, appID, commit, status, text) {

  var url = config.address + ':' + config.port + '/result/' + appID + '/' + commit;

  await updateStatus(appInfo, appID, commit, status, text);

  if (appInfo.github !== undefined) {
    var githubClient = github.client(appInfo.github);
    var ghrepo = githubClient.repo(appInfo.repo);
    try {
      await ghrepo.statusAsync(commit, {
        "state": status,
        "target_url": url,
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

    var appID = options.appID;
    var commit = options.commit;

    child.stdout.on('data', (data) => {
      stdout += data;

      sockets.results.pushStandardContent(appID, commit, data.toString('utf8'));
    });

    child.stderr.on('data', (data) => {
      stderr += data;

      sockets.results.pushStandardContent(appID, commit, data.toString('utf8'));
    });

    child.on('error', (data) => {
      console.log('hard error:');
      console.log(data);

      var message = (data.code + ' (' + data.errno + ') - ' + data.path + ': ' + data.message);
      stderr += message;

      sockets.results.pushStandardContent(appID, commit, message + '\n\r');
    });

    child.on('close', (code) => {
      sockets.closeClient(appID);
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

  appInfo.ref = data.ref || "refs/heads/master";
  appInfo.build = data.build || [];
  appInfo.release = data.release;

  if (appInfo.release !== undefined) {
    appInfo.release.do_build = data.release.do_build || true;
    appInfo.release.post_commands = data.release.post_commands || [];
    //appInfo.release.upload_file
  }
}

module.exports = router;