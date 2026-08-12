const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 60000 });

const rooms = new Map();
const ROOM_LIFETIME = 60 * 60 * 1000; // 1 hour

const CATEGORIES = [
  "Place", "Animal", "Food", "Name", "Job", "Thing", "Brand",
  "Sport", "Country", "City", "Fruit", "Vegetable", "Drink",
  "Vehicle", "Clothing", "Body Part", "School Subject", "Technology",
  "Movie", "Song", "Celebrity", "Game", "Company", "App", "Color",
  "Instrument", "Profession", "Household Item", "Nature", "Superhero"
];

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function makeCode() {
  let code;
  do code = "SG" + Math.floor(1000 + Math.random() * 9000);
  while (rooms.has(code));
  return code;
}

function pickLetter() {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function cleanName(name, fallback) {
  return String(name || fallback).trim().slice(0, 25) || fallback;
}

function snapshot(room) {
  return {
    code: room.code,
    category: room.category,
    state: room.state,
    round: room.round,
    letter: room.letter,
    time: room.time,
    hostOnline: Boolean(room.hostSocket),
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      score: p.score
    })),
    submissions: room.submissions.map(s => ({
      id: s.id,
      playerId: s.playerId,
      playerName: s.playerName,
      answer: s.answer,
      order: s.order
    }))
  };
}

function broadcast(room) {
  io.to(room.code).emit("room", snapshot(room));
}

function stopTimer(room) {
  if (room.timer) clearInterval(room.timer);
  room.timer = null;
}

function startTimer(room) {
  stopTimer(room);
  room.time = 45;

  room.timer = setInterval(() => {
    room.time -= 1;
    io.to(room.code).emit("time", room.time);

    if (room.time <= 0) {
      stopTimer(room);
      room.state = "result";
      io.to(room.code).emit("roundResult", {
        winner: null,
        answer: null,
        message: "Time is up!"
      });
      broadcast(room);
    }
  }, 1000);
}

function expireRoom(room) {
  clearTimeout(room.expiry);
  room.expiry = setTimeout(() => {
    if (rooms.get(room.code) === room && !room.hostSocket) {
      stopTimer(room);
      rooms.delete(room.code);
      io.to(room.code).emit("roomExpired");
    }
  }, ROOM_LIFETIME);
}

