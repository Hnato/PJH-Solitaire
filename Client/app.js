const Suits = ["hearts", "diamonds", "clubs", "spades"];
const Values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function isRed(card) {
  return card.suit === "hearts" || card.suit === "diamonds";
}

function cloneCard(card) {
  return {
    id: card.id,
    suit: card.suit,
    value: card.value,
    faceUp: card.faceUp
  };
}

function cloneState(state) {
  return {
    deck: state.deck.map(cloneCard),
    waste: state.waste.map(cloneCard),
    foundations: state.foundations.map(f => f.map(cloneCard)),
    tableau: state.tableau.map(c => c.map(cloneCard)),
    moves: state.moves,
    startTimestamp: state.startTimestamp,
    elapsedMs: state.elapsedMs,
    won: state.won
  };
}

class SolitaireGame {
  constructor(rng) {
    this.rng = rng || Math.random;
    this.state = null;
    this.undoStack = [];
    this.redoStack = [];
    this.newGame();
  }

  newGame() {
    const deck = [];
    let idCounter = 1;
    for (const suit of Suits) {
      for (const value of Values) {
        deck.push({ id: idCounter++, suit, value, faceUp: false });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    const tableau = [[], [], [], [], [], [], []];
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck.pop();
        card.faceUp = row === col;
        tableau[col].push(card);
      }
    }
    this.state = {
      deck,
      waste: [],
      foundations: [[], [], [], []],
      tableau,
      moves: 0,
      startTimestamp: Date.now(),
      elapsedMs: 0,
      won: false
    };
    this.undoStack = [];
    this.redoStack = [];
  }

  snapshot() {
    return cloneState(this.state);
  }

  restore(snapshot) {
    this.state = cloneState(snapshot);
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    const current = this.snapshot();
    const prev = this.undoStack.pop();
    this.redoStack.push(current);
    this.restore(prev);
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    const current = this.snapshot();
    const next = this.redoStack.pop();
    this.undoStack.push(current);
    this.restore(next);
    return true;
  }

  canPlaceOnTableau(card, target) {
    if (!target) return card.value === 13;
    const oppositeColor = isRed(card) !== isRed(target);
    return oppositeColor && card.value === target.value - 1;
  }

  canPlaceOnFoundation(card, foundation) {
    if (foundation.length === 0) return card.value === 1;
    const top = foundation[foundation.length - 1];
    return card.suit === top.suit && card.value === top.value + 1;
  }

  drawCard() {
    this.pushUndo();
    const s = this.state;
    if (s.deck.length === 0) {
      if (s.waste.length === 0) {
        this.undoStack.pop();
        return false;
      }
      s.deck = s.waste.slice().reverse();
      s.waste = [];
      for (const c of s.deck) c.faceUp = false;
      s.moves++;
      return true;
    }
    const card = s.deck.pop();
    card.faceUp = true;
    s.waste.push(card);
    s.moves++;
    return true;
  }

  moveWasteToFoundation(foundationIndex) {
    const s = this.state;
    if (s.waste.length === 0) return false;
    const card = s.waste[s.waste.length - 1];
    const foundation = s.foundations[foundationIndex];
    if (!this.canPlaceOnFoundation(card, foundation)) return false;
    this.pushUndo();
    s.waste.pop();
    foundation.push(card);
    s.moves++;
    this.checkWin();
    return true;
  }

  moveWasteToTableau(columnIndex) {
    const s = this.state;
    if (s.waste.length === 0) return false;
    const card = s.waste[s.waste.length - 1];
    const column = s.tableau[columnIndex];
    const target = column[column.length - 1];
    if (!this.canPlaceOnTableau(card, target)) return false;
    this.pushUndo();
    s.waste.pop();
    column.push(card);
    s.moves++;
    return true;
  }

  moveTableauToFoundation(columnIndex, foundationIndex) {
    const s = this.state;
    const column = s.tableau[columnIndex];
    if (column.length === 0) return false;
    const card = column[column.length - 1];
    if (!card.faceUp) return false;
    const foundation = s.foundations[foundationIndex];
    if (!this.canPlaceOnFoundation(card, foundation)) return false;
    this.pushUndo();
    column.pop();
    foundation.push(card);
    if (column.length > 0 && !column[column.length - 1].faceUp) {
      column[column.length - 1].faceUp = true;
    }
    s.moves++;
    this.checkWin();
    return true;
  }

  moveTableauToTableau(fromColumn, toColumn, startIndexInFrom) {
    const s = this.state;
    const src = s.tableau[fromColumn];
    const dst = s.tableau[toColumn];
    if (startIndexInFrom < 0 || startIndexInFrom >= src.length) return false;
    const moving = src.slice(startIndexInFrom);
    if (moving.length === 0) return false;
    if (!moving[0].faceUp) return false;
    const target = dst[dst.length - 1];
    if (!this.canPlaceOnTableau(moving[0], target)) return false;
    this.pushUndo();
    s.tableau[fromColumn] = src.slice(0, startIndexInFrom);
    for (const c of moving) dst.push(c);
    const last = s.tableau[fromColumn][s.tableau[fromColumn].length - 1];
    if (last && !last.faceUp) last.faceUp = true;
    s.moves++;
    this.checkWin();
    return true;
  }

  autoMoveCard(cardId) {
    const s = this.state;
    let card = null;
    let where = null;
    if (s.waste.length && s.waste[s.waste.length - 1].id === cardId) {
      card = s.waste[s.waste.length - 1];
      where = { type: "waste" };
    }
    if (!card) {
      for (let col = 0; col < 7; col++) {
        const column = s.tableau[col];
        if (!column.length) continue;
        const top = column[column.length - 1];
        if (top.id === cardId && top.faceUp) {
          card = top;
          where = { type: "tableau", col };
          break;
        }
      }
    }
    if (!card) return false;
    for (let i = 0; i < 4; i++) {
      const foundation = s.foundations[i];
      if (this.canPlaceOnFoundation(card, foundation)) {
        if (where.type === "waste") {
          this.moveWasteToFoundation(i);
        } else {
          this.moveTableauToFoundation(where.col, i);
        }
        return true;
      }
    }
    return false;
  }

