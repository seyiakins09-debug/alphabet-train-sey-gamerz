const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 25000, pingTimeout: 60000 });

const path = require("path");
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const rooms = new Map();
const ROOM_LIFETIME = 60 * 60 * 1000; // 1 hour

const CATEGORIES = [
  "Place", "Animal", "Food", "Name", "Job", "Thing", "Brand",
  "Sport", "Country", "City", "Fruit", "Vegetable", "Drink",
  "Vehicle", "Clothing", "Body Part", "School Subject", "Technology",
  "Movie", "Song", "Celebrity", "Game", "Company", "App", "Color",
  "Instrument", "Profession", "Household Item", "Nature", "Superhero"
];


const ANSWERS = {
  "Place": ["Abuja","Accra","Athens","Berlin","Cairo","Calabar","Dubai","Enugu","Ibadan","Jos","Kano","Lagos","London","Madrid","Nairobi","Oslo","Paris","Quito","Rome","Sokoto","Tokyo","Uyo","Vienna","Wuse","Yola","Zaria"],
  "Animal": ["Ant","Antelope","Bear","Cat","Cow","Dog","Dolphin","Eagle","Elephant","Fox","Giraffe","Goat","Horse","Iguana","Jaguar","Kangaroo","Lion","Monkey","Octopus","Parrot","Rabbit","Snake","Tiger","Urchin","Vulture","Wolf","Yak","Zebra"],
  "Food": ["Apple pie","Beans","Bread","Burger","Cake","Chips","Doughnut","Egusi soup","Fried rice","Garri","Hamburger","Ice cream","Jollof rice","Kebab","Lasagna","Meat pie","Noodles","Okra soup","Pizza","Rice","Salad","Toast","Ugali","Yam","Zobo"],
  "Name": ["Ada","Aisha","Ben","Bola","Chinedu","David","Emeka","Faith","Grace","Hassan","Ibrahim","Jane","Kelechi","Lilian","Michael","Ngozi","Ola","Peter","Queen","Ruth","Samuel","Tunde","Uche","Victor","Wale","Yusuf","Zainab"],
  "Job": ["Accountant","Baker","Carpenter","Doctor","Engineer","Farmer","Guard","Hairdresser","Inspector","Journalist","Kindergarten teacher","Lawyer","Mechanic","Nurse","Officer","Pilot","Receptionist","Salesperson","Teacher","Usher","Veterinarian","Waiter","X-ray technician","YouTuber"],
  "Thing": ["Apple","Bag","Chair","Door","Envelope","Fan","Glass","Hammer","Iron","Jug","Key","Lamp","Mirror","Notebook","Orange","Pencil","Quilt","Radio","Spoon","Table","Umbrella","Vase","Watch","Xylophone","Yo-yo","Zipper"],
  "Brand": ["Adidas","Amazon","Apple","BMW","Canon","Dell","Emirates","Ford","Google","Honda","Intel","Jumia","Kia","Lego","MTN","Nike","Oppo","Pepsi","Rolex","Samsung","Toyota","Uber","Visa","Xiaomi","Yamaha","Zara"],
  "Sport": ["Archery","Baseball","Cricket","Darts","Equestrian","Football","Golf","Hockey","Ice hockey","Judo","Karate","Lacrosse","Motocross","Netball","Olympics","Polo","Quidditch","Rugby","Soccer","Tennis","UFC","Volleyball","Wrestling"],
  "Country": ["Argentina","Brazil","Canada","Denmark","Egypt","France","Ghana","Hungary","India","Jamaica","Kenya","Laos","Mexico","Nigeria","Oman","Portugal","Qatar","Rwanda","Spain","Turkey","Uganda","Vietnam","Yemen","Zambia","Zimbabwe"],
  "City": ["Abuja","Accra","Amsterdam","Berlin","Cairo","Dublin","Enugu","Florence","Geneva","Havana","Ibadan","Jakarta","Kano","Lagos","Madrid","Nairobi","Oslo","Paris","Quebec","Rome","Seoul","Tokyo","Uyo","Vienna","Yola","Zaria"],
  "Fruit": ["Apple","Banana","Cherry","Date","Elderberry","Fig","Grape","Guava","Honeydew","Kiwi","Lemon","Mango","Nectarine","Orange","Papaya","Quince","Raspberry","Strawberry","Tangerine","Watermelon"],
  "Vegetable": ["Artichoke","Beetroot","Carrot","Daikon","Eggplant","Fennel","Garlic","Horseradish","Iceberg lettuce","Jalapeno","Kale","Leek","Mushroom","Onion","Pea","Radish","Spinach","Tomato","Turnip","Yam","Zucchini"],
  "Drink": ["Apple juice","Beer","Coffee","Drinkable yogurt","Espresso","Fanta","Gin","Hot chocolate","Iced tea","Juice","Kola drink","Lemonade","Milk","Nescafe","Orange juice","Pepsi","Qahwa","Root beer","Smoothie","Tea","Umu tea","Vodka","Water","Zobo"],
  "Vehicle": ["Ambulance","Bus","Car","Dump truck","Excavator","Ferry","Golf cart","Helicopter","Ice cream van","Jeep","Kayak","Lorry","Motorcycle","Nissan","Omnibus","Plane","Quad bike","Racing car","Scooter","Train","Uber car","Van","Wagon","Yacht","Zamboni"],
  "Clothing": ["Anorak","Blazer","Cap","Dress","Espadrille","Frock","Gloves","Hat","Jacket","Kimono","Leggings","Miniskirt","Necktie","Overalls","Pants","Quilted jacket","Robe","Shirt","Trousers","Uniform","Vest","Waistcoat","Yukata"],
  "Body Part": ["Ankle","Arm","Back","Chest","Ear","Elbow","Finger","Gum","Hand","Iris","Jaw","Knee","Leg","Mouth","Neck","Nose","Palm","Rib","Shoulder","Thigh","Ulna","Vein","Wrist"],
  "School Subject": ["Art","Biology","Chemistry","Drama","Economics","French","Geography","History","ICT","Journalism","Knowledge studies","Literature","Mathematics","Physics","Religion","Science","Technology","Yoruba"],
  "Technology": ["Android","Bluetooth","Computer","Database","Ethernet","Firewall","Google","HTML","Internet","Java","Keyboard","Linux","Monitor","Network","Oracle","Python","Router","Server","Tablet","USB","VPN","Wi-Fi","Xiaomi","YouTube","Zoom"],
  "Movie": ["Avatar","Barbie","Cars","Dune","Encanto","Frozen","Gladiator","Hercules","Inception","Joker","King Kong","Lion King","Matrix","Nope","Oppenheimer","Parasite","Queen of Katwe","Rocky","Titanic","Up","Venom","Wonder Woman","X-Men","Yes Day","Zootopia"],
  "Song": ["Africa","Bad Guy","Calm Down","Despacito","Easy On Me","Firework","Halo","Imagine","Jolene","Killing Me Softly","Love Story","Perfect","Queen of Hearts","Rolling in the Deep","Shape of You","Thriller","Umbrella","Viva La Vida","Watermelon Sugar","Yellow","Zombie"],
  "Celebrity": ["Adele","Beyonce","Chris Evans","Drake","Eminem","Femi Kuti","Gordon Ramsay","Halle Berry","Idris Elba","Jackie Chan","Kanye West","Lionel Messi","Michael Jackson","Nicki Minaj","Oprah","Rihanna","Shakira","Taylor Swift","Usain Bolt","Wizkid","Yemi Alade","Zlatan"],
  "Game": ["Among Us","Bingo","Chess","Dominoes","Elden Ring","Fortnite","GTA","Halo","Injustice","Jenga","Kingdom Hearts","Ludo","Minecraft","Need for Speed","Overwatch","PUBG","Quiz","Roblox","Scrabble","Tetris","Uno","Valorant","Warzone","Xenoblade Chronicles","Yu-Gi-Oh!","Zelda"],
  "Company": ["Amazon","Apple","BMW","Canon","Disney","Emirates","Facebook","Google","Honda","Intel","Jumia","Konga","Lego","Microsoft","Netflix","Oracle","PepsiCo","Qatar Airways","Samsung","Toyota","Uber","Visa","Xiaomi","Yamaha","Zoom"],
  "App": ["Airbnb","Bolt","Canva","Duolingo","Excel","Facebook","Google Maps","Instagram","Jumia","Kuda","LinkedIn","Messenger","Netflix","Opera","Pinterest","Quora","Reddit","Snapchat","TikTok","Uber","VLC","WhatsApp","X","YouTube","Zoom"],
  "Color": ["Amber","Beige","Black","Coral","Denim","Emerald","Fuchsia","Gold","Hazel","Ivory","Jade","Khaki","Lavender","Magenta","Navy","Orange","Pink","Red","Silver","Teal","Ultramarine","Violet","White","Yellow"],
  "Instrument": ["Accordion","Banjo","Cello","Drum","Electric guitar","Flute","Guitar","Harp","Ibanez guitar","Keyboard","Lute","Mandolin","Oboe","Piano","Recorder","Saxophone","Tambourine","Ukulele","Violin","Xylophone","Zither"],
  "Profession": ["Architect","Baker","Chef","Dentist","Engineer","Farmer","Geologist","Historian","Illustrator","Journalist","Lawyer","Musician","Nurse","Optician","Pilot","Researcher","Scientist","Teacher","Umpire","Veterinarian","Writer","YouTuber"],
  "Household Item": ["Apron","Broom","Cup","Dish","Extension cord","Fork","Grater","Hanger","Iron","Jug","Kettle","Lamp","Mirror","Napkin","Oven","Plate","Quilt","Rug","Spoon","Table","Umbrella","Vacuum","Washing machine","Xylophone","Zipper"],
  "Nature": ["Air","Beach","Cloud","Desert","Earth","Forest","Glacier","Hill","Island","Jungle","Lake","Mountain","Nature","Ocean","Rain","River","Sand","Tree","Valley","Waterfall","Wind","Yew","Zinnia"],
  "Superhero": ["Aquaman","Batman","Captain America","Daredevil","Elektra","Flash","Green Lantern","Hulk","Iron Man","Jean Grey","Krypton","Loki","Moon Knight","Nightwing","Odin","Punisher","Quicksilver","Robin","Superman","Thor","Ultron","Vision","Wolverine","X-Men","Yellowjacket","Zatanna"]
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function makeCode() {
  let code;
  do code = "SG" + Math.floor(1000 + Math.random() * 9000);
  while (rooms.has(code));
  return code;
}

function pickLetter(category) { return pickLetterForCategory(category); }

function cleanName(name, fallback) {
  return String(name || fallback).trim().slice(0, 25) || fallback;
}

function normalizeAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function acceptedAnswers(category) {
  return new Set((ANSWERS[category] || []).map(normalizeAnswer));
}

function pickLetterForCategory(category) {
  const letters = [...new Set((ANSWERS[category] || []).map(x => normalizeAnswer(x)[0]).filter(Boolean))];
  return letters[Math.floor(Math.random() * letters.length)]?.toUpperCase() || "A";
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
    room.letter = pickLetter(room.category);
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

    const normalized = normalizeAnswer(cleanAnswer);
    const requiredLetter = room.letter.toLowerCase();
    const validWords = acceptedAnswers(room.category);
    const startsCorrectly = normalized.startsWith(requiredLetter);
    const categoryCorrect = validWords.has(normalized);

    // Every submission is checked automatically. Only an answer in the category
    // answer bank and beginning with the round letter can win.
    if (!startsCorrectly) {
      return done?.({ ok: false, error: `Your answer must start with ${room.letter}.` });
    }
    if (!categoryCorrect) {
      return done?.({ ok: false, error: `That answer is not recognized for ${room.category}. Try another one.` });
    }

    // The first valid answer wins automatically.
    if (room.state !== "playing") {
      return done?.({ ok: false, error: "This round already has a winner." });
    }

    room.submissionCounter += 1;
    const submission = {
      id: `${socket.id}-${Date.now()}-${room.submissionCounter}`,
      playerId: socket.id,
      playerName: player.name,
      answer: cleanAnswer,
      order: room.submissionCounter,
      valid: true
    };

    room.submissions.push(submission);

    stopTimer(room);
    room.state = "result";
    player.score += 1;

    io.to(room.code).emit("submission", submission);
    io.to(room.code).emit("roundResult", {
      winner: player.name,
      answer: cleanAnswer,
      score: player.score,
      order: submission.order,
      automatic: true
    });

    broadcast(room);
    done?.({ ok: true, order: submission.order, winner: true });
  });

  // Winner detection is automatic. The host no longer needs to mark answers.
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
    room.letter = pickLetter(room.category);
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
server.listen(PORT, "0.0.0.0", () => {
  console.log(`ALPHABET TRAIN V4 running on port ${PORT}`);
});
