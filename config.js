var fs = require('fs');
var util = require('util');

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

module.exports = class Config {
    constructor() {
        this.lastPath = "";
        this.dataSet = {};
    }

    setDefaults(obj) {
        this.dataSet = obj;
    }

    loadConfig(path) {
        if (PathExists(path)) {
            this.dataSet = JSON.parse(fs.readFileSync(path, 'utf8'));
        } else {
            console.log('Config does not exist! Creating: ' + path);
            this.saveConfig(path);
        }
        this.lastPath = path;
    }

    saveConfig(path) {
        if (path === undefined) path = this.lastPath;
        fs.writeFileSync(path, JSON.stringify(this.dataSet, null, 4));
    }

    async loadConfigAsync(path) {
        if (PathExists(path)) {
            this.dataSet = JSON.parse(await readFileAsync(path, 'utf8'));
        } else {
            console.log('Config does not exist! Creating: ' + path);
            this.saveConfigAsync(path);
        }
        this.lastPath = path;
    }

    async saveConfigAsync(path) {
        if (path === undefined) path = this.lastPath;
        await writeFileAsync(path, JSON.stringify(this.dataSet, null, 4));
    }
}

function PathExists(pathaddr) {
    return fs.existsSync(pathaddr);
}