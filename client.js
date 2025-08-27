const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = 600;
canvas.height = 400;

let playerId = null;
let players = {};
let gameStarted = false;

// Oyuna katılma
function joinGame() {
  const name = document.getElementById("playerName").value;
  if (name) {
    socket.emit("join", name);
    document.getElementById("menu").style.display = "none";
  }
}

// Sunucudan oyuncu bilgisi al
socket.on("init", (id) => {
  playerId = id;
});

socket.on("updatePlayers", (data) => {
  players = data;
});

socket.on("gameStart", () => {
  gameStarted = true;
});

// Çizim fonksiyonu
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 30, 30);

    ctx.fillStyle = "white";
    ctx.fillText(p.name + " (" + p.hp + ")", p.x, p.y - 5);
  }

  requestAnimationFrame(draw);
}
draw();