require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const tournamentRoutes = require("./routes/tournament.routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. API Endpoints
app.use("/api/auth", authRoutes);
app.use("/api/turn-pro", tournamentRoutes);

// 2. Custom Middleware untuk Service Worker Headers
const clientPublicDir = path.join(__dirname, "../../client/public");

app.use((req, res, next) => {
  // Service Worker harus selalu fresh dan tidak di-cache oleh browser
  if (req.path.endsWith("sw.js")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "application/javascript");
  }

  // Header Service-Worker-Allowed khusus subpath turn-pro
  if (req.path === "/turn-pro/sw.js") {
    res.setHeader("Service-Worker-Allowed", "/turn-pro/");
  } else if (req.path === "/sw.js") {
    res.setHeader("Service-Worker-Allowed", "/");
  }

  next();
});

// 3. Serve Static Assets dari client/public
app.use(express.static(clientPublicDir));

// 4. Subpath SPA Fallbacks
app.get(["/turn-pro/display", "/turn-pro/display/"], (req, res) => {
  res.sendFile(path.join(clientPublicDir, "turn-pro", "display.html"));
});

app.get("/turn-pro/*", (req, res) => {
  res.sendFile(path.join(clientPublicDir, "turn-pro", "index.html"));
});

app.get("/coach/*", (req, res) => {
  res.sendFile(path.join(clientPublicDir, "coach", "index.html"));
});

app.get("/member/*", (req, res) => {
  res.sendFile(path.join(clientPublicDir, "member", "index.html"));
});

// Root fallback untuk Dojang Core
app.get("*", (req, res) => {
  res.sendFile(path.join(clientPublicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log("==================================================");
  console.log(`🥋 Dojang Multi-Subpath PWA Server running on port ${PORT}`);
  console.log(`- Core (Root)      : http://localhost:${PORT}/`);
  console.log(`- Turn Pro (Arena) : http://localhost:${PORT}/turn-pro/`);
  console.log(`- Coach            : http://localhost:${PORT}/coach/`);
  console.log(`- Member           : http://localhost:${PORT}/member/`);
  console.log("==================================================");
});
