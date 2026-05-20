/* ============================================================
   dialogue.js
   Dialogue event system. Shows character image and dialogue box.
   ============================================================ */

const Dialogue = (() => {
  let container, charImage, dialogBox, dialogText;
  let currentDialogue = null;
  let currentIndex = 0;
  let isActive = false;

  /* Predefined dialogue events mapped to map coordinates */
  const dialogueEvents = {
    "1,1": {
      character: "asset/images/Avg_avg_npc_083.png",
      lines: [
        "你好，预言家。",
        "你本来应该与我同行的",
        "不是吗？"
      ]
    }
  };

  function init() {
    /* Create dialogue container */
    container = document.createElement("div");
    container.id = "dialogue-container";
    container.classList.add("hidden");
    document.getElementById("screen").appendChild(container);

    /* Character image */
    charImage = document.createElement("img");
    charImage.id = "dialogue-character";
    container.appendChild(charImage);

    /* Dialogue box */
    dialogBox = document.createElement("div");
    dialogBox.id = "dialogue-box";
    container.appendChild(dialogBox);

    /* Dialogue text */
    dialogText = document.createElement("p");
    dialogText.id = "dialogue-text";
    dialogBox.appendChild(dialogText);

    /* Handle click to advance dialogue */
    container.addEventListener("click", advance);
    window.addEventListener("keydown", (e) => {
      if (isActive && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        advance();
      }
    });
  }

  function show(x, y) {
    const key = `${y},${x}`;
    if (!dialogueEvents[key]) return false;

    currentDialogue = dialogueEvents[key];
    currentIndex = 0;
    isActive = true;

    charImage.src = currentDialogue.character;
    dialogText.textContent = currentDialogue.lines[0];

    container.classList.remove("hidden");
    document.body.style.cursor = "pointer";
    return true;
  }

  function advance() {
    if (!isActive || !currentDialogue) return;

    currentIndex++;
    if (currentIndex >= currentDialogue.lines.length) {
      close();
      return;
    }

    dialogText.textContent = currentDialogue.lines[currentIndex];
  }

  function close() {
    isActive = false;
    currentDialogue = null;
    currentIndex = 0;
    container.classList.add("hidden");
    document.body.style.cursor = "none";
  }

  function isDialogueCell(x, y) {
    return dialogueEvents[`${y},${x}`] !== undefined;
  }

  return {
    init,
    show,
    close,
    isDialogueCell,
    isActive: () => isActive,
    canMove: () => !isActive
  };
})();