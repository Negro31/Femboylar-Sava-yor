// server.js - MongoDB ile kalıcı veri saklama
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const bcrypt = require("bcryptjs");
const { MongoClient } = require("mongodb");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// MongoDB bağlantısı
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = "ballgame";
let db;
let usersCollection;

// MongoDB'ye bağlan
async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection("users");
    console.log("MongoDB'ye bağlanıldı");
    
    // Index oluştur (hızlı arama için)
    await usersCollection.createIndex({ username: 1 }, { unique: true });
  } catch (e) {
    console.error("MongoDB bağlantı hatası:", e);
    console.log("Yerel bellek kullanılacak (veriler kaybolacak)");
  }
}

// ---- Oyun ayarları ----
const W = 600;
const H = 400;
const RADIUS = 15;
const TICK_MS = 50;
let BASE_SPEED = 6;
let SPEED = BASE_SPEED;
const SPEED_INCREASE = 0.008;
const ITEM_INTERVAL_MS = 2000;
const ITEM_LIFETIME_MS = 10000;

const itemSpawnRates = {
  attack: 0.6,
  shield: 0.25,
  health: 0.15
};

const itemCatalog = {
  extraLife: {
    key: "extraLife",
    title: "Bir şans daha!",
    price: 200,
    desc: "Kullanıldığında 1 can kazanırsın (oyun içinde tüketilir)."
  },
  speedBoost: {
    key: "speedBoost",
    title: "Kaaçoovvv",
    price: 400,
    desc: "3 saniyeliğine yüksek hız artışı sağlar."
  },
  nuke: {
    key: "nuke",
    title: "Yok Et!",
    price: 600,
    desc: "Bütün oyuncuların canını 2 can indirirsin (öldürürse kill sana yazar)."
  }
};

let players = {};
let items = [];
let gameStarted = false;
let countdown = 10;
let countdownInterval = null;
let itemLoop = null;
let onlineUsers = {};

// ----------- Kullanıcı veri yönetimi (MongoDB) -----------
async function getUser(username) {
  if (!usersCollection) return null;
  try {
    return await usersCollection.findOne({ username });
  } catch (e) {
    console.error("Kullanıcı okuma hatası:", e);
    return null;
  }
}

async function saveUser(username, userData) {
  if (!usersCollection) {
    console.log("MongoDB bağlantısı yok, veri kaydedilemiyor");
    return false;
  }
  try {
    await usersCollection.updateOne(
      { username },
      { $set: userData },
      { upsert: true }
    );
    console.log(`Kullanıcı kaydedildi: ${username}`);
    return true;
  } catch (e) {
    console.error("Kullanıcı kaydetme hatası:", e);
    return false;
  }
}

async function updateUserFields(username, updates) {
  if (!usersCollection) return false;
  try {
    await usersCollection.updateOne(
      { username },
      { $set: updates }
    );
    return true;
  } catch (e) {
    console.error("Kullanıcı güncelleme hatası:", e);
    return false;
  }
}

async function getAllUsers() {
  if (!usersCollection) return [];
  try {
    return await usersCollection.find({}).toArray();
  } catch (e) {
    console.error("Kullanıcı listesi okuma hatası:", e);
    return [];
  }
}

// Basit token üreteci
function generateToken() {
  return require("crypto").randomBytes(24).toString("hex");
}

// ----------- Yardımcı fonksiyonlar -----------
function normalize(vx, vy, target = SPEED) {
  const mag = Math.hypot(vx, vy) || 1;
  const s = target / mag;
  return { vx: vx * s, vy: vy * s };
}

function spawnItemOfType(type) {
  const newItem = {
    id: Date.now() + Math.random(),
    type,
    x: Math.random() * (W - 2 * RADIUS) + RADIUS,
    y: Math.random() * (H - 2 * RADIUS) + RADIUS,
  };
  items.push(newItem);
  io.emit("updateItems", items);

  setTimeout(() => {
    items = items.filter((it) => it.id !== newItem.id);
    io.emit("updateItems", items);
  }, ITEM_LIFETIME_MS);
}

function spawnRandomItem() {
  const r = Math.random();
  let cum = 0;
  for (const [type, rate] of Object.entries(itemSpawnRates)) {
    cum += rate;
    if (r <= cum) {
      spawnItemOfType(type);
      return;
    }
  }
  spawnItemOfType("attack");
}

async function emitLeaderboard() {
  const allUsers = await getAllUsers();
  const arr = allUsers.map(u => ({
    username: u.username,
    wins: u.wins || 0,
    kills: u.kills || 0,
    balance: u.balance || 0
  }));
  arr.sort((a,b) => b.wins - a.wins || b.kills - a.kills);
  const top = arr.slice(0, 20);
  io.emit("leaderboard", top);
}