  autoMoveSmart(cardId) {
    const s = this.state;
    let card = null;
    let where = null;
    if (s.waste.length && s.waste[s.waste.length - 1].id === cardId) {
      card = s.waste[s.waste.length - 1];
      where = { type: "waste" };
    }
    if (!card) {
      for (let col = 0; col < 7; col++) {
        const column = s.tableau[col];
        if (!column.length) continue;
        const top = column[column.length - 1];
        if (top.id === cardId && top.faceUp) {
          card = top;
          where = { type: "tableau", col };
          break;
        }
      }
    }
    if (!card) return false;
    for (let i = 0; i < 4; i++) {
      const foundation = s.foundations[i];
      if (this.canPlaceOnFoundation(card, foundation)) {
        if (where.type === "waste") {
          this.moveWasteToFoundation(i);
        } else {
          this.moveTableauToFoundation(where.col, i);
        }
        return true;
      }
    }
    for (let col = 0; col < 7; col++) {
      if (where && where.type === "tableau" && where.col === col) continue;
      const column = s.tableau[col];
      const target = column[column.length - 1];
      if (this.canPlaceOnTableau(card, target)) {
        if (where.type === "waste") {
          this.moveWasteToTableau(col);
        } else {
          const src = s.tableau[where.col];
          const startIndex = src.length - 1;
          this.moveTableauToTableau(where.col, col, startIndex);
        }
        return true;
      }
    }
    return false;
  }

  autoComplete() {
    let changed = false;
    while (true) {
      let movedSomething = false;
      for (let col = 0; col < 7; col++) {
        const column = this.state.tableau[col];
        if (!column.length) continue;
        const top = column[column.length - 1];
        if (!top.faceUp) continue;
        for (let f = 0; f < 4; f++) {
          const foundation = this.state.foundations[f];
          if (this.canPlaceOnFoundation(top, foundation)) {
            this.moveTableauToFoundation(col, f);
            movedSomething = true;
            changed = true;
            break;
          }
        }
        if (movedSomething) break;
      }
      if (!movedSomething) break;
    }
    return changed;
  }

  autoMoveAces() {
    const s = this.state;
    let changed = false;
    while (true) {
      let moved = false;
      if (s.waste.length) {
        const topWaste = s.waste[s.waste.length - 1];
        if (topWaste.faceUp && topWaste.value === 1) {
          for (let f = 0; f < 4; f++) {
            const foundation = s.foundations[f];
            if (this.canPlaceOnFoundation(topWaste, foundation)) {
              this.moveWasteToFoundation(f);
              moved = true;
              changed = true;
              break;
            }
          }
        }
      }
      if (moved) continue;
      for (let col = 0; col < 7; col++) {
        const column = s.tableau[col];
        if (!column.length) continue;
        const top = column[column.length - 1];
        if (!top.faceUp || top.value !== 1) continue;
        for (let f = 0; f < 4; f++) {
          const foundation = s.foundations[f];
          if (this.canPlaceOnFoundation(top, foundation)) {
            this.moveTableauToFoundation(col, f);
            moved = true;
            changed = true;
            break;
          }
        }
        if (moved) break;
      }
      if (!moved) break;
    }
    return changed;
  }

  checkWin() {
    let count = 0;
    for (const f of this.state.foundations) {
      count += f.length;
    }
    if (count === 52) {
      this.state.won = true;
    }
  }

  tick(now) {
    if (!this.state.startTimestamp) return;
    this.state.elapsedMs = now - this.state.startTimestamp;
  }
}

const board = {
  root: null,
  stock: null,
  waste: null,
  foundations: [],
  tableau: [],
  movesEl: null,
  timeEl: null,
  bestEl: null,
  messageEl: null
};

let game = null;
let animationFrameId = null;

let dragState = null;
const CARD_Y_STEP = 44;
let hasShownWin = false;

const DRAG_DISTANCE_THRESHOLD_SQ = 196;
const DOUBLE_CLICK_MS = 260;

function shouldStartDragDistance(state, clientX, clientY) {
  const dx = clientX - state.startX;
  const dy = clientY - state.startY;
  return dx * dx + dy * dy >= DRAG_DISTANCE_THRESHOLD_SQ;
}

const soundState = {
  enabled: true,
  volume: 0.9,
  dragAudio: null,
  dropAudio: null
};

const ambientState = {
  audio: null,
  enabled: true,
  track: "1",
  volume: 0.4,
  muteOnStartup: false,
  started: false,
  autoplayBlocked: false
};

function showTransientMessage(text) {
  const el = board.messageEl;
  if (!el) return;
  el.textContent = String(text || "");
  el.classList.add("visible");
  if (!document.body.classList.contains("win-active")) {
    setTimeout(() => {
      if (!document.body.classList.contains("win-active")) {
        el.classList.remove("visible");
      }
    }, 1500);
  }
}

function autoMoveAllAces() {
  if (!game || !game.autoMoveAces) return false;
  try {
    const changed = game.autoMoveAces();
    if (changed) {
      console.log("AutoAces: przeniesiono asy");
    }
    return changed;
  } catch (err) {
    console.error("AutoAces: błąd", err);
    showTransientMessage("Błąd automatycznego przenoszenia asów");
    return false;
  }
}

const SETTINGS_KEY = "pjh_settings_v1";

function defaultSettings() {
  return {
    speed: "normal",
    soundEnabled: true,
    soundVolume: 0.9,
    ambientEnabled: true,
    ambientTrack: "1",
    ambientVolume: 0.4,
    ambientMuteOnStartup: false
  };
}

let settingsState = defaultSettings();
let audioContext = null;

function normalizeVolume(volume) {
  const v = Math.min(1, Math.max(0, volume));
  return v;
}

function validateSettings(data) {
  if (!data || typeof data !== "object") return false;
  if (data.speed !== "fast" && data.speed !== "normal" && data.speed !== "slow") return false;
  if (typeof data.soundEnabled !== "boolean") return false;
  if (typeof data.soundVolume !== "number") return false;
  if (typeof data.ambientEnabled !== "boolean") return false;
  if (data.ambientTrack !== "1" && data.ambientTrack !== "2") return false;
  if (typeof data.ambientVolume !== "number") return false;
  if (typeof data.ambientMuteOnStartup !== "boolean") return false;
  return true;
}

