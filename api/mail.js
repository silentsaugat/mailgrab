const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');

function extractTwitterCode(text) {
  const match = text.match(/^(\s)*(\d{6})(\s)*$/m);
  return match ? match[2] : null;
}

function extractDomainName(email) {
  try {
    const domainPart = email.split('@')[1];
    const parts = domainPart.split('.');
    if (parts.length >= 2) {
      return parts[parts.length - 2];
    }
  } catch (e) {
    console.error('Invalid email format:', email);
  }
  return null;
}

async function getTwitterCode(toEmail, imapConfig) {
  try {
    const connection = await imaps.connect({ imap: imapConfig });
    await connection.openBox('INBOX');
    const delay = 10 * 60 * 1000;
    const since = new Date(Date.now() - delay);
    const searchCriteria = [
      'UNSEEN',
      ['SINCE', since.toISOString()],
      ['FROM', 'twitter.com']
    ];
    const fetchOptions = {
      bodies: ['HEADER.FIELDS (TO SUBJECT)', 'TEXT'],
      markSeen: true
    };
    const messages = await connection.search(searchCriteria, fetchOptions);
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const textPart = msg.parts.find(p => p.which === 'TEXT');
      const parsed = await simpleParser(textPart.body);
      let recipients = [];
      if (parsed.to && parsed.to.value) {
        recipients = parsed.to.value.map(v => v.address.toLowerCase());
      }
      if (!recipients.includes(toEmail.toLowerCase())) continue;
      const text = parsed.text || parsed.html || '';
      const code = extractTwitterCode(text);
      if (code) {
        await connection.end();
        return code;
      }
    }
    await connection.end();
    return null;
  } catch (err) {
    console.error('IMAP Error:', err);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const { mail, project, type } = req.body;
  if (project !== 'twitter' || type !== 'login' || !mail) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }
  const imapConfig = {
    user: process.env.IMAP_USER,
    password: process.env.IMAP_PASSWORD,
    host: process.env.IMAP_HOST,
    port: parseInt(process.env.IMAP_PORT),
    tls: true,
    authTimeout: 5000
  };
  const domain = extractDomainName(mail);
  const code = await getTwitterCode(mail, imapConfig);
  if (code) {
    res.json({ success: true, code, domain });
  } else {
    res.status(404).json({ success: false, message: 'Code not found' });
  }
};
