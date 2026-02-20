import { initSolitaire, newGame, undo, redo, autoComplete, resetBestScore } from "./solitaire-ui.js";
import { runTests } from "./solitaire-tests.js";

function bindUi() {
  const btnNew = document.getElementById("btn-new");
  const btnUndo = document.getElementById("btn-undo");
  const btnRedo = document.getElementById("btn-redo");
  const btnAuto = document.getElementById("btn-auto");
  const btnOptions = document.getElementById("btn-options");
  const btnResetBest = document.getElementById("btn-reset-best");
  const overlayOptions = document.getElementById("overlay-options");
  const btnCloseOptions = document.getElementById("btn-close-options");
  if (btnNew) btnNew.addEventListener("click", () => {
    if (confirm("Rozpocząć nową grę? Aktualny postęp zostanie utracony.")) newGame();
  });
  if (btnUndo) btnUndo.addEventListener("click", () => {
    if (confirm("Cofnąć ostatni ruch?")) undo();
  });
  if (btnRedo) btnRedo.addEventListener("click", () => {
    if (confirm("Powtórzyć następny ruch?")) redo();
  });
  if (btnAuto) btnAuto.addEventListener("click", () => {
    if (confirm("Uruchomić automatyczne przenoszenie kart (Auto)?")) autoComplete();
  });
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
}

function main() {
  initSolitaire();
  bindUi();
  try {
    runTests();
  } catch (e) {
    console.error("Błąd testów logiki:", e);
  }
}

main();
