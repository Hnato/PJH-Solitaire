import { SolitaireGame } from "./solitaire-logic.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "Assertion failed");
  }
}

function runTests() {
  const game = new SolitaireGame(() => 0.123456);
  assert(game.state.deck.length + game.state.waste.length + game.state.foundations.reduce((a, f) => a + f.length, 0) + game.state.tableau.reduce((a, c) => a + c.length, 0) === 52, "Talia ma mieć 52 karty");
  let faceUpCount = 0;
  for (const col of game.state.tableau) {
    if (col.length) {
      assert(col[col.length - 1].faceUp, "Ostatnia karta w kolumnie powinna być odkryta");
      faceUpCount++;
    }
  }
  assert(faceUpCount === 7, "Wszystkie kolumny powinny mieć odkryty wierzch");
  const snapshot = game.snapshot();
  const moved = game.drawCard();
  assert(moved, "Dobranie karty powinno być możliwe");
  const undone = game.undo();
  assert(undone, "Undo powinno działać");
  assert(game.state.deck.length === snapshot.deck.length, "Undo przywraca talię");
  assert(game.state.waste.length === snapshot.waste.length, "Undo przywraca stos dobierania");
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
  assert(g3.state.tableau[0].length === 1 && g3.state.tableau[1].length === 1, "Przy nieprawidłowym ruchu stan się nie zmienia");
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
  assert(g4.state.tableau[0].length === 1 && g4.state.tableau[1].length === 0, "Król trafia na pustą kolumnę");
  console.log("Testy PJH Solitaire: OK");
}

export { runTests };