function readCookie(name) {
  const all = document.cookie;
  if (!all) return null;
  const parts = all.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function writeCookie(name, value) {
  try {
    const encoded = encodeURIComponent(value);
    document.cookie = name + "=" + encoded + ";path=/;max-age=31536000";
  } catch {}
}

function loadSettings() {
  let loaded = null;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateSettings(parsed)) loaded = parsed;
    }
  } catch {}
  if (!loaded) {
    try {
      const raw = sessionStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (validateSettings(parsed)) loaded = parsed;
      }
    } catch {}
  }
  if (!loaded) {
    const rawCookie = readCookie(SETTINGS_KEY);
    if (rawCookie) {
      try {
        const parsed = JSON.parse(rawCookie);
        if (validateSettings(parsed)) loaded = parsed;
      } catch {}
    }
  }
  if (!loaded) {
    settingsState = defaultSettings();
  } else {
    settingsState = loaded;
  }
}

function saveSettings() {
  const safe = {
    speed: settingsState.speed === "fast" || settingsState.speed === "slow" ? settingsState.speed : "normal",
    soundEnabled: !!settingsState.soundEnabled,
    soundVolume: normalizeVolume(settingsState.soundVolume),
    ambientEnabled: !!settingsState.ambientEnabled,
    ambientTrack: settingsState.ambientTrack === "2" ? "2" : "1",
    ambientVolume: normalizeVolume(settingsState.ambientVolume),
    ambientMuteOnStartup: !!settingsState.ambientMuteOnStartup
  };
  settingsState = safe;
  const payload = JSON.stringify(safe);
  try {
    localStorage.setItem(SETTINGS_KEY, payload);
  } catch {}
  try {
    sessionStorage.setItem(SETTINGS_KEY, payload);
  } catch {}
  writeCookie(SETTINGS_KEY, payload);
}

function ambientUrl() {
  return "ambient/" + ambientState.track + ".mp3";
}

function ensureAmbientAudio() {
  if (ambientState.audio) return;
  try {
    const a = new Audio(ambientUrl());
    a.autoplay = true;
    a.playsInline = true;
    a.muted = true;
    a.loop = true;
    a.preload = "auto";
    a.volume = ambientState.volume;
    a.addEventListener("error", () => {
      console.error("Błąd ładowania ambientu", a.error, "src:", a.src);
    });
    a.addEventListener("canplaythrough", () => {
      console.log("Ambient załadowany:", a.src);
    });
    ambientState.audio = a;
  } catch (err) {
    console.error("Błąd inicjalizacji ambientu", err);
  }
}

function applyAmbientSettings() {
  if (!ambientState.audio) ensureAmbientAudio();
  const a = ambientState.audio;
  if (!a) return;
  const url = ambientUrl();
  if (!a.src.includes(url)) {
    a.src = url;
    a.load();
  }
  a.volume = ambientState.volume;
  if (!ambientState.enabled) {
    a.pause();
  }
}

function startAmbient(fromStartup) {
  if (!ambientState.enabled) return;
  if (fromStartup && ambientState.muteOnStartup) return;
  ensureAmbientAudio();
  const a = ambientState.audio;
  if (!a) return;
  a.muted = true;
  try {
    const promise = a.play();
    if (promise && typeof promise.then === "function") {
      promise
        .then(() => {
          ambientState.started = true;
          ambientState.autoplayBlocked = false;
          updateSoundToggleUi();
        })
        .catch(err => {
          ambientState.autoplayBlocked = true;
          if (!err || err.name !== "NotAllowedError") {
            console.error("Błąd odtwarzania ambientu", err && err.name, err && err.message);
          }
          updateSoundToggleUi();
        });
    }
    ambientState.started = true;
  } catch (err) {
    if (!err || err.name !== "NotAllowedError") {
      console.error("Wyjątek przy odtwarzaniu ambientu", err);
    }
    updateSoundToggleUi();
  }
}

function setupAmbientAutoplayFallback() {
  if (ambientState.started || !ambientState.enabled) return;
  let handled = false;
  function onFirstInteraction() {
    if (handled) return;
    handled = true;
    startAmbient(false);
    window.removeEventListener("pointerdown", onFirstInteraction);
    window.removeEventListener("keydown", onFirstInteraction);
  }
  window.addEventListener("pointerdown", onFirstInteraction);
  window.addEventListener("keydown", onFirstInteraction);
}

function ensureAudioLoaded() {
  if (soundState.dragAudio && soundState.dropAudio) return;
  try {
    soundState.dragAudio = new Audio("sfx-card-drag.mp3");
    soundState.dropAudio = new Audio("sfx-card-drop.mp3");
    soundState.dragAudio.preload = "auto";
    soundState.dropAudio.preload = "auto";
    soundState.dragAudio.volume = soundState.volume;
    soundState.dropAudio.volume = soundState.volume;
    soundState.dragAudio.muted = false;
    soundState.dropAudio.muted = false;
    soundState.dragAudio.load();
    soundState.dropAudio.load();
    soundState.dragAudio.addEventListener("error", () => {
      console.error("Błąd ładowania sfx-card-drag.mp3", soundState.dragAudio.error);
    });
    soundState.dropAudio.addEventListener("error", () => {
      console.error("Błąd ładowania sfx-card-drop.mp3", soundState.dropAudio.error);
    });
  } catch (err) {
    console.error("Błąd inicjalizacji Audio", err);
  }
}

function playDragSound() {
  if (!soundState.enabled) return;
  ensureAudioLoaded();
  const a = soundState.dragAudio;
  if (a) {
    try {
      a.currentTime = 0;
      a.play().catch(err => {
        console.error("Błąd odtwarzania drag", err);
      });
    } catch (err) {
      console.error("Wyjątek przy odtwarzaniu drag", err);
    }
  }
}

function playDropSound() {
  if (!soundState.enabled) return;
  ensureAudioLoaded();
  const a = soundState.dropAudio;
  if (a) {
    try {
      a.currentTime = 0;
      a.play().catch(err => {
        console.error("Błąd odtwarzania drop", err);
      });
    } catch (err) {
      console.error("Wyjątek przy odtwarzaniu drop", err);
    }
  }
}

