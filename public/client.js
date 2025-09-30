// client.js - Karakter bazlı sistem
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let socketPlayerId = null;
let players = {};
let onlineUsers = [];
let account = null;

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

// Ses sistemi
const sounds = {
  hit: new Audio("https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3"), // Vuruş sesi
  clash: new Audio("https://assets.mixkit.co/active_storage/sfx/2566/2566-preview.mp3"), // Metal çarpışma
  death: new Audio("https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3") // Ölüm
};

// Ses volume ayarı
sounds.hit.volume = 0.3;
sounds.clash.volume = 0.4;
sounds.death.volume = 0.5;

// Ses çalma fonksiyonu
function playSound(type) {
  if (sounds[type]) {
    sounds[type].currentTime = 0;
    sounds[type].play().catch(e => console.log("Ses çalınamadı:", e));
  }
}

// Sunucudan ses eventi
socket.on("playSound", (data) => {
  playSound(data.type);
});

// DOM referanslar
const joinBtn = document.getElementById("joinBtn");
const statusDiv = document.getElementById("status");
const rosterList = document.getElementById("rosterList");
const leaderboardList = document.getElementById("leaderboardList");

const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");
const btnRegister = document.getElementById("btnRegister");
const btnLogin = document.getElementById("btnLogin");
const authForms = document.getElementById("authForms");
const accountInfo = document.getElementById("accountInfo");
const accName = document.getElementById("accName");
const accBalance = document.getElementById("accBalance");
const logoutBtn = document.getElementById("logoutBtn");

const marketBtn = document.getElementById("marketBtn");
const marketModal = document.getElementById("marketModal");
const marketContent = document.getElementById("marketContent");
const marketItemsDiv = document.getElementById("marketItems");
const marketBalanceDiv = document.getElementById("marketBalance");
const closeMarketBtn = document.getElementById("closeMarket");

const characterSelectDiv = document.getElementById("characterSelect");
const characterListDiv = document.getElementById("characterList");

// Session resume
socket.on("connect", () => {
  const token = localStorage.getItem("sessionToken");
  if (token) {
    socket.emit("resumeSession", token, (res) => {
      if (!res || !res.ok) {
        localStorage.removeItem("sessionToken");
      }
    });
  }
});

// Event listeners
joinBtn.onclick = () => {
  if (!account) return alert("Önce giriş yapın.");
  socket.emit("join", (success, msg) => {
    if (!success) alert(msg || "Katılamadı.");
  });
};

btnRegister.onclick = () => {
  const u = authUser.value.trim();
  const p = authPass.value;
  if (!u || !p) return alert("Kullanıcı adı ve şifre girin.");
  socket.emit("register", { username: u, password: p }, (res) => {
    if (res.ok) {
      alert("Kayıt başarılı. Giriş yapabilirsiniz.");
    } else {
      alert("Kayıt başarısız: " + (res.msg||""));
    }
  });
};

btnLogin.onclick = () => {
  const u = authUser.value.trim();
  const p = authPass.value;
  if (!u || !p) return alert("Kullanıcı adı ve şifre girin.");
  socket.emit("login", { username: u, password: p }, (res) => {
    if (res.ok) {
      authForms.classList.add("hidden");
      accountInfo.classList.remove("hidden");
    } else {
      alert("Giriş başarısız: " + (res.msg || ""));
    }
  });
};

logoutBtn.onclick = () => {
  socket.emit("logout", (res) => {
    localStorage.removeItem("sessionToken");
    account = null;
    authForms.classList.remove("hidden");
    accountInfo.classList.add("hidden");
    document.getElementById("marketBtn").classList.add("hidden");
    document.getElementById("side").classList.add("hidden");
    document.getElementById("characterSelect").classList.add("hidden");
  });
};

// Market
marketBtn.onclick = () => {
  if (!account) return alert("Market için giriş yapın.");
  openMarket();
};
closeMarketBtn.onclick = () => closeMarket();

