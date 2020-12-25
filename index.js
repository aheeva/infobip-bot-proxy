const https = require("https");
const fs = require('fs');
const helmet = require("helmet");
const morgan = require("morgan");
const express = require("express");
const { client } = require("./helpers/database");
const { processWhatsAppWebhook, processWhatsAppBotWebhook, processSmsBotWebhook, processSmsWebhook, createWhatsAppMessage, createSmsMessage, closeThread } = require("./helpers/webhook");
const config = require("./config");
const options = {
    key: fs.readFileSync(config.sslcert.key),
    cert: fs.readFileSync(config.sslcert.cert)
};

const app = express();

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(helmet());
app.use(morgan("dev"));

app.post('/whatsapp/webhook/callback', processWhatsAppWebhook);
app.post('/whatsapp/bot/callback', processWhatsAppBotWebhook);
app.post('/whatsapp/outbound/create', createWhatsAppMessage);

app.post('/sms/webhook/callback', processSmsWebhook);
app.post('/sms/bot/callback', processSmsBotWebhook);
app.post('/sms/outbound/create', createSmsMessage);

app.post('/thread/:threadID/disposition/:dispositionID', closeThread);

const server = https.createServer(options, app);
const port = process.env.PORT || 4233;

server.listen(port, async () => {
    try {
        await client.connect();
        console.log("Infobip Bot Proxy is running on port: " + port)
    } catch (error) {
        console.error(error);
        process.exit(-1);
    }
});