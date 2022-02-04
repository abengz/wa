const {
    WAConnection,
    MessageType,
    MessageOptions,
    Presence,
    Mimetype,
    WALocationMessage,
    WA_MESSAGE_STUB_TYPES,
    ReconnectMode,
    ProxyAgent,
    waChatKey,
} = require("@adiwajshing/baileys");
const http = require("http");
const https = require("https");
var qrcode = require('qrcode');
const fs = require("fs");
const { body, validationResult } = require('express-validator');
const express = require('express');
const axios = require("axios");
const app = express();
const server = http.createServer(app);
const socketIO = require('socket.io');
const { phoneNumberFormatter } = require('./helper/formatter');
const io = socketIO(server, {
    cors: {
        origin: ['https://demo.jadiorder.com']
    }
});
// koneksi database
//const mysql = require('mysql');
const request = require('request');
const { json } = require("express");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const cron = require('node-cron');

 
//konfigurasi koneksi
/*
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'jadisend_wa'
});
 
//connect ke database
db.connect((err) =>{
  if(err) throw err;
  console.log('Mysql Connected...');
});
*/

const configs = {
    port: 3000, // custom port to access server
    url_callback : 'https://wa.jadisender.com/helper/callback.php'
};
// cronjob

cron.schedule('* * * * *',  function() {
  console.log('cronjob berjalan')
 // console.log('ada init')
  const savedSessions = getSessionsFile();


      savedSessions.forEach(sess => {
          if(sess.ready == true){
console.log(sess.id)
              createSession(sess.id);
          }
      }); 
});
const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json';
const mkZap = async (id) => {
  
    const conn =  new WAConnection()
     conn.version = [2, 2147, 16];
     await conn.loadAuthInfo(`./whatsapp-session-${id}.json`)
    if (conn.state == 'open'){
        return conn;
    } else {

        await conn.connect()
        return conn
    }

  }
const createSessionsFileIfNotExists = function () {
    if (!fs.existsSync(SESSIONS_FILE)) {
        try {
            fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
            console.log('Sessions file created successfully.');
        } catch (err) {
            console.log('Failed to create sessions file: ', err);
        }
    } 
}
createSessionsFileIfNotExists();
const setSessionsFile = function (sessions) {
    fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function (err) {
        if (err) {
            console.log(err);
        }
    });
} 
const getSessionsFile = function () {
    
    return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}
const createSession = function (id) {

    const conn = new WAConnection();
    conn.version = [2, 2147, 16];
    conn.setMaxListeners(0);
    console.log('Creating session: ' + id);
    const SESSION_FILE_PATH = `./whatsapp-session-${id}.json`;
    let sessionCfg;
    if (fs.existsSync(SESSION_FILE_PATH)) {
        sessionCfg = require(SESSION_FILE_PATH);
        conn.loadAuthInfo(`./whatsapp-session-${id}.json`)
       if(conn.state == 'open'){
        io.emit('message', { id: id, text: 'Whatsapp is ready!' });
        io.emit('authenticated',  { id: id, data : conn.user})
        return conn;
        } else if( conn.state == 'connecting') {
            return;
    }
}

conn.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', { id: id, src: url });
        io.emit('message', { id: id, text: 'QR Code received, scan please!' });
    });
    conn.removeAllListeners('qr');
});

conn.connect(); 
// conn.on('initial-data-received',function(){
//     console.log('aaaaaaaaaaa')
// })
conn.on('open', (result) => {
    io.emit('ready', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp is ready!' });
    io.emit('authenticated',  { id: id, data : conn.user})
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
    
    const session = conn.base64EncodedAuthInfo()
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
        if (err) {
            console.error(err);
        }
    });

});
// conn.on('initial-data-received',function(){
//     console.log('sfdsf');
// })
conn.on('close', ({ reason }) => {
    const nomors =  phoneNumberFormatter(conn.user.jid);
    const nomor = nomors.replace(/\D/g, '');
    console.log(nomor)
	if (reason == 'invalid_session') {
        if (fs.existsSync(`./whatsapp-session-${nomor}.json`)) {
            fs.unlinkSync(`./whatsapp-session-${nomor}.json`);
           
            io.emit('close', { id: nomor, text: 'Connection Lost..' });
            const savedSessions = getSessionsFile();
            const sessionIndex = savedSessions.findIndex(sess => sess.id == nomor);
            savedSessions[sessionIndex].ready = false;
            //setSessionsFile(savedSessions);
            setSessionsFile(savedSessions);          
	}
	}
})
// Menambahkan session ke file
// Tambahkan client ke sessions
sessions.push({
    id: id,
});
// Menambahkan session ke file
const savedSessions = getSessionsFile();
const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

