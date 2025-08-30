// client.js
const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let socketPlayerId = null;
let players = {};
let items = [];
let onlineUsers = [];
let account = null;

const itemCatalog = {
  extraLife: { key:"extraLife", title:"Bir şans daha!", price:200, desc:"Kullanıldığında 1 can kazanırsın." },
  speedBoost: { key:"speedBoost", title:"Kaaçoovvv", price:400, desc:"3 saniyeliğine yüksek hız artışı." },
  nuke: { key:"nuke", title:"Yok Et!", price:600, desc:"Bütün oyuncuların canını 2 azaltır." }
};

// DOM
const joinBtn = document.getElementById("joinBtn");
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
const marketItemsDiv = document.getElementById("marketItems");
const marketBalanceDiv = document.getElementById("marketBalance");
const closeMarketBtn = document.getElementById("closeMarket");

// Login/Register
btnRegister.onclick = () => {
  const u = authUser.value.trim();
  const p = authPass.value;
  if (!u || !p) return alert("Kullanıcı adı ve şifre girin.");
  socket.emit("register", { username: u, password: p }, (res) => {
    if (res.ok) alert("Kayıt başarılı. Giriş yapabilirsiniz.");
    else alert("Kayıt başarısız: " + (res.msg||""));
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
      document.getElementById("topBar").classList.remove("hidden");
      document.getElementById("gameCanvas").classList.remove("hidden");
      document.getElementById("side").classList.remove("hidden");
      marketBtn.classList.remove("hidden");
    } else {
      alert("Giriş başarısız: " + (res.msg || ""));
    }
  });
};

logoutBtn.onclick = () => location.reload();

// Oyuna katıl
joinBtn.onclick = () => {
  if (!account) return alert("Önce giriş yapın.");
  socket.emit("join", account.username, (success, msg) => {
    if (!success) alert(msg || "Katılamadı.");
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

// Satın alma
function buyItem(key) {
  socket.emit("buyItem", key, (res) => {
    if (res.ok) alert("Satın alındı!");
    else alert("Satın alma başarısız: " + (res.msg||""));
  });
}
function useItem(key) {
  socket.emit("useItem", key, (res) => {
    if (res.ok) alert(res.msg || "Kullanıldı.");
    else alert("Kullanım başarısız: " + (res.msg||""));
  });
}

// Socket events
socket.on("init", (id) => socketPlayerId = id);
socket.on("updatePlayers", (data) => { players = data; renderRoster(); });
socket.on("updateItems", (data) => { items = data; });
socket.on("updateOnlineUsers", (list) => { onlineUsers = list||[]; renderRoster(); });
socket.on("waiting", (msg) => statusDiv.innerText = msg);
socket.on("countdown", (t) => statusDiv.innerText = "Oyun " + t + " saniye içinde başlıyor!");
socket.on("gameStart", () => statusDiv.innerText = "Oyun başladı!");
socket.on("winner", (name) => statusDiv.innerText = "Kazanan: " + name);

socket.on("accountUpdate", (acc) => {
  account = { username: acc.username, balance: acc.balance||0, wins: acc.wins||0, kills: acc.kills||0, inventory: acc.inventory||{} };
  renderAccount();
  renderMarket();
});
socket.on("leaderboard", (data) => renderLeaderboard(data));

// Render
function renderAccount() {
  if (!account) return;
  accName.innerText = account.username;
  accBalance.innerText = "💰 " + account.balance;
}
function renderMarket() {
  if (!account) return;
  marketBalanceDiv.innerText = "Bakiye: 💰 " + account.balance;
  marketItemsDiv.innerHTML = "";
  Object.values(itemCatalog).forEach(item => {
    const div = document.createElement("div");
    div.className = "market-item";
    div.innerHTML = `
      <div>
        <strong>${item.title}</strong><br><small>${item.desc}</small>
      </div>
      <div>
        <button onclick="buyItem('${item.key}')">Satın Al (${item.price})</button>
        <button onclick="useItem('${item.key}')">Kullan (${account.inventory[item.key]||0})</button>
      </div>`;
    marketItemsDiv.appendChild(div);
  });
}
function renderLeaderboard(data) {
  leaderboardList.innerHTML = "";
  data.forEach(u => {
    const div = document.createElement("div");
    div.className = "roster-item";
    div.innerText = `${u.username} - 🏆 ${u.wins} - 💀 ${u.kills}`;
    leaderboardList.appendChild(div);
  });
}
function renderRoster() {
  rosterList.innerHTML = "";
  Object.values(players).forEach(p => {
    const div = document.createElement("div");
    div.className = "roster-item";
    div.innerHTML = `<span style="color:${p.color}">●</span> ${p.name} (❤️${p.hp})`;
    rosterList.appendChild(div);
  });
}