io.on("connection", socket => {

  // HOST creates the room. Host is NOT added to players.
  socket.on("host:create", ({ name, category }, done) => {
    const room = {
      code: makeCode(),
      hostName: cleanName(name, "HOST"),
      hostSocket: socket.id,
      category: CATEGORIES.includes(category) ? category : "Place",
      state: "lobby",
      round: 0,
      letter: "",
      time: 0,
      timer: null,
      submissions: [],
      submissionCounter: 0,
      players: new Map(),
      expiry: null
    };

    rooms.set(room.code, room);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.role = "host";

    done({ ok: true, code: room.code, categories: CATEGORIES });
    broadcast(room);
  });

  // PLAYER joins using the host's current room code.
  socket.on("player:join", ({ name, code }, done) => {
    const room = rooms.get(String(code || "").trim().toUpperCase());

    if (!room) {
      return done({
        ok: false,
        error: "Room not found. Check the code with the host."
      });
    }

    if (!room.hostSocket) {
      return done({
        ok: false,
        error: "The host is currently disconnected. Ask the host to reconnect."
      });
    }

    if (room.state !== "lobby") {
      return done({
        ok: false,
        error: "This game has already started."
      });
    }

    const player = {
      id: socket.id,
      name: cleanName(name, "Player"),
      score: 0
    };

    room.players.set(socket.id, player);
    socket.join(room.code);
    socket.data.room = room.code;
    socket.data.role = "player";

    done({ ok: true, code: room.code });
    broadcast(room);
  });

  // HOST starts a round.
  socket.on("host:start", ({ category }, done) => {
    const room = rooms.get(socket.data.room);

    if (!room || room.hostSocket !== socket.id) {
      return done?.({ ok: false, error: "Host permission required." });
    }

    if (room.players.size === 0) {
      return done?.({ ok: false, error: "Wait for at least one player to join." });
    }

    if (CATEGORIES.includes(category)) room.category = category;

    room.state = "playing";
    room.round += 1;
    room.letter = pickLetter();
    room.submissions = [];
    room.submissionCounter = 0;

    startTimer(room);
    broadcast(room);
    done?.({ ok: true });
  });

  // PLAYER submits an answer. Host decides if it is correct.
  socket.on("player:submit", ({ answer }, done) => {
    const room = rooms.get(socket.data.room);

    if (!room || socket.data.role !== "player") {
      return done?.({ ok: false, error: "Player session not found." });
    }

    if (room.state !== "playing") {
      return done?.({ ok: false, error: "The round is not active." });
    }

    const player = room.players.get(socket.id);
    if (!player) return done?.({ ok: false, error: "You are not in this room." });

    const cleanAnswer = String(answer || "").trim().slice(0, 60);
    if (!cleanAnswer) return done?.({ ok: false, error: "Enter an answer." });

    if (!cleanAnswer.toLowerCase().startsWith(room.letter.toLowerCase())) {
      return done?.({
        ok: false,
        error: `Your answer must start with ${room.letter}.`
      });
    }

    room.submissionCounter += 1;
    const submission = {
      id: `${socket.id}-${Date.now()}-${room.submissionCounter}`,
      playerId: socket.id,
      playerName: player.name,
      answer: cleanAnswer,
      order: room.submissionCounter
    };

    room.submissions.push(submission);

    // Host gets the submission immediately, preserving first-answer order.
    io.to(room.code).emit("submission", submission);
    broadcast(room);

    done?.({ ok: true, order: submission.order });
  });

  // HOST marks a submission correct.
  socket.on("host:correct", ({ submissionId }, done) => {
    const room = rooms.get(socket.data.room);

    if (!room || room.hostSocket !== socket.id) {
      return done?.({ ok: false, error: "Host permission required." });
    }

    if (room.state !== "playing") {
      return done?.({ ok: false, error: "The round is not active." });
    }

    const submission = room.submissions.find(s => s.id === submissionId);
    if (!submission) {
      return done?.({ ok: false, error: "Submission not found." });
    }

    const player = room.players.get(submission.playerId);
    if (!player) return done?.({ ok: false, error: "Player not found." });

    stopTimer(room);
    room.state = "result";
    player.score += 1;

    io.to(room.code).emit("roundResult", {
      winner: player.name,
      answer: submission.answer,
      score: player.score,
      order: submission.order
    });

    broadcast(room);
    done?.({ ok: true });
  });

  socket.on("host:next", done => {
    const room = rooms.get(socket.data.room);

    if (!room || room.hostSocket !== socket.id) {
      return done?.({ ok: false, error: "Host permission required." });
    }

    if (room.state !== "result") {
      return done?.({ ok: false, error: "Finish the current round first." });
    }

    room.state = "playing";
    room.round += 1;
    room.letter = pickLetter();
    room.submissions = [];
    room.submissionCounter = 0;

    startTimer(room);
    broadcast(room);
    done?.({ ok: true });
  });

  socket.on("host:category", ({ category }, done) => {
    const room = rooms.get(socket.data.room);

    if (!room || room.hostSocket !== socket.id) {
      return done?.({ ok: false });
    }

    if (room.state !== "lobby") {
      return done?.({ ok: false, error: "Category can only be changed in the lobby." });
    }

    if (!CATEGORIES.includes(category)) {
      return done?.({ ok: false, error: "Invalid category." });
    }

    room.category = category;
    broadcast(room);
    done?.({ ok: true });
  });

  socket.on("host:end", () => {
    const room = rooms.get(socket.data.room);

    if (!room || room.hostSocket !== socket.id) return;

    stopTimer(room);
    io.to(room.code).emit("gameEnded");
    rooms.delete(room.code);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;

    if (socket.data.role === "host" && room.hostSocket === socket.id) {
      room.hostSocket = null;
      stopTimer(room);
      broadcast(room);
      expireRoom(room);
    }

    if (socket.data.role === "player") {
      room.players.delete(socket.id);
      broadcast(room);
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "ALPHABET TRAIN V4",
    rooms: rooms.size
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ALPHABET TRAIN V4 running on port ${PORT}`);
});
