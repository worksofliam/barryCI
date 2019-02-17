module.exports = class {
  constructor(repo_name, clone_url, branch, commit) {
    this.appID = '';
    this.repo_name = repo_name;
    this.clone_url = clone_url;
    this.branch = branch;
    this.commit = commit;
  }

  setRepoDir(path) {
    this.repoDir = path;
  }

  setConfig(config) {
    this.config = config;
    /**
     * {
     * 
     * }
     */
  }
}