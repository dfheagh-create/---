
// =====================================
// 1. ПОДКЛЮЧЕНИЕ SUPABASE
// =====================================

const SUPABASE_URL = "https://ibmajjbjgdinpohxolvj.supabase.co";
const SUPABASE_KEY = "sb_publishable_Gyw3m_JQ93wM5SFGVUu6Pg_e1obFBkK";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =====================================
// 2. ПЕРЕМЕННЫЕ
// =====================================

const avatarFiles = [
  "ava1.png",
  "ava2.jpe",
  "ava3.jpe",
  "ava4.jpe",
  "ava5.png"
];

const memeFiles = Array.from(
  { length: 30 },
  (_, index) => `meme${index + 1}.jpg`
);

let selectedAvatar = "ava1.png";
let currentRoomId = null;
let currentPlayerId = null;
let currentRoomCode = null;
let isHost = false;
let refreshTimer = null;
let currentGameView = "";

const homeScreen = document.querySelector("#homeScreen");
const lobbyScreen = document.querySelector("#lobbyScreen");
const gameScreen = document.querySelector("#gameScreen");

const homeMessage = document.querySelector("#homeMessage");
const lobbyMessage = document.querySelector("#lobbyMessage");

// =====================================
// 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================

function showScreen(screen) {
  homeScreen.classList.add("hidden");
  lobbyScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");

  screen.classList.remove("hidden");
}

function stopRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function startRefresh() {
  stopRefresh();

  refreshTimer = setInterval(() => {
    syncRoom();
  }, 1500);
}

function setHostButtons() {
  document.querySelector("#startGame")
    .classList.toggle("hidden", !isHost);

  document.querySelector("#nextRound")
    .classList.toggle("hidden", !isHost);
}

// =====================================
// 4. ВЫБОР АВАТАРКИ
// =====================================

document.querySelectorAll(".avatar-option").forEach(button => {
  button.addEventListener("click", () => {
    selectedAvatar = button.dataset.avatar;

    document.querySelectorAll(".avatar-option").forEach(item => {
      item.classList.remove("selected");
    });

    button.classList.add("selected");
  });
});

// =====================================
// 5. ОТКРЫТИЕ КОМНАТЫ
// =====================================

function openLobby(room, player, host) {
  currentRoomId = room.id;
  currentPlayerId = player.id;
  currentRoomCode = room.code;
  isHost = host;

  localStorage.setItem("memeRoomId", room.id);
  localStorage.setItem("memePlayerId", player.id);
  localStorage.setItem("memeRoomCode", room.code);
  localStorage.setItem("memeIsHost", String(host));

  if (host) {
    localStorage.setItem("memeHostPlayerId", player.id);
  }

  document.querySelector("#lobbyCode").textContent = room.code;

  lobbyMessage.textContent = "";

  showScreen(lobbyScreen);
  startRefresh();
  syncRoom();
}

// =====================================
// 6. ОБНОВЛЕНИЕ КОМНАТЫ
// =====================================

