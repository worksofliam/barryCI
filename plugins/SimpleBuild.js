
var BuildInfo = require('../src/classes/BuildInfo');

var Config = require('../src/appConfig');
var config = Config.dataSet;

var cicd = require('../src/cicd');

module.exports = class IntroPlugin {
  constructor() {
    this.name = 'SimpleBuild';
    console.log(this.name + ' loaded.');
  }

  async load(object) {
    var app = object.express;
    app.post('/build/:id/:branch', async (req, res) => {
      var appID = req.params.id;
      var branch = req.params.branch;
    
      if (config.repos[appID] !== undefined) {
        var appInfo = config.repos[appID];
        if (appInfo.clone_url !== undefined) {
    
          var input = new BuildInfo(appInfo.name, appInfo.clone_url, branch, 'HEAD');
          input.appID = appID;
    
          res.json({message: 'Build starting for ' + appInfo.name + '-' + branch + '.'});
          cicd.build_event(input);
    
        } else {
          res.json({message: 'Clone URL missing from ' + appInfo.name + '.'});
        }
      } else {
        res.json({message: 'Build ID does not exist.'});
      }
    });
  }
}