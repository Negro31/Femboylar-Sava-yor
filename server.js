// server.js - Karakter bazlı savaş sistemi
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
const DB_NAME = "Cluster0";
let db;
let usersCollection;

async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection("users");
    console.log("MongoDB'ye bağlanıldı");
    await usersCollection.createIndex({ username: 1 }, { unique: true });
  } catch (e) {
    console.error("MongoDB bağlantı hatası:", e);
    console.log("Yerel bellek kullanılacak (veriler kaybolacak)");
  }
}

// ---- Oyun ayarları ----
const W = 600;
const H = 400;
const RADIUS = 20; // Oyuncu topu boyutu
const TICK_MS = 50;
const BASE_SPEED = 4;
let SPEED = BASE_SPEED;
const SPEED_INCREASE = 0.005;

// Karakter kataloğu
const characterCatalog = {
  warrior: {
    key: "warrior",
    name: "Warrior",
    hp: 300,
    equipment: "sword",
    damage: 30,
    price: 0,
    desc: "Kılıç ile savaşan temel savaşçı"
  },
  barbarian: {
    key: "barbarian",
    name: "Barbarian",
    hp: 210,
    equipment: "axe_shield",
    damage: 50,
    shieldHP: 90,
    price: 500,
    desc: "Balta ve kalkan ile savaşan güçlü karakter"
  }
};

let players = {};
let gameStarted = false;
let countdown = 10;
let countdownInterval = null;
let onlineUsers = {};

// Dönen ekipman açısı (her oyuncu için)
const BASE_ROTATION_SPEED = 0.02; // radyan/tick başlangıç
const ROTATION_ACCELERATION = 0.0001; // Her tick hız artışı
let globalRotationSpeed = BASE_ROTATION_SPEED;

// ----------- Kullanıcı veri yönetimi -----------
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
    console.log("MongoDB bağlantısı yok");
    return false;
  }
  try {
    await usersCollection.updateOne(
      { username },
      { $set: userData },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error("Kullanıcı kaydetme hatası:", e);
    return false;
  }
}

