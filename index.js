
var ConfigClass = require('./config');

const express = require('express');
const app = express();
const bodyParser = require('body-parser');

var Config = new ConfigClass();
Config.setDefaults(require('./defaultConfig'));

Config.loadConfig('config.json');
var config = Config.dataSet;

app.use(bodyParser.json());
app.set('view engine', 'pug');

app.use('/', require('./routes'));
app.listen(config.port, () => console.log(`buildSave listening on port ${config.port}!`));