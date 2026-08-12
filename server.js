const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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
const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ";

app.use(express.static("public"));

function makeCode(){
  let c;
  do c="SG"+Math.floor(1000+Math.random()*9000);
  while(rooms.has(c));
  return c;
}
function snapshot(r){
  return {
    code:r.code, state:r.state, hostName:r.hostName, category:r.category,
    round:r.round, letter:r.letter, time:r.time,
    players:[...r.players.values()].map(p=>({id:p.id,name:p.name,score:p.score}))
  };
}
function sendRoom(r){ io.to(r.code).emit("room",snapshot(r)); }

function startTimer(r){
  clearInterval(r.timer);
  r.time=45;
  r.timer=setInterval(()=>{
    r.time--;
    io.to(r.code).emit("time",r.time);
    if(r.time<=0){
      clearInterval(r.timer); r.timer=null; r.state="result";
      io.to(r.code).emit("roundResult",{name:null,answer:null});
      sendRoom(r);
    }
  },1000);
}

io.on("connection", socket=>{
  socket.on("host:create",({name,category},done)=>{
    const code=makeCode();
    const r={code,host:socket.id,hostName:(name||"HOST").trim().slice(0,25)||"HOST",
      category:category||"Place",state:"lobby",round:0,letter:"",time:0,timer:null,players:new Map()};
    r.players.set(socket.id,{id:socket.id,name:r.hostName,score:0,isHost:true});
    rooms.set(code,r); socket.join(code); socket.data.code=code; socket.data.isHost=true;
    done({ok:true,code}); sendRoom(r);
  });

  socket.on("player:join",({name,code},done)=>{
    const key=(code||"").trim().toUpperCase();
    const r=rooms.get(key);
    if(!r) return done({ok:false,error:"Room not found. Ask the host for the current room code."});
    if(r.state!=="lobby") return done({ok:false,error:"This game has already started."});
    const clean=(name||"Player").trim().slice(0,25)||"Player";
    r.players.set(socket.id,{id:socket.id,name:clean,score:0,isHost:false});
    socket.join(key); socket.data.code=key; socket.data.isHost=false;
    done({ok:true}); sendRoom(r);
  });

  socket.on("host:start",done=>{
    const r=rooms.get(socket.data.code);
    if(!r||r.host!==socket.id) return done?.({ok:false});
    r.state="playing"; r.round=1; r.letter=letters[Math.floor(Math.random()*letters.length)];
    startTimer(r); sendRoom(r); done?.({ok:true});
  });

  socket.on("player:answer",({answer},done)=>{
    const r=rooms.get(socket.data.code);
    if(!r||r.state!=="playing") return done?.({ok:false,error:"The round is not active."});
    const p=r.players.get(socket.id);
    const a=String(answer||"").trim().toLowerCase();
    const valid=a.startsWith(r.letter.toLowerCase()) && (categories[r.category]||[]).includes(a);
    if(!valid) return done?.({ok:false,error:"Incorrect answer."});
    clearInterval(r.timer); r.timer=null; r.state="result"; p.score++;
    io.to(r.code).emit("roundResult",{name:p.name,answer:a.toUpperCase(),score:p.score});
    sendRoom(r); done?.({ok:true});
  });

  socket.on("host:next",done=>{
    const r=rooms.get(socket.data.code);
    if(!r||r.host!==socket.id||r.state!=="result") return done?.({ok:false});
    r.round++; r.letter=letters[Math.floor(Math.random()*letters.length)]; r.state="playing";
    startTimer(r); sendRoom(r); done?.({ok:true});
  });

  socket.on("host:end",()=>{
    const r=rooms.get(socket.data.code);
    if(!r||r.host!==socket.id) return;
    clearInterval(r.timer); io.to(r.code).emit("gameEnded"); rooms.delete(r.code);
  });

  socket.on("disconnect",()=>{
    const code=socket.data.code, r=rooms.get(code);
    if(!r) return;
    if(r.host===socket.id){
      clearInterval(r.timer); io.to(code).emit("hostLeft"); rooms.delete(code);
    } else {
      r.players.delete(socket.id); sendRoom(r);
    }
  });
});

app.get("/health",(req,res)=>res.json({ok:true,rooms:rooms.size}));
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Alphabet Train V2 running on "+PORT));
