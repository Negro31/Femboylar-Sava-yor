const socket = io();
let canvas = document.getElementById("gameCanvas");
let ctx = canvas.getContext("2d");

let countdown = null;
let winnerName = null;

// İsim girme
document.getElementById("startBtn").onclick = () => {
  let name = document.getElementById("nameInput").value.trim();
  if (name) {
    socket.emit("newPlayer", name);
    document.getElementById("login").style.display = "none";
  }
};

socket.on("state", (state) => {
  draw(state);
  updatePlayerList(state.players);
  if (state.winnerName) winnerName = state.winnerName;
});

socket.on("countdown", (num) => {
  countdown = num;
});

socket.on("winner", (name) => {
  winnerName = name;
});

// Çizim
function draw(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Oyuncular
  for (let id in state.players) {
    let p = state.players[id];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "black";
    ctx.fillText(p.name, p.x - 10, p.y - 20);
    ctx.fillText("HP:" + p.hp, p.x - 10, p.y + 30);
  }

  // Eşyalar
  state.items.forEach((it) => {
    ctx.fillStyle = it.type === "hp" ? "pink" : "gray";
    ctx.fillRect(it.x, it.y, it.size, it.size);
  });

  // Countdown
  if (countdown !== null && countdown > 0) {
    ctx.fillStyle = "black";
    ctx.font = "40px Arial";
    ctx.fillText(countdown, canvas.width / 2 - 10, canvas.height / 2);
  }

  // Winner
  if (winnerName) {
    ctx.fillStyle = "black";
    ctx.font = "40px Arial";
    ctx.fillText(
      "Kazanan: " + winnerName,
      canvas.width / 2 - 100,
      canvas.height / 2
    );
  }
}

// Oyuncu listesi
function updatePlayerList(players) {
  let div = document.getElementById("playerList");
  div.innerHTML = "";
  for (let id in players) {
    let p = players[id];
    div.innerHTML += `
      <div style="color:${p.color}">
        ${p.name} | HP:${p.hp} ${p.hasAtk ? "⚔️" : ""}
      </div>
    `;
  }
}
