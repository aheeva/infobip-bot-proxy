const { default: Axios } = require("axios");
const config = require("../config");
const { client } = require("./database");
const https = require("https");
const crypto = require('crypto');

const agent = new https.Agent({
    rejectUnauthorized: false
});

const processWhatsAppWebhook = async (request, response) => {
    const { body } = request;
    try {
        const database = client.db('Kaku');
        const { results } = body;
        if (results) {
            for (let i = 0; i < results.length; i++) {
                const { from, to } = results[i];
                if (from && to) {
                    const findResult = await database.collection('KakuBotProxyRecipients').findOne({
                        sender: from,
                        receiver: to,
                        channel: 'WHATSAPP'
                    });
                    if (findResult) {
                        const hash = crypto.createHash('sha256').update(JSON.stringify(body.results || {})).digest('hex');
                        const isPresent = await database.collection('KakuBotProxyIncomingMessages').findOne({'hash': hash});
                        if(!isPresent){
                            await database.collection('KakuBotProxyIncomingMessages').insertOne({'hash': hash, payload: body.results || {}, timestamp: new Date().getTime()});
                            Axios.post(
                                `${config.kaku.scheme}://${config.kaku.host}:${config.kaku.port}/whatsapp/webhook/callback`,
                                body,
                                {
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    httpsAgent: agent
                                }
                            ).then((res) => {
                            }).catch((error) => {
                                console.error(error.response.data);
                            });
                        }
                    }
                }
            }
        }
        response.sendStatus(200);
    } catch (error) {
        response.sendStatus(500);
    }
}

const processWhatsAppBotWebhook = async (request, response) => {
    const { sender, receiver } = request.body;
    try {
        const database = client.db('Kaku');
        const result = await database.collection('KakuBotProxyRecipients').insertOne({
            sender,
            receiver,
            channel: 'WHATSAPP',
            timestamp: new Date().getTime()
        });
        const account = await database.collection('KakuChannelAccountTesting').findOne({ "attributes.originalID": `whatsapp:+${receiver}` });
        if (account) {
            const credentials = account.attributes.accountDetails.credentials;
            const { whatsappInfobipRealm, whatsappAuthToken } = credentials;
            Axios.get(
                `https://${whatsappInfobipRealm}.api.infobip.com/ccaas/1/conversations`,
                {
                    headers: {
                        Authorization: `App ${whatsappAuthToken}`
                    },
                    params: {
                        status: 'OPEN',
                        limit: 999,
                    }
                }
            ).then((res) => {
                const { conversations } = res.data;
                const ids = conversations.map(c => c.id);
                const promises = [];
                ids.forEach((id) => {
                    promises.push(
                        Axios.get(
                            `https://${whatsappInfobipRealm}.api.infobip.com/ccaas/1/conversations/${id}/messages`,
                            {
                                headers: {
                                    Authorization: `App ${whatsappAuthToken}`
                                },
                                params: {
                                    limit: 999
                                }
                            }
                        )
                    )
                });
                Promise.all(promises).then(async (results) => {
                    const messages = results.map(r => r.data.messages);
                    let currentConversationId = '';
                    let currentMessages = [];
                    for (let i = 0; i < ids.length; i++) {
                        for (let j = 0; j < messages[i].length; j++) {
                            if (messages[i][j].from === sender && messages[i][j].to === receiver) {
                                currentConversationId = messages[i][j].conversationId;
                                currentMessages = messages[i].map((m, index) => {
                                    return {
                                        from: sender,
                                        to: receiver,
                                        integrationType: "WHATSAPP",
                                        messageId: m.id,
                                        message: {
                                            text: m.content.text || "",
                                            type: m.contentType
                                        }
                                    }
                                });
                                currentMessages.forEach(async (cm) => {
                                    try {
                                        await Axios.post(
                                            `${config.kaku.scheme}://${config.kaku.host}:${config.kaku.port}/whatsapp/webhook/callback`,
                                            {
                                                results: [
                                                    cm
                                                ]
                                            },
                                            {
                                                headers: {
                                                    'Content-Type': 'application/json'
                                                },
                                                httpsAgent: agent
                                            }
                                        );
                                    } catch (error) {
                                        console.error(error.response.data);
                                    }
                                });
                                break;
                            }
                        }
                    }
                    if (currentConversationId) {
                        try {
                            const database = client.db('Kaku');
                            await database.collection('KakuCustomerTesting').updateMany({ 'attributes.screenName': `whatsapp:+${sender}` }, {
                                $set: {
                                    'attributes.detailsByChannelAccountType.Whatsapp.currentConversationId': currentConversationId
                                }
                            });
                        } catch (error) {
                            console.error(error);
                        }
                    }
                });
            }).catch((error) => {
                console.error(error.response.data);
            })
        }
        response.sendStatus(200);
    } catch (error) {
        response.sendStatus(500);
    }
}