if (sessionIndex == -1) {
    savedSessions.push({
        id: id,
        ready: false,
    });
    setSessionsFile(savedSessions);
}

conn.on('initial-data-received', async () => {
    request({ url: configs.url_callback, method: "POST", json: {"id" : conn.user.jid ,"data" : conn.contacts} })
})

// chat masuk
/*
conn.on('chat-update', async chat => {
    if (chat.presences) { // receive presence updates -- composing, available, etc.
		Object.values(chat.presences).forEach(presence => console.log(`${presence.name}'s presence is ${presence.lastKnownPresence} in ${chat.jid}`))
	}
	if (chat.imgUrl) {
        console.log('imgUrl of chat changed ', chat.imgUrl)
		return
	}
	// only do something when a new message is received
	if (!chat.hasNewMessage) {
		if (chat.messages) {
			console.log('updated message: ', chat.messages.first)
		}
		return
	}

	const m = chat.messages.all()[0] // pull the new message from the update
	const messageStubType = WA_MESSAGE_STUB_TYPES[m.messageStubType] || 'MESSAGE'
	console.log('got notification of type: ' + messageStubType)

	const messageContent = m.message
	// if it is not a regular text or media message
	if (!messageContent) return

	if (m.key.fromMe) {
		console.log('relayed my own message')
		return
	}
    let sender = m.key.remoteJid
	
	const messageType = Object.keys(messageContent)[0] // message will always contain one key signifying what kind of message
	if (messageType === MessageType.text) {
		const text = m.message.conversation
        ///////////untuk auto reply via web
       const nomor =  phoneNumberFormatter(conn.user.jid);
      const nomorsaya = nomor.replace(/\D/g, '');
       let sql = `SELECT * FROM autoreply WHERE keyword = "${text}" `;
       db.query(sql, function (err, result) {
           if (err) throw err;
           // jika di database ada keyword dan nomor sesuai pesan, maka buat auto replyy
           result.forEach(data => {
            if(data.nomor == nomorsaya){
                // ini untuk auto chat , jika tidak ada gambar
                console.log(data.media);
                    if(data.media == ''){
                        conn.sendMessage(sender, data.response, MessageType.text);
                    } else {
                        // fungsi mengambil buffer dari url
                        const getBuffer = async (url, options) => {
                            try {
                                options ? options : {}
                                const res = await axios({
                                    method: "get",
                                    url,
                                    ...options,
                                    responseType: 'arraybuffer'
                                })
                                return res.data
                            } catch (e) {
                                console.log(`Error : ${e}`)
                            }
                        }
                        //////

                        var media = `${data.media}`;
                       
                     const array = media.split(".");
                     const ext = array[array.length - 1];
                     console.log(ext);
                        if(ext == 'jpg'){
                            // kirim media
                            async function sendmedia(){
                                var messageOptions = {
                                    caption: data.response
                                };
                                const buffer =  await getBuffer(media)
                              
                                conn.sendMessage(sender, buffer, MessageType.image, messageOptions)
                            }
                            sendmedia();
                        
                        }
                    }
              
            }  else {
                console.log('bukan nomormu')
            }
       });
       /////////////////////////////
        //////////////////////////////////////////////////////////
        // untuk webhook 

        let sql = `SELECT link_webhook FROM device WHERE nomor = ${nomorsaya} `;
        db.query(sql, function (err, result) {
            if (err) throw err;
            console.log(result)
               const webhookurl = result[0].link_webhook;
               const pesan = {
                   sender: phoneNumberFormatter(sender),
                   msg: text
               }
               var senddd = kirimwebhook(sender, text, m,conn,webhookurl);
        });
       });
      ///////////////////////////////////////////////////////////
    } else if (messageType === MessageType.extendedText) {
		const text = m.message.extendedTextMessage.text
		console.log(sender + ' sent: ' + text + ' and quoted message: ' + JSON.stringify(m.message))
		var senddd = kirimwebhook(sender, text, m);
	} else if (messageType === MessageType.contact) {
		const contact = m.message.contactMessage
		console.log(sender + ' sent contact (' + contact.displayName + '): ' + contact.vcard)
	} else if (messageType === MessageType.location || messageType === MessageType.liveLocation) {

		console.log(`${sender} sent location (lat: ${locMessage.degreesLatitude}, long: ${locMessage.degreesLongitude})`)

		await conn.downloadAndSaveMediaMessage(m, './Media/media_loc_thumb_in_' + m.key.id) // save location thumbnail

		if (messageType === MessageType.liveLocation) {
			console.log(`${sender} sent live location for duration: ${m.duration / 60}`)
		}
	} else {
		// if it is a media (audio, image, video, sticker) message
		// decode, decrypt & save the media.
		// The extension to the is applied automatically based on the media type
		try {
			const savedFile = await conn.downloadAndSaveMediaMessage(m, './Media/media_in_' + m.key.id)
			console.log(sender + ' sent media, saved at: ' + savedFile)
		} catch (err) {
			console.log('error in decoding message: ' + err)
		}
	}
    })
*/
}
//init
const init = function (socket) {
    console.log('ada init')
    const savedSessions = getSessionsFile();
  
  
        savedSessions.forEach(sess => {
            if(sess.ready == true){
console.log(sess.id)
                createSession(sess.id);
            }
        });
  }
  
  init();
