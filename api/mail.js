const Imap = require('imap');
const { simpleParser } = require('mailparser');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { mail } = req.body;
  if (!mail || !mail.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const domainPart = mail.split('@')[1];
  const domainName = domainPart.split('.')[1]; // e.g., from xyz.yoyobu.com => yoyobu

  const imapUser = `jackcz@${domainName}.com`;
  const imap = new Imap({
    user: imapUser,
    password: 'Random@728',
    host: 'server-1743635354.getmx.org',
    port: 993,
    tls: true
  });

  function openInbox(cb) {
    imap.openBox('INBOX', true, cb);
  }

  imap.once('ready', function () {
    openInbox(function (err, box) {
      if (err) {
        imap.end();
        return res.status(500).json({ error: 'Failed to open inbox' });
      }

      const sinceDate = new Date();
      sinceDate.setMinutes(sinceDate.getMinutes() - 10);

      imap.search([['SINCE', sinceDate.toUTCString()]], function (err, results) {
        if (err || results.length === 0) {
          imap.end();
          return res.status(404).json({ error: 'No recent messages' });
        }

        const f = imap.fetch(results.slice(-5), { bodies: '' });

        let foundCode = null;

        f.on('message', function (msg) {
          msg.on('body', function (stream) {
            simpleParser(stream, async (err, parsed) => {
              const { subject, text } = parsed;
              if (subject?.toLowerCase().includes('confirm your email') && text?.includes('X')) {
                const codeMatch = text.match(/\b\d{6}\b/);
                if (codeMatch) {
                  foundCode = codeMatch[0];
                }
              }
            });
          });
        });

        f.once('end', function () {
          imap.end();
          if (foundCode) {
            res.status(200).json({ code: foundCode });
          } else {
            res.status(404).json({ error: 'Code not found' });
          }
        });
      });
    });
  });

  imap.once('error', function (err) {
    res.status(500).json({ error: 'IMAP error', details: err.message });
  });

  imap.connect();
};