function setSoundEnabled(enabled) {
  const value = !!enabled;
  soundState.enabled = value;
  settingsState.soundEnabled = value;
  saveSettings();
}

function setSoundVolume(volume) {
  const v = normalizeVolume(volume);
  soundState.volume = v;
  if (soundState.dragAudio) soundState.dragAudio.volume = v;
  if (soundState.dropAudio) soundState.dropAudio.volume = v;
   settingsState.soundVolume = v;
   saveSettings();
}

function setAmbientEnabled(enabled) {
  const value = !!enabled;
  ambientState.enabled = value;
  settingsState.ambientEnabled = value;
  saveSettings();
  applyAmbientSettings();
  if (ambientState.enabled && !ambientState.started) {
    startAmbient(false);
  }
}

function setAmbientTrack(track) {
  if (track !== "1" && track !== "2") return;
  ambientState.track = track;
  settingsState.ambientTrack = track;
  saveSettings();
  applyAmbientSettings();
  if (ambientState.enabled) {
    startAmbient(false);
  }
}

function setAmbientVolume(volume) {
  const v = normalizeVolume(volume);
  ambientState.volume = v;
  if (ambientState.audio) ambientState.audio.volume = v;
  settingsState.ambientVolume = v;
  saveSettings();
}

function setAmbientMuteOnStartup(muted) {
  const value = !!muted;
  ambientState.muteOnStartup = value;
  settingsState.ambientMuteOnStartup = value;
  saveSettings();
}

function updateSoundToggleUi() {
  const btn = document.getElementById("btn-sound-toggle");
  if (!btn) return;
  if (!btn.querySelector(".icon-on")) {
    btn.innerHTML =
      '<svg class="icon-on" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M11 5 L6 9 H3 v6 h3 l5 4 V5 Z"></path>' +
      '<path d="M15.5 8.5a5 5 0 0 1 0 7"></path>' +
      '<path d="M19 4a9 9 0 0 1 0 16"></path>' +
      '</svg>' +
      '<svg class="icon-off" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M11 5 L6 9 H3 v6 h3 l5 4 V5 Z"></path>' +
      '<line x1="17" y1="9" x2="23" y2="15"></line>' +
      '<line x1="23" y1="9" x2="17" y2="15"></line>' +
      '</svg>';
  }
  const a = ambientState.audio;
  const on = !!(a && !a.muted && !a.paused && ambientState.enabled);
  btn.classList.toggle("state-on", on);
  btn.classList.toggle("state-off", !on);
  btn.setAttribute("aria-label", on ? "Wyłącz dźwięk" : "Włącz dźwięk");
  btn.title = on ? "Wyłącz dźwięk" : "Włącz dźwięk";
}

function toggleSoundByFab() {
  ensureAmbientAudio();
  const a = ambientState.audio;
  if (!a) return;
  if (!ambientState.enabled || a.paused || a.muted) {
    setAmbientEnabled(true);
    startAmbient(false);
    if (ambientState.audio) {
      ambientState.audio.muted = false;
      ambientState.audio.volume = ambientState.volume;
      if (ambientState.audio.play) {
        ambientState.audio.play().catch(() => {});
      }
    }
  } else {
    a.muted = true;
    a.pause();
    setAmbientEnabled(false);
  }
  updateSoundToggleUi();
}

function ensureSoundFab() {
  let btn = document.getElementById("btn-sound-toggle");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btn-sound-toggle";
    btn.className = "fab-sound state-off";
    btn.type = "button";
    btn.innerHTML =
      '<svg class="icon-on" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M11 5 L6 9 H3 v6 h3 l5 4 V5 Z"></path>' +
      '<path d="M15.5 8.5a5 5 0 0 1 0 7"></path>' +
      '<path d="M19 4a9 9 0 0 1 0 16"></path>' +
      '</svg>' +
      '<svg class="icon-off" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M11 5 L6 9 H3 v6 h3 l5 4 V5 Z"></path>' +
      '<line x1="17" y1="9" x2="23" y2="15"></line>' +
      '<line x1="23" y1="9" x2="17" y2="15"></line>' +
      '</svg>';
    btn.setAttribute("aria-label", "Włącz dźwięk");
    btn.title = "Włącz dźwięk";
    document.body.appendChild(btn);
  }
}

function clearDropHighlights() {
  for (const col of board.tableau) {
    if (!col) continue;
    col.classList.remove("pile--drop-ok");
    col.classList.remove("pile--drop-deny");
  }
  for (const f of board.foundations) {
    if (!f) continue;
    f.classList.remove("pile--drop-ok");
    f.classList.remove("pile--drop-deny");
  }
}

function computeDropTarget(clientX, clientY) {
  const elAtPoint = document.elementFromPoint(clientX, clientY);
  if (!elAtPoint) return null;
  const foundation = elAtPoint.closest(".pile-foundation");
  const tableau = elAtPoint.closest(".pile-tableau");
  if (foundation && dragState && dragState.movingCards.length === 1) {
    const index = parseInt(foundation.dataset.index, 10);
    return { type: "foundation", index, element: foundation };
  }
  if (tableau) {
    const index = parseInt(tableau.dataset.index, 10);
    return { type: "tableau", index, element: tableau };
  }
  return null;
}