function openMarket() {
  marketModal.classList.remove("hidden");
  renderMarket();
}

function closeMarket() {
  marketModal.classList.add("hidden");
}

marketModal.addEventListener("click", (e) => {
  if (e.target === marketModal) closeMarket();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMarket();
});

function buyCharacter(key) {
  socket.emit("buyCharacter", key, (res) => {
    if (res.ok) {
      alert("Karakter satın alındı!");
    } else {
      alert("Satın alma başarısız: " + (res.msg||""));
    }
  });
}

function selectCharacter(key) {
  socket.emit("selectCharacter", key, (res) => {
    if (res.ok) {
      alert("Karakter seçildi: " + characterCatalog[key].name);
      renderCharacterSelect();
    } else {
      alert("Seçim başarısız: " + (res.msg||""));
    }
  });
}

// Socket events
socket.on("init", (id) => {
  socketPlayerId = id;
});

socket.on("updatePlayers", (data) => {
  players = data;
  renderRoster();
});

socket.on("updateOnlineUsers", (list) => {
  onlineUsers = list || [];
  renderRoster();
});

socket.on("waiting", (msg) => {
  statusDiv.innerText = msg;
});

socket.on("countdown", (t) => {
  statusDiv.innerText = "Oyun " + t + " saniye içinde başlıyor!";
});

socket.on("gameStart", () => {
  statusDiv.innerText = "Oyun başladı!";
});

socket.on("winner", (name) => {
  statusDiv.innerText = "Kazanan: " + name;
});

socket.on("accountUpdate", (acc) => {
  account = {
    username: acc.username,
    balance: acc.balance || 0,
    wins: acc.wins || 0,
    kills: acc.kills || 0,
    ownedCharacters: acc.ownedCharacters || ["warrior"],
    selectedCharacter: acc.selectedCharacter || "warrior"
  };
  if (acc.sessionToken) {
    localStorage.setItem("sessionToken", acc.sessionToken);
  }
  renderAccount();
  renderMarket();
  renderCharacterSelect();

  if (account && account.username) {
    authForms.classList.add("hidden");
    accountInfo.classList.remove("hidden");
    document.getElementById("marketBtn").classList.remove("hidden");
    document.getElementById("side").classList.remove("hidden");
    document.getElementById("characterSelect").classList.remove("hidden");
  }
});

socket.on("leaderboard", (data) => {
  renderLeaderboard(data);
});

socket.on("forceLogout", (message) => {
  alert(message || "Hesabınız başka bir yerde açıldı.");
  localStorage.removeItem("sessionToken");
  account = null;
  authForms.classList.remove("hidden");
  accountInfo.classList.add("hidden");
  document.getElementById("marketBtn").classList.add("hidden");
  document.getElementById("side").classList.add("hidden");
  document.getElementById("characterSelect").classList.add("hidden");
  location.reload();
});

// UI render
function renderAccount() {
  if (!account) return;
  accName.innerText = account.username;
  accBalance.innerText = `${account.balance} ₺`;
  if (marketBalanceDiv) marketBalanceDiv.innerText = `Bakiye: ${account.balance} ₺`;
}