const createWhatsAppMessage = async (request, response) => {
    const { credentials, message } = request.body;
    try {
        const database = client.db('Kaku');
        const customer = await database.collection('KakuCustomerTesting').findOne({ 'attributes.screenName': `whatsapp:+${message.destinations[0].to.phoneNumber}` });
        if(customer.attributes.detailsByChannelAccountType.Whatsapp.currentConversationId){
            const contentType = message.whatsApp.imageUrl ? "IMAGE" : (message.whatsApp.fileUrl ? "DOCUMENT" : "TEXT");
            await Axios.post(
                `https://${credentials.whatsappInfobipRealm}.api.infobip.com/ccaas/1/conversations/${customer.attributes.detailsByChannelAccountType.Whatsapp.currentConversationId}/messages`,
                {
                    channel: 'WHATSAPP',
                    from: credentials.whatsappAccountSid.replace('whatsapp:+',''),
                    to: message.destinations[0].to.phoneNumber,
                    conversationId: customer.attributes.detailsByChannelAccountType.Whatsapp.currentConversationId,
                    contentType: contentType,
                    content: {
                        text: message.whatsApp.text || undefined,
                        caption: contentType === 'TEXT' ? undefined : message.whatsApp.text,
                        url: message.whatsApp.imageUrl || message.whatsApp.fileUrl || undefined
                    }
                },
                {
                    headers: {
                        Authorization: `App ${credentials.whatsappAuthToken}`
                    }
                }
            )
        }
    } catch (error) {
        console.error(error);
    }
    response.send({"message": "OK"});
}

const processSmsWebhook = async (request, response) => {
    const { body } = request;
    try {
        const database = client.db('Kaku');
        const { results } = body;
        if (results) {
            for (let i = 0; i < results.length; i++) {
                const { from, to } = results[i];
                if (from && to) {
                    const findResult = await database.collection('KakuBotProxyRecipients').findOne({
                        sender: from,
                        receiver: to,
                        channel: 'SMS'
                    });
                    if (findResult) {
                        const hash = crypto.createHash('sha256').update(JSON.stringify(body.results || {})).digest('hex');
                        const isPresent = await database.collection('KakuBotProxyIncomingMessages').findOne({'hash': hash});
                        if(!isPresent){
                            await database.collection('KakuBotProxyIncomingMessages').insertOne({'hash': hash, payload: body.results || {}, timestamp: new Date().getTime()});
                            Axios.post(
                                `${config.kaku.scheme}://${config.kaku.host}:${config.kaku.port}/sms/webhook/callback`,
                                body,
                                {
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    httpsAgent: agent
                                }
                            ).then((res) => {
                            }).catch((error) => {
                                console.error(error.response.data);
                            });
                        }
                    }
                }
            }
        }
        response.sendStatus(200);
    } catch (error) {
        response.sendStatus(500);
    }
}

const processSmsBotWebhook = async (request, response) => {
    const { sender, receiver } = request.body;
    try {
        const database = client.db('Kaku');
        const result = await database.collection('KakuBotProxyRecipients').insertOne({
            sender,
            receiver,
            channel: 'SMS',
            timestamp: new Date().getTime()
        });
        const account = await database.collection('KakuChannelAccountTesting').findOne({ "attributes.originalID": `sms:+${receiver}` });
        if (account) {
            const credentials = account.attributes.accountDetails.credentials;
            const { smsAuthToken, smsInfobipRealm } = credentials;
            Axios.get(
                `https://${smsInfobipRealm}.api.infobip.com/ccaas/1/conversations`,
                {
                    headers: {
                        Authorization: `App ${smsAuthToken}`
                    },
                    params: {
                        status: 'OPEN',
                        limit: 999,
                    }
                }
            ).then((res) => {
                const { conversations } = res.data;
                const ids = conversations.map(c => c.id);
                const promises = [];
                ids.forEach((id) => {
                    promises.push(
                        Axios.get(
                            `https://${smsInfobipRealm}.api.infobip.com/ccaas/1/conversations/${id}/messages`,
                            {
                                headers: {
                                    Authorization: `App ${smsAuthToken}`
                                },
                                params: {
                                    limit: 999
                                }
                            }
                        )
                    )
                });
                Promise.all(promises).then(async (results) => {
                    const messages = results.map(r => r.data.messages);
                    let currentConversationId = '';
                    let currentMessages = [];
                    for (let i = 0; i < ids.length; i++) {
                        for (let j = 0; j < messages[i].length; j++) {
                            if (messages[i][j].from === sender && messages[i][j].to === receiver) {
                                currentConversationId = messages[i][j].conversationId;
                                currentMessages = messages[i].map((m, index) => {
                                    return {
                                        from: sender,
                                        to: receiver,
                                        integrationType: "SMS",
                                        messageId: m.id,
                                        message: {
                                            text: m.content.text || "",
                                            type: m.contentType
                                        }
                                    }
                                });
                                currentMessages.forEach(async (cm) => {
                                    try {
                                        await Axios.post(
                                            `${config.kaku.scheme}://${config.kaku.host}:${config.kaku.port}/sms/webhook/callback`,
                                            {
                                                results: [
                                                    cm
                                                ]
                                            },
                                            {
                                                headers: {
                                                    'Content-Type': 'application/json'
                                                },
                                                httpsAgent: agent
                                            }
                                        );
                                    } catch (error) {
                                        console.error(error.response.data);
                                    }
                                });
                                break;
                            }
                        }
                    }
                    if (currentConversationId) {
                        try {
                            const database = client.db('Kaku');
                            await database.collection('KakuCustomerTesting').updateMany({ 'attributes.screenName': `sms:+${sender}` }, {
                                $set: {
                                    'attributes.detailsByChannelAccountType.SMS.currentConversationId': currentConversationId
                                }
                            });
                        } catch (error) {
                            console.error(error);
                        }
                    }
                });
            }).catch((error) => {
                console.error(error.response.data);
            })
        }
        response.sendStatus(200);
    } catch (error) {
        response.sendStatus(500);
    }
}

