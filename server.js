const express = require("express");
const P = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());

let sock;

// Health check for Railway
app.get("/", (req, res) => {
  res.status(200).send("OK");
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

async function startSock() {
  try {
    console.log("Starting WhatsApp...");

    // IMPORTANT: volume must be mounted to /data
    const { state, saveCreds } = await useMultiFileAuthState("/data/auth");
    console.log("Auth state loaded ✅");

    sock = makeWASocket({
      logger: P({ level: "info" }), // show QR + logs
      auth: state,
      printQRInTerminal: true,
      browser: ["RailwayBot", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        console.log("Connection closed.");

        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("Reconnecting...");
          startSock();
        } else {
          console.log("Logged out. Delete volume and restart.");
        }
      } else if (connection === "open") {
        console.log("WhatsApp Connected ✅");
      }
    });

  } catch (err) {
    console.error("Error inside startSock:", err.message, err.stack);
  }
}

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);

  // Start WhatsApp AFTER server is ready
  startSock().catch((err) => {
    console.error("Baileys failed:", err);
  });
});
