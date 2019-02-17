
var ConfigClass = require('./src/appConfig');

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');

var plugins = require('./src/classes/plugin');
var sockets = require('./src/sockets');
var buildMessages = require('./src/buildMessages');

ConfigClass.init('./config.json');

app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'yolo', resave: true, saveUninitialized: true }));
app.set('view engine', 'pug');

function checkAuth (req, res, next) {
	// don't serve /secure to those not logged in
	// you should add to this list, for each and every secure url
	if (req.url.startsWith('/app/') && (!req.session || !req.session.authenticated)) {
    res.redirect('/login' );
		return;
	}

	next();
}
app.use(checkAuth);
buildMessages.load();

app.use('/public', express.static('./views/public'));
app.use('/', require('./src/base'));
app.use('/app', require('./src/app'));

app.listen(ConfigClass.dataSet.port, () => console.log(`barryCI listening on port ${ConfigClass.dataSet.port}!`));
sockets.startServer(ConfigClass.dataSet.port+1);

loadPlugins();

async function loadPlugins() {
	await plugins.initPlugins();
	await plugins.emit('load', {express: app});
}