async function syncRoom() {
  if (!currentRoomId) return;

  const { data: room, error: roomError } = await db
    .from("rooms")
    .select("*")
    .eq("id", currentRoomId)
    .maybeSingle();

  if (roomError) {
    console.error(roomError);
    return;
  }

  if (!room) {
    stopRefresh();
    alert("Комната больше не существует.");

    localStorage.removeItem("memeRoomId");
    localStorage.removeItem("memePlayerId");
    localStorage.removeItem("memeRoomCode");
    localStorage.removeItem("memeIsHost");
    localStorage.removeItem("memeHostPlayerId");

    currentRoomId = null;
    currentPlayerId = null;
    isHost = false;

    showScreen(homeScreen);
    return;
  }

  const { data: players, error: playersError } = await db
    .from("players")
    .select("*")
    .eq("room_id", currentRoomId)
    .order("id", { ascending: true });

  if (playersError) {
    console.error(playersError);
    return;
  }

  document.querySelector("#playerCount").textContent =
    `${players.length}/3`;

  const list = document.querySelector("#playersList");
  list.replaceChildren();

  players.forEach(player => {
    const card = document.createElement("div");
    card.className = "player-card";

    const avatar = document.createElement("img");
    const file = avatarFiles.includes(player.avatar)
      ? player.avatar
      : "ava1.png";

    avatar.src = "avatars/" + file;
    avatar.alt = "Аватар игрока";

    const info = document.createElement("div");
    info.className = "player-info";

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.nickname;

    const role = document.createElement("div");
    role.className = "player-role";

    const playerIsHost =
      player.id === localStorage.getItem("memeHostPlayerId");

    role.textContent = playerIsHost
      ? "Создатель комнаты"
      : "Участник";

    info.append(name, role);
    card.append(avatar, info);

    if (player.id === currentPlayerId) {
      const label = document.createElement("span");
      label.className = "host-label";
      label.textContent = "";
      card.append(label);
    }

    list.append(card);
  });

  for (let i = players.length; i < 3; i++) {
    const empty = document.createElement("div");
    empty.className = "empty-slot";
    empty.textContent = "Ожидаем игрока...";
    list.append(empty);
  }

  if (room.status === "waiting") {
    if (currentGameView !== "") {
      currentGameView = "";
      showScreen(lobbyScreen);
    }

    document.querySelector("#startGame").disabled =
      players.length < 2 || players.length > 3;

    document.querySelector("#startGame").textContent =
      players.length >= 2
        ? "НАЧАТЬ ИГРУ →"
        : "ЖДЁМ ИГРОКОВ...";

    document.querySelector("#startGame")
      .classList.toggle("hidden", !isHost);

    return;
  }

  if (room.status === "playing") {
    await updateGameScreen(room, players);
    return;
  }

  if (room.status === "finished") {
    showFinalScreen();
  }
}

// =====================================
// 7. СОЗДАНИЕ КОМНАТЫ
// =====================================

async function createRoom() {
  const nickname = document.querySelector("#nickname").value.trim();

  if (!nickname) {
    homeMessage.textContent = "Сначала введи свой никнейм!";
    return;
  }

  homeMessage.textContent = "Создаём комнату...";

  const code = Math.floor(
    100000 + Math.random() * 900000
  ).toString();

  const { data: room, error: roomError } = await db
    .from("rooms")
    .insert([{
      code: code,
      status: "waiting",
      current_round: 0,
      current_image: null,
      used_images: []
    }])
    .select()
    .single();

  if (roomError) {
    homeMessage.textContent =
      "Ошибка создания комнаты: " + roomError.message;
    console.error(roomError);
    return;
  }

  const { data: player, error: playerError } = await db
    .from("players")
    .insert([{
      room_id: room.id,
      nickname: nickname,
      avatar: selectedAvatar
    }])
    .select()
    .single();

  if (playerError) {
    homeMessage.textContent =
      "Ошибка добавления игрока: " + playerError.message;
    console.error(playerError);
    return;
  }

  localStorage.setItem("memeHostPlayerId", player.id);

  openLobby(room, player, true);
}

// =====================================
// 8. ВХОД В КОМНАТУ
// =====================================

async function joinRoom() {
  const nickname = document.querySelector("#nickname").value.trim();
  const code = document.querySelector("#roomCode").value.trim();

  if (!nickname) {
    homeMessage.textContent = "Сначала введи свой никнейм!";
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    homeMessage.textContent = "Введи правильный шестизначный код!";
    return;
  }

  homeMessage.textContent = "Ищем комнату...";

  const { data: room, error: roomError } = await db
    .from("rooms")
    .select("*")
    .eq("code", code)
    .eq("status", "waiting")
    .maybeSingle();

  if (roomError || !room) {
    homeMessage.textContent = "Комната не найдена!";
    return;
  }

  const { data: existingPlayers, error: listError } = await db
    .from("players")
    .select("id")
    .eq("room_id", room.id);

  if (listError) {
    homeMessage.textContent = "Не удалось проверить игроков.";
    console.error(listError);
    return;
  }

  if (existingPlayers.length >= 3) {
    homeMessage.textContent = "Комната уже заполнена!";
    return;
  }

  const { data: player, error: playerError } = await db
    .from("players")
    .insert([{
      room_id: room.id,
      nickname: nickname,
      avatar: selectedAvatar
    }])
    .select()
    .single();

  if (playerError) {
    homeMessage.textContent =
      "Не удалось войти: " + playerError.message;
    console.error(playerError);
    return;
  }

  openLobby(room, player, false);
}

