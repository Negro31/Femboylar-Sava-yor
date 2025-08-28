const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let players = {};
let items = [];
let gameStarted = false;
let countdown = 10;
let countdownInterval;
let speedMultiplier = 6; // zamanla artacak

// Oyuncu hareketi
function movePlayers() {
  for (let id in players) {
    let p = players[id];
    p.x += p.vx * speedMultiplier;
    p.y += p.vy * speedMultiplier;

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
    y: Math.random() * 350 + 20,
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
      vx: (Math.random() * 2 - 1) * 16, // daha hızlı
      vy: (Math.random() * 2 - 1) * 16,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      hp: 3,
      hasSpike: false,
    };

    socket.emit("init", socket.id);
    io.emit("updatePlayers", players);
    callback(true);

    checkStartConditions();
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("updatePlayers", players);

    if (Object.keys(players).length < 2 && countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      countdown = 10;
      io.emit("waiting", "Oyunun başlamasına son 1 kişi!");
    }
  });
});

// Minimum 2 oyuncu olunca sayaç başlasın
function checkStartConditions() {
  if (Object.keys(players).length < 2) {
    io.emit("waiting", "Oyunun başlamasına son 1 kişi!");
    return;
  }

  if (!countdownInterval) {
    countdown = 10;
    io.emit("waiting", "");
    countdownInterval = setInterval(() => {
      io.emit("countdown", countdown);
      countdown--;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        startGame();
      }
    }, 1000);
  }
}

// Oyunu başlat
function startGame() {
  gameStarted = true;
  speedMultiplier = 1; // başlangıç hızı
  io.emit("gameStart");

  // Oyun döngüsü
  const gameLoop = setInterval(() => {
    movePlayers();

    // hız yavaş yavaş artsın
    speedMultiplier += 0.001;

    // Çarpışmalar
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

      // Oyuncular arası çarpışma
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
      clearInterval(gameLoop);
      resetGame();
    } else if (alive.length === 0) {
      clearInterval(gameLoop);
      resetGame();
    }

    io.emit("updatePlayers", players);
  }, 100);

  // Eşya spawn
  const itemLoop = setInterval(() => {
    if (gameStarted) spawnItem();
    else clearInterval(itemLoop);
  }, 5000);
}

// Reset
function resetGame() {
  players = {};
  items = [];
  gameStarted = false;
  countdown = 10;
  countdownInterval = null;
  speedMultiplier = 1;
  io.emit("updatePlayers", players);
  io.emit("updateItems", items);
}

server.listen(3000, () => {
  console.log("Server çalışıyor http://localhost:3000");
});
