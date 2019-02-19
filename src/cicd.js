const util = require('util');
const exec = util.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const path = require('path');

var tmp = require('tmp');
var tmpDir = util.promisify(tmp.dir);

var fs = require('fs');
const readFileAsync = util.promisify(fs.readFile);

//**********************************************

var sockets = require('./sockets');

//**********************************************

var plugins = require('./classes/plugin');

//**********************************************

var Config = require('./appConfig');
var config = Config.dataSet;

//**********************************************

var statuses = require('./statuses');

//**********************************************

var bmClass = require('./buildMessages');
var buildMessages = bmClass.get();

//**********************************************

const IN_PROGRESS = 0,
  FAILED = 1,
  SUCCESSFUL = 2;

//**********************************************

module.exports = {
  build_event: async function (buildInfo) {
    await this.updateStatus(buildInfo, "middle", "Cloning repository.");

    await plugins.emit('preClone', {
      buildInfo: buildInfo
    });

    try {
      buildInfo.setRepoDir(await this.cloneRepo(buildInfo));
    } catch (error) {
      await this.updateStatus(buildInfo, "failure", "Failed to clone.");
      console.log('----------------');
      console.log('Unable to clone repo: ' + buildInfo.clone_url);
      console.log(error);
      console.log('----------------');
    }

    if (buildInfo.repoDir !== undefined) {
      try {
        buildInfo.setConfig(await this.addRepoSetup(buildInfo));
      } catch (error) {
        console.log('----------------');
        console.log('No barryci.json file found in ' + buildInfo.repo);
        console.log(error);
        console.log('----------------');
        configFound = false;
      }

      await plugins.emit('postClone', {
        buildInfo: buildInfo
      });

      if (buildInfo.config !== undefined) {
        if (buildInfo.branch === buildInfo.config.focusBranch || buildInfo.config.focusBranch === undefined) {
          this.updateStatus(buildInfo, "pending", "Building application");
          var result = await this.buildLocal(buildInfo);
          this.updateStatus(buildInfo, (result.status == SUCCESSFUL ? "success" : "failure"), result.stage + " " + (result.status == SUCCESSFUL ? "successful" : "failed") + '.');
        } else {
          console.log('Build for ' + buildInfo.repo + ' not starting. Incorrect branch: ' + buildInfo.eventBranch);
        }
      } else {
        await this.updateStatus(buildInfo, "not-started", "Build cancelled: barryci.json missing.");
      }
    }

  },

  cloneRepo: async function (buildInfo) {
    var repoName = buildInfo.repo_name;
    if (repoName.indexOf('/') >= 0)
      repoName = repoName.split('/')[1];

    console.log('Clone for ' + repoName + ' starting.');
    var repoDir = await tmpDir();

    var clone_string = 'git clone --depth=1 ';

    if (buildInfo.branch !== undefined)
      clone_string += '--single-branch -b ' + buildInfo.branch + ' ';

    clone_string += buildInfo.clone_url;

    try {
      var {
        stdout,
        stderr
      } = await exec(clone_string, {
        cwd: repoDir
      });
      repoDir = path.join(repoDir, repoName);

      console.log('Cloned ' + repoName + ': ' + repoDir);
      return Promise.resolve(repoDir);

    } catch (error) {
      console.log('Clone failed for ' + repoName + ': ');
      console.log(stderr);
      return Promise.reject(stderr);
    }
  },

  buildLocal: async function (buildInfo) {

    var stage = '';
    var timers = [Date.now(), null];

    await plugins.emit('preBuild', {
      buildInfo: buildInfo
    });

    console.log('Build for ' + buildInfo.repo_name + '-' + buildInfo.branch + ' starting.');
    var messageResult = {
      project: buildInfo.repo_name,
      status: IN_PROGRESS,
      branch: buildInfo.branch,
      commit: buildInfo.commit,
      timestamp: new Date().toLocaleString(),
      message: 'Building application branch ' + buildInfo.branch + '.\n\r',
      panel: 'warning',
      time_length: 'In progress.'
    }

    var key = buildInfo.appID + buildInfo.commit;
    buildMessages[key] = messageResult;
    sockets.results.setStatus(buildInfo.appID, buildInfo.commit, messageResult.panel, 'In progress.');

    stage = 'Build';
    var command, stdout, stderr;
    try {
      sockets.results.setStandardContent(buildInfo.appID, buildInfo.commit, "Build starting...\n\r");

      if (buildInfo.config.build !== undefined) {
        if (buildInfo.config.build.length > 0) {

          for (var i in buildInfo.config.build) {
            command = buildInfo.config.build[i];
            stdout = await this.execPromise(command.command, command.args || [], buildInfo);
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

    await plugins.emit('postBuild', {
      buildInfo: buildInfo,
      stderr: stderr
    });

    console.log('Build finished for ' + buildInfo.repo_name + '-' + buildInfo.branch + ': ' + (stderr ? "failed" : "successful"));

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

    sockets.results.pushStandardContent(buildInfo.appID, buildInfo.commit, "End of build.\n\r");

    timers[1] = Date.now();

    var res = Math.abs(timers[0] - timers[1]) / 1000;
    var minutes = Math.floor(res / 60) % 60;
    var seconds = res % 60;
    messageResult.time_length = minutes + 'm ' + seconds + 's';

    sockets.results.setStatus(buildInfo.appID, buildInfo.commit, messageResult.panel, messageResult.time_length);

    console.log('Saving buildMessages.');

    buildMessages[key] = messageResult;
    try {
      await bmClass.save();
    } catch (e) {
      console.log('Couldn\'t save buildMessages.');
      console.log(e);
    }

    return Promise.resolve({
      stage: stage,
      status: messageResult.status
    });
  },

  updateStatus: async function (buildInfo, status, text) {
    var url = config.address + ':' + config.port + '/result/' + buildInfo.appID + '/' + buildInfo.commit
    var key = buildInfo.appID + buildInfo.commit;

    statuses[key] = {
      name: buildInfo.repo_name,
      repo: buildInfo.repo_name + '-' + buildInfo.branch,
      commit: buildInfo.commit,
      status: status,
      text: text,
      url: url,
      time: new Date().toLocaleString()
    };

    sockets.view.updateStatus(key, statuses[key]);
    await plugins.emit('statusUpdate', {
      buildInfo: buildInfo,
      status: statuses[key]
    });
  },

  execPromise: function (command, args, buildInfo) {
    return new Promise((resolve, reject) => {
      var output = "";
      const child = spawn(command, args, {});

      var appID = buildInfo.appID;
      var commit = buildInfo.commit;

      child.stdout.on('data', (data) => {
        var content = data.toString('utf8');
        output += content;

        sockets.results.pushStandardContent(appID, commit, content);
      });

      child.stderr.on('data', (data) => {
        var content = data.toString('utf8');
        output += content;

        sockets.results.pushStandardContent(appID, commit, content);
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
  },

  addRepoSetup: async function (buildInfo) {
    var contents = await readFileAsync(path.join(buildInfo.repoDir, 'barryci.json'), 'utf8');

    contents = contents.replace(new RegExp('&branch-short', 'g'), (buildInfo.branch > 3 ? buildInfo.branch.substr(0, 3) : buildInfo.branch));
    contents = contents.replace(new RegExp('&branch', 'g'), buildInfo.branch);

    return JSON.parse(contents);
  }
}