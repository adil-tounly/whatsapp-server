const express = require("express");
const P = require("pino");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());

// Health check route (VERY IMPORTANT for Railway)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

let sock;

// Safe startup function
async function startSock() {
  try {
    console.log("Starting WhatsApp...");

    // Use Railway mounted volume
    const { state, saveCreds } = await useMultiFileAuthState("/app/auth");

    sock = makeWASocket({
      logger: P({ level: "silent" }),
      auth: state,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
      if (connection === "close") {
        console.log("Connection closed. Restarting...");
        startSock();
      } else if (connection === "open") {
        console.log("WhatsApp Connected ✅");
      }
    });

  } catch (err) {
    console.error("Error inside startSock:", err);
  }
}

// Start WhatsApp safely
startSock().catch((err) => {
  console.error("Baileys failed:", err);
});

// Send message endpoint
app.post("/send", async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!sock) {
      return res.status(500).send("WhatsApp not ready");
    }

    await sock.sendMessage(phone + "@s.whatsapp.net", { text: message });

    res.send("Message sent");
  } catch (err) {
    console.error("Send error:", err);
    res.status(500).send("Failed to send");
  }
});

// Railway port
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});

// 🔥 Prevent Node from exiting
setInterval(() => {}, 1000);