// koneksi socket
io.on('connection', function (socket) {
    init(socket);
// membuat session
    socket.on('create-session', function (data) {
        console.log(data)
        console.log('Create session: ' + data.id);
        createSession(data.id);
    });
//
    // ini baris untuk logout
    socket.on('logout',async function (data) {
        if (fs.existsSync(`./whatsapp-session-${data.id}.json`)) {
            socket.emit('isdelete', { id : data.id, text :'<h2 class="text-center text-info mt-4">Logout Success, Lets Scan Again<h2>' })
            fs.unlinkSync(`./whatsapp-session-${data.id}.json`);
            const client = await mkZap(data.id);
            client.logout()
            client.clearAuthInfo()
            const savedSessions = getSessionsFile();
            const sessionIndex = savedSessions.findIndex(sess => sess.id == data.id);
            savedSessions[sessionIndex].ready = false;
            //setSessionsFile(savedSessions);
            setSessionsFile(savedSessions);
            
        } else {
            socket.emit('isdelete', { id : data.id, text : '<h2 class="text-center text-danger mt-4">You are have not Login yet!<h2>'})
        }
    })
    // 
});

// Send message
app.post('/send-message', async (req, res) => {
    const sender = req.body.sender;

    if (fs.existsSync(`whatsapp-session-${sender}.json`)) {
    const client = await mkZap(sender);
    
   // var number = phoneNumberFormatter(req.body.number);
    const message = req.body.message;
    if (req.body.number.length > 15) {
		var number = req.body.number; 
    } else {
        var number = phoneNumberFormatter(req.body.number);
        var numberExists = await client.isOnWhatsApp(number);
		if (!numberExists) {
			return res.status(422).json({
				status: false,
				message: 'The number is not registered'
			});
		}
    }

 if(client.state == 'open'){

    client.sendMessage(number, message, MessageType.text).then(response => {
        res.status(200).json({
            status: true,
            response: response
        });
    }).catch(err => {
        res.status(500).json({
            status: false,
            response: err
        });
    });
    } else {
        res.status(500).json({
            status: false,
            response: 'Please scan the QR before use this API'
        });
    }
} else {
    res.writeHead(401, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
        status: false,
        message: 'Please scan the QR before use the API 2'
    }));
}
}); 

