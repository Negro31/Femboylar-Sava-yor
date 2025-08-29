const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let localPlayer = null;
let players = {};
let gameStarted = false;
let countdown = null;
let winnerOverlay = document.getElementById("winnerOverlay");

document.getElementById("joinBtn").addEventListener("click", () => {
  const name = document.getElementById("nameInput").value.trim();
  if (name) {
    socket.emit("joinGame", name);
  }
});

socket.on("joinError", (msg) => {
  alert(msg);
});

socket.on("playersUpdate", (serverPlayers) => {
  players = serverPlayers;
});

socket.on("waitingForPlayers", () => {
  document.getElementById("status").innerText = "Oyunun başlamasına son 1 kişi!";
});

socket.on("countdown", (time) => {
  document.getElementById("status").innerText = `Oyun ${time} saniye içinde başlayacak!`;
});

socket.on("gameStart", () => {
  document.getElementById("status").innerText = "";
  gameStarted = true;
});

socket.on("resetGame", () => {
  gameStarted = false;
  winnerOverlay.innerText = "";
  document.getElementById("status").innerText = "Oyunun başlamasına son 1 kişi!";
});

socket.on("winner", (name) => {
  winnerOverlay.innerText = `KAZANAN: ${name}`;
  winnerOverlay.style.display = "block";
  setTimeout(() => {
    winnerOverlay.style.display = "none";
  }, 5000);
});

// Oyuncu girişini göster
socket.on("connect", () => {
  document.getElementById("login").style.display = "block";
  document.getElementById("gameUI").style.display = "block";
});

// Oyuncu hareketi (ok tuşları)
document.addEventListener("keydown", (e) => {
  if (!gameStarted || !players[socket.id]) return;
  const speed = 10;
  let player = players[socket.id];

  if (e.key === "ArrowLeft") player.x -= speed;
  if (e.key === "ArrowRight") player.x += speed;
  if (e.key === "ArrowUp") player.y -= speed;
  if (e.key === "ArrowDown") player.y += speed;

  socket.emit("updatePosition", { x: player.x, y: player.y });
});

// Çizim
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Platform
  ctx.fillStyle = "#333";
  ctx.fillRect(0, 400, canvas.width, 100);

  // Oyuncular
  for (let id in players) {
    let p = players[id];
    ctx.fillStyle = "blue";
    ctx.fillRect(p.x, p.y, 40, 40);
    ctx.fillStyle = "white";
    ctx.fillText(p.name, p.x, p.y - 5);
  }

  requestAnimationFrame(draw);
}
draw();
