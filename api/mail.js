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

// Helper function to create an IMAP connection with a dynamic username based on email domain
function createImapConnection(email) {
  const domain = extractDomain(email);
  const password = "Random@728"; // Fixed password

  // Dynamic username: "jackcz" + domain name
  const user = `jackcz@${domain}.com`;

  return {
    user: user,
    password: password,
    host: 'server-1743635354.getmx.org', // Use the same IMAP host for all domains
    port: 993,
    tls: true
  };
}

// Function to fetch the latest email for a specific address
async function fetchVerificationCode(imapConfig) {
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
    // Create IMAP connection with dynamic username
    const imapConfig = createImapConnection(mail);

    // Fetch verification code from email
    const verificationCode = await fetchVerificationCode(imapConfig);
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
