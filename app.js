const tg = window.Telegram?.WebApp;

const el = {
  userLine: document.getElementById("userLine"),
  networkPill: document.getElementById("networkPill"),

  balance: document.getElementById("balance"),
  perTap: document.getElementById("perTap"),
  perSec: document.getElementById("perSec"),

  energyNow: document.getElementById("energyNow"),
  energyMax: document.getElementById("energyMax"),
  energyFill: document.getElementById("energyFill"),
  energyHint: document.getElementById("energyHint"),
  boostStatus: document.getElementById("boostStatus"),

  tapBtn: document.getElementById("tapBtn"),
  floating: document.getElementById("floating"),
  comboLine: document.getElementById("comboLine"),

  critChance: document.getElementById("critChance"),
  critMult: document.getElementById("critMult"),
  autoRate: document.getElementById("autoRate"),

  shopList: document.getElementById("shopList"),
  skinList: document.getElementById("skinList"),
  questList: document.getElementById("questList"),

  resetBtn: document.getElementById("resetBtn"),
  shareBtn: document.getElementById("shareBtn"),
  claimAllBtn: document.getElementById("claimAllBtn"),
};

const STORAGE_KEY = "mobycoin_state_v3";
const now = () => Date.now();

const format = (n) => {
  if (n < 1000) return String(Math.floor(n));
  const units = ["K", "M", "B", "T"];
  let u = -1;
  let x = n;
  while (x >= 1000 && u < units.length - 1) { x /= 1000; u++; }
  return `${x.toFixed(x >= 10 || u === 0 ? 1 : 2)}${units[u]}`;
};

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function haptic(type="light"){
  try{ tg?.HapticFeedback?.impactOccurred(type); }catch{}
}

function floatText(text, cls=""){
  const node = document.createElement("div");
  node.className = "float-item " + cls;
  node.textContent = text;
  node.style.setProperty("--dx", (Math.random()*120 - 60).toFixed(0) + "px");
  el.floating.appendChild(node);
  setTimeout(()=>node.remove(), 760);
}

/* -------------------- Skins -------------------- */
const SKINS = [
  { id: "pirate", name: "Пиратская", face: "☠️", price: 0 },
  { id: "anchor", name: "Якорь", face: "⚓", price: 5000 },
  { id: "crown",  name: "Корона", face: "👑", price: 12000 },
  { id: "gem",    name: "Алмаз",  face: "💎", price: 25000 },
  { id: "map",    name: "Карта",  face: "🗺️", price: 40000 },
];

/* -------------------- Boosts -------------------- */
const BOOSTS = [
  { type: "infinite", title: "∞ Стамина", icon: "⚡", durationSec: 8 },
  { type: "double",   title: "x2 Прибыль", icon: "🪙", durationSec: 10 },
];

function defaultState() {
  return {
    balance: 0,

    // базовые параметры
    basePerTap: 1,
    perSec: 0,

    // энергия (замедленная)
    energyMax: 120,
    energy: 120,
    energyRegenPerSec: 0.6,
    energyCostPerTap: 2,

    // крит/комбо/авто
    critChance: 0.04,       // 4%
    critMult: 2.0,          // x2
    combo: 0,
    comboMultPerStep: 0.02, // +2% за шаг
    comboCap: 50,
    comboTimeoutMs: 1500,
    lastTapAt: 0,
    autoTapsPerSec: 0,

    upgrades: {
      cursor: 0,
      grandma: 0,
      farm: 0,
      factory: 0,
      lab: 0,

      battery: 0,
      regen: 0,
      efficiency: 0,

      crit: 0,
      critmult: 0,
      combo: 0,
      autoclick: 0,
    },

    skins: {
      owned: ["pirate"],
      active: "pirate",
    },

    boosts: {
      active: { double: 0, infinite: 0 },
      nextSpawnAt: 0,
      shown: null, // { type, expiresAt, corner }
    },

    quests: {
      daily: { lastClaimDay: null },

      taps: { done: 0, claimed: false, target: 300 },
      balance: { claimed: false, target: 800 },

      buy_grandma: { claimed: false },
      buy_lab: { claimed: false },
      buy_autoclick: { claimed: false },

      reach_persec: { claimed: false, target: 50 },
      buy_skin: { claimed: false }, // купи любой платный скин

      // заглушки без сервера (оставим как визуал)
      subscribe: { claimed: false },
      invite: { claimed: false, invited: 0, target: 3 },
    },

    lastTick: now(),
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const s = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...s,
      upgrades: { ...base.upgrades, ...(s.upgrades || {}) },
      skins: { ...base.skins, ...(s.skins || {}) },
      boosts: {
        ...base.boosts,
        ...(s.boosts || {}),
        active: { ...base.boosts.active, ...((s.boosts||{}).active || {}) },
      },
      quests: { ...base.quests, ...(s.quests || {}) },
    };
  }catch{
    return defaultState();
  }
}

