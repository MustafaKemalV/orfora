import { complexityRouter } from "../../src/index";
import { localEmbedder } from "../../src/local";

// A no-key router: the local embedder runs the model in the browser.
const router = complexityRouter({
  simple: "gpt-4o-mini",
  complex: "gpt-4o",
  embed: localEmbedder(),
});

const promptEl = document.querySelector("#prompt");
const runEl = document.querySelector("#run");
const outputEl = document.querySelector("#output");

if (
  promptEl instanceof HTMLTextAreaElement &&
  runEl instanceof HTMLButtonElement &&
  outputEl instanceof HTMLElement
) {
  runEl.addEventListener("click", async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) return;

    runEl.disabled = true;
    outputEl.textContent = "Routing... (the first run downloads a small model)";
    try {
      const result = await router.route(prompt);
      outputEl.textContent = [
        `route:    ${result.route}`,
        `model:    ${result.model}`,
        `score:    ${result.score.toFixed(3)}`,
        `fallback: ${result.fallback}`,
        result.reason ? `reason:   ${result.reason}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch (error) {
      outputEl.textContent = `Error: ${(error as Error).message}`;
    } finally {
      runEl.disabled = false;
    }
  });
}
