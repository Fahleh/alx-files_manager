/* eslint-disable no-unused-vars */
import fs from 'fs';
import readline from 'readline';
import { promisify } from 'util';
import mimeMessage from 'mime-message';
import { gmail_v1 as gmailV1, google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
/* The file `token.json` stores the user's access & refresh tokens, and is
   created automatically when the authorization flow completes for the first
   time. Delete `token.json` when modifying this scope. */
const TOKEN_STORE = 'token.json';
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

/**
 * Stores the new user token and executes the given function.
 * @param {google.auth.OAuth2} oAuth2 The OAuth2 client to get token for.
 * @param {getEventsCallback} noNameFn The callback for the authorized client.
 */
async function getToken(oAuth2, noNameFn) {
  const URL = oAuth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('For authorization visit:', URL);
  const readLine = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  readLine.question('Enter the authorization code: ', (code) => {
    readLine.close();
    oAuth2.getToken(code, (err, token) => {
      if (err) {
        console.error('Failed to retrieve access token', err);
        return;
      }
      oAuth2.setCredentials(token);
      writeFile(TOKEN_STORE, JSON.stringify(token))
        .then(() => {
          console.log('Token saved in', TOKEN_STORE);
          noNameFn(oAuth2);
        })
        .catch((writeError) => console.error(writeError));
    });
  });
}

/**
 * Create an OAuth2 client with the user data, then execute the
 * given function.
 * @param {Object} userData The authorization client credentials.
 * @param {function} noNameFn The callback to call with the authorized client.
 */
async function handleAuth(userData, noNameFn) {
  const cSecret = userData.web.client_secret;
  const cId = userData.web.client_id;
  const redirects = userData.web.redirect_uris;
  const oAuth2 = new google.auth.OAuth2(
    cId,
    cSecret,
    redirects[0],
  );
  console.log('Starting Client authorization...');

  await readFile(TOKEN_STORE)
    .then((token) => {
      oAuth2.setCredentials(JSON.parse(token));
      noNameFn(oAuth2);
    }).catch(async () => getToken(oAuth2, noNameFn));
  console.log('Authorization completed.');
}

/**
 * Sends an email to the user's account.
 * @param {google.auth.OAuth2} oAuth An authorized OAuth2 client.
 * @param {gmailV1.Schema$Message} message The message to send.
 */
function mailSender(oAuth, message) {
  const gmail = google.gmail({ version: 'v1', oAuth });

  gmail.users.messages.send({
    userId: 'me',
    requestBody: message,
  }, (error, _res) => {
    if (error) {
      console.log(`Error: ${error.message || error.toString()}`);
      return;
    }
    console.log('Message sent successfully');
  });
}

// Handles mail delivery routines.
export default class Mailer {
  static verifyAuth() {
    readFile('credentials.json')
      .then(async (content) => {
        await handleAuth(JSON.parse(content), (auth) => {
          if (auth) {
            console.log('Passed authentication check.');
          }
        });
      })
      .catch((error) => {
        console.log('Error: Failed to load secret file:', error);
      });
  }

  static buildMessage(destination, subject, body) {
    const sender = process.env.GMAIL_SENDER;
    const messagConfig = {
      type: 'text/html',
      encoding: 'UTF-8',
      from: sender,
      to: [destination],
      cc: [],
      bcc: [],
      replyTo: [],
      date: new Date(),
      subject,
      body,
    };

    if (!sender) {
      throw new Error(`Invalid sender: ${sender}`);
    }
    if (!mimeMessage.validMimeMessage(messagConfig)) {
      throw new Error('Invalid MIME message');
    }
    const mimeMsg = mimeMessage.createMimeMessage(messagConfig);
    return { raw: mimeMsg.toBase64SafeString() };
  }

  static sendMail(msg) {
    readFile('credentials.json')
      .then(async (data) => {
        await handleAuth(
          JSON.parse(data),
          (auth) => mailSender(auth, msg),
        );
      })
      .catch((error) => {
        console.log('Error: Failed to load secret file:', error);
      });
  }
}
