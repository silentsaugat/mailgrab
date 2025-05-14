const express = require('express');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
require('dotenv').config();

const app = express();
app.use(express.json());

app.post('/get-email-code', (req, res) => {
  const { mail } = req.body;

  // Extract the domain from the email address
  const domain = mail.split('@')[1].split('.')[0];  // Extracts the domain part before '.com'

  // Construct the IMAP user as 'jackcz' for the extracted domain
  const imapUser = `jackcz@${domain}.com`;  // Dynamic IMAP user
  const imapPassword = process.env.IMAP_PASSWORD;  // Use password from .env file

  // IMAP Configuration
  const imapConfig = {
    user: imapUser,
    password: imapPassword,
    host: 'server-1743635354.getmx.org', // Use the same IMAP host for all domains
    port: 993,
    tls: true,
  };

  const imap = new Imap(imapConfig);

  // Connect to the IMAP server
  imap.connect();

  imap.once('ready', () => {
    imap.openBox('INBOX', true, (err, box) => {
      if (err) return res.status(500).json({ error: 'Failed to open inbox' });

      imap.search(['UNSEEN', ['FROM', 'verify@x.com']], (err, results) => {
        if (err || !results.length) return res.status(404).json({ error: 'No verification emails found' });

        const fetch = imap.fetch(results, { bodies: '' });

        fetch.on('message', (msg) => {
          msg.once('body', (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) return res.status(500).json({ error: 'Failed to parse email' });

              const verificationCode = parsed.text.match(/\d{6}/); // Extract 6-digit code
              if (verificationCode) {
                return res.status(200).json({ verificationCode: verificationCode[0] });
              } else {
                return res.status(404).json({ error: 'No verification code found' });
              }
            });
          });
        });

        fetch.once('end', () => {
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => {
    return res.status(500).json({ error: `IMAP error: ${err.message}` });
  });

  imap.once('end', () => {
    console.log('IMAP connection closed');
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
