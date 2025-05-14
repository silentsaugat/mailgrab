import { simpleParser } from 'mailparser';
import Imap from 'imap';
import dotenv from 'dotenv';

dotenv.config();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mail } = req.body;
  if (!mail || !mail.includes('@')) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const domainMatch = mail.split('@')[1].match(/\.([^.]+)\.com$/);
  if (!domainMatch) {
    return res.status(400).json({ error: 'Invalid domain in email' });
  }

  const domain = domainMatch[1]; // e.g., 'retromailcz'
  const imapUser = `jackcz@${domain}.com`;

  const imapConfig = {
    user: imapUser,
    password: 'Random@728',
    host: 'server-1743635354.getmx.org',
    port: 993,
    tls: true,
  };

  const imap = new Imap(imapConfig);

  function openInbox(cb) {
    imap.openBox('INBOX', false, cb);
  }

  imap.once('ready', () => {
    openInbox((err, box) => {
      if (err) {
        imap.end();
        return res.status(500).json({ error: 'Failed to open inbox' });
      }

      imap.search(['UNSEEN', ['SINCE', new Date()]], (err, results) => {
        if (err || results.length === 0) {
          imap.end();
          return res.status(404).json({ error: 'No unseen emails found' });
        }

        const f = imap.fetch(results, { bodies: '' });
        let found = false;

        f.on('message', (msg) => {
          msg.on('body', async (stream) => {
            const parsed = await simpleParser(stream);

            const from = parsed.from?.value?.[0]?.address || '';
            const to = parsed.to?.value?.map(v => v.address.toLowerCase()) || [];
            const subject = parsed.subject || '';
            const body = parsed.text || '';

            if (
              from === 'verify@x.com' &&
              to.includes(mail.toLowerCase()) &&
              subject.toLowerCase().includes('confirm your email address to access')
            ) {
              const codeMatch = body.match(/\b\d{6}\b/);
              if (codeMatch) {
                found = true;
                imap.end();
                return res.status(200).json({ code: codeMatch[0] });
              }
            }
          });
        });

        f.once('end', () => {
          imap.end();
          if (!found) {
            return res.status(404).json({ error: 'No matching email found' });
          }
        });
      });
    });
  });

  imap.once('error', (err) => {
    console.error('IMAP error:', err);
    return res.status(500).json({ error: 'IMAP connection error' });
  });

  imap.connect();
}