// =====================================
// 9. НАЧАЛО ИГРЫ
// =====================================

async function startGame() {
  if (!isHost) return;

  const { data: players, error } = await db
    .from("players")
    .select("id")
    .eq("room_id", currentRoomId);

  if (error) {
    alert("Не удалось проверить игроков: " + error.message);
    return;
  }

  if (players.length < 2 || players.length > 3) {
    alert("Для игры нужно 2–3 игрока.");
    return;
  }

  const firstImage =
    memeFiles[Math.floor(Math.random() * memeFiles.length)];

  const { error: updateError } = await db
    .from("rooms")
    .update({
      status: "playing",
      current_round: 1,
      current_image: firstImage,
      used_images: [firstImage]
    })
    .eq("id", currentRoomId);

  if (updateError) {
    alert("Не удалось начать игру: " + updateError.message);
    console.error(updateError);
    return;
  }

  currentGameView = "";
  await syncRoom();
}

// =====================================
// 10. ОБНОВЛЕНИЕ ЭКРАНА ИГРЫ
// =====================================

async function updateGameScreen(room, players) {
  const round = room.current_round;
  const image = room.current_image;

  if (!round || !image) return;

  const { data: captions, error } = await db
    .from("captions")
    .select("*")
    .eq("room_id", currentRoomId)
    .eq("round_number", round);

  if (error) {
    console.error(error);
    return;
  }

  const myCaption = captions.find(
    caption => caption.player_id === currentPlayerId
  );

  document.querySelector("#roundNumber").textContent = round;

  const writingArea = document.querySelector("#writingArea");
  const waitingArea = document.querySelector("#waitingAnswers");
  const resultsArea = document.querySelector("#resultsArea");
  const finalArea = document.querySelector("#finalArea");

  finalArea.classList.add("hidden");

  if (captions.length >= players.length) {
    if (currentGameView !== `results-${round}`) {
      currentGameView = `results-${round}`;
      showScreen(gameScreen);

      writingArea.classList.add("hidden");
      waitingArea.classList.add("hidden");
      resultsArea.classList.remove("hidden");

      document.querySelector("#gameStatus").textContent =
        "РЕЗУЛЬТАТЫ РАУНДА";

      await showRoundResults(captions, players, image);
    }

    document.querySelector("#nextRound")
      .classList.toggle("hidden", !isHost);

    document.querySelector("#resultsMessage").textContent =
      isHost
        ? "Все подписи готовы! Можно продолжать."
        : "Ждём, пока создатель начнёт следующий раунд.";

    return;
  }

  if (myCaption) {
    currentGameView = `waiting-${round}`;

    showScreen(gameScreen);

    writingArea.classList.add("hidden");
    waitingArea.classList.remove("hidden");
    resultsArea.classList.add("hidden");

    document.querySelector("#gameStatus").textContent =
      "ОТВЕТ ОТПРАВЛЕН";

    document.querySelector("#answerCount").textContent =
      `Ответили: ${captions.length}/${players.length}`;

    return;
  }

  if (currentGameView !== `writing-${round}`) {
    currentGameView = `writing-${round}`;

    showScreen(gameScreen);

    writingArea.classList.remove("hidden");
    waitingArea.classList.add("hidden");
    resultsArea.classList.add("hidden");

    document.querySelector("#gameStatus").textContent =
      "ПРИДУМАЙ ПОДПИСЬ";

    document.querySelector("#memeImage").src =
      "images/" + image;

    document.querySelector("#captionInput").value = "";

    document.querySelector("#submitCaption").disabled = false;
  }

  document.querySelector("#answerCount").textContent =
    `Ответили: ${captions.length}/${players.length}`;
}