function updateDropHints(clientX, clientY) {
  if (!dragState) return;
  clearDropHighlights();
  const target = computeDropTarget(clientX, clientY);
  if (!target) {
    dragState.dropTarget = null;
    return;
  }
  const s = game.state;
  let card = null;
  if (dragState.originColumn != null && dragState.originIndex != null) {
    const column = s.tableau[dragState.originColumn];
    if (column && column.length) {
      card = column[dragState.originIndex];
    }
  } else if (s.waste.length) {
    card = s.waste[s.waste.length - 1];
  }
  if (!card) {
    dragState.dropTarget = null;
    return;
  }
  let ok = false;
  if (target.type === "foundation") {
    const foundation = s.foundations[target.index];
    ok = game.canPlaceOnFoundation(card, foundation);
  } else if (target.type === "tableau") {
    const column = s.tableau[target.index];
    const top = column[column.length - 1];
    ok = game.canPlaceOnTableau(card, top);
  }
  if (ok) {
    target.element.classList.add("pile--drop-ok");
    dragState.dropTarget = target;
  } else {
    target.element.classList.add("pile--drop-deny");
    dragState.dropTarget = null;
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return mm + ":" + ss;
}

function loadBestScore() {
  try {
    const raw = localStorage.getItem("pjh_solitaire_best");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resetBestScore() {
  try {
    localStorage.removeItem("pjh_solitaire_best");
  } catch {}
  updateHud();
}

function saveBestScore(moves, timeMs) {
  const prev = loadBestScore();
  if (prev && prev.timeMs <= timeMs && prev.moves <= moves) return;
  const value = { moves, timeMs };
  try {
    localStorage.setItem("pjh_solitaire_best", JSON.stringify(value));
  } catch {}
}

function updateHud() {
  const state = game.state;
  if (board.movesEl) board.movesEl.textContent = String(state.moves);
  if (board.timeEl) board.timeEl.textContent = formatTime(state.elapsedMs || 0);
  const best = loadBestScore();
  if (board.bestEl) {
    if (best) {
      board.bestEl.textContent = best.moves + " ruchów, " + formatTime(best.timeMs);
    } else {
      board.bestEl.textContent = "brak";
    }
  }
}

function clearBoard() {
  for (const col of board.tableau) {
    col.innerHTML = "";
  }
  for (const f of board.foundations) {
    f.innerHTML = "";
  }
  if (board.stock) board.stock.innerHTML = "";
  if (board.waste) board.waste.innerHTML = "";
}

function createCardElement(card) {
  const el = document.createElement("div");
  el.className = "card";
  if (card.faceUp) el.classList.add("face-up");
  else el.classList.add("face-down");
  el.dataset.id = String(card.id);
  el.dataset.suit = card.suit;
  el.dataset.value = String(card.value);
  const front = document.createElement("div");
  front.className = "card-front";
  const back = document.createElement("div");
  back.className = "card-back";
  const rankMap = {
    1: "A",
    11: "J",
    12: "Q",
    13: "K"
  };
  const suitSymbols = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠"
  };
  const rank = rankMap[card.value] || String(card.value);
  const symbol = suitSymbols[card.suit];
  const top = document.createElement("div");
  top.className = "card-corner top";
  top.textContent = rank + symbol;
  const bottom = document.createElement("div");
  bottom.className = "card-corner bottom";
  bottom.textContent = rank + symbol;
  const center = document.createElement("div");
  center.className = "card-center";
  center.textContent = symbol;
  front.appendChild(top);
  front.appendChild(center);
  front.appendChild(bottom);
  el.appendChild(front);
  el.appendChild(back);
  return el;
}

function render() {
  clearBoard();
  const state = game.state;
  if (board.stock) {
    if (state.deck.length) {
      const fakeCard = {
        id: -1,
        suit: "spades",
        value: 13,
        faceUp: false
      };
      const cardEl = createCardElement(fakeCard);
      cardEl.classList.add("stock-card");
      board.stock.appendChild(cardEl);
    }
  }
  if (board.waste) {
    const waste = state.waste;
    if (waste.length) {
      const top = waste[waste.length - 1];
      const el = createCardElement(top);
      el.classList.add("waste-card");
      board.waste.appendChild(el);
    }
  }
  for (let i = 0; i < 4; i++) {
    const fRoot = board.foundations[i];
    const foundation = state.foundations[i];
    if (!fRoot) continue;
    if (!foundation.length) continue;
    const top = foundation[foundation.length - 1];
    const el = createCardElement(top);
    el.classList.add("foundation-card");
    fRoot.appendChild(el);
  }
  for (let col = 0; col < 7; col++) {
    const colRoot = board.tableau[col];
    if (!colRoot) continue;
    const column = state.tableau[col];
    for (let row = 0; row < column.length; row++) {
      const card = column[row];
      const el = createCardElement(card);
      let t = "translateY(" + row * CARD_Y_STEP + "px)";
      if (!card.faceUp) {
        t += " rotateY(180deg)";
      }
      el.style.transform = t;
      el.dataset.column = String(col);
      el.dataset.index = String(row);
      colRoot.appendChild(el);
    }
  }
  updateHud();
}

function pointerDownCard(e) {
  if (e.button !== 0) return;
  if (e.detail > 1) return;
  e.preventDefault();
  const target = e.target.closest(".card.face-up");
  if (!target) return;
  const cardId = parseInt(target.dataset.id, 10);
  const columnIndex = target.dataset.column ? parseInt(target.dataset.column, 10) : null;
  const indexInColumn = target.dataset.index ? parseInt(target.dataset.index, 10) : null;
  let movingCards = [];
  if (columnIndex != null && indexInColumn != null) {
    const columnRoot = board.tableau[columnIndex];
    const all = Array.from(columnRoot.querySelectorAll(".card.face-up"));
    for (const el of all) {
      const idx = parseInt(el.dataset.index, 10);
      if (idx >= indexInColumn) movingCards.push(el);
    }
  } else {
    movingCards = [target];
  }
  const cardRects = movingCards.map(el => el.getBoundingClientRect());
  dragState = {
    cardId,
    movingCards,
    cardRects,
    originColumn: columnIndex,
    originIndex: indexInColumn,
    isDragging: false,
    dropTarget: null,
    startX: e.clientX,
    startY: e.clientY,
    startTime: Date.now()
  };
  window.addEventListener("mousemove", pointerMoveCard);
  window.addEventListener("mouseup", pointerUpCard);
}

function pointerMoveCard(e) {
  if (!dragState) return;
  if (!dragState.isDragging) {
    const now = Date.now();
    if (now - dragState.startTime < DOUBLE_CLICK_MS) {
      return;
    }
    if (!shouldStartDragDistance(dragState, e.clientX, e.clientY)) {
      return;
    }
    dragState.isDragging = true;
    playDragSound();
    for (let i = 0; i < dragState.movingCards.length; i++) {
      const el = dragState.movingCards[i];
      const rect = dragState.cardRects[i];
      el.dataset.dragPrevPosition = el.style.position || "";
      el.dataset.dragPrevLeft = el.style.left || "";
      el.dataset.dragPrevTop = el.style.top || "";
      el.dataset.dragPrevTransform = el.style.transform || "";
      el.dataset.dragPrevPointerEvents = el.style.pointerEvents || "";
      el.style.position = "fixed";
      el.style.left = rect.left + "px";
      el.style.top = rect.top + "px";
      el.style.pointerEvents = "none";
      el.style.transform = el.classList.contains("face-down") ? "rotateY(180deg)" : "";
      el.classList.add("dragging");
    }
  }
  const anchorRect = dragState.cardRects[0];
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const dx = e.clientX - anchorCenterX;
  const dy = e.clientY - anchorCenterY;
  for (let i = 0; i < dragState.movingCards.length; i++) {
    const el = dragState.movingCards[i];
    let t = "translate(" + dx + "px," + dy + "px)";
    if (el.classList.contains("face-down")) {
      t += " rotateY(180deg)";
    }
    el.style.transform = t;
  }
  updateDropHints(e.clientX, e.clientY);
}

function pointerDblClickCard(e) {
  if (!game || !board.root) return;
  const target = e.target.closest(".card.face-up");
  if (!target) return;
  const cardId = parseInt(target.dataset.id, 10);
  if (!Number.isFinite(cardId)) return;
  try {
    console.log("DblClick: próba autoMove", { cardId });
    const moved = game.autoMoveSmart(cardId);
    if (!moved) {
      console.log("DblClick: brak dozwolonego ruchu dla karty", { cardId });
      return;
    }
    playDropSound();
    render();
  } catch (err) {
    console.error("DblClick: błąd podczas autoMove", err);
    showTransientMessage("Błąd przy podwójnym kliknięciu");
  }
}

function pointerUpCard(e) {
  window.removeEventListener("mousemove", pointerMoveCard);
  window.removeEventListener("mouseup", pointerUpCard);
  if (!dragState) return;
  if (!dragState.isDragging) {
    for (const el of dragState.movingCards) {
    el.classList.remove("dragging");
      el.style.position = el.dataset.dragPrevPosition || "";
      el.style.left = el.dataset.dragPrevLeft || "";
      el.style.top = el.dataset.dragPrevTop || "";
      el.style.transform = el.dataset.dragPrevTransform || "";
      el.style.pointerEvents = el.dataset.dragPrevPointerEvents || "";
      delete el.dataset.dragPrevPosition;
      delete el.dataset.dragPrevLeft;
      delete el.dataset.dragPrevTop;
      delete el.dataset.dragPrevTransform;
      delete el.dataset.dragPrevPointerEvents;
    }
    clearDropHighlights();
    dragState = null;
    return;
  }
  let handled = false;
  const stateBefore = game.snapshot();
  const target = dragState.dropTarget || computeDropTarget(e.clientX, e.clientY);
  if (target) {
    if (target.type === "foundation" && dragState.movingCards.length === 1) {
      if (dragState.originColumn != null && dragState.originIndex != null) {
        handled = game.moveTableauToFoundation(dragState.originColumn, target.index);
      } else {
        handled = game.moveWasteToFoundation(target.index);
      }
    } else if (target.type === "tableau") {
      if (dragState.originColumn != null && dragState.originIndex != null) {
        handled = game.moveTableauToTableau(dragState.originColumn, target.index, dragState.originIndex);
      } else {
        handled = game.moveWasteToTableau(target.index);
      }
    }
  }
  if (!handled) {
    game.restore(stateBefore);
  }
  for (const el of dragState.movingCards) {
    el.classList.remove("dragging");
    el.style.position = el.dataset.dragPrevPosition || "";
    el.style.left = el.dataset.dragPrevLeft || "";
    el.style.top = el.dataset.dragPrevTop || "";
    el.style.transform = el.dataset.dragPrevTransform || "";
    el.style.pointerEvents = el.dataset.dragPrevPointerEvents || "";
    delete el.dataset.dragPrevPosition;
    delete el.dataset.dragPrevLeft;
    delete el.dataset.dragPrevTop;
    delete el.dataset.dragPrevTransform;
    delete el.dataset.dragPrevPointerEvents;
  }
  clearDropHighlights();
  dragState = null;
  render();
  if (autoMoveAllAces()) {
    render();
  }
  if (handled) {
    playDropSound();
  }
  if (game.state.won && !hasShownWin) {
    hasShownWin = true;
    saveBestScore(game.state.moves, game.state.elapsedMs);
    if (board.messageEl) {
      board.messageEl.textContent = "Wygrana!";
      board.messageEl.classList.add("visible");
      document.body.classList.add("win-active");
      setTimeout(() => {
        board.messageEl.classList.remove("visible");
        document.body.classList.remove("win-active");
      }, 3000);
    }
  }
}

function onStockClick() {
  if (!game) return;
  const moved = game.drawCard();
  if (!moved) return;
  render();
  if (autoMoveAllAces()) {
    render();
  }
}

function setupBoard() {
  board.root = document.querySelector(".solitaire-root");
  board.stock = document.querySelector(".pile-stock");
  board.waste = document.querySelector(".pile-waste");
  board.foundations = Array.from(document.querySelectorAll(".pile-foundation"));
  board.tableau = Array.from(document.querySelectorAll(".pile-tableau"));
  board.movesEl = document.getElementById("hud-moves");
  board.timeEl = document.getElementById("hud-time");
  board.bestEl = document.getElementById("hud-best");
  board.messageEl = document.getElementById("hud-message");
  board.stock.addEventListener("click", onStockClick);
  board.root.addEventListener("mousedown", pointerDownCard);
  board.root.addEventListener("dblclick", pointerDblClickCard);
}

function tickLoop() {
  const now = Date.now();
  game.tick(now);
  updateHud();
  animationFrameId = requestAnimationFrame(tickLoop);
}

function initSolitaire() {
  game = new SolitaireGame();
  setupBoard();
  render();
  if (animationFrameId != null) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(tickLoop);
}

function newGame() {
  game.newGame();
  hasShownWin = false;
  document.body.classList.remove("win-active");
  render();
}

function undo() {
  if (game.undo()) render();
}

function redo() {
  if (game.redo()) render();
}

function autoComplete() {
  if (!game) return;
  try {
    console.log("Auto: start");
    const changed = game.autoComplete();
    console.log("Auto: wynik", { changed });
    if (changed) {
      render();
      if (autoMoveAllAces()) {
        render();
      }
    } else {
      showTransientMessage("Brak automatycznych ruchów");
    }
  } catch (err) {
    console.error("Auto: błąd", err);
    showTransientMessage("Błąd przy Auto");
  }
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "Assertion failed");
  }
}

