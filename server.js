const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const players = {};
const items = [];
const FIXED_SPEED = 6; // tüm oyuncuların hızı
let lastUpdate = Date.now();

function spawnItem() {
  let type = Math.random() < 0.5 ? "hp" : "atk"; // %50 HP %50 ATK
  items.push({
    id: Date.now(),
    x: Math.random() * 800,
    y: Math.random() * 600,
    type,
  });
}

// 5 saniyede bir item spawn
setInterval(spawnItem, 5000);

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("newPlayer", (name) => {
    let vx = Math.random() * 2 - 1;
    let vy = Math.random() * 2 - 1;
    let len = Math.sqrt(vx * vx + vy * vy);
    vx = (vx / len) * FIXED_SPEED;
    vy = (vy / len) * FIXED_SPEED;

    players[socket.id] = {
      id: socket.id,
      name,
      x: Math.random() * 800,
      y: Math.random() * 600,
      vx,
      vy,
      hp: 100,
      hasAtk: false,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      size: 20,
    };
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    console.log("Bir oyuncu ayrıldı:", socket.id);
  });
});

function gameLoop() {
  let now = Date.now();
  let delta = (now - lastUpdate) / 16; // ~60fps
  lastUpdate = now;

  // oyuncu hareketi
  for (let id in players) {
    let p = players[id];
    p.x += p.vx * delta;
    p.y += p.vy * delta;

    // kenarlardan sekme
    if (p.x < 0 || p.x > 800) p.vx *= -1;
    if (p.y < 0 || p.y > 600) p.vy *= -1;
  }

  // çarpışma kontrolü
  for (let id1 in players) {
    for (let id2 in players) {
      if (id1 === id2) continue;
      let p1 = players[id1];
      let p2 = players[id2];
      let dx = p1.x - p2.x;
      let dy = p1.y - p2.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < p1.size + p2.size) {
        let overlap = (p1.size + p2.size) - dist;
        let nx = dx / dist;
        let ny = dy / dist;
        p1.x += nx * overlap / 2;
        p1.y += ny * overlap / 2;
        p2.x -= nx * overlap / 2;
        p2.y -= ny * overlap / 2;
      }
    }
  }

  // item toplama
  for (let id in players) {
    let p = players[id];
    items.forEach((item, i) => {
      let dx = p.x - item.x;
      let dy = p.y - item.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.size) {
        if (item.type === "hp") p.hp = Math.min(100, p.hp + 20);
        if (item.type === "atk") p.hasAtk = true;
        items.splice(i, 1);
      }
    });
  }

  io.emit("state", { players, items });
}

setInterval(gameLoop, 1000 / 60);

server.listen(3000, () => {
  console.log("Sunucu çalışıyor: http://localhost:3000");
});