// =====================================
// 11. ОТПРАВКА ПОДПИСИ
// =====================================

async function submitCaption() {
  const text = document.querySelector("#captionInput").value.trim();

  if (!text) {
    alert("Сначала напиши подпись!");
    return;
  }

  const button = document.querySelector("#submitCaption");
  button.disabled = true;
  button.textContent = "ОТПРАВЛЯЕМ...";

  const { data: room, error: roomError } = await db
    .from("rooms")
    .select("current_round, current_image, status")
    .eq("id", currentRoomId)
    .single();

  if (roomError || !room || room.status !== "playing") {
    alert("Не удалось проверить текущий раунд.");
    button.disabled = false;
    button.textContent = "ОТПРАВИТЬ ПОДПИСЬ →";
    return;
  }

  const { error } = await db
    .from("captions")
    .insert([{
      room_id: currentRoomId,
      player_id: currentPlayerId,
      round_number: room.current_round,
      image_file: room.current_image,
      caption: text
    }]);

  if (error) {
    alert("Не удалось отправить подпись: " + error.message);
    console.error(error);

    button.disabled = false;
    button.textContent = "ОТПРАВИТЬ ПОДПИСЬ →";
    return;
  }

  await syncRoom();
}

// =====================================
// 12. ПОКАЗ РЕЗУЛЬТАТОВ
// =====================================

async function showRoundResults(captions, players, image) {
  const list = document.querySelector("#resultsList");
  list.replaceChildren();

  for (const caption of captions) {
    const player = players.find(
      item => item.id === caption.player_id
    );

    const card = document.createElement("div");
    card.className = "result-card";

    const meme = document.createElement("img");
    meme.src = "images/" + image;
    meme.alt = "Мем с подписью";

    const text = document.createElement("p");
    text.className = "result-caption";
    text.textContent = caption.caption;

    const author = document.createElement("div");
    author.className = "result-author";
    author.textContent = player
      ? "— " + player.nickname
      : "— Игрок";

    card.append(meme, text, author);
    list.append(card);
  }
}

// =====================================
// 13. СЛЕДУЮЩИЙ РАУНД
// =====================================

async function nextRound() {
  if (!isHost) return;

  const { data: room, error: roomError } = await db
    .from("rooms")
    .select("*")
    .eq("id", currentRoomId)
    .single();

  if (roomError || !room) {
    alert("Не удалось получить комнату.");
    return;
  }

  if (room.current_round >= 10) {
    const { error } = await db
      .from("rooms")
      .update({ status: "finished" })
      .eq("id", currentRoomId);

    if (error) {
      alert("Не удалось завершить игру: " + error.message);
      return;
    }

    showFinalScreen();
    return;
  }

  const usedImages = room.used_images || [];

  const availableImages = memeFiles.filter(
    file => !usedImages.includes(file)
  );

  if (availableImages.length === 0) {
    alert("Картинки закончились!");
    return;
  }

  const nextImage =
    availableImages[
      Math.floor(Math.random() * availableImages.length)
    ];

  const nextNumber = room.current_round + 1;

  const { error } = await db
    .from("rooms")
    .update({
      current_round: nextNumber,
      current_image: nextImage,
      used_images: [...usedImages, nextImage]
    })
    .eq("id", currentRoomId);

  if (error) {
    alert("Не удалось начать следующий раунд: " + error.message);
    console.error(error);
    return;
  }

  currentGameView = "";
  await syncRoom();
}

// =====================================
// 14. ФИНАЛ
// =====================================

