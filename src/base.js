
var cicd = require('./cicd');
var AppInfo = require('./classes/AppInfo');
var express = require('express'), router = express.Router();

var Config = require('./appConfig');
var config = Config.dataSet;

var bmClass = require('./buildMessages');
var buildMessages = bmClass.get();

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

router.post('/build/:id/:branch', async (req, res) => {
  var appID = req.params.id;
  var branch = req.params.branch;

  if (config.repos[appID] !== undefined) {
    var appInfo = config.repos[appID];
    if (appInfo.clone_url !== undefined) {

      var input = new AppInfo(appInfo.name, appInfo.clone_url, branch, 'HEAD');
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

module.exports = router;