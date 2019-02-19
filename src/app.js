
var express = require('express'), router = express.Router();

var Config = require('./appConfig');
var config = Config.dataSet;

var plugins = require('./classes/plugin');

//**********************************************

router.get('/logout', function (req, res) {
  delete req.session.authenticated;
  delete req.session.username;
  
  res.redirect('/login');
});

router.get('/list', async (req, res) => {
  res.render('list', { username: req.session.username, repos: config.repos });
});

router.get('/manage', async (req, res) => {
  res.render('manage', { username: req.session.username, repos: config.repos });
});

router.get('/plugins', async (req, res) => {
  var names = Object.keys(plugins.pluginClasses);
  res.render('plugins', { username: req.session.username, plugins: names });
});

router.get('/plugins/:name', async (req, res) => {
  var plugin = req.params.name;
  if (config.plugins[plugin] !== undefined) {
    res.render('plugin_config', { username: req.session.username, name: plugin, config: config.plugins[plugin] });
  } else {
    res.redirect('/app/plugins');
  }
});

router.post('/plugins/:name', async (req, res) => {
  var plugin = req.params.name;
  if (config.plugins[plugin] !== undefined) {
    for (var key in config.plugins[plugin]) {
      config.plugins[plugin][key] = req.body[key];
    }
    await Config.save();
    res.redirect('/app/plugins');
  } else {
    res.redirect('/app/plugins');
  }
});

router.post(['/edit/:id', '/edit', '/create'], async (req, res) => {
  var id = req.body.id;

  if (req.body.clone_url === "") req.body.clone_url = undefined;

  if (req.body.clone_url !== undefined) {
    var parts = req.body.clone_url.split('/');
    if (parts[parts.length-1].endsWith('.git'))
      req.body.repo = parts[parts.length-1].substring(0, parts[parts.length-1].length - 4)
  }

  var repo = {
    name: req.body.name,
    clone_url: req.body.clone_url
  }

  if (id === "" || repo.name === "") {
    res.redirect('/app/create');
  } else {
    Config.dataSet.repos[id] = repo;
    await Config.save();

    res.redirect('/app/manage');
  }
});

router.get(['/edit/:id', '/edit', '/create'], async (req, res) => {
  var id = req.params.id;

  var params = { username: req.session.username, repo: config.repos[id] || {} };

  if (id !== undefined) {
    params.id = id;
    params.githuburl = config.address + ':' + config.port + '/work/' + id;
    params.buildurl = config.address + ':' + config.port + '/app/build/' + id + '/master';
  } else {
    params.use_id = makeid();
  }

  res.render('edit', params);
});

router.get(['/delete/:id'], async (req, res) => {
  var id = req.params.id;

  delete Config.dataSet.repos[id];
  await Config.save();

  res.redirect('/app/manage');
});

function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 10; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

module.exports = router;