const createSmsMessage = async (request, response) => {
    const { credentials, message } = request.body;
    try {
        const database = client.db('Kaku');
        const customer = await database.collection('KakuCustomerTesting').findOne({ 'attributes.screenName': `sms:+${message.destinations[0].to.phoneNumber}` });
        if(customer.attributes.detailsByChannelAccountType.SMS.currentConversationId){
            await Axios.post(
                `https://${credentials.smsInfobipRealm}.api.infobip.com/ccaas/1/conversations/${customer.attributes.detailsByChannelAccountType.SMS.currentConversationId}/messages`,
                {
                    channel: 'SMS',
                    from: credentials.smsAccountSid.replace('sms:+',''),
                    to: message.destinations[0].to.phoneNumber,
                    conversationId: customer.attributes.detailsByChannelAccountType.SMS.currentConversationId,
                    contentType: 'TEXT',
                    content: {
                        text: message.sms.text || ''
                    }
                },
                {
                    headers: {
                        Authorization: `App ${credentials.smsAuthToken}`
                    }
                }
            )
        }
    } catch (error) {
        console.error(error);
    }
    response.send({"message": "OK"});
}

const closeThread = async (request, response) => {
    try {
        const database = client.db('Kaku');
        const disposition = await database.collection('KakuDispositionTesting').findOne({ID: request.params.dispositionID});
        if(disposition && disposition.attributes.name === 'closed') {
            const thread = await database.collection('KakuThreadTesting').findOne({ID: request.params.threadID});
            if(thread) {
                const customer = await database.collection('KakuCustomerTesting').findOne({ID: thread.attributes.customerID});
                if(customer){
                    let currentConversationId = '';
                    if(customer.attributes.detailsByChannelAccountType.Whatsapp){
                        currentConversationId = customer.attributes.detailsByChannelAccountType.Whatsapp.currentConversationId;
                    }
                    if(customer.attributes.detailsByChannelAccountType.SMS){
                        currentConversationId = customer.attributes.detailsByChannelAccountType.SMS.currentConversationId;
                    }
                    if (currentConversationId) {
                        const account = await database.collection('KakuChannelAccountTesting').findOne({ ID: thread.attributes.channelAccountID });
                        if (account) {
                            const credentials = account.attributes.accountDetails.credentials;
                            const { whatsappInfobipRealm, whatsappAuthToken, smsInfobipRealm, smsAuthToken } = credentials;
                            await Axios.put(
                                `https://${whatsappInfobipRealm || smsInfobipRealm}.api.infobip.com/ccaas/1/conversations/${currentConversationId}`,
                                {
                                    status: 'CLOSED'
                                },
                                {
                                    headers: {
                                        Authorization: `App ${whatsappAuthToken || smsAuthToken}`
                                    }
                                }
                            );
                            await database.collection('KakuBotProxyRecipients').deleteMany({ receiver: account.attributes.originalID.replace('whatsapp:+','').replace('sms:+','') });
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
    response.send({"message": "OK"});
}

module.exports = {
    processWhatsAppBotWebhook,
    processWhatsAppWebhook,
    processSmsBotWebhook,
    processSmsWebhook,
    createWhatsAppMessage,
    createSmsMessage,
    closeThread
};