function emitOnlineUsers() {
  io.emit("updateOnlineUsers", Object.keys(onlineUsers));
}

// ----------- Oyun mekaniği -----------
function movePlayers() {
  for (let id in players) {
    const p = players[id];
    const target = SPEED * (p.speedMult || 1);
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < RADIUS) { p.x = RADIUS; p.vx *= -1; }
    else if (p.x > W - RADIUS) { p.x = W - RADIUS; p.vx *= -1; }
    if (p.y < RADIUS) { p.y = RADIUS; p.vy *= -1; }
    else if (p.y > H - RADIUS) { p.y = H - RADIUS; p.vy *= -1; }

    const n = normalize(p.vx, p.vy, target);
    p.vx = n.vx;
    p.vy = n.vy;
  }
}

async function handlePlayerCollisions() {
  const ids = Object.keys(players);
  const deaths = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = players[ids[i]];
      const b = players[ids[j]];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 2 * RADIUS) {
        const overlap = 2 * RADIUS - dist || 0.01;
        const nx = dx / (dist || 1);
        const ny = dy / (dist || 1);
        a.x -= (nx * overlap) / 2;
        a.y -= (ny * overlap) / 2;
        b.x += (nx * overlap) / 2;
        b.y += (ny * overlap) / 2;

        const avx = a.vx, avy = a.vy;
        a.vx = b.vx; a.vy = b.vy;
        b.vx = avx;  b.vy = avy;

        const an = normalize(a.vx, a.vy, SPEED * (a.speedMult || 1));
        const bn = normalize(b.vx, b.vy, SPEED * (b.speedMult || 1));
        a.vx = an.vx; a.vy = an.vy;
        b.vx = bn.vx; b.vy = bn.vy;

        if (a.hasSpike) {
          if (b.hasShield) {
            b.hasShield = false;
          } else {
            b.hp -= 1;
            if (b.hp <= 0) {
              deaths.push({ victimId: b.id, killerUsername: a.account || null });
            }
          }
          a.hasSpike = false;
        }
        if (b.hasSpike) {
          if (a.hasShield) {
            a.hasShield = false;
          } else {
            a.hp -= 1;
            if (a.hp <= 0) {
              deaths.push({ victimId: a.id, killerUsername: b.account || null });
            }
          }
          b.hasSpike = false;
        }
      }
    }
  }

  for (const d of deaths) {
    const victim = players[d.victimId];
    if (!victim) continue;
    delete players[d.victimId];

    const killer = d.killerUsername;
    if (killer) {
      const user = await getUser(killer);
      if (user) {
        await updateUserFields(killer, {
          balance: (user.balance || 0) + 50,
          kills: (user.kills || 0) + 1
        });
      }
    }
  }

  await emitLeaderboard();
  io.emit("updatePlayers", players);
  
  for (const username of Object.keys(onlineUsers)) {
    const sockId = onlineUsers[username];
    const user = await getUser(username);
    if (user) {
      io.to(sockId).emit("accountUpdate", {
        username,
        balance: user.balance || 0,
        wins: user.wins || 0,
        kills: user.kills || 0,
        inventory: user.inventory || {}
      });
    }
  }
}