function renderMarket() {
  if (!account || !marketItemsDiv) return;
  marketItemsDiv.innerHTML = "";
  
  for (const k of Object.keys(characterCatalog)) {
    const char = characterCatalog[k];
    const owned = account.ownedCharacters.includes(k);
    
    const div = document.createElement("div");
    div.className = "market-item";
    
    const left = document.createElement("div");
    left.innerHTML = `<strong>${char.name}</strong><div style="font-size:12px">HP: ${char.hp} | Hasar: ${char.damage}</div><div style="font-size:11px;color:#aaa">${char.desc}</div>`;
    
    const right = document.createElement("div");
    
    if (owned) {
      const ownedLabel = document.createElement("span");
      ownedLabel.textContent = "✓ Sahip";
      ownedLabel.style.color = "#4CAF50";
      ownedLabel.style.fontWeight = "bold";
      right.appendChild(ownedLabel);
      
      const selectBtn = document.createElement("button");
      selectBtn.textContent = account.selectedCharacter === k ? "Seçili" : "Seç";
      selectBtn.disabled = account.selectedCharacter === k;
      selectBtn.onclick = () => selectCharacter(k);
      right.appendChild(selectBtn);
    } else {
      const priceLabel = document.createElement("span");
      priceLabel.textContent = char.price === 0 ? "Bedava" : `${char.price} ₺`;
      priceLabel.style.marginRight = "8px";
      right.appendChild(priceLabel);
      
      const buyBtn = document.createElement("button");
      buyBtn.textContent = "Satın Al";
      buyBtn.onclick = () => buyCharacter(k);
      right.appendChild(buyBtn);
    }
    
    div.appendChild(left);
    div.appendChild(right);
    marketItemsDiv.appendChild(div);
  }
  
  if (marketBalanceDiv) marketBalanceDiv.innerText = `Bakiye: ${account.balance} ₺`;
}

function renderCharacterSelect() {
  if (!account || !characterListDiv) return;
  characterListDiv.innerHTML = "";
  
  const selected = account.selectedCharacter || "warrior";
  const char = characterCatalog[selected];
  
  characterListDiv.innerHTML = `
    <div style="text-align:center">
      <strong>${char.name}</strong><br>
      HP: ${char.hp} | Hasar: ${char.damage}
    </div>
  `;
}

function renderRoster() {
  if (!rosterList) return;
  rosterList.innerHTML = "";
  
  const joined = Object.values(players).slice().sort((a,b)=> a.name.localeCompare(b.name));
  const joinedUsernames = new Set(joined.map(p => p.account));

  for (const p of joined) {
    const li = document.createElement("div");
    li.className = "roster-item";
    
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = p.color;
    
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = `${p.name} (${characterCatalog[p.character].name})`;
    
    left.appendChild(dot);
    left.appendChild(name);

    const rightText = document.createElement("div");
    rightText.innerHTML = `<span class="roster-hp">HP: ${p.hp}</span>`;
    if (p.character === "barbarian") {
      rightText.innerHTML += `<span class="roster-spike"> 🛡️${p.shieldHP}</span>`;
    }
    
    li.appendChild(left);
    li.appendChild(rightText);
    rosterList.appendChild(li);
  }

  const notJoined = onlineUsers.filter(u => !joinedUsernames.has(u)).sort((a,b)=> a.localeCompare(b));
  for (const username of notJoined) {
    const li = document.createElement("div");
    li.className = "roster-item";
    
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = "#888";
    
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = username + " (hazır)";
    
    left.appendChild(dot);
    left.appendChild(name);

    const rightText = document.createElement("div");
    rightText.innerHTML = `<span class="roster-hp">—</span>`;
    
    li.appendChild(left);
    li.appendChild(rightText);
    rosterList.appendChild(li);
  }
}

function renderLeaderboard(list) {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = "";
  
  for (const entry of list) {
    const li = document.createElement("div");
    li.className = "roster-item";
    
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = entry.username;
    left.appendChild(name);

    const right = document.createElement("div");
    right.innerHTML = `Wins: ${entry.wins} • Kills: ${entry.kills}`;
    
    li.appendChild(left);
    li.appendChild(right);
    leaderboardList.appendChild(li);
  }
}

