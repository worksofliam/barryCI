const fs = require('fs');
const util = require('util');
const path = require('path');

var readDir = util.promisify(fs.readdir);

var pluginClasses = [];

module.exports = {

  initPlugins: async function() {
    fs.existsSync("plugins") || fs.mkdirSync("plugins");

    var files = await readDir("plugins");
    var currentClass;
    
    for (var i = 0; i < files.length; i++) {
      currentClass = require(path.join("..", "..", "plugins", files[i]));
      pluginClasses.push(new currentClass());
    }
  },

  emit: async function(event, object) {
    for (var i = 0; i < pluginClasses.length; i++) {
      //In this case, 'event' is a function
      if (pluginClasses[i][event] !== undefined)
        await pluginClasses[i][event](object);
    }
  }

}