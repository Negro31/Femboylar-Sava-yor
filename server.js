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
let itemInterval;

// Oyuncular rastgele hareket etsin diye hızlar
function createPlayer(id, name) {
  return {
    id,
    name,
    x: Math.random() * 550,
    y: Math.random() * 350,
    dx: (Math.random() - 0.5) * 4,
    dy: (Math.random() - 0.5) * 4,
    color: "#" + Math.floor(Math.random() * 16777215).toString(16),
    hp: 3,
    hasAttack: false
  };
}

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("join", (name) => {
    if (gameStarted) {
      socket.emit("message", "Oyun çoktan başladı!");
      return;
    }

    players[socket.id] = createPlayer(socket.id, name);
    socket.emit("init", socket.id);
    io.emit("updatePlayers", players);

    if (Object.keys(players).length === 1 && !gameStarted) {
      startCountdown();
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("updatePlayers", players);
  });
});

// Geri sayım başlat
function startCountdown() {
  let time = countdown;
  let interval = setInterval(() => {
    io.emit("countdown", time);
    time--;
    if (time < 0) {
      clearInterval(interval);
      startGame();
    }
  }, 1000);
}

// Oyunu başlat
function startGame() {
  gameStarted = true;
  io.emit("gameStart");

  // Eşya spawn sistemi
  itemInterval = setInterval(spawnItem, 5000);

  // Oyun döngüsü
  setInterval(gameLoop, 50);
}

// Oyun döngüsü
function gameLoop() {
  // Oyuncuları hareket ettir
  for (let id in players) {
    let p = players[id];
    p.x += p.dx;
    p.y += p.dy;

    if (p.x <= 0 || p.x >= 570) p.dx *= -1;
    if (p.y <= 0 || p.y >= 370) p.dy *= -1;
  }

  // Eşya kontrolü
  for (let id in players) {
    let p = players[id];
    for (let i = items.length - 1; i >= 0; i--) {
      let item = items[i];
      let dist = Math.hypot(p.x - item.x, p.y - item.y);
      if (dist < 20) {
        if (item.type === "attack") {
          p.hasAttack = true;
          setTimeout(() => p.hasAttack = false, 3000); // 3 sn sonra kaybolur
        } else if (item.type === "heal") {
          p.hp += 1;
        }
        items.splice(i, 1);
      }
    }
  }

  // Saldırı kontrolü
  for (let id in players) {
    let p = players[id];
    if (p.hasAttack) {
      for (let otherId in players) {
        if (id !== otherId) {
          let o = players[otherId];
          if (Math.abs(p.x - o.x) < 30 && Math.abs(p.y - o.y) < 30) {
            o.hp -= 1;
            p.hasAttack = false;
            if (o.hp <= 0) {
              delete players[o.id];
            }
          }
        }
      }
    }
  }

  // Kazanan kontrolü
  let alive = Object.keys(players);
  if (alive.length === 1) {
    io.emit("gameOver", players[alive[0]].name);
    clearInterval(itemInterval);
  }

  io.emit("updatePlayers", players);
  io.emit("updateItems", items);
}

// Rasgele eşya spawn
function spawnItem() {
  if (!gameStarted) return;
  let type = Math.random() > 0.5 ? "attack" : "heal";
  items.push({
    type,
    x: Math.random() * 580 + 10,
    y: Math.random() * 380 + 10
  });
}

server.listen(3000, () => {
  console.log("Server çalışıyor http://localhost:3000");
});
