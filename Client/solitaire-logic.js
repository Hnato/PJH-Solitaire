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
        this.pushUndo();
        if (where.type === "waste") {
          s.waste.pop();
        } else {
          s.tableau[where.col].pop();
          const last = s.tableau[where.col][s.tableau[where.col].length - 1];
          if (last && !last.faceUp) last.faceUp = true;
        }
        foundation.push(card);
        s.moves++;
        this.checkWin();
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

export { SolitaireGame };
