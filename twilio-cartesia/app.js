const twilio = require('twilio');
const WebSocket = require('ws');
const http = require('http');
const ngrok = require('ngrok');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');


// Load environment variables
dotenv.config();

// Function to get a value from environment variable or command line argument
function getConfig(key, defaultValue = undefined) {
  return process.env[key] || process.argv.find(arg => arg.startsWith(`${key}=`))?.split('=')[1] || defaultValue;
}

let audioChunksReceived = 0;
let messageComplete = false;
let audio_string = "";

// Configuration
const config = {
    TWILIO_ACCOUNT_SID: getConfig('TWILIO_ACCOUNT_SID'),
    TWILIO_AUTH_TOKEN: getConfig('TWILIO_AUTH_TOKEN'),
    CARTESIA_API_KEY: getConfig('CARTESIA_API_KEY'),
};

// Validate required configuration
const requiredConfig = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'CARTESIA_API_KEY'];
for (const key of requiredConfig) {
    if (!config[key]) {
        console.error(`Missing required configuration: ${key}`);
        process.exit(1);
    }
}

const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);

const TTS_WEBSOCKET_URL = `wss://api.cartesia.ai/tts/websocket?api_key=${config.CARTESIA_API_KEY}&cartesia_version=2024-06-10`;
const modelId = 'sonic-english';
const voice = {
    'mode': 'id',
    'id': "b043dea0-a007-4bbe-a708-769dc0d0c569" // You can check available voices using the Cartesia API or at https://play.cartesia.ai
};
const partialResponse = 'Hi Santosh.';

const outbound = "+13124782361"; // Replace with the number you want to call
const inbound = "+13312535168";  // Replace with your Twilio number

function connectToTTSWebSocket() {
  return new Promise((resolve, reject) => {
    console.log('Attempting to connect to TTS WebSocket');
    ttsWebSocket = new WebSocket(TTS_WEBSOCKET_URL);

    ttsWebSocket.on('open', () => {
      console.log('Connected to TTS WebSocket');
      resolve(ttsWebSocket);
    });

    ttsWebSocket.on('error', (error) => {
      console.log(`TTS WebSocket error: ${error.message}`);
      reject(error);
    });

    ttsWebSocket.on('close', (code, reason) => {
      console.log(`TTS WebSocket closed. Code: ${code}, Reason: ${reason}`);
      reject(new Error('TTS WebSocket closed unexpectedly'));
    });
  });
}

function sendTTSMessage(message) {
  const textMessage = {
    'model_id': modelId,
    'transcript': message,
    'voice': voice,
    'context_id': "happy-monkeys-fly",
    'output_format': {
      'container': 'raw',
      'encoding': 'pcm_mulaw',
      'sample_rate': 8000
    }
  };

  console.log(`Sending message to TTS WebSocket: ${message}`);
  console.log(JSON.stringify(textMessage));
  ttsWebSocket.send(JSON.stringify(textMessage));
}

