/* ============================================================
   inventory.js
   Inventory system with backpack UI. Press B to toggle.
   ============================================================ */

const Inventory = (() => {
  let container, itemList, _isOpen = false;
  const items = [];

  const ITEMS = {
    axe: {
      id: "axe",
      name: "斧子",
      description: "一把锋利的森林之斧",
      icon: "🪓"
    },
    key: {
      id: "key",
      name: "钥匙",
      description: "可以打开上锁的门",
      icon: "🔑"
    },
    potion: {
      id: "potion",
      name: "治疗药水",
      description: "恢复生命值",
      icon: "🧪"
    }
  };

  function init() {
    container = document.createElement("div");
    container.id = "inventory-container";
    container.classList.add("hidden");
    document.getElementById("screen").appendChild(container);

    const header = document.createElement("div");
    header.className = "inventory-header";
    header.textContent = "背包";
    container.appendChild(header);

    itemList = document.createElement("div");
    itemList.className = "inventory-items";
    container.appendChild(itemList);

    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "b") {
        toggle();
      }
    });

    container.addEventListener("click", () => {
      close();
    });
  }

  function toggle() {
    if (_isOpen) {
      close();
    } else {
      open();
    }
  }

  function open() {
    _isOpen = true;
    container.classList.remove("hidden");
    renderItems();
  }

  function close() {
    _isOpen = false;
    container.classList.add("hidden");
  }

  function isOpen() {
    return _isOpen;
  }

  function addItem(itemId) {
    if (!ITEMS[itemId]) return false;
    const existing = items.find(i => i.id === itemId);
    if (existing) {
      existing.quantity++;
    } else {
      items.push({
        ...ITEMS[itemId],
        quantity: 1
      });
    }
    return true;
  }

  function hasItem(itemId) {
    return items.some(i => i.id === itemId);
  }

  function renderItems() {
    itemList.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "inventory-empty";
      empty.textContent = "背包是空的";
      itemList.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const el = document.createElement("div");
      el.className = "inventory-item";
      el.innerHTML = `
        <span class="item-icon">${item.icon}</span>
        <span class="item-name">${item.name}</span>
        ${item.quantity > 1 ? `<span class="item-qty">x${item.quantity}</span>` : ""}
        <span class="item-desc">${item.description}</span>
      `;
      itemList.appendChild(el);
    });
  }

  return {
    init,
    toggle,
    open,
    close,
    isOpen,
    addItem,
    hasItem,
    ITEMS
  };
})();