// ----------- Socket.IO -----------
io.on("connection", (socket) => {
  console.log("Bağlantı:", socket.id);

  socket.on("register", async ({ username, password }, cb) => {
    if (!username || !password) return cb && cb({ ok: false, msg: "Kullanıcı adı ve şifre gerekli." });
    
    const existing = await getUser(username);
    if (existing) return cb && cb({ ok: false, msg: "Bu kullanıcı adı zaten alınmış." });

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    
    await saveUser(username, {
      username,
      passwordHash: hash,
      balance: 0,
      wins: 0,
      kills: 0,
      inventory: { extraLife: 0, speedBoost: 0, nuke: 0 }
    });
    
    await emitLeaderboard();
    cb && cb({ ok: true });
  });

  socket.on("login", async ({ username, password }, cb) => {
    const u = await getUser(username);
    if (!u) return cb && cb({ ok: false, msg: "Kullanıcı bulunamadı." });
    
    const match = bcrypt.compareSync(password, u.passwordHash || "");
    if (!match) return cb && cb({ ok: false, msg: "Şifre hatalı." });

    const token = generateToken();
    await updateUserFields(username, { sessionToken: token });

    socket.data.username = username;
    onlineUsers[username] = socket.id;
    emitOnlineUsers();

    socket.emit("accountUpdate", {
      username,
      balance: u.balance || 0,
      wins: u.wins || 0,
      kills: u.kills || 0,
      inventory: u.inventory || {},
      sessionToken: token
    });

    await emitLeaderboard();
    cb && cb({ ok: true });
  });

  socket.on("resumeSession", async (token, cb) => {
    if (!token) return cb && cb({ ok: false });
    
    const allUsers = await getAllUsers();
    const user = allUsers.find(u => u.sessionToken === token);
    
    if (!user) return cb && cb({ ok: false });

    socket.data.username = user.username;
    onlineUsers[user.username] = socket.id;
    emitOnlineUsers();

    socket.emit("accountUpdate", {
      username: user.username,
      balance: user.balance || 0,
      wins: user.wins || 0,
      kills: user.kills || 0,
      inventory: user.inventory || {},
      sessionToken: user.sessionToken
    });
    
    await emitLeaderboard();
    cb && cb({ ok: true });
  });

  socket.on("logout", async (cb) => {
    const username = socket.data.username;
    if (username) {
      await updateUserFields(username, { sessionToken: null });
      delete onlineUsers[username];
      emitOnlineUsers();
    }
    socket.data.username = null;
    cb && cb({ ok: true });
  });

  socket.on("join", (callback) => {
    const account = socket.data.username || null;
    if (!account) {
      callback && callback(false, "Önce giriş yapmalısın.");
      return;
    }
    if (gameStarted) {
      callback && callback(false, "Oyun zaten başladı!");
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * SPEED;
    const vy = Math.sin(angle) * SPEED;

    players[socket.id] = {
      id: socket.id,
      name: account,
      account: account,
      x: Math.random() * (W - 2 * RADIUS) + RADIUS,
      y: Math.random() * (H - 2 * RADIUS) + RADIUS,
      vx,
      vy,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6,"0"),
      hp: 3,
      hasSpike: false,
      hasShield: false,
      speedMult: 1
    };

    socket.emit("init", socket.id);
    io.emit("updatePlayers", players);
    io.emit("updateOnlineUsers", Object.keys(onlineUsers));
    callback && callback(true);

    checkStartConditions();
  });

  socket.on("buyItem", async (itemKey, cb) => {
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, msg: "Giriş yapmalısın." });
    
    const catalogItem = Object.values(itemCatalog).find(i => i.key === itemKey);
    if (!catalogItem) return cb && cb({ ok: false, msg: "Ürün bulunamadı." });

    const user = await getUser(username);
    if (!user || (user.balance || 0) < catalogItem.price) {
      return cb && cb({ ok: false, msg: "Yetersiz bakiye." });
    }

    const newBalance = user.balance - catalogItem.price;
    const inventory = user.inventory || { extraLife:0, speedBoost:0, nuke:0 };
    if (itemKey === "extraLife") inventory.extraLife = (inventory.extraLife || 0) + 1;
    if (itemKey === "speedBoost") inventory.speedBoost = (inventory.speedBoost || 0) + 1;
    if (itemKey === "nuke") inventory.nuke = (inventory.nuke || 0) + 1;

    await updateUserFields(username, { balance: newBalance, inventory });
    
    socket.emit("accountUpdate", {
      username,
      balance: newBalance,
      wins: user.wins || 0,
      kills: user.kills || 0,
      inventory
    });
    
    await emitLeaderboard();
    cb && cb({ ok: true });
  });

  socket.on("useItem", async (itemKey, cb) => {
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, msg: "Giriş yapmalısın." });

    const user = await getUser(username);
    if (!user) return cb && cb({ ok: false, msg: "Kullanıcı bulunamadı." });

    const inventory = user.inventory || { extraLife:0, speedBoost:0, nuke:0 };
    const p = players[socket.id];
    if (!p) return cb && cb({ ok: false, msg: "Oyunda değilsin, özellik kullanımını oyundayken yapabilirsin." });

    if (itemKey === "extraLife") {
      if ((inventory.extraLife || 0) <= 0) return cb && cb({ ok: false, msg: "Bu üründen yok." });
      p.hp += 1;
      inventory.extraLife -= 1;
      await updateUserFields(username, { inventory });
      io.emit("updatePlayers", players);
      socket.emit("accountUpdate", {
        username, balance: user.balance, wins: user.wins || 0, kills: user.kills || 0, inventory
      });
      return cb && cb({ ok: true, msg: "1 can kazandın." });
    }

    if (itemKey === "speedBoost") {
      if ((inventory.speedBoost || 0) <= 0) return cb && cb({ ok: false, msg: "Bu üründen yok." });
      inventory.speedBoost -= 1;
      p.speedMult = 2;
      await updateUserFields(username, { inventory });
      io.emit("updatePlayers", players);
      socket.emit("accountUpdate", {
        username, balance: user.balance, wins: user.wins || 0, kills: user.kills || 0, inventory
      });
      setTimeout(() => {
        if (players[socket.id]) {
          players[socket.id].speedMult = 1;
          io.emit("updatePlayers", players);
        }
      }, 3000);
      return cb && cb({ ok: true, msg: "3 saniyelik hız verildi." });
    }

    if (itemKey === "nuke") {
      if ((inventory.nuke || 0) <= 0) return cb && cb({ ok: false, msg: "Bu üründen yok." });
      inventory.nuke -= 1;
      const killed = [];
      for (const sid of Object.keys(players)) {
        if (sid === socket.id) continue;
        const target = players[sid];
        if (!target) continue;
        target.hp -= 2;
        if (target.hp <= 0) {
          killed.push(sid);
        }
      }
      for (const sid of killed) {
        delete players[sid];
      }
      await updateUserFields(username, {
        inventory,
        balance: (user.balance || 0) + (killed.length * 50),
        kills: (user.kills || 0) + killed.length
      });
      io.emit("updatePlayers", players);
      const updatedUser = await getUser(username);
      socket.emit("accountUpdate", {
        username, 
        balance: updatedUser.balance, 
        wins: updatedUser.wins || 0, 
        kills: updatedUser.kills || 0, 
        inventory
      });
      await emitLeaderboard();
      return cb && cb({ ok: true, msg: `Yok Et! kullanıldı. ${killed.length} oyuncu öldü (varsa).` });
    }

    cb && cb({ ok: false, msg: "Bilinmeyen ürün." });
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit("updatePlayers", players);
    }
    const username = socket.data.username;
    if (username && onlineUsers[username]) {
      delete onlineUsers[username];
      emitOnlineUsers();
    }
  });

  socket.emit("updateItems", items);
  socket.emit("updatePlayers", players);
  socket.emit("updateOnlineUsers", Object.keys(onlineUsers));
  emitLeaderboard();
});

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

