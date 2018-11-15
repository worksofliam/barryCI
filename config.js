var fs = require('fs');

module.exports = {
    constructor() {
        this.lastPath = "";
        this.dataSet = {};
    },

    setDefaults(obj) {
        this.dataSet = obj;
    },

    loadConfig(path) {
        if (PathExists(path)) {
            this.dataSet = JSON.parse(ReadContent(path));
        } else {
            console.log('Config does not exist! Creating: ' + path);
            this.saveConfig(path);
        }
        this.lastPath = path;
    },

    saveConfig(path) {
        if (path === undefined) path = this.lastPath;
        WriteContent(path, JSON.stringify(this.dataSet, null, 4));
    }
}

function ReadContent(file) {
    return fs.readFileSync(file, 'utf8');
}

function PathExists(pathaddr) {
    return fs.existsSync(pathaddr);
}

function WriteContent(pathOut, content) {
    fs.writeFileSync(pathOut, content);
}