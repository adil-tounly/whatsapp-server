const express = require("express");
const P = require("pino");
const QRCode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());

let sock;
global.lastQR = null;

// Health check for Railway
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// QR Code page — open this in browser to scan
app.get("/qr", (req, res) => {
  if (global.lastQR) {
    res.send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#111;color:white;font-family:sans-serif;">
          <h2>Scan this QR with WhatsApp</h2>
          <img src="${global.lastQR}" style="width:300px;height:300px;" />
          <p>Refresh this page if QR expired</p>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#111;color:white;font-family:sans-serif;">
          <h2>No QR available</h2>
          <p>Either already connected or still starting up. Refresh in a few seconds.</p>
        </body>
      </html>
    `);
  }
});

// Send message endpoint
app.post("/send", async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!sock) {
      return res.status(500).send("WhatsApp not ready");
    }

    await sock.sendMessage(phone + "@s.whatsapp.net", {
      text: message,
    });

    res.send("Message sent");
  } catch (err) {
    console.error("Send error:", err);
    res.status(500).send("Failed to send");
  }
});

// Connection status endpoint
app.get("/status", (req, res) => {
  res.json({
    connected: sock ? true : false,
    qrAvailable: global.lastQR ? true : false,
  });
});

let isConnecting = false;

async function startSock() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    console.log("Starting WhatsApp...");

    const { state, saveCreds } = await useMultiFileAuthState("/data/auth");
    console.log("Auth state loaded ✅");

   sock = makeWASocket({
  logger: P({ level: "silent" }),
  auth: state,
  browser: ["Ubuntu", "Chrome", "120.0.0"],
  connectTimeoutMs: 30000,
  retryRequestDelayMs: 2000,
  maxRetries: 5,
});
    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("QR received ✅ — visit /qr on your Railway URL to scan");
        try {
          global.lastQR = await QRCode.toDataURL(qr);
        } catch (e) {
          console.error("Failed to generate QR image:", e);
        }
      }

      if (connection === "close") {
        global.lastQR = null;
        isConnecting = false;
        console.log("Connection closed.");

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("Reconnecting in 5 seconds...");
          setTimeout(() => startSock(), 5000);
        } else {
          console.log("Logged out. Delete /data/auth volume contents and restart.");
        }
      } else if (connection === "open") {
        global.lastQR = null;
        isConnecting = false;
        console.log("WhatsApp Connected ✅");
      }
    });
  } catch (err) {
    isConnecting = false;
    console.error("Error inside startSock:", err.message, err.stack);
    console.log("Retrying in 10 seconds...");
    setTimeout(() => startSock(), 10000);
  }
}

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
  startSock();
});
