const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let players = {};
let items = [];
let gameStarted = false;
let countdown = 10;
let countdownInterval;

// Oyuncu hareketi için
function movePlayers() {
  for (let id in players) {
    let p = players[id];
    p.x += p.vx;
    p.y += p.vy;

    if (p.x <= 0 || p.x >= 570) p.vx *= -1;
    if (p.y <= 0 || p.y >= 370) p.vy *= -1;
  }
}

// Rasgele eşya spawn
function spawnItem() {
  const type = Math.random() < 0.5 ? "attack" : "heal";
  items.push({
    id: Date.now(),
    type,
    x: Math.random() * 550 + 20,
    y: Math.random() * 350 + 20
  });
  io.emit("updateItems", items);

  // 8 saniye sonra kaybolsun
  setTimeout(() => {
    items.shift();
    io.emit("updateItems", items);
  }, 8000);
}

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("join", (name, callback) => {
    if (gameStarted) {
      callback(false);
      return;
    }

    players[socket.id] = {
      id: socket.id,
      name: name,
      x: Math.random() * 550,
      y: Math.random() * 350,
      vx: (Math.random() * 2 - 1) * 2,
      vy: (Math.random() * 2 - 1) * 2,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      hp: 3,
      hasSpike: false
    };

    socket.emit("init", socket.id);
    io.emit("updatePlayers", players);
    callback(true);

    if (!countdownInterval) {
      countdownInterval = setInterval(() => {
        io.emit("countdown", countdown);
        countdown--;
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          startGame();
        }
      }, 1000);
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

// Oyunu başlatma fonksiyonu
function startGame() {
  gameStarted = true;
  io.emit("gameStart");

  // Hareket ve savaş döngüsü
  setInterval(() => {
    movePlayers();

    // Çarpışma kontrolü
    for (let id in players) {
      let p = players[id];

      // Eşya alma
      for (let i = items.length - 1; i >= 0; i--) {
        let item = items[i];
        if (Math.abs(p.x - item.x) < 20 && Math.abs(p.y - item.y) < 20) {
          if (item.type === "attack") {
            p.hasSpike = true;
          } else if (item.type === "heal") {
            p.hp++;
          }
          items.splice(i, 1);
          io.emit("updateItems", items);
        }
      }

      // Başka oyuncularla çarpışma
      for (let otherId in players) {
        if (id !== otherId) {
          let o = players[otherId];
          if (Math.abs(p.x - o.x) < 30 && Math.abs(p.y - o.y) < 30) {
            if (p.hasSpike) {
              o.hp -= 1;
              p.hasSpike = false;
              if (o.hp <= 0) {
                delete players[o.id];
              }
            }
          }
        }
      }
    }

    // Kazanan kontrolü
    let alive = Object.values(players);
    if (alive.length === 1) {
      io.emit("winner", alive[0].name);
      resetGame();
    } else if (alive.length === 0) {
      resetGame();
    }

    io.emit("updatePlayers", players);
  }, 100);

  // Eşya spawn döngüsü
  setInterval(() => {
    if (gameStarted) spawnItem();
  }, 5000);
}

// Oyun reset
function resetGame() {
  players = {};
  items = [];
  gameStarted = false;
  countdown = 10;
  countdownInterval = null;
  io.emit("updatePlayers", players);
  io.emit("updateItems", items);
}

server.listen(3000, () => {
  console.log("Server çalışıyor http://localhost:3000");
});
