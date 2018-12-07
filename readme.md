# barryCI

barryCI is a build server for IBM i (well, mainly tested for ILE applications) written in Node.js. barryCI needs to be exposed to the internet for builds to be triggered from GitHub.

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

That's the only configuration required before running barryCI. Next, you can access the barryCI interface by going to `localhost:port/login` and use the login you setup in the configuration.