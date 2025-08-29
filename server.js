const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let players = {};
let items = [];

function spawnItem() {
  const type = Math.random() < 0.5 ? "heal" : "attack";
  items.push({
    id: Date.now() + "_" + Math.floor(Math.random() * 1000),
    type,
    x: Math.random() * 700,
    y: Math.random() * 500
  });
}

setInterval(() => {
  if (items.length < 5) spawnItem();
}, 3000);

io.on("connection", (socket) => {
  socket.on("newPlayer", (name) => {
    players[socket.id] = {
      id: socket.id,
      name,
      x: Math.random() * 700,
      y: Math.random() * 500,
      hp: 5,
      color: "#" + Math.floor(Math.random()*16777215).toString(16),
      attack: false,
      speed: 3,
      keys: {}
    };
  });

  socket.on("keyPress", (data) => {
    if (players[socket.id]) {
      players[socket.id].keys[data.key] = data.state;
    }
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

function gameLoop() {
  for (let id in players) {
    let p = players[id];
    if (p.keys["ArrowUp"]) p.y -= p.speed;
    if (p.keys["ArrowDown"]) p.y += p.speed;
    if (p.keys["ArrowLeft"]) p.x -= p.speed;
    if (p.keys["ArrowRight"]) p.x += p.speed;

    // Harita sınırları
    if (p.x < 0) p.x = 0;
    if (p.y < 0) p.y = 0;
    if (p.x > 750) p.x = 750;
    if (p.y > 550) p.y = 550;

    // Item alma
    for (let i = items.length - 1; i >= 0; i--) {
      let it = items[i];
      let dx = p.x - it.x;
      let dy = p.y - it.y;
      if (Math.sqrt(dx*dx + dy*dy) < 20) {
        if (it.type === "heal" && p.hp < 10) p.hp++;
        if (it.type === "attack") p.attack = true;
        items.splice(i, 1);
      }
    }

    // Çarpışma kontrolü
    for (let id2 in players) {
      if (id === id2) continue;
      let p2 = players[id2];
      let dx = p.x - p2.x;
      let dy = p.y - p2.y;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        if (p.attack) {
          p2.hp--;
          p.attack = false;
          if (p2.hp <= 0) {
            delete players[id2];
          }
        }
      }
    }
  }

  io.sockets.emit("state", { players, items });
}

setInterval(gameLoop, 1000 / 60);

http.listen(PORT, () => {
  console.log("Server çalışıyor -> " + PORT);
});
