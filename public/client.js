const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Telefon uyumlu boyut
canvas.width = window.innerWidth * 0.9;
canvas.height = window.innerHeight * 0.7;
window.addEventListener("resize", () => {
  canvas.width = window.innerWidth * 0.9;
  canvas.height = window.innerHeight * 0.7;
});

let playerId = null;
let players = {};
let items = [];
let gameStarted = false;
let countdown = null;
let winnerName = null;

// Oyuna katılma
function joinGame() {
  const name = document.getElementById("playerName").value;
  if (name) {
    socket.emit("join", name);
  }
}

// Mesaj göster
socket.on("message", (msg) => {
  document.getElementById("message").innerText = msg;
});

// Sunucudan oyuncu bilgisi al
socket.on("init", (id) => {
  playerId = id;
  document.getElementById("menu").style.display = "none";
});

socket.on("updatePlayers", (data) => {
  players = data;
});

socket.on("updateItems", (data) => {
  items = data;
});

socket.on("countdown", (time) => {
  countdown = time;
});

socket.on("gameStart", () => {
  gameStarted = true;
});

socket.on("gameOver", (winner) => {
  winnerName = winner;
  setTimeout(() => {
    location.reload(); // 5 saniye sonra oyun sıfırlanır
  }, 5000);
});

// Çizim fonksiyonu
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Geri sayım
  if (!gameStarted && countdown !== null) {
    ctx.fillStyle = "yellow";
    ctx.font = "30px Arial";
    ctx.fillText("Başlangıç: " + countdown, canvas.width / 2 - 80, canvas.height / 2);
  }

  // Oyuncuları çiz
  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 30, 30);

    // Saldırı gücü varsa diken efekti
    if (p.hasAttack) {
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 5, p.y - 5, 40, 40);
    }

    ctx.fillStyle = "white";
    ctx.fillText(p.name + " (" + p.hp + ")", p.x, p.y - 5);
  }

  // Eşyaları çiz
  for (let item of items) {
    if (item.type === "attack") {
      ctx.fillStyle = "red";
    } else {
      ctx.fillStyle = "green";
    }
    ctx.beginPath();
    ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kazananı göster
  if (winnerName) {
    ctx.fillStyle = "cyan";
    ctx.font = "40px Arial";
    ctx.fillText("Kazanan: " + winnerName, canvas.width / 2 - 100, canvas.height / 2);
  }

  requestAnimationFrame(draw);
}
draw();