function runTests() {
  const gameTest = new SolitaireGame(() => 0.123456);
  assert(
    gameTest.state.deck.length +
      gameTest.state.waste.length +
      gameTest.state.foundations.reduce((a, f) => a + f.length, 0) +
      gameTest.state.tableau.reduce((a, c) => a + c.length, 0) === 52,
    "Talia ma mieć 52 karty"
  );
  let faceUpCount = 0;
  for (const col of gameTest.state.tableau) {
    if (col.length) {
      assert(col[col.length - 1].faceUp, "Ostatnia karta w kolumnie powinna być odkryta");
      faceUpCount++;
    }
  }
  assert(faceUpCount === 7, "Wszystkie kolumny powinny mieć odkryty wierzch");
  const snapshot = gameTest.snapshot();
  const moved = gameTest.drawCard();
  assert(moved, "Dobranie karty powinno być możliwe");
  const undone = gameTest.undo();
  assert(undone, "Undo powinno działać");
  assert(gameTest.state.deck.length === snapshot.deck.length, "Undo przywraca talię");
  assert(gameTest.state.waste.length === snapshot.waste.length, "Undo przywraca stos dobierania");
  const g2 = new SolitaireGame(() => 0.5);
  g2.state = {
    deck: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const sixBlack = { id: 1, suit: "clubs", value: 6, faceUp: true };
  const fiveRed = { id: 2, suit: "hearts", value: 5, faceUp: true };
  g2.state.tableau[0].push(sixBlack);
  g2.state.tableau[1].push(fiveRed);
  const okMove = g2.moveTableauToTableau(1, 0, 0);
  assert(okMove, "Powinno pozwolić przenieść 5♥ na 6♣");
  assert(g2.state.tableau[0].length === 2, "Docelowa kolumna ma 2 karty");
  assert(g2.state.tableau[1].length === 0, "Źródłowa kolumna jest pusta");
  const g3 = new SolitaireGame(() => 0.5);
  g3.state = {
    deck: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const sevenRed = { id: 3, suit: "hearts", value: 7, faceUp: true };
  const sixRed = { id: 4, suit: "diamonds", value: 6, faceUp: true };
  g3.state.tableau[0].push(sevenRed);
  g3.state.tableau[1].push(sixRed);
  const badMove = g3.moveTableauToTableau(1, 0, 0);
  assert(!badMove, "Nie powinno pozwolić położyć czerwonej karty na czerwonej");
  assert(
    g3.state.tableau[0].length === 1 && g3.state.tableau[1].length === 1,
    "Przy nieprawidłowym ruchu stan się nie zmienia"
  );
  const g4 = new SolitaireGame(() => 0.5);
  g4.state = {
    deck: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const kingBlack = { id: 5, suit: "spades", value: 13, faceUp: true };
  g4.state.tableau[1].push(kingBlack);
  const kingMove = g4.moveTableauToTableau(1, 0, 0);
  assert(kingMove, "Król powinien móc zostać przeniesiony na pustą kolumnę");
  assert(
    g4.state.tableau[0].length === 1 && g4.state.tableau[1].length === 0,
    "Król trafia na pustą kolumnę"
  );
  const g5 = new SolitaireGame(() => 0.5);
  g5.state = {
    deck: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const aceHearts = { id: 10, suit: "hearts", value: 1, faceUp: true };
  g5.state.waste.push(aceHearts);
  const movedToFoundation = g5.autoMoveCard(aceHearts.id);
  assert(movedToFoundation, "autoMoveCard powinno przenieść asa z odrzutów na fundament");
  assert(g5.state.waste.length === 0 && g5.state.foundations[0].length === 1, "As trafia na fundament");
  const g6 = new SolitaireGame(() => 0.5);
  g6.state = {
    deck: [],
    waste: [],
    foundations: [[{ id: 20, suit: "spades", value: 1, faceUp: true }], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const twoSpades = { id: 21, suit: "spades", value: 2, faceUp: true };
  g6.state.tableau[0].push(twoSpades);
  const autoChanged = g6.autoComplete();
  assert(autoChanged, "autoComplete powinno wykonać co najmniej jeden ruch");
  assert(
    g6.state.tableau[0].length === 0 && g6.state.foundations[0].length === 2,
    "Dwójka powinna trafić na fundament"
  );
  const g7 = new SolitaireGame(() => 0.5);
  g7.state = {
    deck: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const sixClubs = { id: 30, suit: "clubs", value: 6, faceUp: true };
  const sevenDiamonds = { id: 31, suit: "diamonds", value: 7, faceUp: true };
  g7.state.tableau[0].push(sixClubs);
  g7.state.tableau[1].push(sevenDiamonds);
  const smartMoved = g7.autoMoveSmart(sixClubs.id);
  assert(smartMoved, "autoMoveSmart powinno przenieść kartę na poprawną kolumnę");
  assert(g7.state.tableau[0].length === 0 && g7.state.tableau[1].length === 2, "Karta trafia na docelową kolumnę");
  const g8 = new SolitaireGame(() => 0.5);
  g8.state = {
    deck: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTimestamp: 0,
    elapsedMs: 0,
    won: false
  };
  const aceSpades = { id: 40, suit: "spades", value: 1, faceUp: true };
  const aceHearts2 = { id: 41, suit: "hearts", value: 1, faceUp: true };
  g8.state.waste.push(aceSpades);
  g8.state.tableau[0].push(aceHearts2);
  const acesChanged = g8.autoMoveAces();
  assert(acesChanged, "autoMoveAces powinno przenieść asy na fundamenty");
  const totalOnFoundations =
    g8.state.foundations[0].length +
    g8.state.foundations[1].length +
    g8.state.foundations[2].length +
    g8.state.foundations[3].length;
  assert(totalOnFoundations === 2, "Oba asy powinny zostać przeniesione na fundamenty");
  const ds = { startX: 100, startY: 100 };
  assert(!shouldStartDragDistance(ds, 102, 103), "Mały ruch nie powinien startować drag");
  assert(shouldStartDragDistance(ds, 110, 110), "Duży ruch powinien startować drag");
  const sValid = defaultSettings();
  assert(validateSettings(sValid), "Domyślne ustawienia powinny przejść walidację");
  const sInvalid = { speed: "x", soundEnabled: true, soundVolume: 0.9, ambientEnabled: true, ambientTrack: "3", ambientVolume: 0.4, ambientMuteOnStartup: false };
  assert(!validateSettings(sInvalid), "Nieprawidłowe ustawienia nie powinny przechodzić walidacji");
  settingsState = defaultSettings();
  settingsState.ambientEnabled = true;
  settingsState.ambientTrack = "1";
  settingsState.ambientVolume = 0.1;
  saveSettings();
  const before = settingsState;
  loadSettings();
  assert(validateSettings(settingsState), "Ustawienia po loadSettings powinny być poprawne");
  assert(settingsState.ambientTrack === before.ambientTrack, "Ścieżka ambient powinna zostać przywrócona");
  assert(
    Math.abs(settingsState.ambientVolume - before.ambientVolume) < 1e-6,
    "Głośność ambient powinna zostać przywrócona"
  );
}
function bindUi() {
  const btnNew = document.getElementById("btn-new");
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  const btnAuto = document.getElementById("btn-auto");
  const btnSoundToggle = document.getElementById("btn-sound-toggle");
  const btnOptions = document.getElementById("btn-options");
  const btnResetBest = document.getElementById("btn-reset-best");
  const overlayOptions = document.getElementById("overlay-options");
  const btnCloseOptions = document.getElementById("btn-close-options");
  const optSpeed = document.getElementById("opt-speed");
  const optSound = document.getElementById("opt-sound");
  const optVolume = document.getElementById("opt-volume");
  const optAmbientEnabled = document.getElementById("opt-ambient-enabled");
  const optAmbientTrack = document.getElementById("opt-ambient-track");
  const optAmbientVolume = document.getElementById("opt-ambient-volume");
  const optAmbientMuteStart = document.getElementById("opt-ambient-mute-start");
  if (btnNew) btnNew.addEventListener("click", () => {
    if (confirm("Rozpocząć nową grę? Aktualny postęp zostanie utracony.")) newGame();
  });
  if (btnUndo) btnUndo.addEventListener("click", () => {
    undo();
  });
  if (btnRedo) btnRedo.addEventListener("click", () => {
    redo();
  });
  if (btnAuto) btnAuto.addEventListener("click", () => {
    autoComplete();
  });
  if (btnSoundToggle) {
    btnSoundToggle.addEventListener("click", () => {
      toggleSoundByFab();
    });
    updateSoundToggleUi();
  }
  if (btnOptions) btnOptions.addEventListener("click", () => {
    if (overlayOptions) overlayOptions.classList.add("visible");
  });
  if (btnCloseOptions) btnCloseOptions.addEventListener("click", () => {
    if (overlayOptions) overlayOptions.classList.remove("visible");
  });
  if (btnResetBest) btnResetBest.addEventListener("click", () => {
    if (confirm("Zresetować najlepszy wynik?")) resetBestScore();
  });
  if (overlayOptions) overlayOptions.addEventListener("click", e => {
    if (e.target === overlayOptions) overlayOptions.classList.remove("visible");
  });

  if (optSpeed) {
    optSpeed.value = settingsState.speed;
    optSpeed.addEventListener("change", () => {
      const value = optSpeed.value;
      if (value === "fast" || value === "normal" || value === "slow") {
        settingsState.speed = value;
        saveSettings();
      }
    });
  }

  if (optSound) {
    optSound.value = settingsState.soundEnabled ? "on" : "off";
    setSoundEnabled(settingsState.soundEnabled);
    optSound.addEventListener("change", () => {
      setSoundEnabled(optSound.value !== "off");
    });
  }

  if (optVolume) {
    const initial = settingsState.soundVolume;
    optVolume.value = String(initial);
    if (!Number.isNaN(initial)) setSoundVolume(initial);
    optVolume.addEventListener("input", () => {
      const value = parseFloat(optVolume.value);
      if (!Number.isNaN(value)) setSoundVolume(value);
    });
  }
  if (optAmbientEnabled) {
    optAmbientEnabled.value = ambientState.enabled ? "on" : "off";
    optAmbientEnabled.addEventListener("change", () => {
      setAmbientEnabled(optAmbientEnabled.value !== "off");
    });
  }
  if (optAmbientTrack) {
    optAmbientTrack.value = ambientState.track;
    optAmbientTrack.addEventListener("change", () => {
      setAmbientTrack(optAmbientTrack.value);
    });
  }
  if (optAmbientVolume) {
    optAmbientVolume.value = String(ambientState.volume);
    optAmbientVolume.addEventListener("input", () => {
      const value = parseFloat(optAmbientVolume.value);
      if (!Number.isNaN(value)) setAmbientVolume(value);
    });
  }
  if (optAmbientMuteStart) {
    optAmbientMuteStart.checked = ambientState.muteOnStartup;
    optAmbientMuteStart.addEventListener("change", () => {
      setAmbientMuteOnStartup(optAmbientMuteStart.checked);
    });
  }
}

function main() {
  loadSettings();
  soundState.enabled = settingsState.soundEnabled;
  soundState.volume = normalizeVolume(settingsState.soundVolume);
  ambientState.enabled = settingsState.ambientEnabled;
  ambientState.track = settingsState.ambientTrack;
  ambientState.volume = normalizeVolume(settingsState.ambientVolume);
  ambientState.muteOnStartup = settingsState.ambientMuteOnStartup;
  saveSettings();
  initSolitaire();
  ensureSoundFab();
  bindUi();
  console.log("Nie zaglądaj tu :p");
  try {
    runTests();
  } catch (e) {
    console.error("Błąd testów logiki:", e);
  }
  applyAmbientSettings();
  startAmbient(true);
  setupAmbientAutoplayFallback();
}

main();
