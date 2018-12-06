# barryCI

barryCI is a build server for IBM i (well, mainly tested for ILE applications) written in Node.js. The barryCI needs to be exposed to the internet for builds to be triggered from GitHub.

## Installation

1. `git clone https://github.com/WorksOfBarry/barryCI.git` to get the stuff.
2. `npm i` to install the dependencies.
3. `node index` and then Control+C to stop the app. This will generate `config.json`.

When running the barryCI script, `pm2` is a good option.

## Configuring the server

The only place you need to do any setup is in the `config.json` which is generated the first time you start the app. These are the attributes you need to setup correctly:

* `address` - the remote address that will be access from GitHub.
* `port` - the port number for the app.
* `store_stdout` - if true, standard out will not be stored if successful. Standard error is always saved.
* `login` - the login which can is used from the frontend.

## Configuring a build when a push happens



### Setting up the webhook

Next, you will need to create a webhook in your GitHub repository settings. You can find the webhook in the edit page of the build item in barryCI.

![](https://i.imgur.com/i7j8GMp.png)

### Setting up the `barryci.json`

Each repo that gets built can optionally have a `barryci.json` file in the root of the repo. This file contains build information that will be used on the build system.

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