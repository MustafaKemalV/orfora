import { createVectorRouter, defaultVectorCatalog } from "../../src/index";
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

// A no-key router: the embedding model runs in a background worker, and the
// built-in catalog is scored on real benchmarks.
const router = createVectorRouter({ embed: workerEmbedder() });
const byId = new Map(defaultVectorCatalog.map((m) => [m.id, m]));

const promptEl = document.querySelector("#prompt") as HTMLTextAreaElement;
const runEl = document.querySelector("#run") as HTMLButtonElement;
const statusEl = document.querySelector("#status") as HTMLElement;
const boardEl = document.querySelector("#board") as HTMLElement;
const hudEl = document.querySelector("#hud") as HTMLElement;
const beamsEl = document.querySelector("#beams") as unknown as SVGSVGElement;
const chipsEl = document.querySelector("#chips") as HTMLElement;

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
  const ty = snap(r.top + r.height / 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  circuitEl.setAttribute("viewBox", `0 0 ${W} ${H}`);
  circuitEl.innerHTML = "";

  // Seed points on the edges: both sides at several heights, plus the floor.
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
    const p = document.createElementNS(svgns, "path");
    let d: string;
    if (floor) {
      // From the floor: rise along a column, then step across into the mark.
      const midY = snap(ty + 90 + (idx % 3) * GRID);
      d = `M ${sx} ${sy} V ${midY} H ${tx} V ${ty}`;
    } else {
      // From a side: in along a row to a bend column, up/down, then in.
      const midX = snap(sx + (tx - sx) * (0.4 + (idx % 3) * 0.08));
      d = `M ${sx} ${sy} H ${midX} V ${ty} H ${tx}`;
    }
    p.setAttribute("d", d);
    circuitEl.appendChild(p);
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${SEG} ${len}`;
    p.style.setProperty("--travel", `${-len}px`);
    p.style.animationDelay = `${((idx % 6) * 0.34 + (idx % 2) * 0.17).toFixed(2)}s`;
    p.style.animationDuration = `${(2.4 + (idx % 4) * 0.35).toFixed(2)}s`;
  });

  // The convergence point itself, pulsing where the traces all arrive.
  const dot = document.createElementNS(svgns, "circle");
  dot.setAttribute("cx", String(tx));
  dot.setAttribute("cy", String(ty));
  dot.setAttribute("r", "3");
  dot.setAttribute("class", "conv-dot");
  circuitEl.appendChild(dot);
}
drawCircuit();
window.addEventListener("resize", drawCircuit);

// Render the grid of models as nodes.
const nodeById = new Map<string, HTMLElement>();
for (const m of defaultVectorCatalog) {
  const node = document.createElement("div");
  node.className = `node tier-${m.priceTier}`;
  node.innerHTML =
    `<span class="node-family">${m.family}</span>` +
    `<span class="node-id">${shortId(m.id)}</span>` +
    `<span class="node-meta">${m.priceTier} // $${m.pricePerMTokens}/M</span>`;
  boardEl.appendChild(node);
  nodeById.set(m.id, node);
}

const examples = [
  "Refactor this module to remove the duplication and explain the change.",
  "Prove that the square root of 2 is irrational.",
  "Write a short noir opening about a lighthouse keeper.",
  "What is the current USD to EUR rate today?",
  "Summarise this paragraph in one sentence.",
  "Bu fonksiyondaki hatayi bul ve duzelt.",
];
for (const ex of examples) {
  const chip = document.createElement("button");
  chip.className = "chip";
  chip.type = "button";
  chip.textContent = ex.length > 42 ? `${ex.slice(0, 40)}...` : ex;
  chip.addEventListener("click", () => {
    promptEl.value = ex;
    route();
  });
  chipsEl.appendChild(chip);
}

function drawBeam(target: HTMLElement | undefined) {
  beamsEl.innerHTML = "";
  if (!target) return;
  const src = runEl.getBoundingClientRect();
  const dst = target.getBoundingClientRect();
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
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
    const model = byId.get(d.model);

    for (const node of nodeById.values()) node.classList.remove("active");
    const chosen = nodeById.get(d.model);
    if (chosen) {
      boardEl.classList.add("decided");
      chosen.classList.add("active");
      chosen.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    drawBeam(chosen);

    hudEl.hidden = false;
    set("#hud-cap", d.capability);
    set("#hud-tier", d.tier);
    set("#hud-model", shortId(d.model));
    set(
      "#hud-fit",
      typeof d.fitness === "number" ? d.fitness.toFixed(2) : "n/a",
    );
    set("#hud-cost", model ? `$${model.pricePerMTokens}/M` : "-");
    set("#hud-reason", d.reason + (d.fallback ? " (fail-open)" : ""));
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
