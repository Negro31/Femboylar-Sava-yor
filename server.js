const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// index.html ve diğer dosyaları göstermek için
app.use(express.static(__dirname));

let players = {};       // Oyuncular burada tutulacak
let gameStarted = false;
let countdown = 10;     // 10 saniye geri sayım

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  // Yeni oyuncu katıldığında
  socket.on("join", (name) => {
    players[socket.id] = {
      id: socket.id,
      name: name,
      x: Math.random() * 550,
      y: Math.random() * 350,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      hp: 3
    };

    socket.emit("init", socket.id);
    io.emit("updatePlayers", players);

    // Eğer oyun başlamadıysa 10 saniye sonra başlat
    if (!gameStarted) {
      setTimeout(startGame, countdown * 1000);
      gameStarted = true;
    }
  });

  // Oyuncu çıkarsa listeden sil
  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

// Oyunu başlatma fonksiyonu
function startGame() {
  io.emit("gameStart");

  // Basit savaş: her 2 saniyede oyuncular rastgele birbirine vurur
  setInterval(() => {
    let ids = Object.keys(players);
    if (ids.length > 1) {
      let a = players[ids[Math.floor(Math.random() * ids.length)]];
      let b = players[ids[Math.floor(Math.random() * ids.length)]];
      if (a && b && a !== b) {
        b.hp -= 1;
        if (b.hp <= 0) {
          delete players[b.id];
        }
        io.emit("updatePlayers", players);
      }
    }
  }, 2000);
}

// Sunucuyu başlat
server.listen(3000, () => {
  console.log("Server çalışıyor http://localhost:3000");
});