// Oyun çizimi - SVG stilinde modern ekipmanlar
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let id in players) {
    const p = players[id];
    
    // Ekipmanları çiz - MODERNİZE EDİLMİŞ GÖRSEL
    const angle = p.equipmentAngle || 0;
    const distance = 20 + 18;
    
    if (p.character === "warrior") {
      // KILIÇ - Detaylı ve modern
      const swordX = p.x + Math.cos(angle) * distance;
      const swordY = p.y + Math.sin(angle) * distance;
      
      ctx.save();
      ctx.translate(swordX, swordY);
      
      // Gölge efekti
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      // Kılıç sapı (kahverengi)
      ctx.fillStyle = "#8B4513";
      ctx.fillRect(-4, 8, 8, 12);
      
      // Kılıç koruyucusu (altın)
      ctx.fillStyle = "#FFD700";
      ctx.fillRect(-10, 6, 20, 3);
      
      // Kılıç bıçağı (parlak gri gradyan)
      const gradient = ctx.createLinearGradient(-5, -15, 5, -15);
      gradient.addColorStop(0, "#B0B0B0");
      gradient.addColorStop(0.5, "#FFFFFF");
      gradient.addColorStop(1, "#B0B0B0");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-5, 6);
      ctx.lineTo(5, 6);
      ctx.closePath();
      ctx.fill();
      
      // Bıçak kenar parlaklığı
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.restore();
      
    } else if (p.character === "barbarian") {
      // BALTA - Detaylı ve güçlü
      const axeX = p.x + Math.cos(angle) * distance;
      const axeY = p.y + Math.sin(angle) * distance;
      
      ctx.save();
      ctx.translate(axeX, axeY);
      
      // Gölge
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      // Balta sapı (koyu kahverengi)
      ctx.fillStyle = "#654321";
      ctx.fillRect(-3, -8, 6, 26);
      
      // Balta başı (metal gradyan)
      const axeGradient = ctx.createRadialGradient(0, -12, 0, 0, -12, 12);
      axeGradient.addColorStop(0, "#E0E0E0");
      axeGradient.addColorStop(0.5, "#A0A0A0");
      axeGradient.addColorStop(1, "#606060");
      ctx.fillStyle = axeGradient;
      
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(-12, -10);
      ctx.lineTo(-10, -6);
      ctx.lineTo(0, -8);
      ctx.lineTo(10, -6);
      ctx.lineTo(12, -10);
      ctx.closePath();
      ctx.fill();
      
      // Metal kenar
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.restore();
      
      // KALKAN - 3D efektli
      if (p.shieldHP > 0) {
        const shieldAngle = angle + Math.PI;
        const shieldX = p.x + Math.cos(shieldAngle) * distance;
        const shieldY = p.y + Math.sin(shieldAngle) * distance;
        
        ctx.save();
        ctx.translate(shieldX, shieldY);
        
        // Gölge
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 5;
        
        // Kalkan - gradyan ile 3D efekt
        const shieldGradient = ctx.createRadialGradient(-3, -3, 2, 0, 0, 16);
        shieldGradient.addColorStop(0, "#6495ED");
        shieldGradient.addColorStop(0.5, "#4169E1");
        shieldGradient.addColorStop(1, "#1E3A8A");
        
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fillStyle = shieldGradient;
        ctx.fill();
        
        // Altın çerçeve (kalın)
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // İç daire (detay)
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Haç deseni
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.stroke();
        
        ctx.restore();
      }
    }
    
    // Oyuncu topu - gradyan ile 3D
    ctx.save();
    const playerGradient = ctx.createRadialGradient(p.x - 5, p.y - 5, 2, p.x, p.y, 22);
    playerGradient.addColorStop(0, lightenColor(p.color, 40));
    playerGradient.addColorStop(1, p.color);
    
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = playerGradient;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // İsim ve HP
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "white";
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${p.name}`, p.x, p.y - 28);
    ctx.font = "12px Arial";
    ctx.fillStyle = p.hp > 100 ? "#4CAF50" : p.hp > 50 ? "#FFA500" : "#FF0000";
    ctx.fillText(`HP: ${p.hp}`, p.x, p.y - 14);
  }

  requestAnimationFrame(draw);
}

// Renk açma fonksiyonu (3D efekt için)
function lightenColor(color, percent) {
  const num = parseInt(color.replace("#",""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
    (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
    .toString(16).slice(1);
}

draw();
