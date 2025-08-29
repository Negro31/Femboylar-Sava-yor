const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let players = {};
let gameInProgress = false;
let countdown = null;
let countdownValue = 0;
let winnerTimeout = null;
let winnerName = null;

function resetGame() {
  gameInProgress = false;
  countdown = null;
  countdownValue = 0;
  winnerName = null;
  io.emit("resetGame");
}

function startCountdown() {
  countdownValue = 10;
  io.emit("countdown", countdownValue);

  countdown = setInterval(() => {
    countdownValue--;
    if (countdownValue > 0) {
      io.emit("countdown", countdownValue);
    } else {
      clearInterval(countdown);
      countdown = null;
      gameInProgress = true;
      io.emit("gameStart");
    }
  }, 1000);
}

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("joinGame", (name) => {
    if (Object.keys(players).length >= 2 || gameInProgress) {
      socket.emit("joinError", "Oyun dolu veya devam ediyor!");
      return;
    }

    players[socket.id] = {
      id: socket.id,
      name: name,
      x: 100 + Object.keys(players).length * 100,
      y: 300,
    };

    io.emit("playersUpdate", players);

    if (Object.keys(players).length === 2) {
      startCountdown();
    } else {
      io.emit("waitingForPlayers");
    }
  });

  socket.on("updatePosition", (pos) => {
    if (players[socket.id]) {
      players[socket.id].x = pos.x;
      players[socket.id].y = pos.y;
      io.emit("playersUpdate", players);
    }
  });

  socket.on("playerEliminated", () => {
    if (!players[socket.id]) return;
    delete players[socket.id];
    io.emit("playersUpdate", players);

    // Son kişi kaldıysa kazananı belirle
    if (Object.keys(players).length === 1 && gameInProgress) {
      const winner = Object.values(players)[0];
      winnerName = winner.name;
      io.emit("winner", winnerName);

      winnerTimeout = setTimeout(() => {
        resetGame();
      }, 5000);
    }
  });

  socket.on("disconnect", () => {
    console.log("Oyuncu ayrıldı:", socket.id);
    if (players[socket.id]) {
      delete players[socket.id];
      io.emit("playersUpdate", players);

      if (Object.keys(players).length < 2 && gameInProgress) {
        // Tek kişi kalmışsa kazanan o
        if (Object.keys(players).length === 1) {
          const winner = Object.values(players)[0];
          winnerName = winner.name;
          io.emit("winner", winnerName);

          winnerTimeout = setTimeout(() => {
            resetGame();
          }, 5000);
        } else {
          resetGame();
        }
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Sunucu çalışıyor: http://localhost:3000");
});
