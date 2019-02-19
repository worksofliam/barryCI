const fs = require('fs');
const util = require('util');
const path = require('path');

var readDir = util.promisify(fs.readdir);

module.exports = {
  pluginClasses: [],

  initPlugins: async function() {
    fs.existsSync("plugins") || fs.mkdirSync("plugins");

    var files = await readDir("plugins");
    var currentClass;
    
    for (var i = 0; i < files.length; i++) {
      currentClass = require(path.join("..", "..", "plugins", files[i]));
      currentClass = new currentClass();
      this.pluginClasses[currentClass.name] = currentClass;
    }
  },

  emit: async function(event, object) {
    for (var name in this.pluginClasses) {
      //In this case, 'event' is a function
      if (this.pluginClasses[name][event] !== undefined)
        await this.pluginClasses[name][event](object);
    }
  }

}