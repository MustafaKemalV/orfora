import {
  createMultimodalRouter,
  defaultGenerativeCatalog,
  defaultTierModel,
  defaultVectorCatalog,
} from "../../src/index";
import type { EmbeddingProvider } from "../../src/types";

// Run the embedding model in a Web Worker so its heavy forward pass never blocks
// the main thread: the page keeps animating while the router thinks. It is the
// same model and settings as orfora/local, so the vectors, and therefore every
// routing decision, are identical; only the thread the maths runs on changes.
function workerEmbedder(): EmbeddingProvider {
  const worker = new Worker(new URL("./embedder.worker.ts", import.meta.url), {
    type: "module",
  });
  let seq = 0;
  const pending = new Map<
    number,
    { resolve: (v: number[][]) => void; reject: (e: Error) => void }
  >();
  worker.addEventListener("message", (e: MessageEvent) => {
    const { id, vectors, error } = e.data as {
      id: number;
      vectors?: number[][];
      error?: string;
    };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(vectors ?? []);
  });
  return {
    embed(texts: string[]) {
      return new Promise<number[][]>((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, texts });
      });
    },
  };
}

// A no-key multimodal router: the embedding model runs in a background worker, and
// both the chat catalog and the generative catalog are scored on real benchmarks.
// The worker embeds with the same MiniLM the tier predictor was trained on, so the
// learned tier (from real routing outcomes) is enabled here, not the seed fallback.
const router = createMultimodalRouter({
  embed: workerEmbedder(),
  chat: { tierPredictor: defaultTierModel },
});
const byId = new Map(defaultVectorCatalog.map((m) => [m.id, m]));
const unitShort: Record<string, string> = {
  image: "img",
  second: "sec",
  minute: "min",
  song: "song",
  "1k_chars": "1k",
};

const promptEl = document.querySelector("#prompt") as HTMLTextAreaElement;
const runEl = document.querySelector("#run") as HTMLButtonElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const familiesEl = document.querySelector("#families") as HTMLElement;
const hudEl = document.querySelector("#hud") as HTMLElement;
const beamsEl = document.querySelector("#beams") as unknown as SVGSVGElement;
const exampleEl = document.querySelector(
  "#example-select",
) as HTMLSelectElement;

const circuitEl = document.querySelector(
  "#circuit",
) as unknown as SVGSVGElement;
const svgns = "http://www.w3.org/2000/svg";

const shortId = (id: string) => id.split("/")[1] ?? id;
const set = (id: string, value: string) => {
  const el = document.querySelector(id);
  if (el) el.textContent = value;
};

// Neon circuit traces that run ALONG the grid lines (never across a cell) and
// converge on the ORFORA mark: dye through veins, reversed, coming from all
// around to meet at one point. Every coordinate snaps to the 46px lattice.
const GRID = 46;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const SEG = 88; // length of each travelling energy pulse

function drawCircuit() {
  const mark = document.querySelector(".masthead h1") as HTMLElement | null;
  if (!mark) return;
  const r = mark.getBoundingClientRect();
  const tx = snap(r.left + r.width / 2);
  // Converge on a grid node just BELOW the ORFORA mark, so the meeting point is
  // out in the open on the grid, not hidden behind the letters.
  const ty = snap(r.bottom + 12);
  const W = window.innerWidth;
  const H = window.innerHeight;
  circuitEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  circuitEl.innerHTML = "";

  const traces: Array<{ sx: number; sy: number; floor: boolean }> = [];
  const rows = 6;
  for (let i = 0; i < rows; i++) {
    const y = snap(H * (0.16 + (0.72 * i) / (rows - 1)));
    traces.push({ sx: 0, sy: y, floor: false });
    traces.push({ sx: snap(W), sy: y, floor: false });
  }
  for (let i = 1; i <= 4; i++) {
    traces.push({ sx: snap((W * i) / 5), sy: snap(H), floor: true });
  }

  traces.forEach(({ sx, sy, floor }, idx) => {
    let d: string;
    if (floor) {
      const midY = snap(ty + 92 + (idx % 3) * GRID);
      d = `M ${sx} ${sy} V ${midY} H ${tx} V ${ty}`;
    } else {
      const midX = snap(sx + (tx - sx) * (0.4 + (idx % 3) * 0.08));
      d = `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`;
    }
    const base = document.createElementNS(svgns, "path");
    base.setAttribute("d", d);
    base.setAttribute("class", "trace-base");
    circuitEl.appendChild(base);
    const pulse = document.createElementNS(svgns, "path");
    pulse.setAttribute("d", d);
    pulse.setAttribute("class", "trace-pulse");
    circuitEl.appendChild(pulse);
    const len = pulse.getTotalLength();
    pulse.style.strokeDasharray = `${SEG} ${len}`;
    pulse.style.setProperty("--travel", `${-len}px`);
    pulse.style.animationDelay = `${((idx % 6) * 0.34 + (idx % 2) * 0.17).toFixed(2)}s`;
    pulse.style.animationDuration = `${(2.4 + (idx % 4) * 0.35).toFixed(2)}s`;
  });

  const dot = document.createElementNS(svgns, "circle");
  dot.setAttribute("cx", String(tx));
  dot.setAttribute("cy", String(ty));
  dot.setAttribute("r", "3");
  dot.setAttribute("class", "conv-dot");
  circuitEl.appendChild(dot);
}
drawCircuit();
window.addEventListener("resize", drawCircuit);