async function updateUserFields(username, updates) {
  if (!usersCollection) return false;
  try {
    await usersCollection.updateOne({ username }, { $set: updates });
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

function generateToken() {
  return require("crypto").randomBytes(24).toString("hex");
}

// ----------- Yardımcı fonksiyonlar -----------
function normalize(vx, vy, target = SPEED) {
  const mag = Math.hypot(vx, vy) || 1;
  const s = target / mag;
  return { vx: vx * s, vy: vy * s };
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
    p.x += p.vx;
    p.y += p.vy;

    // Duvar çarpma
    if (p.x < RADIUS) { p.x = RADIUS; p.vx *= -1; }
    else if (p.x > W - RADIUS) { p.x = W - RADIUS; p.vx *= -1; }
    if (p.y < RADIUS) { p.y = RADIUS; p.vy *= -1; }
    else if (p.y > H - RADIUS) { p.y = H - RADIUS; p.vy *= -1; }

    const n = normalize(p.vx, p.vy, SPEED);
    p.vx = n.vx;
    p.vy = n.vy;

    // Ekipman dönüş açısını güncelle
    p.equipmentAngle = (p.equipmentAngle || 0) + globalRotationSpeed;
  }
}

// Ekipman konumlarını hesapla
function getEquipmentPositions(player) {
  const positions = [];
  const angle = player.equipmentAngle || 0;
  const distance = RADIUS + 15; // Topun etrafında 15px uzaklıkta

  if (player.character === "warrior") {
    // Tek kılıç
    positions.push({
      type: "sword",
      x: player.x + Math.cos(angle) * distance,
      y: player.y + Math.sin(angle) * distance,
      angle: angle,
      damage: characterCatalog.warrior.damage
    });
  } else if (player.character === "barbarian") {
    // Balta (12 yön - yukarı)
    const axeAngle = angle;
    positions.push({
      type: "axe",
      x: player.x + Math.cos(axeAngle) * distance,
      y: player.y + Math.sin(axeAngle) * distance,
      angle: axeAngle,
      damage: characterCatalog.barbarian.damage
    });
    
    // Kalkan (6 yön - aşağı)
    const shieldAngle = angle + Math.PI;
    positions.push({
      type: "shield",
      x: player.x + Math.cos(shieldAngle) * distance,
      y: player.y + Math.sin(shieldAngle) * distance,
      angle: shieldAngle,
      hp: player.shieldHP || 0
    });
  }

  return positions;
}

// Ekipman çarpışma kontrolü
async function handleEquipmentCollisions() {
  const playerIds = Object.keys(players);
  const deaths = [];
  const hitCooldowns = {}; // Aynı vuruşun tekrarlanmaması için

  for (let i = 0; i < playerIds.length; i++) {
    const pA = players[playerIds[i]];
    if (!pA) continue;

    const equipA = getEquipmentPositions(pA);

    for (let j = 0; j < playerIds.length; j++) {
      if (i === j) continue;
      const pB = players[playerIds[j]];
      if (!pB) continue;

      const equipB = getEquipmentPositions(pB);

      // A'nın ekipmanı B'nin oyuncusuna çarpıyor mu?
      for (const eqA of equipA) {
        if (eqA.type === "shield") continue; // Kalkan hasar vermez

        const cooldownKey = `${pA.id}-${pB.id}-${Date.now()}`;
        
        const dist = Math.hypot(eqA.x - pB.x, eqA.y - pB.y);
        if (dist < RADIUS + 5) {
          // Cooldown kontrolü (100ms içinde aynı oyuncuya tekrar vuramaz)
          if (!pA.lastHitTime || Date.now() - pA.lastHitTime > 100) {
            // Hasar ver
            pB.hp -= eqA.damage;
            pA.lastHitTime = Date.now();
            
            // Vurulan oyuncuyu geriye ittir
            const pushAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
            const pushForce = 3;
            pB.x += Math.cos(pushAngle) * pushForce;
            pB.y += Math.sin(pushAngle) * pushForce;
            
            // Sınır kontrolü
            pB.x = Math.max(RADIUS, Math.min(W - RADIUS, pB.x));
            pB.y = Math.max(RADIUS, Math.min(H - RADIUS, pB.y));
            
            // Vuran ekipman geri seksin
            pA.equipmentAngle += Math.PI / 3; // 60 derece geri sek
            
            if (pB.hp <= 0) {
              deaths.push({ victimId: pB.id, killerUsername: pA.account });
            }
          }
        }
      }

      // Ekipman-ekipman çarpışması (geri sekme)
      for (const eqA of equipA) {
        for (const eqB of equipB) {
          const dist = Math.hypot(eqA.x - eqB.x, eqA.y - eqB.y);
          if (dist < 15) {
            // İki ekipman çarptı
            if (eqA.type === "shield" && eqB.type !== "shield") {
              // Kalkan hasar alıyor
              if (!pA.shieldLastHit || Date.now() - pA.shieldLastHit > 100) {
                pA.shieldHP = Math.max(0, (pA.shieldHP || 0) - eqB.damage);
                pA.shieldLastHit = Date.now();
              }
            } else if (eqB.type === "shield" && eqA.type !== "shield") {
              if (!pB.shieldLastHit || Date.now() - pB.shieldLastHit > 100) {
                pB.shieldHP = Math.max(0, (pB.shieldHP || 0) - eqA.damage);
                pB.shieldLastHit = Date.now();
              }
            }
            // Geri sekme efekti
            pA.equipmentAngle += Math.PI / 6;
            pB.equipmentAngle -= Math.PI / 6;
          }
        }
      }
    }
  }

  // Ölümleri işle
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
        ownedCharacters: user.ownedCharacters || ["warrior"]
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
      ownedCharacters: ["warrior"], // Başlangıçta sadece warrior
      selectedCharacter: "warrior"
    });
    
    await emitLeaderboard();
    cb && cb({ ok: true });
  });

  socket.on("login", async ({ username, password }, cb) => {
    const u = await getUser(username);
    if (!u) return cb && cb({ ok: false, msg: "Kullanıcı bulunamadı." });
    
    const match = bcrypt.compareSync(password, u.passwordHash || "");
    if (!match) return cb && cb({ ok: false, msg: "Şifre hatalı." });

    if (onlineUsers[username]) {
      const oldSocketId = onlineUsers[username];
      io.to(oldSocketId).emit("forceLogout", "Hesabınız başka bir yerde açıldı.");
      io.sockets.sockets.get(oldSocketId)?.disconnect(true);
    }

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
      ownedCharacters: u.ownedCharacters || ["warrior"],
      selectedCharacter: u.selectedCharacter || "warrior",
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

    if (onlineUsers[user.username]) {
      const oldSocketId = onlineUsers[user.username];
      io.to(oldSocketId).emit("forceLogout", "Hesabınız başka bir yerde açıldı.");
      io.sockets.sockets.get(oldSocketId)?.disconnect(true);
    }

    socket.data.username = user.username;
    onlineUsers[user.username] = socket.id;
    emitOnlineUsers();

    socket.emit("accountUpdate", {
      username: user.username,
      balance: user.balance || 0,
      wins: user.wins || 0,
      kills: user.kills || 0,
      ownedCharacters: user.ownedCharacters || ["warrior"],
      selectedCharacter: user.selectedCharacter || "warrior",
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

  socket.on("selectCharacter", async (characterKey, cb) => {
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, msg: "Giriş yapmalısın." });

    const user = await getUser(username);
    if (!user) return cb && cb({ ok: false, msg: "Kullanıcı bulunamadı." });

    const owned = user.ownedCharacters || ["warrior"];
    if (!owned.includes(characterKey)) {
      return cb && cb({ ok: false, msg: "Bu karaktere sahip değilsin." });
    }

    await updateUserFields(username, { selectedCharacter: characterKey });
    socket.emit("accountUpdate", {
      username,
      balance: user.balance || 0,
      wins: user.wins || 0,
      kills: user.kills || 0,
      ownedCharacters: owned,
      selectedCharacter: characterKey
    });

    cb && cb({ ok: true });
  });

  socket.on("join", async (callback) => {
    const account = socket.data.username || null;
    if (!account) {
      callback && callback(false, "Önce giriş yapmalısın.");
      return;
    }
    if (gameStarted) {
      callback && callback(false, "Oyun zaten başladı!");
      return;
    }

    const user = await getUser(account);
    if (!user) {
      callback && callback(false, "Kullanıcı bulunamadı.");
      return;
    }

    const selectedChar = user.selectedCharacter || "warrior";
    const charData = characterCatalog[selectedChar];

    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * SPEED;
    const vy = Math.sin(angle) * SPEED;

    players[socket.id] = {
      id: socket.id,
      name: account,
      account: account,
      character: selectedChar,
      x: Math.random() * (W - 2 * RADIUS) + RADIUS,
      y: Math.random() * (H - 2 * RADIUS) + RADIUS,
      vx,
      vy,
      color: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6,"0"),
      hp: charData.hp,
      shieldHP: charData.shieldHP || 0,
      equipmentAngle: Math.random() * Math.PI * 2
    };

    socket.emit("init", socket.id);
    io.emit("updatePlayers", players);
    io.emit("updateOnlineUsers", Object.keys(onlineUsers));
    callback && callback(true);

    checkStartConditions();
  });

  socket.on("buyCharacter", async (charKey, cb) => {
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, msg: "Giriş yapmalısın." });
    
    const charData = characterCatalog[charKey];
    if (!charData) return cb && cb({ ok: false, msg: "Karakter bulunamadı." });

    const user = await getUser(username);
    if (!user) return cb && cb({ ok: false, msg: "Kullanıcı bulunamadı." });

    const owned = user.ownedCharacters || ["warrior"];
    if (owned.includes(charKey)) {
      return cb && cb({ ok: false, msg: "Bu karaktere zaten sahipsin." });
    }

    if ((user.balance || 0) < charData.price) {
      return cb && cb({ ok: false, msg: "Yetersiz bakiye." });
    }

    const newBalance = user.balance - charData.price;
    owned.push(charKey);

    await updateUserFields(username, {
      balance: newBalance,
      ownedCharacters: owned
    });

    socket.emit("accountUpdate", {
      username,
      balance: newBalance,
      wins: user.wins || 0,
      kills: user.kills || 0,
      ownedCharacters: owned,
      selectedCharacter: user.selectedCharacter || "warrior"
    });

    await emitLeaderboard();
    cb && cb({ ok: true });
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
  globalRotationSpeed = BASE_ROTATION_SPEED;
  io.emit("gameStart");

  const gameLoop = setInterval(() => {
    SPEED += SPEED_INCREASE;
    globalRotationSpeed += ROTATION_ACCELERATION;

    movePlayers();
    handleEquipmentCollisions();

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
                ownedCharacters: updatedUser.ownedCharacters || ["warrior"],
                selectedCharacter: updatedUser.selectedCharacter || "warrior"
              });
            }
          }
        })();
      }

      clearInterval(gameLoop);
      resetGame();
    } else if (alive.length === 0) {
      clearInterval(gameLoop);
      resetGame();
    }

    io.emit("updatePlayers", players);
  }, TICK_MS);
}

async function resetGame() {
  players = {};
  gameStarted = false;
  SPEED = BASE_SPEED;
  globalRotationSpeed = BASE_ROTATION_SPEED;
  countdown = 10;
  countdownInterval = null;
  io.emit("updatePlayers", players);
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
        ownedCharacters: user.ownedCharacters || ["warrior"],
        selectedCharacter: user.selectedCharacter || "warrior"
      });
    }
  }
}

connectDB().then(() => {
  server.listen(3000, () => {
    console.log("Server çalışıyor http://localhost:3000");
  });
});
