
const util = require('util');

var express = require('express'), router = express.Router();

var ConfigClass = require('./config');

//**********************************************

var Config = new ConfigClass();
Config.loadConfig('config.json');
var config = Config.dataSet;

//**********************************************

var statuses = require('./statuses');

//**********************************************

router.get('/logout', function (req, res) {
  delete req.session.authenticated;
  delete req.session.username;
  
  res.redirect('/login');
});

router.get('/list', async (req, res) => {
  res.render('list', { username: req.session.username, repos: config.repos, statuses: statuses });
});

router.get('/manage', async (req, res) => {
  res.render('manage', { username: req.session.username, repos: config.repos });
});

router.post(['/edit/:id', '/edit', '/create'], async (req, res) => {
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

    res.redirect('/app/manage');
  }
});

router.get(['/edit/:id', '/edit', '/create'], async (req, res) => {
  var id = req.params.id;

  var params = { username: req.session.username, id: id, repo: config.repos[id] || {}, flash: [] };

  if (id !== undefined) {
    params.pushurl = config.address + ':' + config.port + '/work/' + id;
  }

  res.render('edit', params);
});

router.get(['/delete/:id'], async (req, res) => {
  var id = req.params.id;

  delete Config.dataSet.repos[id];
  await Config.saveConfigAsync();

  res.redirect('/app/manage');
});

module.exports = router;