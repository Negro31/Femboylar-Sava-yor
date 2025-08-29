// client.js
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let socketPlayerId = null;
let players = {};
let items = [];
let onlineUsers = []; // oturum açmış kullanıcılar
let account = null;   // { username, balance, wins, kills, inventory }

const itemCatalog = {
  extraLife: { key:"extraLife", title:"Bir şans daha!", price:200, desc:"Kullanıldığında 1 can kazanırsın." },
  speedBoost: { key:"speedBoost", title:"Kaaçoovvv", price:400, desc:"3 saniyeliğine yüksek hız artışı." },
  nuke: { key:"nuke", title:"Yok Et!", price:600, desc:"Bütün oyuncuların canını 2 azaltır." }
};

// DOM referanslar
const joinBtn = document.getElementById("joinBtn");
const displayNameInput = document.getElementById("displayName");
const nameInput = document.getElementById("displayName");
const statusDiv = document.getElementById("status");
const rosterList = document.getElementById("rosterList");
const leaderboardList = document.getElementById("leaderboardList");

// Auth DOM
const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");
const btnRegister = document.getElementById("btnRegister");
const btnLogin = document.getElementById("btnLogin");
const authForms = document.getElementById("authForms");
const accountInfo = document.getElementById("accountInfo");
const accName = document.getElementById("accName");
const accBalance = document.getElementById("accBalance");
const logoutBtn = document.getElementById("logoutBtn");

// Market DOM
const marketBtn = document.getElementById("marketBtn");
const marketModal = document.getElementById("marketModal");
const marketContent = document.getElementById("marketContent");
const marketItemsDiv = document.getElementById("marketItems");
const marketBalanceDiv = document.getElementById("marketBalance");
const closeMarketBtn = document.getElementById("closeMarket");

// Event listeners
joinBtn.onclick = () => {
  const name = (displayNameInput.value || "").trim();
  if (!account) return alert("Önce giriş yapın.");
  socket.emit("join", name || account.username, (success, msg) => {
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
      // Başarılı, sunucu 'accountUpdate' event'iyle detay gönderecek
      authForms.classList.add("hidden");
      accountInfo.classList.remove("hidden");
    } else {
      alert("Giriş başarısız: " + (res.msg || ""));
    }
  });
};

