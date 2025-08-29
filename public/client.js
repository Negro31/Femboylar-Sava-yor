const socket = io();
let canvas = document.getElementById("game");
let ctx = canvas.getContext("2d");

let myId = null;

function joinGame() {
  const name = document.getElementById("name").value.trim();
  if (name.length > 0) {
    socket.emit("newPlayer", name);
    document.getElementById("status").innerText = "Oyuna katıldın!";
  }
}

document.addEventListener("keydown", (e) => {
  socket.emit("keyPress", { key: e.key, state: true });
});
document.addEventListener("keyup", (e) => {
  socket.emit("keyPress", { key: e.key, state: false });
});

socket.on("state", (game) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Eşyalar
  game.items.forEach(it => {
    ctx.fillStyle = it.type === "heal" ? "lime" : "red";
    ctx.beginPath();
    ctx.arc(it.x, it.y, 10, 0, Math.PI*2);
    ctx.fill();
  });

  // Oyuncular
  let listHtml = "<h3>Oyuncular</h3>";
  for (let id in game.players) {
    let p = game.players[id];
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.fillText(p.name + " (HP:" + p.hp + ")", p.x-20, p.y-20);

    listHtml += `<div style="color:${p.color}">
      ${p.name} | HP:${p.hp} ${p.attack ? "⚔️" : ""}
    </div>`;
  }
  document.getElementById("playersList").innerHTML = listHtml;
});
