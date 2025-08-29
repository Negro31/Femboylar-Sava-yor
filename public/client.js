const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
let playerId = null;
let players = {};
let items = [];

function joinGame() {
  const name = document.getElementById("name").value;
  if (!name) return alert("İsim girin!");
  socket.emit("join", name, (success) => {
    if (!success) alert("Oyun zaten başladı!");
  });
}

socket.on("init", (id) => {
  playerId = id;
});

socket.on("updatePlayers", (data) => {
  players = data;
  renderRoster(data); // alttaki listeyi güncelle
});

socket.on("updateItems", (data) => {
  items = data;
});

socket.on("waiting", (msg) => {
  document.getElementById("status").innerText = msg;
});

socket.on("countdown", (time) => {
  document.getElementById("status").innerText = "Oyun " + time + " saniye içinde başlıyor!";
});

socket.on("gameStart", () => {
  document.getElementById("status").innerText = "Oyun başladı!";
});

socket.on("winner", (name) => {
  document.getElementById("status").innerText = "Kazanan: " + name;
});

// Oyuncu listesi (canvas altında)
function renderRoster(playersObj) {
  const list = document.getElementById("rosterList");
  if (!list) return;

  list.innerHTML = "";
  const entries = Object.values(playersObj);

  // sırayı sabit tutsun diye isme göre
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const p of entries) {
    const li = document.createElement("div");
    li.className = "roster-item";

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = p.color;

    const name = document.createElement("span");
    name.className = "roster-name";
    name.textContent = p.name;

    const hp = document.createElement("span");
    hp.className = "roster-hp";
    hp.textContent = `HP: ${p.hp}`;

    const spike = document.createElement("span");
    spike.className = "roster-spike";
    spike.textContent = p.hasSpike ? "🗡️" : "—";
    spike.title = p.hasSpike ? "Saldırı eşyası var" : "Saldırı eşyası yok";

    li.appendChild(dot);
    li.appendChild(name);
    li.appendChild(hp);
    li.appendChild(spike);
    list.appendChild(li);
  }
}

// Oyun ekranı çizim
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Eşyalar
  for (let item of items) {
    ctx.fillStyle = item.type === "attack" ? "red" : "green";
    ctx.fillRect(item.x - 7.5, item.y - 7.5, 15, 15);
  }

  // Oyuncular
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (let id in players) {
    const p = players[id];

    // gölge/kenar için
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    ctx.fillStyle = "white";
    const spikeTxt = p.hasSpike ? "🗡️" : "";
    ctx.fillText(`${p.name} (HP:${p.hp}) ${spikeTxt}`, p.x, p.y - 20);
  }

  requestAnimationFrame(draw);
}
draw();