// send media
app.post('/send-media', async (req, res) => {
    const sender = req.body.sender;
    if (fs.existsSync(`whatsapp-session-${sender}.json`)) {
        const client = await mkZap(sender);
        const url = req.body.url;
        const filetype = req.body.filetype;
        const filename = req.body.filename;
        const caption = req.body.caption;
  //  var number = phoneNumberFormatter(req.body.number);
  //  const message = req.body.message;
    if (req.body.number.length > 15) {
		var number = req.body.number; 
    } else {
        var number = phoneNumberFormatter(req.body.number);
        var numberExists = await client.isOnWhatsApp(number);
		if (!numberExists) {
			return res.status(422).json({
				status: false,
				message: 'The number is not registered'
			});
		}
    }

    const getBuffer = async (url, options) => {
    try {
        options ? options : {}
        const res = await axios({
            method: "get",
            url,
            ...options,
            responseType: 'arraybuffer'
        })
        return res.data
    } catch (e) {
        console.log(`Error : ${e}`)
    }
}

if(client.state == 'open'){
      
 if (filetype == 'jpg') {
        var messageOptions = {
            caption: caption
        };
        const buffer = await getBuffer(url)
        client.sendMessage(number, buffer, MessageType.image, messageOptions).then(response => {
            res.status(200).json({
                status: true,
                response: response
            });
        }).catch(err => {
            res.status(500).json({
                status: false,
                response: err
            });
        });

    } else if (filetype == 'pdf') {
        const buffer = await getBuffer(url);
        client.sendMessage(number, buffer, MessageType.document, { mimetype: 'pdf', filename: filename + '.' + filetype }).then(response => {
            return res.status(200).json({
                status: true,
                response: response
            });
        }).catch(err => {
            return res.status(500).json({
                status: false,
                response: err
            });
        });
    } else {
        res.status(500).json({
            status: false,
            response: 'Filetype tidak dikenal'
        });
    }
    } else {
        res.status(500).json({
            status: false,
            response: 'Please scan the QR before use this API'
        });
    }
} else {
    res.writeHead(401, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
        status: false,
        message: 'Please scan the QR before use the API 2'
    }));
}
});

// server running
app.get('/', async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({
        status: true,
        service_code: 200,
        message: 'Server is Running...'
    }));
});

//function kebutuhan webhook
function kirimwebhook(sender, message, m ,conn,link) {
   
	var webhook_response = {
		from: phoneNumberFormatter(sender),
		message: message
	}
	const getBuffer = async (url, options) => {
		try {
			options ? options : {}
			const res = await axios({
				method: "get",
				url,
				...options,
				responseType: 'arraybuffer'
			})
			return res.data
		} catch (e) {
			console.log(`Error : ${e}`)
		}
	}

	request({ url: link, method: "POST", json: webhook_response },
		async function (error, response) {
			if (!error && response.statusCode == 200) {
				// process hook
				if (response.body == null) {
					return 'gagal send webhook';
				}
				const res = response.body;
				console.log(res);
				if (res.mode == 'chat') {
					conn.sendMessage(sender, res.pesan, MessageType.text)
				} else if (res.mode == 'reply') {
					conn.sendMessage(sender, res.pesan, MessageType.extendedText, { quoted: m })
				} else if (res.mode == 'picture') {
					const url = res.data.url;
					const caption = res.data.caption;
					var messageOptions = {};
					const buffer = await getBuffer(url);
					if (caption != '') messageOptions.caption = caption;
					conn.sendMessage(sender, buffer, MessageType.image, messageOptions);
				}
			} else { console.log('error'); }
		}
	);
}



server.listen(configs.port, function () {
    console.log('App running on *: ' + configs.port);
});