function testTTSWebSocket() {
  return new Promise((resolve, reject) => {
    const testMessage = 'This is a test message';
    let receivedAudio = false;

    sendTTSMessage(testMessage);

    const timeout = setTimeout(() => {
      if (!receivedAudio) {
        reject(new Error('Timeout: No audio received from TTS WebSocket'));
      }
    }, 10000); // 10 second timeout

    ttsWebSocket.on('message', (audioChunk) => {
      if (!receivedAudio) {
        console.log(audioChunk);
        console.log('Received audio chunk from TTS for test message');
        receivedAudio = true;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function startCall(twilioWebsocketUrl) {
  try {
    console.log(`Initiating call with WebSocket URL: ${twilioWebsocketUrl}`);
    const call = await client.calls.create({
      twiml: `<Response><Connect><Stream url="${twilioWebsocketUrl}"/></Connect></Response>`,
      to: outbound,  // Replace with the phone number you want to call
      from: inbound  // Replace with your Twilio phone number
    });

    callSid = call.sid;
    console.log(`Call initiated. SID: ${callSid}`);
  } catch (error) {
    console.log(`Error initiating call: ${error.message}`);
    throw error;
  }
}

function createFileAndWriteContent(filePath, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, content, (err) => {
      if (err) {
        reject(`Error writing to file: ${err.message}`);
      } else {
        resolve(`File created and content written to ${filePath}`);
      }
    });
  });
}

async function hangupCall() {
  try {
    console.log(`Attempting to hang up call: ${callSid}`);
    await client.calls(callSid).update({status: 'completed'});
    console.log('Call hung up successfully');
    createFileAndWriteContent("audio_dump.txt", audio_string);
  } catch (error) {
    console.log(`Error hanging up call: ${error.message}`);
  }
}

function setupTwilioWebSocket() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        console.log(`Received HTTP request: ${req.method} ${req.url}`);
        res.writeHead(200);
        res.end('WebSocket server is running');
      });

      const wss = new WebSocket.Server({ server });

      console.log('WebSocket server created');

      wss.on('connection', (twilioWs, request) => {
        console.log(`Twilio WebSocket connection attempt from ${request.socket.remoteAddress}`);

        let streamSid = null;
        twilioWs.on('message', (message) => {
          try {
            const msg = JSON.parse(message);
            
            console.log(`Received message from Twilio: ${JSON.stringify(msg)}`);

            if (msg.event === 'start') {
              console.log('Media stream started');
              streamSid = msg.start.streamSid;
              console.log(`Stream SID: ${streamSid}`);
              sendTTSMessage(partialResponse);
            } else if (msg.event === 'media' && !messageComplete) {
              audio_string+=msg.media.payload;
              console.log('Received media event');
            } else if (msg.event === 'stop') {
              console.log('Media stream stopped');
              hangupCall();
            }
          } catch (error) {
            console.log(`Error processing Twilio message: ${error.message}`);
          }
        });

        twilioWs.on('close', (code, reason) => {
          console.log(`Twilio WebSocket disconnected. Code: ${code}, Reason: ${reason}`);
        });

        twilioWs.on('error', (error) => {
          console.log(`Twilio WebSocket error: ${error.message}`);
        });

        // Handle incoming audio chunks from TTS WebSocket
        ttsWebSocket.on('message', (audioChunk) => {
          console.log('Received audio chunk from TTS');
          try {
            if (streamSid) {
              console.log(JSON.parse(audioChunk));
              twilioWs.send(JSON.stringify({
                event: 'media',
                streamSid: streamSid,
                media: {
                  payload: JSON.parse(audioChunk)['data']
                }
              }));

              audioChunksReceived++;
              console.log(`Audio chunks received: ${audioChunksReceived}`);

              if (audioChunksReceived >= 220) {
                messageComplete = true;
                console.log('Message complete, preparing to hang up');
                setTimeout(hangupCall, 2000);
              }
            } else {
              console.log('Warning: Received audio chunk but streamSid is not set');
            }
          } catch (error) {
            console.log(`Error sending audio chunk to Twilio: ${error.message}`);
          }
        });

        console.log('Twilio WebSocket connected and handlers set up');
      });

      wss.on('error', (error) => {
        console.log(`WebSocket server error: ${error.message}`);
      });

      server.listen(0, () => {
        const port = server.address().port;
        console.log(`Twilio WebSocket server is running on port ${port}`);
        resolve(port);
      });

      server.on('error', (error) => {
        console.log(`HTTP server error: ${error.message}`);
        reject(error);
      });
    });
  }

async function setupNgrokTunnel(port) {
    try {
      console.log(`Twilio WebSocket server set up on port ${port}`);
      const httpsUrl = await ngrok.connect(port);
	    // Convert https:// to wss://
      const wssUrl = httpsUrl.replace('https://', 'wss://');
      console.log(`ngrok tunnel established: ${wssUrl}`);
      return wssUrl;
    } catch (error) {
      console.log(`Error setting up ngrok tunnel: ${error.message}`);
      throw error;
    }
  }

async function main() {
  try {
    console.log('Starting application');

    await connectToTTSWebSocket();
    console.log('TTS WebSocket connected successfully');

    await testTTSWebSocket();
    console.log('TTS WebSocket test passed successfully');

    const twilioWebsocketPort = await setupTwilioWebSocket();
    console.log(`Twilio WebSocket server set up on port ${twilioWebsocketPort}`);

    const twilioWebsocketUrl = await setupNgrokTunnel(twilioWebsocketPort);


    await startCall(twilioWebsocketUrl);
  } catch (error) {
    console.log(`Error in main function: ${error.message}`);
  }
}

// Run the script
main();

