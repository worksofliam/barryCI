
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

//**********************************************

var Config = require('./appConfig');
var config = Config.dataSet;

//**********************************************

var statuses = require('./statuses');

//**********************************************

var github = require('octonode');

//**********************************************

var ConfigClass = require('./config/config');
var buildMessagesConfig = new ConfigClass();
buildMessagesConfig.loadConfig('buildMessages.json');
var buildMessages = buildMessagesConfig.dataSet;

//**********************************************

const IN_PROGRESS = 0, FAILED = 1, SUCCESSFUL = 2;

//**********************************************

router.get('/result/:appID/:commit', async (req, res) => {
  var id = req.params.appID;
  var commit = req.params.commit;

  if (buildMessages[id + commit] !== undefined) {
    var body = {info: buildMessages[id + commit]};

    if (req.session.username !== undefined)
      body.username = req.session.username;

    res.render('result', body);
  } else {
    res.send("No way");
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
        console.log('X-Hub-Signature does not match request signature: ' + appID);
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

router.post('/app/build/:id', async (req, res) => {
  var appID = req.params.id;

  if (config.repos[appID] !== undefined) {
    var appInfo = config.repos[appID];
    if (appInfo.clone_url !== undefined) {

      var input = {
        params: {
          id: appID
        },
        body: {
          ref: 'refs/heads/master',
          after: 'HEAD',
          repository: {
            full_name: appInfo.repo || appInfo.name,
            clone_url: appInfo.clone_url
          }
        }
      }

      res.json({message: 'Build starting for ' + appInfo.name + '.'});
      push_event(input);

    } else {
      res.json({message: 'Clone URL missing from ' + appInfo.name + '.'});
    }
  } else {
    res.json({message: 'Build ID does not exist.'});
  }
});

async function push_event(req, res) {
  var appID = req.params.id;
  var commit = req.body.after;
  
  var appInfo = Object.assign({}, config.repos[appID]);

  appInfo.repo = req.body.repository.full_name;
  appInfo.clone_url = req.body.repository.clone_url;
  appInfo.sender = req.body.sender;

  if (res !== undefined)
    res.json({message: 'Build for ' + appInfo.repo + ' starting.'});

  await updateStatus(appInfo, appID, "", "middle", "Cloning repository.");

  try {
    appInfo.repoDir = await cloneRepo(appInfo.clone_url, appInfo.repo);
  } catch (error) {
    await updateStatus(appInfo, appID, "", "failure", "Failed to clone.");
    console.log('----------------');
    console.log('Unable to clone repo: ' + appInfo.clone_url);
    console.log(error);
    console.log('----------------');
    appInfo.repoDir = undefined;
  }

  if (appInfo.repoDir !== undefined) {
    var configFound = false;
    try {
      await addRepoSetup(appInfo);
      configFound = true;
    } catch (error) {
      console.log('----------------');
      console.log('No barryci.json file found in ' + appInfo.repo);
      console.log(error);
      console.log('----------------');
      configFound = false;
    }

    if (configFound) {
      if (req.body.ref === appInfo.ref) {
        updateGitHubStatus(appInfo, appID, commit, "pending", "Building application");

        var result = await buildLocal(appInfo, appID, req.body.ref, commit);

        updateGitHubStatus(appInfo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), result.stage + " " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
      } else {
        console.log('Build for ' + appInfo.repo + ' not starting. Incorrect ref: ' + req.body.ref);
      }
    } else {
      await updateStatus(appInfo, appID, "", "not-started", "Build cancelled: barryci.json missing.");
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
  appInfo.sender = req.body.sender;
  
  appInfo.release_id = req.body.release.id;
  appInfo.release_branch = req.body.release.target_commitish;

  res.json({message: 'Release for ' + appInfo.repo + ' starting.'});

  await updateStatus(appInfo, appID, "", "middle", "Cloning repository.");

  try {
    appInfo.repoDir = await cloneRepo(appInfo.clone_url, appInfo.repo.split('/')[1], appInfo.release_branch);
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

        //First let's try and run our build if we need to do_build
        var result = {status: SUCCESSFUL}
        if (appInfo.release.do_build) {
          await updateStatus(appInfo, appID, commit, "pending", "Building application");
          result = await buildLocal(appInfo, appID, req.body.ref, commit);
          await updateStatus(appInfo, appID, commit, (result.status == SUCCESSFUL ? "success" : "failure"), "Build " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
        }

        //If we don't need to be or it was successful...
        if (result.status === SUCCESSFUL) {
          try {
            await updateStatus(appInfo, appID, commit, "pending", "Release starting.");
      
            //Run the post_commands
            if (appInfo.release.post_commands.length > 0) {
              for (var i in appInfo.release.post_commands) {
                command = appInfo.release.post_commands[i];
                await execPromise(command.command, command.args || [], { cwd: appInfo.repoDir, appID: appID, commit: commit });
              }
            }

            //Then upload the file if it exists!
            try {
              await fileExists(appInfo.upload_file);
              
              await updateStatus(appInfo, appID, "", "pending", "Release upload started.");
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
        await updateStatus(appInfo, appID, "", "not-started", "Release file not defined in barryci.json.");
      }
    } else {
      await updateStatus(appInfo, appID, "", "not-started", "Release not defined in barryci.json.");
    }
  }
}

async function cloneRepo(httpsURI, repoName, branch) {
  if (repoName.indexOf('/') >= 0)
    repoName = repoName.split('/')[1];

  console.log('Clone for ' + repoName + ' starting.');
  var repoDir = await tmpDir();

  var clone_string = 'git clone --depth=1 ';

  if (branch !== undefined) 
    clone_string += '--single-branch -b ' + branch + ' ';

  clone_string += httpsURI;

  try {
    var { stdout, stderr } = await exec(clone_string, { cwd: repoDir });
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
  
  var stage = '';
  var timers = [Date.now(), null];

  console.log('Build for ' + appInfo.repo + ' starting.');
  var messageResult = {
    project: appInfo.repo,
    status: IN_PROGRESS,
    ref: ref,
    commit: commit,
    timestamp: new Date().toLocaleString(),
    message: 'Building application.\n\r',
    panel: 'warning',
    time_length: 'In progress.'
  }

  if (appInfo.sender !== undefined) {
    messageResult.pusher = {
      user: appInfo.sender.login,
      link: appInfo.sender.html_url
    }
  }

  buildMessages[appID + commit] = messageResult;
  sockets.results.setStatus(appID, commit, messageResult.panel, 'In progress.');

  stage = 'Build';
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

  sockets.results.pushStandardContent(appID, commit, "End of build.\n\r");

  timers[1] = Date.now();

  var res = Math.abs(timers[0] - timers[1]) / 1000;
  var minutes = Math.floor(res / 60) % 60;
  var seconds = res % 60;
  messageResult.time_length = minutes + 'm ' + seconds + 's';

  sockets.results.setStatus(appID, commit, messageResult.panel, messageResult.time_length);

  console.log('Saving buildMessages.');

  buildMessages[appID + commit] = messageResult;
  try {
    await buildMessagesConfig.saveConfigAsync();
  } catch (e) {
    console.log('Couldn\'t save buildMessages.');
    console.log(e);
  }

  return Promise.resolve({
    stage: stage,
    status: messageResult.status
  });
}

async function updateStatus(appInfo, appID, commit, status, text) {
  var url = "";

  if (commit !== "")
    url = config.address + ':' + config.port + '/result/' + appID + '/' + commit

  statuses[appID] = {
    name: appInfo.name,
    repo: appInfo.repo,
    commit: commit,
    status: status,
    text: text,
    url: url,
    time: new Date().toLocaleString()
  };

  sockets.view.updateStatus(appID, statuses[appID]);
}

async function uploadGitHubRelease(appInfo) {
  if (appInfo.github !== undefined) {
    var githubClient = github.client(appInfo.github);
    var ghrel = githubClient.release(appInfo.repo, appInfo.release_id);
    var file = await readFileAsync(appInfo.upload_file);
    try {
      var response = await ghrel.uploadAssetsAsync(file, {
        name: path.basename(appInfo.upload_file),
        contentType: 'application/zip',
        uploadHost: 'uploads.github.com'
      });

      return Promise.resolve(true);
    } catch (error) {
      console.log('Did not update release on repo ' + appInfo.repo + ': ' + error.message);
      return Promise.resolve(false);
    }
  }
}

async function updateGitHubStatus(appInfo, appID, commit, status, text) {

  var url = config.address + ':' + config.port + '/result/' + appID + '/' + commit;
  await updateStatus(appInfo, appID, commit, status, text);

  if (commit === "HEAD") return;

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
    var output = "";
    const child = spawn(command, args, options);

    var appID = options.appID;
    var commit = options.commit;

    child.stdout.on('data', (data) => {
      output += data.toString('utf8');

      sockets.results.pushStandardContent(appID, commit, data.toString('utf8'));
    });

    child.stderr.on('data', (data) => {
      output += data.toString('utf8');

      sockets.results.pushStandardContent(appID, commit, data.toString('utf8'));
    });

    child.on('error', (data) => {
      var message = (data.code + ' (' + data.errno + ') - ' + data.path + ': ' + data.message);
      output += message;

      sockets.results.pushStandardContent(appID, commit, '\n\r' + message + '\n\r');
    });

    child.on('close', (code) => {
      if (code !== 0) {
        if (output.length > 500)
          output = output.substr(output.length - 500);

        reject(output);
      } else {
        resolve(output);
      }
    });
  });
}

async function addRepoSetup(appInfo) {
  var data = JSON.parse(await readFileAsync(path.join(appInfo.repoDir, 'barryci.json'), 'utf8'));

  appInfo.ref = data.ref || "refs/heads/master";
  appInfo.build = data.build || [];
  appInfo.test = data.test;
  appInfo.release = data.release;

  if (appInfo.release !== undefined) {
    appInfo.release.do_build = data.release.do_build || true;
    appInfo.release.post_commands = data.release.post_commands || [];
    //appInfo.release.upload_file
  }
}

module.exports = router;