const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ---- Oyun ayarları ----
const W = 600;
const H = 400;
const RADIUS = 15;
const TICK_MS = 50;          // daha pürüzsüz hareket
const SPEED = 8;             // tüm oyuncular için SABİT ve hızlı hız (px/tick)
const ITEM_INTERVAL_MS = 2000; // 2 sn'de bir eşya
const ITEM_LIFETIME_MS = 10000; // 10 sn sonra kaybolsun

let players = {};
let items = [];
let gameStarted = false;
let countdown = 10;
let countdownInterval;

// Yardımcı
function normalize(vx, vy, target = SPEED) {
  const mag = Math.hypot(vx, vy) || 1;
  const s = target / mag;
  return { vx: vx * s, vy: vy * s };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Oyuncu hareketi + duvar çarpışması
function movePlayers() {
  for (let id in players) {
    const p = players[id];
    p.x += p.vx;
    p.y += p.vy;

    // Duvarlara çarp ve geri seken
    if (p.x < RADIUS) {
      p.x = RADIUS;
      p.vx *= -1;
    } else if (p.x > W - RADIUS) {
      p.x = W - RADIUS;
      p.vx *= -1;
    }
    if (p.y < RADIUS) {
      p.y = RADIUS;
      p.vy *= -1;
    } else if (p.y > H - RADIUS) {
      p.y = H - RADIUS;
      p.vy *= -1;
    }

    // Hızı sabit tut
    const n = normalize(p.vx, p.vy, SPEED);
    p.vx = n.vx;
    p.vy = n.vy;
  }
}

// Rasgele eşya spawn
function spawnItem() {
  const type = Math.random() < 0.5 ? "attack" : "heal";
  const newItem = {
    id: Date.now() + Math.random(),
    type,
    x: Math.random() * (W - 2 * RADIUS) + RADIUS,
    y: Math.random() * (H - 2 * RADIUS) + RADIUS,
  };
  items.push(newItem);
  io.emit("updateItems", items);

  // belirli süre sonra kaldır
  setTimeout(() => {
    items = items.filter((it) => it.id !== newItem.id);
    io.emit("updateItems", items);
  }, ITEM_LIFETIME_MS);
}

// Oyuncu-oyuncu çarpışmaları (sekme + hasar)
function handlePlayerCollisions() {
  const ids = Object.keys(players);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = players[ids[i]];
      const b = players[ids[j]];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 2 * RADIUS) {
        // Biraz ayır (overlap çöz)
        const overlap = 2 * RADIUS - dist || 0.01;
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;

        // Basit sekme: hızları değiş tokuş et
        const avx = a.vx, avy = a.vy;
        a.vx = b.vx; a.vy = b.vy;
        b.vx = avx;  b.vy = avy;

        // Hızı sabit tut
        const an = normalize(a.vx, a.vy, SPEED);
        const bn = normalize(b.vx, b.vy, SPEED);
        a.vx = an.vx; a.vy = an.vy;
        b.vx = bn.vx; b.vy = bn.vy;

        // Hasar (spike olan, rakibin HP'sini 1 düşürür ve spike kaybolur)
        if (a.hasSpike) { b.hp -= 1; a.hasSpike = false; }
        if (b.hasSpike) { a.hp -= 1; b.hasSpike = false; }
      }
    }
  }

  // Ölüm temizliği (çarpışma turu bittikten sonra)
  for (let id of Object.keys(players)) {
    if (players[id].hp <= 0) delete players[id];
  }
}

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("join", (name, callback) => {
    if (gameStarted) {
      callback(false);
      return;
    }

    // rasgele yön fakat SABİT hız
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * SPEED;
    const vy = Math.sin(angle) * SPEED;

    players[socket.id] = {
      id: socket.id,
      name: name || "Oyuncu",
      x: Math.random() * (W - 2 * RADIUS) + RADIUS,
      y: Math.random() * (H - 2 * RADIUS) + RADIUS,
      vx,
      vy,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6,"0"),
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
  io.emit("gameStart");

  // Oyun döngüsü
  const gameLoop = setInterval(() => {
    movePlayers();

    // Eşya alma
    for (let id in players) {
      const p = players[id];

      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (Math.abs(p.x - item.x) < RADIUS + 5 && Math.abs(p.y - item.y) < RADIUS + 5) {
          if (item.type === "attack") {
            p.hasSpike = true;
          } else if (item.type === "heal") {
            p.hp++;
          }
          items.splice(i, 1);
          io.emit("updateItems", items);
        }
      }
    }

    // Oyuncular arası çarpışma + hasar
    handlePlayerCollisions();

    // Kazanan kontrolü
    const alive = Object.values(players);
    if (alive.length === 1) {
      io.emit("winner", alive[0].name);
      clearInterval(gameLoop);
      resetGame();
    } else if (alive.length === 0) {
      clearInterval(gameLoop);
      resetGame();
    }

    io.emit("updatePlayers", players);
  }, TICK_MS);

  // Eşya spawn
  const itemLoop = setInterval(() => {
    if (gameStarted) spawnItem();
    else clearInterval(itemLoop);
  }, ITEM_INTERVAL_MS);
}

// Reset
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