function saveState(){
  state.lastTick = now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* -------------------- Telegram init -------------------- */
function initTelegram(){
  if(!tg) return;
  try{
    tg.ready();
    tg.expand();
  }catch{}
}

function renderTelegramHeader(){
  const isTg = Boolean(tg?.initDataUnsafe);
  const user = tg?.initDataUnsafe?.user;

  if(isTg && user){
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    el.userLine.textContent = `${name} • @${user.username || "без_юзернейма"}`;
    el.networkPill.textContent = "Telegram";
  }else{
    el.userLine.textContent = "Открой в Telegram для полного опыта";
    el.networkPill.textContent = "Browser";
  }
}

/* -------------------- Economy helpers -------------------- */
function calcComboMult(){
  const comboLvl = state.upgrades.combo || 0;
  const comboBoost = state.comboMultPerStep + comboLvl * 0.005; // +0.5%/lvl
  return 1 + clamp(state.combo, 0, state.comboCap) * comboBoost;
}

function calcPerTap(){
  const cursorLvl = state.upgrades.cursor || 0;
  const base = state.basePerTap + cursorLvl * 1;
  return base * calcComboMult();
}

function tryConsumeEnergy(cost){
  if(cost <= 0) return true;
  if(state.energy >= cost){
    state.energy -= cost;
    return true;
  }
  return false;
}

function applyOfflineProgress(){
  const t = now();
  const dtMs = Math.max(0, t - (state.lastTick || t));
  const dt = dtMs / 1000;

  // пассивный доход оффлайн
  if(state.perSec > 0) state.balance += state.perSec * dt;

  // реген энергии оффлайн
  if(state.energyRegenPerSec > 0){
    state.energy = clamp(state.energy + state.energyRegenPerSec * dt, 0, state.energyMax);
  }

  // протухшие бусты
  cleanupBoosts();

  state.lastTick = t;
}

/* -------------------- Upgrades (cookie-ish) -------------------- */
const upgrades = [
  // cookie buildings
  {
    key: "cursor",
    name: "Cursor",
    icon: "🖱️",
    desc: "+1 к тапу",
    baseCost: 15, costMul: 1.15,
    onBuy: () => {},
    valueText: () => `ур. ${state.upgrades.cursor} • +${state.upgrades.cursor}/тап`,
  },
  {
    key: "grandma",
    name: "Grandma",
    icon: "👵",
    desc: "+1/сек",
    baseCost: 100, costMul: 1.15,
    onBuy: () => { state.perSec += 1; },
    valueText: () => `ур. ${state.upgrades.grandma} • +${state.upgrades.grandma}/сек`,
  },
  {
    key: "farm",
    name: "Farm",
    icon: "🌾",
    desc: "+8/сек",
    baseCost: 1100, costMul: 1.15,
    onBuy: () => { state.perSec += 8; },
    valueText: () => `ур. ${state.upgrades.farm} • +${state.upgrades.farm*8}/сек`,
  },
  {
    key: "factory",
    name: "Factory",
    icon: "🏭",
    desc: "+47/сек",
    baseCost: 13000, costMul: 1.15,
    onBuy: () => { state.perSec += 47; },
    valueText: () => `ур. ${state.upgrades.factory} • +${state.upgrades.factory*47}/сек`,
  },
  {
    key: "lab",
    name: "Lab",
    icon: "🧪",
    desc: "+260/сек",
    baseCost: 200000, costMul: 1.15,
    onBuy: () => { state.perSec += 260; },
    valueText: () => `ур. ${state.upgrades.lab} • +${state.upgrades.lab*260}/сек`,
  },

  // stamina
  {
    key: "battery",
    name: "Battery Pack",
    icon: "🔋",
    desc: "+25 макс энергии",
    baseCost: 250, costMul: 1.25,
    onBuy: () => {
      state.energyMax += 25;
      state.energy = clamp(state.energy + 10, 0, state.energyMax);
    },
    valueText: () => `ур. ${state.upgrades.battery} • max ${Math.floor(state.energyMax)}`,
  },
  {
    key: "regen",
    name: "Recharge",
    icon: "⚡",
    desc: "+0.2 энергии/сек",
    baseCost: 400, costMul: 1.22,
    onBuy: () => { state.energyRegenPerSec += 0.2; },
    valueText: () => `ур. ${state.upgrades.regen} • ${state.energyRegenPerSec.toFixed(1)}/сек`,
  },
  {
    key: "efficiency",
    name: "Efficiency",
    icon: "🛡️",
    desc: "-0.1 энергии за тап",
    baseCost: 600, costMul: 1.22,
    onBuy: () => { state.energyCostPerTap = Math.max(0.6, state.energyCostPerTap - 0.1); },
    valueText: () => `ур. ${state.upgrades.efficiency} • cost ${state.energyCostPerTap.toFixed(1)}`,
  },

  // multitap mechanics
  {
    key: "crit",
    name: "Lucky Tooth",
    icon: "🍀",
    desc: "+1% к крит шансу",
    baseCost: 800, costMul: 1.25,
    onBuy: () => { state.critChance = Math.min(0.6, state.critChance + 0.01); },
    valueText: () => `ур. ${state.upgrades.crit} • ${Math.round(state.critChance*100)}%`,
  },
  {
    key: "critmult",
    name: "Whale Rage",
    icon: "🐋",
    desc: "+0.1 к крит множителю",
    baseCost: 1200, costMul: 1.28,
    onBuy: () => { state.critMult = Math.min(10, state.critMult + 0.1); },
    valueText: () => `ур. ${state.upgrades.critmult} • x${state.critMult.toFixed(1)}`,
  },
  {
    key: "combo",
    name: "Combo Training",
    icon: "🥊",
    desc: "усиливает комбо",
    baseCost: 900, costMul: 1.22,
    onBuy: () => {},
    valueText: () => `ур. ${state.upgrades.combo} • x${calcComboMult().toFixed(2)}`,
  },
  {
    key: "autoclick",
    name: "Auto Clicker",
    icon: "🤖",
    desc: "+1 авто-тап/сек",
    baseCost: 5000, costMul: 1.35,
    onBuy: () => { state.autoTapsPerSec += 1; },
    valueText: () => `ур. ${state.upgrades.autoclick} • ${state.autoTapsPerSec}/сек`,
  },
];

function upgradeCost(u){
  const lvl = state.upgrades[u.key] || 0;
  return Math.floor(u.baseCost * Math.pow(u.costMul, lvl));
}

/* -------------------- Quests -------------------- */
function dailyReward(){
  // растёт от прогресса: базовая + немного от дохода
  return Math.floor(80 + (state.perSec * 60) * 0.12);
}

function questDefinitions(){
  return [
    {
      key: "daily",
      icon: "🎁",
      name: "Ежедневная награда",
      desc: "Забирай 1 раз в день",
      canClaim: () => state.quests.daily.lastClaimDay !== todayKey(),
      rewardText: () => `+${format(dailyReward())} MobyCoin`,
      claim: () => {
        state.balance += dailyReward();
        state.quests.daily.lastClaimDay = todayKey();
      }
    },
    {
      key: "taps",
      icon: "👆",
      name: "Сделай 300 тапов",
      desc: `Прогресс: ${state.quests.taps.done}/${state.quests.taps.target}`,
      canClaim: () => state.quests.taps.done >= state.quests.taps.target && !state.quests.taps.claimed,
      rewardText: () => `+${format(250)} MobyCoin`,
      claim: () => { state.balance += 250; state.quests.taps.claimed = true; }
    },
    {
      key: "balance",
      icon: "🏦",
      name: "Накопи 800 MobyCoin",
      desc: `Баланс: ${format(state.balance)}/${format(state.quests.balance.target)}`,
      canClaim: () => state.balance >= state.quests.balance.target && !state.quests.balance.claimed,
      rewardText: () => `+${format(500)} MobyCoin`,
      claim: () => { state.balance += 500; state.quests.balance.claimed = true; }
    },
    {
      key: "buy_grandma",
      icon: "👵",
      name: "Купи Grandma",
      desc: "Купи бабушку хотя бы 1 раз",
      canClaim: () => state.upgrades.grandma >= 1 && !state.quests.buy_grandma.claimed,
      rewardText: () => `+${format(250)} MobyCoin`,
      claim: () => { state.balance += 250; state.quests.buy_grandma.claimed = true; }
    },
    {
      key: "buy_autoclick",
      icon: "🤖",
      name: "Купи Auto Clicker",
      desc: "Купи автокликер хотя бы 1 раз",
      canClaim: () => state.upgrades.autoclick >= 1 && !state.quests.buy_autoclick.claimed,
      rewardText: () => `+${format(900)} MobyCoin`,
      claim: () => { state.balance += 900; state.quests.buy_autoclick.claimed = true; }
    },
    {
      key: "reach_persec",
      icon: "📈",
      name: "Дойди до 50/сек",
      desc: `Текущий доход: ${format(state.perSec)}/${format(state.quests.reach_persec.target)}`,
      canClaim: () => state.perSec >= state.quests.reach_persec.target && !state.quests.reach_persec.claimed,
      rewardText: () => `+${format(3500)} MobyCoin`,
      claim: () => { state.balance += 3500; state.quests.reach_persec.claimed = true; }
    },
    {
      key: "buy_lab",
      icon: "🧪",
      name: "Открой Lab",
      desc: "Купи лабораторию хотя бы 1 раз",
      canClaim: () => state.upgrades.lab >= 1 && !state.quests.buy_lab.claimed,
      rewardText: () => `+${format(15000)} MobyCoin`,
      claim: () => { state.balance += 15000; state.quests.buy_lab.claimed = true; }
    },
    {
      key: "buy_skin",
      icon: "🎭",
      name: "Купи любой скин",
      desc: "Купи любой платный скин кнопки",
      canClaim: () => state.skins.owned.some(id => (SKINS.find(s=>s.id===id)?.price||0) > 0) && !state.quests.buy_skin.claimed,
      rewardText: () => `+${format(2000)} MobyCoin`,
      claim: () => { state.balance += 2000; state.quests.buy_skin.claimed = true; }
    },

    // Заглушки без сервера
    {
      key: "subscribe",
      icon: "📣",
      name: "Подпишись на канал",
      desc: "Без сервера — только заглушка",
      canClaim: () => false,
      rewardText: () => `+${format(1200)} MobyCoin`,
      claim: () => {}
    },
    {
      key: "invite",
      icon: "👥",
      name: "Пригласи 3 друзей",
      desc: "Без сервера — только заглушка",
      canClaim: () => false,
      rewardText: () => `+${format(2500)} MobyCoin`,
      claim: () => {}
    },
  ];
}

/* -------------------- Visual coins particles -------------------- */
function spawnCoins(count = 6){
  for(let i=0;i<count;i++){
    const c = document.createElement("div");
    c.className = "coin-particle coin-fly";

    const dx = (Math.random()*180 - 90).toFixed(0) + "px";
    const dx2 = (Math.random()*240 - 120).toFixed(0) + "px";
    const up = (Math.random()*120 + 70).toFixed(0) + "px";
    const down = (Math.random()*170 + 120).toFixed(0) + "px";

    c.style.setProperty("--dx", dx);
    c.style.setProperty("--dx2", dx2);
    c.style.setProperty("--up", up);
    c.style.setProperty("--down", down);

    el.floating.appendChild(c);
    setTimeout(()=>c.remove(), 950);
  }
}

/* -------------------- Boosts logic -------------------- */
function cleanupBoosts(){
  const t = now();
  if(state.boosts.active.double && t > state.boosts.active.double) state.boosts.active.double = 0;
  if(state.boosts.active.infinite && t > state.boosts.active.infinite) state.boosts.active.infinite = 0;

  if(state.boosts.shown && t > state.boosts.shown.expiresAt) state.boosts.shown = null;
}

function showRandomBoost(){
  if(state.boosts.shown) return;

  const t = now();
  if(state.boosts.nextSpawnAt && t < state.boosts.nextSpawnAt) return;

  // следующее появление через 22–42 сек
  state.boosts.nextSpawnAt = t + (22 + Math.random()*20) * 1000;

  const pick = BOOSTS[Math.floor(Math.random()*BOOSTS.length)];
  const lifeMs = 9000;

  const corners = ["boost-tl","boost-tr","boost-bl","boost-br"];
  const corner = corners[Math.floor(Math.random()*corners.length)];

  state.boosts.shown = { type: pick.type, expiresAt: t + lifeMs, corner };
  saveState();
}

function renderBoost(){
  const layer = document.getElementById("boostLayer");
  if(!layer) return;
  layer.innerHTML = "";

  const shown = state.boosts.shown;
  if(!shown) return;

  if(now() > shown.expiresAt){
    state.boosts.shown = null;
    saveState();
    return;
  }

  const def = BOOSTS.find(b => b.type === shown.type);
  if(!def) return;

  const btn = document.createElement("div");
  btn.className = `boost-chip ${shown.corner || "boost-tr"}`;
  const left = Math.max(0, Math.ceil((shown.expiresAt - now())/1000));

  btn.innerHTML = `
    <span>${def.icon}</span>
    <div style="display:flex;flex-direction:column;gap:2px">
      <div>${def.title}</div>
      <small>жми!</small>
    </div>
    <div class="boost-timer">${left}s</div>
  `;

  btn.addEventListener("click", () => {
    state.boosts.active[def.type] = now() + def.durationSec*1000;
    state.boosts.shown = null;
    haptic("medium");
    saveState();
    renderAll();
  });

  layer.appendChild(btn);
}

function renderBoostStatus(){
  const t = now();
  const parts = [];

  const d = state.boosts.active.double || 0;
  const i = state.boosts.active.infinite || 0;

  if(d > t) parts.push(`x2: ${Math.ceil((d - t)/1000)}с`);
  if(i > t) parts.push(`∞: ${Math.ceil((i - t)/1000)}с`);

  el.boostStatus.textContent = parts.length ? `Бусты: ${parts.join(" • ")}` : "";
}

/* -------------------- UI rendering -------------------- */
function applySkin(){
  const faceEl = document.getElementById("coinFace");
  if(!faceEl) return;
  const skin = SKINS.find(s => s.id === state.skins.active) || SKINS[0];
  faceEl.textContent = skin.face;
}

function renderEnergy(){
  el.energyNow.textContent = Math.floor(state.energy);
  el.energyMax.textContent = Math.floor(state.energyMax);

  const pct = state.energyMax > 0 ? (state.energy / state.energyMax) * 100 : 0;
  el.energyFill.style.width = `${clamp(pct,0,100)}%`;

  const missing = Math.max(0, state.energyMax - state.energy);
  if(missing < 1){
    el.energyHint.textContent = "Полная энергия";
  }else{
    const sec = state.energyRegenPerSec > 0 ? Math.ceil(missing / state.energyRegenPerSec) : null;
    el.energyHint.textContent = sec ? `До полного: ~${sec} сек` : "Восстановление отключено";
  }

  renderBoostStatus();
}

function renderStats(){
  cleanupBoosts();

  const perTap = calcPerTap();

  el.balance.textContent = format(state.balance);
  el.perTap.textContent = format(perTap);
  el.perSec.textContent = format(state.perSec);

  el.critChance.textContent = `${Math.round(state.critChance*100)}%`;
  el.critMult.textContent = `x${state.critMult.toFixed(1)}`;
  el.autoRate.textContent = `${state.autoTapsPerSec}/с`;

  const cm = calcComboMult();
  el.comboLine.textContent = `Комбо: x${cm.toFixed(2)} (${state.combo}/${state.comboCap})`;
}

function renderShop(){
  el.shopList.innerHTML = "";
  upgrades.forEach((u) => {
    const cost = upgradeCost(u);

    const row = document.createElement("div");
    row.className = "item";

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = u.icon;

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = u.name;

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = `${u.desc} • ${u.valueText()}`;

    meta.appendChild(name);
    meta.appendChild(desc);

    const buy = document.createElement("div");
    buy.className = "buy";

    const costEl = document.createElement("div");
    costEl.className = "cost";
    costEl.textContent = `Цена: ${format(cost)}`;

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Купить";
    btn.disabled = state.balance < cost;

    btn.addEventListener("click", () => {
      const c = upgradeCost(u);
      if(state.balance < c) return;

      state.balance -= c;
      state.upgrades[u.key] = (state.upgrades[u.key] || 0) + 1;
      u.onBuy();

      haptic("medium");
      floatText(`-${format(c)}`);
      saveState();
      renderAll();
    });

    buy.appendChild(costEl);
    buy.appendChild(btn);

    row.appendChild(icon);
    row.appendChild(meta);
    row.appendChild(buy);

    el.shopList.appendChild(row);
  });
}

function renderSkins(){
  if(!el.skinList) return;
  el.skinList.innerHTML = "";

  SKINS.forEach((s) => {
    const owned = state.skins.owned.includes(s.id);
    const active = state.skins.active === s.id;

    const row = document.createElement("div");
    row.className = "item";

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = s.face;

    const meta = document.createElement("div");
    meta.className = "meta";
    const status = owned ? (active ? "Активен" : "Куплен") : "Не куплен";
    meta.innerHTML = `<div class="name">${s.name}</div><div class="desc">${status}</div>`;

    const buy = document.createElement("div");
    buy.className = "buy";

    const costEl = document.createElement("div");
    costEl.className = "cost";
    costEl.textContent = owned ? "" : `Цена: ${format(s.price)}`;

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = owned ? (active ? "✓" : "Выбрать") : "Купить";
    btn.disabled = (active) || (!owned && state.balance < s.price);

    btn.addEventListener("click", () => {
      if(!owned){
        if(state.balance < s.price) return;
        state.balance -= s.price;
        state.skins.owned.push(s.id);
      }
      state.skins.active = s.id;
      haptic("medium");
      saveState();
      renderAll();
    });

    buy.appendChild(costEl);
    buy.appendChild(btn);

    row.appendChild(icon);
    row.appendChild(meta);
    row.appendChild(buy);

    el.skinList.appendChild(row);
  });
}

function renderQuests(){
  el.questList.innerHTML = "";
  const defs = questDefinitions();

  defs.forEach((q) => {
    const row = document.createElement("div");
    row.className = "item";

    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = q.icon;

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = q.name;

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = `${q.desc} • Награда: ${q.rewardText()}`;

    meta.appendChild(name);
    meta.appendChild(desc);

    const buy = document.createElement("div");
    buy.className = "buy";

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Забрать";
    btn.disabled = !q.canClaim();

    btn.addEventListener("click", () => {
      if(!q.canClaim()) return;
      q.claim();
      haptic("medium");
      floatText(q.rewardText().replace(" MobyCoin",""), "crit");
      saveState();
      renderAll();
    });

    buy.appendChild(btn);

    row.appendChild(icon);
    row.appendChild(meta);
    row.appendChild(buy);

    el.questList.appendChild(row);
  });
}

function renderAll(){
  renderTelegramHeader();
  applySkin();
  renderEnergy();
  renderStats();
  renderShop();
  renderSkins();
  renderQuests();
  renderBoost();
}

/* -------------------- Core game: tap / combo / crit -------------------- */
function updateComboOnTap(){
  const t = now();
  if(t - state.lastTapAt <= state.comboTimeoutMs){
    state.combo = clamp(state.combo + 1, 0, state.comboCap);
  }else{
    state.combo = 1;
  }
  state.lastTapAt = t;
}

function maybeDecayCombo(){
  const t = now();
  if(state.combo > 0 && t - state.lastTapAt > state.comboTimeoutMs){
    state.combo = Math.max(0, state.combo - 2);
    if(state.combo === 0) state.lastTapAt = 0;
  }
}

function doTap(isAuto=false){
  cleanupBoosts();

  const infiniteOn = now() < (state.boosts.active.infinite || 0);
  const cost = infiniteOn ? 0 : state.energyCostPerTap;

  if(!tryConsumeEnergy(cost)){
    if(!isAuto){
      haptic("rigid");
      floatText(`Нет энергии`, "noenergy");
    }
    return false;
  }

  updateComboOnTap();

  const perTap = calcPerTap();
  const isCrit = Math.random() < state.critChance;

  let gain = isCrit ? perTap * state.critMult : perTap;

  const doubleOn = now() < (state.boosts.active.double || 0);
  if(doubleOn) gain *= 2;

  state.balance += gain;

  if(!isAuto){
    haptic(isCrit ? "heavy" : "light");
    floatText(`+${format(gain)}`, isCrit ? "crit" : "");
    spawnCoins(isCrit ? 10 : 6);
  }

  // квест: тапать
  state.quests.taps.done += 1;

  saveState();
  return true;
}

/* -------------------- Tabs -------------------- */
function initTabs(){
  const tabs = document.querySelectorAll(".tab");
  const panels = {
    tap: document.getElementById("tab-tap"),
    shop: document.getElementById("tab-shop"),
    quests: document.getElementById("tab-quests"),
  };

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      btn.classList.add("active");

      const key = btn.dataset.tab;
      Object.values(panels).forEach(p => p.classList.remove("show"));
      panels[key].classList.add("show");
    });
  });
}

