const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let playerName = prompt("İsminizi girin:");
socket.emit("newPlayer", playerName);

socket.on("state", (state) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // itemleri çiz
  state.items.forEach((item) => {
    ctx.fillStyle = item.type === "hp" ? "green" : "red";
    ctx.beginPath();
    ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  // oyuncuları çiz
  for (let id in state.players) {
    let p = state.players[id];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "white";
    ctx.fillText(p.name, p.x - 10, p.y - 25);
  }

  // oyuncu listesi
  let listDiv = document.getElementById("playerList");
  listDiv.innerHTML = "<b>Oyuncular:</b><br>";
  for (let id in state.players) {
    let p = state.players[id];
    listDiv.innerHTML += `
      <div style="color:${p.color}">
        ${p.name} | HP:${p.hp} ${p.hasAtk ? "⚔️" : ""}
      </div>
    `;
  }
});
