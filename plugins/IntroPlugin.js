
var Config = require('../src/appConfig');
var config = Config.dataSet.plugins;

module.exports = class IntroPlugin {
  constructor() {
    this.name = 'IntroPlugin';
    console.log('Hello from ' + this.name);

    if (config[this.name] === undefined) {
      //config[this.name] = {test: 1234};
      //Config.save();
    }
  }

  async load(object) {
    var app = object.express;
    app.get('/hello', await function(req, res) {
      res.json({text: 'hello'});
    })
  }
}