// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const USERS_FILE = path.join(__dirname, "users.json");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ---- Oyun ayarları ----
const W = 600;
const H = 400;
const RADIUS = 15;
const TICK_MS = 50;
let BASE_SPEED = 6;           // Başlangıç hızı
let SPEED = BASE_SPEED;       // Dinamik global hız (tüm oyuncuların baz hızı)
const SPEED_INCREASE = 0.002; // her tick global hız artışı
const ITEM_INTERVAL_MS = 2000;
const ITEM_LIFETIME_MS = 10000;

// Eşya oranları (burayı istediğin gibi değiştir)
// Toplamları 1 olmalı (örnek: 0.6 + 0.25 + 0.15 = 1)
const itemSpawnRates = {
  attack: 0.6,  // saldırı en çok
  shield: 0.25,
  health: 0.15
};

// Ürün kataloğu (markette gözükecek)
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

let players = {};      // socketId -> player object (oyuna katılanlar)
let items = [];        // haritadaki eşyalar
let gameStarted = false;
let countdown = 10;
let countdownInterval = null;
let itemLoop = null;

// online kullanıcılar (oturum açmış, siteye girip login olanlar)
// username -> socketId (basit tutuyoruz)
let onlineUsers = {};

// ----------- Kullanıcı veri yönetimi (users.json) -----------
function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), "utf8");
    }
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");

    // Eğer dosya eski formatta { "players": {...} } ise normalize et:
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length === 1 && parsed.players && typeof parsed.players === "object") {
      return parsed.players;
    }
    return parsed;
  } catch (e) {
    console.error("users.json yüklenirken hata:", e);
    return {};
  }
}
function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.error("users.json kaydedilemedi:", e);
  }
}
let usersData = loadUsers();

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
  // Fallback
  spawnItemOfType("attack");
}

