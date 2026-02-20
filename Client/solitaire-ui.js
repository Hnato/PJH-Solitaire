import { SolitaireGame } from "./solitaire-logic.js";

document.addEventListener("dragstart", e => {
  e.preventDefault();
});

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

function findCardElementById(id) {
  return board.root.querySelector('.card.face-up[data-id="' + id + '"]');
}

function pointerDownCard(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const target = e.target.closest(".card.face-up");
  if (!target) return;
  const cardId = parseInt(target.dataset.id, 10);
  const rect = target.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
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
    offsetX,
    offsetY,
    movingCards,
    cardRects,
    originColumn: columnIndex,
    originIndex: indexInColumn,
    isDragging: false,
    dropTarget: null
  };
  for (const el of movingCards) {
    el.classList.add("dragging");
  }
  window.addEventListener("mousemove", pointerMoveCard);
  window.addEventListener("mouseup", pointerUpCard);
}

function pointerMoveCard(e) {
  if (!dragState) return;
  if (!dragState.isDragging) {
    dragState.isDragging = true;
  }
  for (let i = 0; i < dragState.movingCards.length; i++) {
    const el = dragState.movingCards[i];
    const rect = dragState.cardRects[i];
    const x = e.clientX - dragState.offsetX;
    const y = e.clientY - dragState.offsetY;
    const dx = x - rect.left;
    const dy = y - rect.top;
    let t = "translate(" + dx + "px," + dy + "px)";
    if (el.classList.contains("face-down")) {
      t += " rotateY(180deg)";
    }
    el.style.transform = t;
  }
  updateDropHints(e.clientX, e.clientY);
}

function pointerUpCard(e) {
  window.removeEventListener("mousemove", pointerMoveCard);
  window.removeEventListener("mouseup", pointerUpCard);
  if (!dragState) return;
  if (!dragState.isDragging) {
    for (const el of dragState.movingCards) {
      el.classList.remove("dragging");
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
  }
  clearDropHighlights();
  dragState = null;
  render();
  if (game.state.won) {
    saveBestScore(game.state.moves, game.state.elapsedMs);
    if (board.messageEl) {
      board.messageEl.textContent = "Wygrana!";
      board.messageEl.classList.add("visible");
      setTimeout(() => {
        board.messageEl.classList.remove("visible");
      }, 3000);
    }
  }
}

function onStockClick() {
  game.drawCard();
  render();
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
}

function tickLoop() {
  const now = Date.now();
  game.tick(now);
  updateHud();
  animationFrameId = requestAnimationFrame(tickLoop);
}

function newGame() {
  game.newGame();
  render();
}

function undo() {
  if (game.undo()) render();
}

function redo() {
  if (game.redo()) render();
}

function autoComplete() {
  if (game.autoComplete()) render();
}

function initSolitaire() {
  game = new SolitaireGame();
  setupBoard();
  render();
  if (animationFrameId != null) cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(tickLoop);
}

export { initSolitaire, newGame, undo, redo, autoComplete, resetBestScore };