// --- Model families -------------------------------------------------------
// Instead of a flat wall of ~70 nodes, group models into family cards the way a
// user thinks of them: chat by vendor family (Claude, GPT, ...), generative by
// output modality (Image, Video, Speech, Music). A card opens to reveal its
// models, and a routing decision opens the winning family and promotes the chosen
// model to the front.
interface Member {
  id: string;
  short: string;
  sub: string;
  cls: string;
}
interface Family {
  key: string;
  label: string;
  badge: string;
  unit: string;
  members: Member[];
  prices: number[];
}

const families: Family[] = [];
const familyByKey = new Map<string, Family>();
function addMember(
  key: string,
  label: string,
  badge: string,
  unit: string,
  member: Member,
  price: number,
) {
  let fam = familyByKey.get(key);
  if (!fam) {
    fam = { key, label, badge, unit, members: [], prices: [] };
    familyByKey.set(key, fam);
    families.push(fam);
  }
  fam.members.push(member);
  fam.prices.push(price);
}

for (const m of defaultVectorCatalog) {
  addMember(
    `chat:${m.family}`,
    m.family,
    "chat",
    "/M",
    {
      id: m.id,
      short: shortId(m.id),
      sub: `${m.priceTier} // $${m.pricePerMTokens}/M`,
      cls: `tier-${m.priceTier}`,
    },
    m.pricePerMTokens,
  );
}
const modLabel: Record<string, string> = {
  image: "Image",
  video: "Video",
  speech: "Speech",
  music: "Music",
};
for (const m of defaultGenerativeCatalog) {
  const u = unitShort[m.priceUnit] ?? m.priceUnit;
  addMember(
    `gen:${m.modality}`,
    modLabel[m.modality] ?? m.modality,
    m.modality,
    `/${u}`,
    {
      id: m.id,
      short: shortId(m.id),
      sub: `${m.qualityTier} // $${m.pricePerUnit}/${u}`,
      cls: `mod-${m.modality}`,
    },
    m.pricePerUnit,
  );
}

// Order each family's models cheapest first.
for (const fam of families) {
  const zipped = fam.members.map((mem, i) => ({ mem, p: fam.prices[i] ?? 0 }));
  zipped.sort((a, b) => a.p - b.p);
  fam.members = zipped.map((z) => z.mem);
  fam.prices = zipped.map((z) => z.p);
}

const familyCardByKey = new Map<string, HTMLElement>();
const familyKeyByModel = new Map<string, string>();

function priceRange(fam: Family): string {
  const min = Math.min(...fam.prices);
  const max = Math.max(...fam.prices);
  return min === max ? `$${min}${fam.unit}` : `$${min}-${max}${fam.unit}`;
}

// The cards stay a uniform, calm grid. The open family's models live in a single
// floating popover that comes to the front over the grid, like a dropdown, so no
// card is taller than another and only one list is ever open.
const popover = document.createElement("div");
popover.className = "family-popover";
popover.hidden = true;
familiesEl.appendChild(popover);

let openKey: string | null = null;

function renderPopover(fam: Family, selectedId?: string) {
  popover.className = `family-popover badge-${fam.badge}`;
  const members = selectedId
    ? [...fam.members].sort((a, b) =>
        a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0,
      )
    : fam.members;
  const rows = members
    .map((mem) => {
      const sel = mem.id === selectedId ? " selected" : "";
      return (
        `<div class="family-model ${mem.cls}${sel}">` +
        `<span class="fm-id">${mem.short}</span>` +
        `<span class="fm-sub">${mem.sub}</span></div>`
      );
    })
    .join("");
  popover.innerHTML =
    `<div class="pop-head"><span class="family-badge">${fam.badge}</span>` +
    `<span class="family-name">${fam.label}</span>` +
    `<span class="family-range">${priceRange(fam)}</span></div>` +
    `<div class="pop-models">${rows}</div>`;
}

function positionPopover(card: HTMLElement) {
  const width = Math.max(card.offsetWidth, 250);
  const maxLeft = familiesEl.clientWidth - width - 4;
  const left = Math.max(4, Math.min(card.offsetLeft, maxLeft));
  popover.style.left = `${left}px`;
  popover.style.top = `${card.offsetTop + card.offsetHeight + 6}px`;
  popover.style.width = `${width}px`;
}

function openPopover(key: string, selectedId?: string) {
  const fam = familyByKey.get(key);
  const card = familyCardByKey.get(key);
  if (!fam || !card) return;
  renderPopover(fam, selectedId);
  positionPopover(card);
  popover.hidden = false;
  openKey = key;
  for (const [k, c] of familyCardByKey) c.classList.toggle("open", k === key);
}

function closePopover() {
  popover.hidden = true;
  openKey = null;
  for (const c of familyCardByKey.values()) c.classList.remove("open");
}

