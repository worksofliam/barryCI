//TODO: turn array into an object so we can reference specific builds

const util = require('util');

var ConfigClass = require('./config');
var config;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

ConfigClass.constructor();
ConfigClass.setDefaults(require('./defaultConfig'));
ConfigClass.loadConfig('config.json');
config = ConfigClass.dataSet;

app.use(bodyParser.json());
app.set('view engine', 'pug');

app.use('/', require('./routes'));
app.listen(config.port, () => console.log(`buildSave listening on port ${config.port}!`));
