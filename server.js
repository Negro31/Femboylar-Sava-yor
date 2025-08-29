const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {};
let items = [];
let gameRunning = false;
let winnerName = null;
let restartTimeout = null;

const MAP_SIZE = 800;
const FIXED_SPEED = 4;
const ITEM_INTERVAL = 8000; // 8 sn
let itemInterval = null;

// Oyuncu ekleme
io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  socket.on("newPlayer", (name) => {
    players[socket.id] = {
      id: socket.id,
      name,
      x: Math.random() * MAP_SIZE,
      y: Math.random() * MAP_SIZE,
      size: 15,
      color: getRandomColor(),
      hp: 100,
      hasAtk: false,
      vx: 0,
      vy: 0,
    };

    checkStartCondition();
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    checkWinner();
  });
});

// Oyun güncelleme
let lastUpdate = Date.now();
setInterval(() => {
  if (!gameRunning) return;

  let now = Date.now();
  let delta = (now - lastUpdate) / 16;
  lastUpdate = now;

  // Hareket
  for (let id in players) {
    let p = players[id];
    p.x += p.vx * delta;
    p.y += p.vy * delta;

    // Duvar çarpması
    if (p.x < 0) p.x = 0;
    if (p.x > MAP_SIZE) p.x = MAP_SIZE;
    if (p.y < 0) p.y = 0;
    if (p.y > MAP_SIZE) p.y = MAP_SIZE;
  }

  // Oyuncu çarpışması
  let ids = Object.keys(players);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      let p1 = players[ids[i]];
      let p2 = players[ids[j]];
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

  // Eşya toplama
  for (let id in players) {
    let p = players[id];
    items = items.filter((it) => {
      let dx = p.x - it.x;
      let dy = p.y - it.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < p.size + it.size) {
        if (it.type === "hp") p.hp = Math.min(100, p.hp + 30);
        if (it.type === "atk") p.hasAtk = true;
        return false;
      }
      return true;
    });
  }

  checkWinner();

  io.emit("state", { players, items, gameRunning, winnerName });
}, 1000 / 60);

function spawnItem() {
  if (!gameRunning) return;
  let type = Math.random() < 0.5 ? "hp" : "atk";
  items.push({
    type,
    x: Math.random() * MAP_SIZE,
    y: Math.random() * MAP_SIZE,
    size: 10,
  });
}

function checkStartCondition() {
  if (!gameRunning && Object.keys(players).length >= 2) {
    // 10 sn geri sayım
    io.emit("countdown", 10);
    let count = 10;
    let timer = setInterval(() => {
      count--;
      io.emit("countdown", count);
      if (count <= 0) {
        clearInterval(timer);
        startGame();
      }
    }, 1000);
  }
}

function startGame() {
  gameRunning = true;
  items = [];
  // hız ver
  for (let id in players) {
    let p = players[id];
    let angle = Math.random() * Math.PI * 2;
    p.vx = Math.cos(angle) * FIXED_SPEED;
    p.vy = Math.sin(angle) * FIXED_SPEED;
    p.hp = 100;
    p.hasAtk = false;
  }
  itemInterval = setInterval(spawnItem, ITEM_INTERVAL);
}

function checkWinner() {
  if (!gameRunning) return;
  let alive = Object.values(players).filter((p) => p.hp > 0);
  if (alive.length === 1) {
    winnerName = alive[0].name;
    gameRunning = false;
    clearInterval(itemInterval);

    io.emit("winner", winnerName);

    // 5 sn sonra oyun reset
    restartTimeout = setTimeout(() => {
      winnerName = null;
      items = [];
      for (let id in players) {
        players[id].hp = 100;
        players[id].hasAtk = false;
        players[id].vx = 0;
        players[id].vy = 0;
      }
      checkStartCondition();
    }, 5000);
  }
}

function getRandomColor() {
  const colors = ["red", "blue", "green", "yellow", "purple", "orange"];
  return colors[Math.floor(Math.random() * colors.length)];
}

server.listen(3000, () => console.log("Server 3000 portunda çalışıyor"));
