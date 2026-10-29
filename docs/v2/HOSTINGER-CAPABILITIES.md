# Hostinger capability evidence

Read-only inspection of official npm package `hostinger-api-mcp@3.8.1`, published by the Hostinger project. Source repository: https://github.com/hostinger/api-mcp-server . Package SHA-1: `d5d67c82b1a91333bdcf2f859206e19d0dff64f0`.

The public developer documentation request was denied by the runtime proxy (CONNECT 403). The official distributed tool definitions were inspected as static data; no package code/server was executed and no Hostinger account API was called. Definitions establish supported API shapes, not account permission or successful operation. Tool names in older skill lists differ from this version; many low-level tools are hidden. No MCP tool is currently callable in this session.

| Tool | Method | Path | Hidden in package |
|---|---|---|---|
| `hosting_git_auto-deployment-settings` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/git/auto-deployments/settings` | True |
| `hosting_git_update-auto-deployment-settings` | PUT | `/api/hosting/v1/accounts/{username}/websites/{domain}/git/auto-deployments/settings` | True |
| `hosting_git_delete-auto-deployment-settings` | DELETE | `/api/hosting/v1/accounts/{username}/websites/{domain}/git/auto-deployments/settings` | False |
| `hosting_git_list-installations` | GET | `/api/hosting/v1/git/installations` | True |
| `hosting_git_list-installation-repositories` | GET | `/api/hosting/v1/git/installations/{uuid}/repositories` | True |
| `hosting_git_deploy-website-repository` | POST | `/api/hosting/v1/accounts/{username}/websites/{domain}/git/repositories/deploy` | False |
| `hosting_git_list-website-repositories` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/git/repositories` | False |
| `hosting_git_ssh-public-key` | GET | `/api/hosting/v1/accounts/{username}/git/ssh-key` | False |
| `hosting_git_generate-ssh-key` | POST | `/api/hosting/v1/accounts/{username}/git/ssh-key` | False |
| `hosting_nodejs_list-builds` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds` | True |
| `hosting_nodejs_start-build` | POST | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds` | True |
| `hosting_nodejs_build-settings` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings` | True |
| `hosting_nodejs_update-build-settings` | PUT | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings` | True |
| `hosting_nodejs_build-settings-from-archive` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/from-archive` | True |
| `hosting_nodejs_build-settings-from-repository` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/from-repository` | False |
| `hosting_nodejs_list-environment-variables` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/env` | False |
| `hosting_nodejs_replace-environment-variables` | PUT | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/env` | False |
| `hosting_nodejs_analyse-failed-build` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/{uuid}/analysis` | True |
| `hosting_nodejs_build` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/{uuid}` | True |
| `hosting_nodejs_build-logs` | GET | `/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/{uuid}/logs` | True |
| `hosting_websites_list` | GET | `/api/hosting/v1/websites` | False |

Authentication in these definitions is `apiToken`; no granular scope strings are declared. Account access, product eligibility, customer-owned Git installation and exact username/domain must be verified through authorized list calls. Do not invent deployment scopes.

Read-only monitoring should use website inventory, build settings, build list, build detail and logs, Git auto-deployment settings and installations/repositories as needed. Environment-variable values are masked and cannot establish their live values; do not fetch or store secrets.

Future deployment candidate: `hosting_nodejs_start-build`, POST builds, using the existing verified configuration with source_type=git and owner/repository/branch/installation_uuid. It clones the current branch head, not a pinned commit argument. Require before/after SHA comparison and protect against moving-head drift. The documented endpoint overwrites site contents. This is owner-gated and disabled in V0.

`hosting_git_deploy-website-repository` clones/pulls into a website directory, resets tracked server changes, and is a different path from GitHub Node.js auto-deployment. A timeout can leave it running. Never substitute it for Node.js build retry without verifying the actual hosting product. Restarting a Node.js process does not rebuild/redeploy a static Astro site.

The failed-build analysis GET runs provider AI analysis on every call (failed builds only, 5 calls/minute). Exclude from automatic polling and do not assume cost-free/idempotent computation.
