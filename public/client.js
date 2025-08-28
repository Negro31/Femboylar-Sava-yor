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

// Oyun ekranı çizim
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Oyuncular
  for (let id in players) {
    let p = players[id];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.fillText(p.name + " (HP:" + p.hp + ")", p.x - 20, p.y - 20);
  }

  // Eşyalar
  for (let item of items) {
    ctx.fillStyle = item.type === "attack" ? "red" : "green";
    ctx.fillRect(item.x, item.y, 15, 15);
  }

  requestAnimationFrame(draw);
}
draw();