function showFinalScreen() {
  currentGameView = "final";

  showScreen(gameScreen);

  document.querySelector("#writingArea").classList.add("hidden");
  document.querySelector("#waitingAnswers").classList.add("hidden");
  document.querySelector("#resultsArea").classList.add("hidden");
  document.querySelector("#finalArea").classList.remove("hidden");

  document.querySelector("#gameStatus").textContent =
    "ИГРА ЗАВЕРШЕНА";
}

// =====================================
// 15. ВЫХОД ИЗ КОМНАТЫ
// =====================================


// =====================================
// 15. ВЫХОД ИЗ КОМНАТЫ
// =====================================

async function leaveRoom() {
  const wasHost = isHost;
  const roomId = currentRoomId;
  const playerId = currentPlayerId;

  stopRefresh();

  let error = null;

  if (wasHost && roomId) {
    const result = await db
      .from("rooms")
      .delete()
      .eq("id", roomId);

    error = result.error;

  } else if (playerId) {
    const result = await db
      .from("players")
      .delete()
      .eq("id", playerId);

    error = result.error;
  }

  if (error) {
    alert("Не удалось полностью выйти: " + error.message);
    console.error(error);
  }

  localStorage.removeItem("memeRoomId");
  localStorage.removeItem("memePlayerId");
  localStorage.removeItem("memeRoomCode");
  localStorage.removeItem("memeIsHost");
  localStorage.removeItem("memeHostPlayerId");

  currentRoomId = null;
  currentPlayerId = null;
  currentRoomCode = null;
  isHost = false;
  currentGameView = "";

  homeMessage.textContent = "";
  lobbyMessage.textContent = "";

  document.querySelector("#nickname").value = "";
  document.querySelector("#roomCode").value = "";

  showScreen(homeScreen);
}


// Кнопка выхода из лобби
document.querySelector("#leaveRoom")
  .addEventListener("click", leaveRoom);


// Кнопка возврата в главное меню после игры
document.querySelector("#backToMenu")
  .addEventListener("click", leaveRoom);

// =====================================
// 16. КНОПКИ
// =====================================

document.querySelector("#createRoom")
  .addEventListener("click", createRoom);

document.querySelector("#joinRoom")
  .addEventListener("click", joinRoom);

document.querySelector("#startGame")
  .addEventListener("click", startGame);

document.querySelector("#submitCaption")
  .addEventListener("click", submitCaption);

document.querySelector("#nextRound")
  .addEventListener("click", nextRound);

document.querySelector("#roomCode")
  .addEventListener("input", event => {
    event.target.value = event.target.value.replace(/\D/g, "");
  });

document.querySelector("#copyCode")
  .addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentRoomCode);
      document.querySelector("#copyCode").textContent = "СКОПИРОВАНО!";
    } catch {
      prompt("Скопируй код комнаты:", currentRoomCode);
    }
  });

// =====================================
// 17. ВОССТАНОВЛЕНИЕ ПОСЛЕ ОБНОВЛЕНИЯ
// =====================================

async function restoreRoom() {
  const roomId = localStorage.getItem("memeRoomId");
  const playerId = localStorage.getItem("memePlayerId");

  if (!roomId || !playerId) return;

  const { data: room } = await db
    .from("rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  const { data: player } = await db
    .from("players")
    .select("*")
    .eq("id", playerId)
    .maybeSingle();

  if (!room || !player) {
    localStorage.removeItem("memeRoomId");
    localStorage.removeItem("memePlayerId");
    localStorage.removeItem("memeRoomCode");
    localStorage.removeItem("memeIsHost");
    localStorage.removeItem("memeHostPlayerId");
    return;
  }

  const host =
    localStorage.getItem("memeIsHost") === "true";

  currentRoomId = room.id;
  currentPlayerId = player.id;
  currentRoomCode = room.code;
  isHost = host;

  document.querySelector("#lobbyCode").textContent = room.code;

  startRefresh();
  await syncRoom();
}

restoreRoom();
