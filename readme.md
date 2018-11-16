# buildSlave

buildSlave is a build server for IBM i (well, mainly tested for ILE applications) written in Node.js. The buildSlave needs to be exposed to the internet for builds to be triggered from GitHub.

## Installation

1. `git clone https://github.com/WorksOfBarry/buildSlave.git` to get the stuff.
2. `npm i` to install the dependencies.
3. `node index` and then Control+C to stop the app. This will generate `config.json`.

When running the buildSlave script, `pm2` is a good option.

## Configuring the server

The only place you need to do any setup is in the `config.json` which is generated the first time you start the app.

* `address` is the remote address that will be access from GitHub.
* `port` is the port number for the app.
* `github` needs to be the person access token for the repos. The user for the repos you're building need to be accessed from this token. To get the token:
  1. go to github.com
  2. go to Settings
  3. go to Developer Settings
  4. go to Personal access tokens
  5. Generate new token for `repo:status` only.
  6. Paste the token into the `config.json`.
* `repos` contains each environment that you want to be able to build (by key).

## Configuring a build

In `config.json`, you will see the `repos` object, this is a keyed list and each key is a different repo which will be built.

1. Clone the repo onto your IBM i: `git clone ...`
2. Open `config.json` and add a new key to `repos`.
3. Each repo object needs 4 items:
  * `repo` - the orginisation and the repo name on GitHub (`WorksOfBarry/buildSlave`, `sitemule/noxdb`, etc)
  * `ref` - the reference to the branch you want to target. `refs/heads/master` is usually the `master` branch.
  * `localRepo` - the local path to the git repo. When the build happens, it will do a `git pull` before `gmake`.
  * `makeParms` - are extra parameters to be passed to `gmake`, for example `BIN_LIB=NOXDB`

For example:

```json
"1": {
    "repo": "WorksOfLiam/noxDB",
    "ref": "refs/heads/master",
    "localRepo": "/home/liama/noxdb",
    "makeParms": "BIN_LIB=NOXDB"
}
```

Next, you will need to create a webhook in your GitHub repository settings. Your hook will point at your web server address and port, followed by `/build/<ID>`, where `<ID>` is the ID/key you defined in the `repos` for the repo. For example, `https://myibmi.website.com:6123/build/1` or `http://opensrc.rzkh.de:6123/build/1`.

![](https://i.imgur.com/i7j8GMp.png)

