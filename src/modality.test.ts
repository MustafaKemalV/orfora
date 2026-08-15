import { describe, expect, it } from "vitest";
import { normalizeModality } from "./modality";

describe("normalizeModality", () => {
  it("recognises MIME types", () => {
    expect(normalizeModality("image/png")).toBe("image");
    expect(normalizeModality("video/mp4")).toBe("video");
    expect(normalizeModality("audio/mpeg")).toBe("audio");
    expect(normalizeModality("application/pdf")).toBe("document");
    expect(normalizeModality("text/csv")).toBe("document");
  });

  it("recognises extensions and file names", () => {
    expect(normalizeModality("mp4")).toBe("video");
    expect(normalizeModality(".mp4")).toBe("video");
    expect(normalizeModality("holiday.MP4")).toBe("video");
    expect(normalizeModality("report.pdf")).toBe("document");
    expect(normalizeModality("photo.jpeg")).toBe("image");
  });

  it("recognises plain words and aliases", () => {
    expect(normalizeModality("photo")).toBe("image");
    expect(normalizeModality("Picture")).toBe("image");
    expect(normalizeModality("movie")).toBe("video");
    expect(normalizeModality("voice")).toBe("audio");
    expect(normalizeModality("slides")).toBe("document");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeModality("  IMAGE/PNG  ")).toBe("image");
    expect(normalizeModality("  MP3 ")).toBe("audio");
  });

  it("maps anything unrecognised to 'other' (never dropped)", () => {
    expect(normalizeModality("wat")).toBe("other");
    expect(normalizeModality("")).toBe("other");
  });
});
