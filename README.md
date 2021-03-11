# infobip-bot-proxy
🤖 Proxy for interacting with Infobip Answers Bot. Supports automatic closure of the conversation on Infobip end when done, written in Node.js

## Setup

If you are using AheevaCCS v8.1.1 or above, you do not need to manually install this proxy component. It will be installed as part of 'Kaku'. The instructions are valid only for AheevaCCS v7 (7.14.3+).

### Instructions
1. Login as `root` or a `sudo` user
2. Navigate to `/root`
3. Clone this repository by running the following command:
```bash
git clone https://github.com/aheeva/infobip-bot-proxy.git
```
4. Download Node.js v12+ by running the following command:
```bash
wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install 12.21.0
```
5. Temporarily switch Node.js to v12.21.0 by running the following command:
```bash
nvm use 12.21.0
```
6. Install `pm2` by running the following command:
```bash
npm i -g pm2
```
7. Install node modules of the project by running the following commands:
```bash
cd infobip-bot-proxy
npm install
```
8. If required, change the database secrets in the file `config.js`
9. Spin up a `pm2` process and save it to startup by running the following commands:
```bash
pm2 start index.js --interpreter=/root/.nvm/versions/node/v12.21.0/bin/node
pm2 startup
pm2 save
```
10. Open up port `4233` on the firewall to receive webhooks from Infobip.

Infobip Bot Proxy is now up and running. The proxy will auto start on every reboot.
