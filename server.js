const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Statik dosyaları "public" klasöründen servis et
app.use(express.static(path.join(__dirname, "public")));

// Ana sayfa isteğinde index.html döndür
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Oyuncular
let players = {};

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("newPlayer", (name) => {
    players[socket.id] = {
      id: socket.id,
      name,
      x: Math.random() * 600,
      y: Math.random() * 400,
      health: 3,
    };
    io.emit("updatePlayers", players);
  });

  socket.on("disconnect", () => {
    console.log("Bir oyuncu ayrıldı:", socket.id);
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

server.listen(PORT, () => {
  console.log(`Server çalışıyor http://localhost:${PORT}`);
});
