
var Config = require('../src/appConfig');
var config = Config.dataSet;
var data = Config.dataSet.plugins;

var BuildInfo = require('../src/classes/BuildInfo');
var cicd = require('../src/cicd');

var github = require('octonode');

module.exports = class SimpleBuildPlugin {
  constructor() {
    this.name = 'GitHubPlugin';

    console.log(this.name + ' loaded.');
  }

  async load(object) {
    if (data[this.name] === undefined) {
      data[this.name] = {
        auth_code: '',
        URL_secret: ''
      };
      
      await Config.save();
    }

    var express = object.express;

    express.post(['/work/:id'], async (req, res) => {
      var appID = req.params.id;
      var event_type = req.headers['x-github-event'];
      var isAllowed = true;
    
      if (config.repos[appID] !== undefined) {
        var secret = data[this.name].URL_secret || "";
        //If key is provided in header, check against local key.
        if (req.headers['x-hub-signature'] !== undefined) {
          var request = JSON.stringify(req.body);
          var calculated_signature = 'sha1=' + crypto.createHmac('sha1', secret).update(request).digest('hex');
    
          if (req.headers['x-hub-signature'] !== calculated_signature) {
            console.log('X-Hub-Signature does not match request signature: ' + appID);
            console.log(' >   Stored secret: "' + secret + '"');
            console.log(' > X-Hub-Signature: "' + req.headers['x-hub-signature'] + '"');
            console.log(' > Calc..Signature: "' + calculated_signature + '"');
            isAllowed = false;
          }
        }
    
        if (isAllowed) {
          switch (event_type) {
            case 'push':
              this.handle_push(req, res);
              break;
            //case 'release':
              //release_event(req, res);
              //break;
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
  }

  async handle_push(req, res) {
    var appID = req.params.id;
    var commit = req.body.after;

    if (config.repos[appID] !== undefined) {
      var appInfo = config.repos[appID];
      if (appInfo.clone_url !== undefined) {
        var ref = req.body.ref.split('/');

        if (ref[1] !== 'tags') {
          var branch = ref[2];
          var input = new BuildInfo(req.body.repository.full_name, appInfo.clone_url, branch, commit);
          input.appID = appID;
    
          res.json({message: 'Build starting for ' + req.body.repository.full_name + '-' + branch + '.'});
          cicd.build_event(input);

        } else {
          res.json({message: 'Will not build releases for ' + req.body.repository.full_name + '. Seperate event.'});
        }
  
      } else {
        res.json({message: 'Clone URL missing from ' + appInfo.name + '.'});
      }
    } else {
      res.json({message: 'Build ID does not exist.'});
    }
  }

  async preBuild(output) {
    this.updateGitHubStatus(output.buildInfo, "pending", "Building application.");
  }

  async postBuild(output) {
    this.updateGitHubStatus(output.buildInfo, (output.stderr === undefined ? "success" : "failure"), "Build " + (output.stderr === undefined ? "successful" : "failed") + '.');
  }

  async updateGitHubStatus(buildInfo, status, text) {

    if (buildInfo.commit === "HEAD") return;

    var url = config.address + ':' + config.port + '/result/' + buildInfo.appID + '/' + buildInfo.commit;
  
    if (data[this.name].auth_code !== '') {
      var githubClient = github.client(data[this.name].auth_code);
      var ghrepo = githubClient.repo(buildInfo.repo_name);
      try {
        await ghrepo.statusAsync(buildInfo.commit, {
          "state": status,
          "target_url": url,
          "description": text
        });
      } catch (error) {
        console.log('Did not update commit status on repo ' + buildInfo.repo_name + ': ' + error.message);
      }
    }
  }
}

