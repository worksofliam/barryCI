# barryCI

barryCI is a build server for IBM i (well, mainly tested for ILE applications) written in Node.js. The barryCI needs to be exposed to the internet for builds to be triggered from GitHub.

## Installation

1. `git clone https://github.com/WorksOfBarry/barryCI.git` to get the stuff.
2. `npm i` to install the dependencies.
3. `node index` and then Control+C to stop the app. This will generate `config.json`.

When running the barryCI script, `pm2` is a good option.

## Configuring the server

The only place you need to do any setup is in the `config.json` which is generated the first time you start the app.

* `address` - the remote address that will be access from GitHub.
* `port` - the port number for the app.
* `store_stdout` - if true, standard out will not be stored if successful. Standard error is always saved.
* `repos` - contains each environment that you want to be able to build (by key).

## Configuring a build when a push happens

In `config.json`, you will see the `repos` object, this is a keyed list and each key is a different repo which will be built.

1. Clone the repo onto your IBM i: `git clone ...`
2. Open `config.json` and add a new key to `repos`.
3. Each repo object needs 2 optional attributes:
   * `github` needs to be the person access token for the repos. The user for the repos you're building need to be accessed from this token. To get the token:
     1. go to github.com
     2. go to Settings
     3. go to Developer Settings
     4. go to Personal access tokens
     5. Generate new token for all of `repo` only.
     6. Paste the token into the `config.json`.
   * `secret` - **optional**, must match the secret which is used when creating the webhook.

Even if your project doesn't post anything back to GitHub, it still needs to be defined as an empty object.

For example:

```json
"1": {},
"2": {"github": "authkeyhere"}
```

### Setting up the webhook

Next, you will need to create a webhook in your GitHub repository settings. Your hook will point at your web server address and port, followed by `/push/<ID>`, where `<ID>` is the ID/key you defined in the `repos` for the repo. For example, `https://myibmi.website.com:6123/push/1` or `http://opensrc.rzkh.de:6123/push/1`.

![](https://i.imgur.com/i7j8GMp.png)

### Setting up the `barryci.json`

Each project that gets built can optionally have a `barryci.json` file in the root of the repo. This file contains build information that will be used on the build system.

This JSON file will contain one object made up of the following attributes:

* `makefile` - **optional**, the name of the makefile if it's not called `makefile`.
* `make_parameters` - **optional**, an array of parameters passed into `gmake`.
* `pre_make` - **optional** - an array of objects specifying commands to run before the build.
  * `command` - **required** - the command (string) to be execute.
  * `args` - **required** - an array of arguments.

```json
{
	"make_parameters": ["BIN_LIB=ILEUSION"]
}
```

```json
{
  "pre_make": [
    {
      "command": "./configure",
      "args": []
    }
  ],
  "make_parameters": ["LIBRARY=KXMLSRV"]
}
```