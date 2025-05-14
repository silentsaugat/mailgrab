const express = require("express");
const { simpleParser } = require("mailparser");
const Imap = require("imap");
const dotenv = require("dotenv");
const fetch = require("node-fetch");

dotenv.config();

const app = express();
app.use(express.json());

// Function to extract the domain from the email address
function extractDomain(email) {
  const domainPart = email.split('@')[1];
  return domainPart.split('.')[0]; // Extract the part before .com or .net, etc.
}

// Helper function to create an IMAP connection based on the extracted domain
function createImapConnection(domain) {
  // You can map domain names to specific IMAP hosts if necessary
  const imapConfig = {
    'pricemailcz': {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASSWORD,
      host: 'server-1743635354.getmx.org', // Example IMAP host for 'pricemailcz'
      port: 993,
      tls: true
    },
    'retromailcz': {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASSWORD,
      host: 'server-1743635354.getmx.org', // Example IMAP host for 'retromailcz'
      port: 993,
      tls: true
    },
    // Add more domain-specific IMAP configurations here
  };

  return imapConfig[domain] || null;
}

// Function to fetch the latest email for a specific address
async function fetchVerificationCode(imapConfig, email) {
  const imap = new Imap(imapConfig);

  return new Promise((resolve, reject) => {
    imap.once("ready", function () {
      imap.openBox("INBOX", true, function (err, box) {
        if (err) reject(err);
        const f = imap.seq.fetch("1:*", { bodies: ["HEADER.FIELDS (FROM TO SUBJECT DATE)", "TEXT"], struct: true });
        f.on("message", function (msg, seqno) {
          let emailData = "";
          msg.on("body", function (stream) {
            stream.on("data", function (chunk) {
              emailData += chunk.toString("utf8");
            });
          });
          msg.on("end", function () {
            simpleParser(emailData, async (err, parsed) => {
              if (err) {
                reject(err);
              }

              // Check if email is from X (or Twitter) and has a verification code
              if (parsed.subject && parsed.subject.includes("Confirm your email address") && parsed.from.text.includes("verify@x.com")) {
                const codeMatch = parsed.text.match(/\d{6}/);
                if (codeMatch) {
                  resolve(codeMatch[0]);
                } else {
                  reject("Verification code not found in email.");
                }
              }
            });
          });
        });

        f.once("error", function (err) {
          reject(err);
        });

        f.once("end", function () {
          imap.end();
        });
      });
    });

    imap.once("error", function (err) {
      reject(err);
    });

    imap.once("end", function () {
      console.log("IMAP session ended.");
    });

    imap.connect();
  });
}

// API endpoint to receive email and fetch the verification code
app.post("/api/mail", async (req, res) => {
  const { project, type, mail } = req.body;
  if (!mail) {
    return res.status(400).json({ error: "Email address is required." });
  }

  try {
    // Extract domain from email
    const domain = extractDomain(mail);
    
    // Create IMAP connection based on the domain
    const imapConfig = createImapConnection(domain);
    if (!imapConfig) {
      return res.status(404).json({ error: "IMAP configuration not found for this domain." });
    }

    // Fetch verification code from email
    const verificationCode = await fetchVerificationCode(imapConfig, mail);
    return res.status(200).json({ verificationCode });
  } catch (error) {
    console.error("Error fetching verification code:", error);
    return res.status(500).json({ error: "An error occurred while processing the email." });
  }
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
