import { simpleParser } from 'mailparser';
import Imap from 'imap';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mail } = req.body;
  if (!mail || typeof mail !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid "mail" field' });
  }

  // Extract the main domain name before ".com" from emails like user@sub.domainname.com
  const domainMatch = mail.match(/@(?:[^@]+\.)?([^@.]+)\.com$/);
  if (!domainMatch) {
    return res.status(400).json({ error: 'Invalid mail format for domain extraction' });
  }
  const domainName = domainMatch[1]; // e.g., 'pricemailcz', 'retromailcz', etc.

  const imapConfig = {
    user: `jackcz@${domainName}.com`,
    password: 'Random@728',
    host: 'server-1743635354.getmx.org',
    port: 993,
    tls: true
  };

  const imap = new Imap(imapConfig);

  const openBox = (mailbox) =>
    new Promise((resolve, reject) => {
      imap.openBox(mailbox, false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });

  const search = (criteria) =>
    new Promise((resolve, reject) => {
      imap.search(criteria, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

  const fetchMail = (uids) =>
    new Promise((resolve, reject) => {
      const f = imap.fetch(uids, { bodies: '' });
      let resolved = false;

      f.on('message', (msg) => {
        msg.on('body', async (stream) => {
          try {
            const parsed = await simpleParser(stream);
            const from = parsed.from?.value?.[0]?.address?.toLowerCase();
            const recipients = (parsed.to?.value || []).map(v => v.address.toLowerCase());
            const subject = parsed.subject || '';
            const body = parsed.text || '';

            const isMatch =
              from === 'verify@x.com' &&
              recipients.includes(mail.toLowerCase()) &&
              subject.toLowerCase().includes('confirm your email address to access');

            if (isMatch) {
              const match = body.match(/\b\d{6}\b/);
              if (match && !resolved) {
                resolved = true;
                resolve(match[0]);
              }
            }
          } catch (e) {
            if (!resolved) {
              resolved = true;
              reject(e);
            }
          }
        });
      });

      f.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      f.on('end', () => {
        if (!resolved) {
          resolved = true;
          reject('No matching email found.');
        }
      });
    });

  imap.once('ready', async () => {
    try {
      await openBox('INBOX');
      const uids = await search(['UNSEEN', ['SINCE', new Date()]]);
      if (!uids.length) throw 'No unseen messages';
      const code = await fetchMail(uids.reverse());
      imap.end();
      res.status(200).json({ code });
    } catch (err) {
      imap.end();
      res.status(500).json({ error: typeof err === 'string' ? err : err.message });
    }
  });

  imap.once('error', (err) => {
    res.status(500).json({ error: 'IMAP connection error: ' + err.message });
  });

  imap.connect();
}
