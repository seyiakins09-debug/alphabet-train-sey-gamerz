const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();

const categories = {
  Place:["abuja","accra","amsterdam","athens","berlin","cairo","canada","dubai","egypt","france","ghana","india","japan","kenya","lagos","london","madrid","nigeria","paris","qatar","rome","spain","tokyo","uganda","zambia"],
  Animal:["ant","antelope","bear","cat","dog","eagle","elephant","fox","goat","horse","lion","monkey","ostrich","panda","rabbit","snake","tiger","whale","zebra"],
  Food:["apple","banana","bread","cake","carrot","donut","egg","fish","garri","hamburger","icecream","jollof","kiwi","mango","noodles","orange","pizza","rice","yam"],
  Name:["alice","amina","ben","brian","chinedu","david","emeka","fatima","grace","henry","ibrahim","james","kelvin","linda","michael","nancy","oliver","paul","queen","ruth","samuel","victor","wendy"],
  Job:["accountant","baker","carpenter","doctor","engineer","farmer","guard","hairdresser","journalist","lawyer","mechanic","nurse","pilot","plumber","receptionist","teacher","waiter"],
  Thing:["anchor","bag","chair","drum","envelope","fan","guitar","hammer","iron","jug","key","lamp","mirror","notebook","phone","radio","shoe","table","umbrella","vase"],
  Brand:["adidas","apple","benz","coca-cola","dell","ebay","facebook","google","honda","intel","jeep","kia","lego","microsoft","nike","oppo","pepsi","samsung","toyota"]
};

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function code() {
  let c;
  do c = "SG" + Math.floor(1000 + Math.random() * 9000);
  while (rooms.has(c));
  return c;
}
function letter() { return letters[Math.floor(Math.random() * letters.length)]; }
function publicRoom(room) {
  return {
    code: room.code,
    host: room.host,
    state: room.state,
    category: room.category,
    round: room.round,
    letter: room.letter,
    timeLeft: room.timeLeft,
    players: [...room.players.values()].map(p => ({id:p.id, name:p.name, score:p.score}))
  };
}
function broadcast(room) { io.to(room.code).emit("room:update", publicRoom(room)); }

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

io.on("connection", socket => {
  socket.on("createRoom", ({name, category}, cb) => {
    const roomCode = code();
    const room = {
      code: roomCode, host: socket.id, category: category || "Place",
      state:"lobby", round:0, letter:"", timeLeft:45, timer:null,
      players:new Map()
    };
    room.players.set(socket.id, {id:socket.id, name:(name||"Host").trim().slice(0,25), score:0});
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.room = roomCode;
    cb({ok:true, room:publicRoom(room)});
    broadcast(room);
  });

  socket.on("joinRoom", ({name, roomCode}, cb) => {
    const room = rooms.get((roomCode||"").trim().toUpperCase());
    if (!room) return cb({ok:false, error:"Room not found."});
    if (room.state !== "lobby") return cb({ok:false, error:"This game has already started."});
    const playerName = (name||"Player").trim().slice(0,25) || "Player";
    room.players.set(socket.id, {id:socket.id, name:playerName, score:0});
    socket.join(room.code);
    socket.data.room = room.code;
    cb({ok:true, room:publicRoom(room)});
    broadcast(room);
  });

  socket.on("startGame", cb => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id) return;
    room.state = "playing"; room.round = 1; room.letter = letter(); room.timeLeft = 45;
    startTimer(room); broadcast(room); if(cb) cb({ok:true});
  });

  socket.on("submitAnswer", ({answer}, cb) => {
    const room = rooms.get(socket.data.room);
    if (!room || room.state !== "playing") return cb?.({ok:false,error:"Round is not active."});
    const player = room.players.get(socket.id);
    if (!player) return;
    const clean = String(answer||"").trim().toLowerCase();
    const valid = clean.startsWith(room.letter.toLowerCase()) &&
      (categories[room.category] || []).includes(clean);
    if (!valid) return cb?.({ok:false,correct:false,error:"Incorrect answer."});
    clearInterval(room.timer); room.timer=null; room.state="result";
    player.score++;
    io.to(room.code).emit("winner", {name:player.name, answer:clean.toUpperCase(), score:player.score});
    broadcast(room);
    cb?.({ok:true,correct:true});
  });

  socket.on("nextRound", () => {
    const room = rooms.get(socket.data.room);
    if (!room || room.host !== socket.id) return;
    room.state="playing"; room.round++; room.letter=letter(); room.timeLeft=45;
    startTimer(room); broadcast(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.host === socket.id) {
      clearInterval(room.timer);
      io.to(room.code).emit("closed");
      rooms.delete(room.code);
    } else broadcast(room);
  });
});

function startTimer(room) {
  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(room.code).emit("timer", room.timeLeft);
    if (room.timeLeft <= 0) {
      clearInterval(room.timer); room.timer=null; room.state="result";
      io.to(room.code).emit("winner", {name:null, answer:null});
      broadcast(room);
    }
  },1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Alphabet Train running on port ${PORT}`));
