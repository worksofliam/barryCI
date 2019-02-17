module.exports = {

  buildMessagesConfig: {},

  load: function() {
    var ConfigClass = require('./config/config');
    this.buildMessagesConfig = new ConfigClass();
    this.buildMessagesConfig.loadConfig('buildMessages.json');
  },

  get: function() {
    return this.buildMessagesConfig.dataSet;
  }
}