for (const fam of families) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `family-card badge-${fam.badge}`;
  card.innerHTML =
    `<span class="family-badge">${fam.badge}</span>` +
    `<span class="family-name">${fam.label}</span>` +
    `<span class="family-range">${priceRange(fam)}</span>` +
    `<span class="family-count">${fam.members.length}</span>`;
  card.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openKey === fam.key) closePopover();
    else openPopover(fam.key);
  });
  familiesEl.appendChild(card);
  familyCardByKey.set(fam.key, card);
  for (const mem of fam.members) familyKeyByModel.set(mem.id, fam.key);
}

// Close the popover on an outside click, and keep it aligned on resize.
document.addEventListener("click", (e) => {
  if (openKey && !popover.contains(e.target as Node)) closePopover();
});
window.addEventListener("resize", () => {
  if (!openKey) return;
  const card = familyCardByKey.get(openKey);
  if (card) positionPopover(card);
});

// --- Examples -------------------------------------------------------------
const examples = [
  "Refactor this module to remove the duplication and explain the change.",
  "Prove that the square root of 2 is irrational.",
  "Write a short noir opening about a lighthouse keeper.",
  "What is the current USD to EUR rate today?",
  "Summarise this paragraph in one sentence.",
  "Bu fonksiyondaki hatayi bul ve duzelt.",
  "Generate an image of a neon city skyline at night.",
  "Design a logo with bold typography for a coffee brand.",
  "Read this paragraph aloud in a calm, warm voice.",
  "Create a ten second video of rain on a window.",
  "Compose a lo-fi instrumental track to study to.",
];
for (const ex of examples) {
  const opt = document.createElement("option");
  opt.value = ex;
  opt.textContent = ex.length > 58 ? `${ex.slice(0, 56)}...` : ex;
  exampleEl.appendChild(opt);
}
exampleEl.addEventListener("change", () => {
  if (!exampleEl.value) return;
  promptEl.value = exampleEl.value;
  exampleEl.selectedIndex = 0;
  route();
});

function drawBeam(target: HTMLElement | undefined) {
  beamsEl.innerHTML = "";
  if (!target) return;
  const src = runEl.getBoundingClientRect();
  const dst = target.getBoundingClientRect();
  const line = document.createElementNS(svgns, "line");
  line.setAttribute("x1", String(src.left + src.width / 2));
  line.setAttribute("y1", String(src.top + src.height / 2));
  line.setAttribute("x2", String(dst.left + dst.width / 2));
  line.setAttribute("y2", String(dst.top + dst.height / 2));
  line.setAttribute("class", "beam-line");
  beamsEl.appendChild(line);
}

async function route() {
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  runEl.disabled = true;
  statusEl.textContent = "ROUTING // COMPILING ON THE GRID...";
  try {
    const d = await router.route(prompt);

    familiesEl.classList.add("decided");
    for (const card of familyCardByKey.values())
      card.classList.remove("active");

    hudEl.hidden = false;
    set("#hud-mod", d.modality.toUpperCase());
    set("#hud-model", shortId(d.model));
    set("#hud-l3", d.modality === "text" ? "TIER" : "QUALITY");
    set("#hud-l4", d.modality === "text" ? "FITNESS" : "MATCH");
    if (d.modality === "text") {
      const model = byId.get(d.model);
      set("#hud-tier", d.tier);
      set(
        "#hud-fit",
        typeof d.fitness === "number" ? d.fitness.toFixed(2) : "n/a",
      );
      set("#hud-cost", model ? `$${model.pricePerMTokens}/M` : "-");
      set(
        "#hud-reason",
        `${d.capability} // ${d.reason}${d.fallback ? " (fail-open)" : ""}`,
      );
    } else {
      set("#hud-tier", d.qualityTier);
      set("#hud-fit", d.tags.length > 0 ? d.tags.join("+") : "-");
      set(
        "#hud-cost",
        `$${d.pricePerUnit}/${unitShort[d.priceUnit] ?? d.priceUnit}`,
      );
      set("#hud-reason", d.reason);
    }

    // Open the winning family's popover with the chosen model promoted to the front.
    const key = familyKeyByModel.get(d.model);
    const card = key ? familyCardByKey.get(key) : undefined;
    if (key) openPopover(key, d.model);
    if (card) card.classList.add("active");
    const selRow = popover.querySelector(
      ".family-model.selected",
    ) as HTMLElement | null;
    // Instant, not smooth: a smooth scroll repaints the animated Tron layers every
    // frame for a second or two, which makes the glow strobe. "nearest" still means
    // no scroll at all when the row is already visible.
    if (selRow) selRow.scrollIntoView({ behavior: "instant", block: "nearest" });
    drawBeam(selRow ?? card);
    statusEl.textContent = "DECISION LOCKED // best-fit model on the grid";
  } catch (error) {
    statusEl.textContent = `ERROR // ${(error as Error).message}`;
  } finally {
    runEl.disabled = false;
  }
}

runEl.addEventListener("click", route);
promptEl.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") route();
});