/* -------------------- Loops -------------------- */
function startLoops(){
  setInterval(() => {
    // пассив
    if(state.perSec > 0) state.balance += state.perSec;

    // реген энергии
    if(state.energyRegenPerSec > 0){
      state.energy = clamp(state.energy + state.energyRegenPerSec, 0, state.energyMax);
    }

    // комбо decay
    maybeDecayCombo();

    // авто-тапы
    const n = state.autoTapsPerSec || 0;
    for(let i=0;i<n;i++) doTap(true);

    // бусты
    showRandomBoost();

    saveState();
    renderAll();
  }, 1000);
}

/* -------------------- UI wires -------------------- */
function wireUI(){
  el.tapBtn.addEventListener("click", () => {
    doTap(false);
    renderAll();
  });

  el.resetBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    renderAll();
  });

  el.shareBtn.addEventListener("click", () => {
    const text =
      `MobyCoin 🪙\nБаланс: ${format(state.balance)}\nЗа тап: ${format(calcPerTap())}\nВ сек: ${format(state.perSec)}\nЭнергия: ${Math.floor(state.energy)}/${Math.floor(state.energyMax)}`;
    if(tg?.showPopup){
      tg.showPopup({ title: "Результат", message: text, buttons: [{ type:"close", text:"Ок" }] });
    }else{
      alert(text);
    }
  });

  el.claimAllBtn.addEventListener("click", () => {
    const defs = questDefinitions();
    let claimed = 0;
    defs.forEach((q) => {
      if(q.canClaim()){
        q.claim();
        claimed++;
      }
    });
    if(claimed > 0){
      haptic("medium");
      floatText(`+квесты`, "crit");
      saveState();
      renderAll();
    }else{
      haptic("light");
    }
  });
}

/* -------------------- Boot -------------------- */
initTelegram();
applyOfflineProgress();
initTabs();
wireUI();
renderAll();
startLoops();
