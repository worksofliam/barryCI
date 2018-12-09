
var ConfigClass = require('./config/config');
var Config = {};

module.exports = {
  init: function(path) {
    Config = new ConfigClass();
    Config.setDefaults(require('./config/defaultConfig'));
    Config.loadConfig(path);

    this.dataSet = Config.dataSet;
  },

  dataSet: Config.dataSet,

  save: async function() {
    await Config.saveConfigAsync();
  }
}