logoutBtn.onclick = () => {
  // Basit client-side logout (sunucuya bilgi yok). Yeniden yükle
  location.reload();
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

// Satın al
function buyItem(key) {
  socket.emit("buyItem", key, (res) => {
    if (res.ok) {
      alert("Satın alındı!");
    } else {
      alert("Satın alma başarısız: " + (res.msg||""));
    }
  });
}

// Özellik kullan
function useItem(key) {
  socket.emit("useItem", key, (res) => {
    if (res.ok) {
      alert(res.msg || "Kullanıldı.");
    } else {
      alert("Kullanım başarısız: " + (res.msg||""));
    }
  });
}

// Socket event handlerları
socket.on("init", (id) => {
  socketPlayerId = id;
});

socket.on("updatePlayers", (data) => {
  players = data;
  renderRoster(); // güncelle
});

socket.on("updateItems", (data) => {
  items = data;
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

// Hesap bilgileri
socket.on("accountUpdate", (acc) => {
  account = {
    username: acc.username,
    balance: acc.balance || 0,
    wins: acc.wins || 0,
    kills: acc.kills || 0,
    inventory: acc.inventory || {}
  };
  renderAccount();
  renderMarket();
});

// Liderlik tablosu
socket.on("leaderboard", (data) => {
  renderLeaderboard(data);
});

// UI render fonksiyonları
function renderAccount() {
  if (!account) return;
  accName.innerText = account.username;
  accBalance.innerText = `${account.balance} ₺`;
  marketBalanceDiv.innerText = `Bakiye: ${account.balance} ₺`;
}

function renderMarket() {
  if (!account) return;
  marketItemsDiv.innerHTML = "";
  for (const k of Object.keys(itemCatalog)) {
    const it = itemCatalog[k];
    const div = document.createElement("div");
    div.className = "market-item";
    const left = document.createElement("div");
    left.innerHTML = `<strong>${it.title}</strong><div style="font-size:12px">${it.price} ₺</div>`;
    const right = document.createElement("div");
    const infoBtn = document.createElement("button");
    infoBtn.textContent = "i";
    infoBtn.onclick = () => alert(it.desc);
    const buyBtn = document.createElement("button");
    buyBtn.textContent = "Satın Al";
    buyBtn.onclick = () => buyItem(it.key);
    right.appendChild(infoBtn);
    right.appendChild(buyBtn);

    // Eğer hesaptaki inventory varsa "kullan" butonu göster
    const invCount = account.inventory ? (account.inventory[it.key] || 0) : 0;
    const useBtn = document.createElement("button");
    useBtn.textContent = `Kullan (${invCount})`;
    useBtn.onclick = () => useItem(it.key);
    right.appendChild(useBtn);

    div.appendChild(left);
    div.appendChild(right);
    marketItemsDiv.appendChild(div);
  }
  marketBalanceDiv.innerText = `Bakiye: ${account.balance} ₺`;
}

// Roster: onlineUsers ile players birleşimi. Eğer kullanıcı oyuna katılmışsa oyuncu bilgilerini göster
function renderRoster() {
  rosterList.innerHTML = "";
  // İlk önce oyuncu olanları listele (oyuna katılmış)
  const joined = Object.values(players).slice().sort((a,b)=> a.name.localeCompare(b.name));
  const joinedUsernames = new Set(joined.map(p => p.account));

  // Önce joined göster
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
    name.textContent = `${p.name}${p.account ? " ("+p.account+")": ""}`;
    left.appendChild(dot);
    left.appendChild(name);

    const rightText = document.createElement("div");
    rightText.innerHTML = `<span class="roster-hp">HP: ${p.hp}</span><span class="roster-spike">${p.hasSpike ? "🗡️" : (p.hasShield ? "🛡️" : "—")}</span>`;
    li.appendChild(left);
    li.appendChild(rightText);
    rosterList.appendChild(li);
  }

  // Sonra oturum açmış ama oyuna katılmamışları göster
  const notJoined = onlineUsers.filter(u => !joinedUsernames.has(u)).sort((a,b)=> a.localeCompare(b));
  for (const username of notJoined) {
    const li = document.createElement("div");
    li.className = "roster-item";
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = "#888"; // gri
    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = username + " (hazır)";
    left.appendChild(dot);
    left.appendChild(name);

    const rightText = document.createElement("div");
    rightText.innerHTML = `<span class="roster-hp">—</span><span class="roster-spike">—</span>`;
    li.appendChild(left);
    li.appendChild(rightText);
    rosterList.appendChild(li);
  }
}

function renderLeaderboard(list) {
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
    right.innerHTML = `Wins: ${entry.wins} • Kills: ${entry.kills} • ${entry.balance}₺`;
    li.appendChild(left);
    li.appendChild(right);
    leaderboardList.appendChild(li);
  }
}

// Oyun çizimi
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Eşyalar
  for (let item of items) {
    const size = 15;
    ctx.fillStyle = item.type === "attack" ? "red" : item.type === "health" || item.type === "heal" ? "green" : "blue";
    ctx.fillRect(item.x - size/2, item.y - size/2, size, size);
  }

  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let id in players) {
    const p = players[id];
    // gövde
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    // kalkan varsa beyaz çember
    if (p.hasShield) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "white";
    const spikeTxt = p.hasSpike ? "🗡️" : "";
    ctx.fillText(`${p.name} (HP:${p.hp}) ${spikeTxt}`, p.x, p.y - 20);
  }

  requestAnimationFrame(draw);
}
draw();
