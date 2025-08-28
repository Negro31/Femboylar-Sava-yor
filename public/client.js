const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.7;

let playerId = null;
let players = {};
let items = [];
let gameStarted = false;
let winner = null;

// Oyuna katılma
function joinGame() {
  const name = document.getElementById("playerName").value;
  if (name) {
    socket.emit("join", name, (accepted) => {
      if (!accepted) {
        document.getElementById("message").innerText = "Oyun çoktan başladı!";
      } else {
        document.getElementById("menu").style.display = "none";
      }
    });
  }
}

// Sunucudan oyuncu bilgisi al
socket.on("init", (id) => {
  playerId = id;
});

socket.on("updatePlayers", (data) => {
  players = data;
});

socket.on("updateItems", (data) => {
  items = data;
});

socket.on("countdown", (num) => {
  document.getElementById("countdown").innerText = "Oyun " + num + " saniye içinde başlayacak!";
});

socket.on("gameStart", () => {
  gameStarted = true;
  document.getElementById("countdown").innerText = "";
});

socket.on("winner", (name) => {
  winner = name;
  setTimeout(() => {
    winner = null;
    document.getElementById("menu").style.display = "block";
    document.getElementById("message").innerText = "";
  }, 5000);
});

// Çizim fonksiyonu
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Eşyaları çiz
  for (let item of items) {
    ctx.fillStyle = item.type === "attack" ? "red" : "green";
    ctx.beginPath();
    ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Oyuncuları çiz
  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 30, 30);

    if (p.hasSpike) {
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 5, p.y - 5, 40, 40);
    }

    ctx.fillStyle = "white";
    ctx.fillText(p.name + " (" + p.hp + ")", p.x, p.y - 5);
  }

  if (winner) {
    ctx.fillStyle = "yellow";
    ctx.font = "30px Arial";
    ctx.fillText("Kazanan: " + winner, canvas.width / 2 - 100, canvas.height / 2);
  }

  requestAnimationFrame(draw);
}
draw();