function startGame() {
  gameStarted = true;
  SPEED = BASE_SPEED;
  io.emit("gameStart");

  const gameLoop = setInterval(() => {
    SPEED += SPEED_INCREASE;
    movePlayers();

    for (let id in players) {
      const p = players[id];
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (Math.abs(p.x - item.x) < RADIUS + 5 && Math.abs(p.y - item.y) < RADIUS + 5) {
          if (item.type === "attack") p.hasSpike = true;
          else if (item.type === "health" || item.type === "heal") p.hp++;
          else if (item.type === "shield") p.hasShield = true;

          items.splice(i, 1);
          io.emit("updateItems", items);
        }
      }
    }

    handlePlayerCollisions();

    const alive = Object.values(players);
    if (alive.length === 1) {
      const winner = alive[0];
      io.emit("winner", winner.name);

      const account = winner.account;
      if (account) {
        (async () => {
          const user = await getUser(account);
          if (user) {
            await updateUserFields(account, {
              balance: (user.balance || 0) + 300,
              wins: (user.wins || 0) + 1
            });
            const updatedUser = await getUser(account);
            const sockId = onlineUsers[account];
            if (sockId) {
              io.to(sockId).emit("accountUpdate", {
                username: account,
                balance: updatedUser.balance,
                wins: updatedUser.wins,
                kills: updatedUser.kills,
                inventory: updatedUser.inventory || {}
              });
            }
          }
        })();
      }

      clearInterval(gameLoop);
      clearInterval(itemLoop);
      resetGame();
    } else if (alive.length === 0) {
      clearInterval(gameLoop);
      clearInterval(itemLoop);
      resetGame();
    }

    io.emit("updatePlayers", players);
  }, TICK_MS);

  itemLoop = setInterval(() => {
    if (gameStarted) spawnRandomItem();
    else clearInterval(itemLoop);
  }, ITEM_INTERVAL_MS);
}

async function resetGame() {
  players = {};
  items = [];
  gameStarted = false;
  SPEED = BASE_SPEED;
  countdown = 10;
  countdownInterval = null;
  io.emit("updatePlayers", players);
  io.emit("updateItems", items);
  await emitLeaderboard();
  
  for (const username of Object.keys(onlineUsers)) {
    const sockId = onlineUsers[username];
    const user = await getUser(username);
    if (user) {
      io.to(sockId).emit("accountUpdate", {
        username,
        balance: user.balance || 0,
        wins: user.wins || 0,
        kills: user.kills || 0,
        inventory: user.inventory || {}
      });
    }
  }
}

// Sunucuyu başlat
connectDB().then(() => {
  server.listen(3000, () => {
    console.log("Server çalışıyor http://localhost:3000");
  });
});
