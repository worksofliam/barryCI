module.exports = class IntroPlugin {
  constructor() {
    console.log('Hello from IntroPlugin');
  }

  async load(object) {
    var app = object.express;
    app.get('/hello', await function(req, res) {
      res.json({text: 'hello'});
    })
  }
}