function emitLeaderboard() {
  // Sıralama: wins (en çok kazananlar). Döndür top 10
  const arr = Object.entries(usersData).map(([username, u]) => ({
    username,
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
    // Her oyuncunun kendi speedMultiplier'ı olabilir
    const target = SPEED * (p.speedMult || 1);
    // Hareket
    p.x += p.vx;
    p.y += p.vy;

    // Duvar çarpma
    if (p.x < RADIUS) { p.x = RADIUS; p.vx *= -1; }
    else if (p.x > W - RADIUS) { p.x = W - RADIUS; p.vx *= -1; }
    if (p.y < RADIUS) { p.y = RADIUS; p.vy *= -1; }
    else if (p.y > H - RADIUS) { p.y = H - RADIUS; p.vy *= -1; }

    // Hız normalizasyonu hedef oyuncu bazlı
    const n = normalize(p.vx, p.vy, target);
    p.vx = n.vx;
    p.vy = n.vy;
  }
}

function handlePlayerCollisions() {
  const ids = Object.keys(players);
  const deaths = []; // {victimId, killerUsername}
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

        // Hız swap
        const avx = a.vx, avy = a.vy;
        a.vx = b.vx; a.vy = b.vy;
        b.vx = avx;  b.vy = avy;

        // Normalize oyuncu bazlı
        const an = normalize(a.vx, a.vy, SPEED * (a.speedMult || 1));
        const bn = normalize(b.vx, b.vy, SPEED * (b.speedMult || 1));
        a.vx = an.vx; a.vy = an.vy;
        b.vx = bn.vx; b.vy = bn.vy;

        // Hasar (attack spike)
        if (a.hasSpike) {
          if (b.hasShield) {
            b.hasShield = false;
          } else {
            b.hp -= 1;
            // Eğer b öldüyse a'ya kill/para ver
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

  // Ölüm işlemleri ve kill/para yazma
  for (const d of deaths) {
    const victim = players[d.victimId];
    if (!victim) continue;
    // Kayıtlı oyuncuysa oyuncu silinecek
    delete players[d.victimId];

    // Killer'a para ve kill ekle
    const killer = d.killerUsername;
    if (killer && usersData[killer]) {
      usersData[killer].balance = (usersData[killer].balance || 0) + 50;
      usersData[killer].kills = (usersData[killer].kills || 0) + 1;
    }
  }

  // Kullanıcı verisini kaydet ve güncellemeleri yolla (eğer değişiklik olduysa)
  saveUsers(usersData);
  emitLeaderboard();
  io.emit("updatePlayers", players);
  // Hesap güncellemelerini online kullanıcılara gönder (herkesin hesabı güncellendi)
  for (const username of Object.keys(onlineUsers)) {
    const sockId = onlineUsers[username];
    io.to(sockId).emit("accountUpdate", {
      username,
      balance: usersData[username]?.balance || 0,
      wins: usersData[username]?.wins || 0,
      kills: usersData[username]?.kills || 0,
      inventory: usersData[username]?.inventory || {}
    });
  }
}

// ----------- Socket.IO -----------
io.on("connection", (socket) => {
  console.log("Bağlantı:", socket.id);

  // Kayıt ol
  socket.on("register", async ({ username, password }, cb) => {
    if (!username || !password) return cb && cb({ ok: false, msg: "Kullanıcı adı ve şifre gerekli." });
    if (usersData[username]) return cb && cb({ ok: false, msg: "Bu kullanıcı adı zaten alınmış." });

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    usersData[username] = {
      passwordHash: hash,
      balance: 0,
      wins: 0,
      kills: 0,
      inventory: { extraLife: 0, speedBoost: 0, nuke: 0 }
    };
    saveUsers(usersData);
    emitLeaderboard();
    cb && cb({ ok: true });
  });

  // Giriş yap
  socket.on("login", async ({ username, password }, cb) => {
    const u = usersData[username];
    if (!u) return cb && cb({ ok: false, msg: "Kullanıcı bulunamadı." });
    const match = bcrypt.compareSync(password, u.passwordHash || "");
    if (!match) return cb && cb({ ok: false, msg: "Şifre hatalı." });

    // 🔹 Oturum tokeni oluştur ve kaydet
    const token = generateToken();
    usersData[username].sessionToken = token;
    saveUsers(usersData);

    // Başarılı login
    socket.data.username = username;
    onlineUsers[username] = socket.id;
    emitOnlineUsers();

    // Gönder hesap bilgisi (sessionToken dahil)
    socket.emit("accountUpdate", {
      username,
      balance: u.balance || 0,
      wins: u.wins || 0,
      kills: u.kills || 0,
      inventory: u.inventory || {},
      sessionToken: token // 🔹
    });

    // Gönder leaderboard
    emitLeaderboard();

    cb && cb({ ok: true });
  });

  // 🔹 Resume session: client yenilendikten sonra token gönderirse session'ı geri kur
  socket.on("resumeSession", (token, cb) => {
    if (!token) return cb && cb({ ok: false });
    const username = Object.keys(usersData).find(u => usersData[u] && usersData[u].sessionToken === token);
    if (!username) {
      // token geçersiz
      return cb && cb({ ok: false });
    }
    // session geri yüklendi
    socket.data.username = username;
    onlineUsers[username] = socket.id;
    emitOnlineUsers();

    const u = usersData[username];
    socket.emit("accountUpdate", {
      username,
      balance: u.balance || 0,
      wins: u.wins || 0,
      kills: u.kills || 0,
      inventory: u.inventory || {},
      sessionToken: u.sessionToken
    });
    emitLeaderboard();
    cb && cb({ ok: true });
  });

  // 🔹 Logout: client manuel çıkış isterse token silinsin ve onlineUsers güncellensin
  socket.on("logout", (cb) => {
    const username = socket.data.username;
    if (username && usersData[username]) {
      delete usersData[username].sessionToken;
      saveUsers(usersData);
    }
    if (username && onlineUsers[username]) {
      delete onlineUsers[username];
      emitOnlineUsers();
    }
    socket.data.username = null;
    cb && cb({ ok: true });
  });

  // Oyuna katılma
  socket.on("join", (displayName, callback) => {
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
      name: displayName || account,
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

  // Satın al (market)
  socket.on("buyItem", (itemKey, cb) => {
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, msg: "Giriş yapmalısın." });
    const catalogItem = Object.values(itemCatalog).find(i => i.key === itemKey);
    if (!catalogItem) return cb && cb({ ok: false, msg: "Ürün bulunamadı." });

    const user = usersData[username];
    if ((user.balance || 0) < catalogItem.price) {
      return cb && cb({ ok: false, msg: "Yetersiz bakiye." });
    }

    user.balance -= catalogItem.price;
    user.inventory = user.inventory || { extraLife:0, speedBoost:0, nuke:0 };
    if (itemKey === "extraLife") user.inventory.extraLife = (user.inventory.extraLife || 0) + 1;
    if (itemKey === "speedBoost") user.inventory.speedBoost = (user.inventory.speedBoost || 0) + 1;
    if (itemKey === "nuke") user.inventory.nuke = (user.inventory.nuke || 0) + 1;

    saveUsers(usersData);
    socket.emit("accountUpdate", {
      username,
      balance: user.balance,
      wins: user.wins || 0,
      kills: user.kills || 0,
      inventory: user.inventory
    });
    emitLeaderboard();
    cb && cb({ ok: true });
  });

  // Özellik kullan
  socket.on("useItem", (itemKey, cb) => {
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, msg: "Giriş yapmalısın." });

    const user = usersData[username];
    user.inventory = user.inventory || { extraLife:0, speedBoost:0, nuke:0 };

    // Oyundaki oyuncu nesnesi (kullanıcı oyundaysa)
    const p = players[socket.id];
    if (!p) return cb && cb({ ok: false, msg: "Oyunda değilsin, özellik kullanımını oyundayken yapabilirsin." });

    if (itemKey === "extraLife") {
      if ((user.inventory.extraLife || 0) <= 0) return cb && cb({ ok: false, msg: "Bu üründen yok." });
      p.hp += 1;
      user.inventory.extraLife -= 1;
      saveUsers(usersData);
      io.emit("updatePlayers", players);
      socket.emit("accountUpdate", {
        username, balance: user.balance, wins: user.wins || 0, kills: user.kills || 0, inventory: user.inventory
      });
      return cb && cb({ ok: true, msg: "1 can kazandın." });
    }

    if (itemKey === "speedBoost") {
      if ((user.inventory.speedBoost || 0) <= 0) return cb && cb({ ok: false, msg: "Bu üründen yok." });
      user.inventory.speedBoost -= 1;
      // 3 saniye hız artışı (örnek 2x)
      p.speedMult = 2;
      saveUsers(usersData);
      io.emit("updatePlayers", players);
      socket.emit("accountUpdate", {
        username, balance: user.balance, wins: user.wins || 0, kills: user.kills || 0, inventory: user.inventory
      });
      setTimeout(() => {
        // revert
        if (players[socket.id]) {
          players[socket.id].speedMult = 1;
          io.emit("updatePlayers", players);
        }
      }, 3000);
      return cb && cb({ ok: true, msg: "3 saniyelik hız verildi." });
    }

    if (itemKey === "nuke") {
      if ((user.inventory.nuke || 0) <= 0) return cb && cb({ ok: false, msg: "Bu üründen yok." });
      user.inventory.nuke -= 1;
      // Tüm oyunculara -2 can
      const killed = [];
      for (const sid of Object.keys(players)) {
        if (sid === socket.id) continue; // kullanıcının kendisi etkilenmesin
        const target = players[sid];
        if (!target) continue;
        target.hp -= 2;
        if (target.hp <= 0) {
          killed.push(sid);
        }
      }
      // Sil ve killer'a para+kill verme
      for (const sid of killed) {
        const victim = players[sid];
        if (!victim) continue;
        delete players[sid];
        // killer'a kredi ver
        user.balance = (user.balance || 0) + 50;
        user.kills = (user.kills || 0) + 1;
      }
      saveUsers(usersData);
      io.emit("updatePlayers", players);
      socket.emit("accountUpdate", {
        username, balance: user.balance, wins: user.wins || 0, kills: user.kills || 0, inventory: user.inventory
      });
      emitLeaderboard();
      return cb && cb({ ok: true, msg: `Yok Et! kullanıldı. ${killed.length} oyuncu öldü (varsa).` });
    }

    cb && cb({ ok: false, msg: "Bilinmeyen ürün." });
  });

  socket.on("disconnect", () => {
    // oyuncu eğer oyundaysa sil
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit("updatePlayers", players);
    }
    // onlineUsers'tan çıkar
    const username = socket.data.username;
    if (username && onlineUsers[username]) {
      delete onlineUsers[username];
      emitOnlineUsers();
    }
  });

  // İstemciden spawn isteği yerine sunucu kendisi spawn edecek (güvenlik)
  // Burada sadece istemciler gerekli olayları dinler.

  // Yeni bağlanan istemciye güncel durumları gönder
  socket.emit("updateItems", items);
  socket.emit("updatePlayers", players);
  socket.emit("updateOnlineUsers", Object.keys(onlineUsers));
  emitLeaderboard();
});

// Minimum 2 oyuncu olunca sayaç başlasın
function checkStartConditions() {
  if (Object.keys(players).length < 2) {
    io.emit("waiting", "Oyunun başlamasına son 1 kişi!");
    // stop item loop if running
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
  SPEED = BASE_SPEED;
  io.emit("gameStart");

  const gameLoop = setInterval(() => {
    // global hız artışı
    SPEED += SPEED_INCREASE;

    movePlayers();

    // Eşya toplama
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

    // Kazanan kontrolü
    const alive = Object.values(players);
    if (alive.length === 1) {
      const winner = alive[0];
      io.emit("winner", winner.name);

      // Para/istatiksel ödül ver
      const account = winner.account;
      if (account && usersData[account]) {
        usersData[account].balance = (usersData[account].balance || 0) + 300;
        usersData[account].wins = (usersData[account].wins || 0) + 1;
        saveUsers(usersData);
        // gönder hesap güncellemesi
        const sockId = onlineUsers[account];
        if (sockId) {
          io.to(sockId).emit("accountUpdate", {
            username: account,
            balance: usersData[account].balance,
            wins: usersData[account].wins,
            kills: usersData[account].kills,
            inventory: usersData[account].inventory || {}
          });
        }
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

  // Eşya spawn döngüsü
  itemLoop = setInterval(() => {
    if (gameStarted) spawnRandomItem();
    else clearInterval(itemLoop);
  }, ITEM_INTERVAL_MS);
}

// Reset
function resetGame() {
  players = {};
  items = [];
  gameStarted = false;
  SPEED = BASE_SPEED;
  countdown = 10;
  countdownInterval = null;
  io.emit("updatePlayers", players);
  io.emit("updateItems", items);
  // Oyun resetlendikten sonra da leaderboard ve hesap güncelle
  emitLeaderboard();
  // Hesap verilerini online kullanıcılara gönder
  for (const username of Object.keys(onlineUsers)) {
    const sockId = onlineUsers[username];
    io.to(sockId).emit("accountUpdate", {
      username,
      balance: usersData[username]?.balance || 0,
      wins: usersData[username]?.wins || 0,
      kills: usersData[username]?.kills || 0,
      inventory: usersData[username]?.inventory || {}
    });
  }
}

server.listen(3000, () => {
  console.log("Server çalışıyor http://localhost:3000");
});
