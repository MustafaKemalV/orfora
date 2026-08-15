/**
 * Modality detection for attachments.
 *
 * The caller passes attachment descriptors as strings, MIME types
 * ("image/png"), file names or bare extensions ("clip.mp4", ".mp4", "mp4"), or
 * plain words ("photo", "voice"). We normalise all of these into a small set of
 * canonical modalities so routing never misses a type because of formatting.
 * Anything unrecognised becomes "other", it is never silently dropped.
 */
export type Modality = "image" | "video" | "audio" | "document" | "other";

const BY_EXTENSION: Record<string, Modality> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  svg: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  heif: "image",
  avif: "image",
  ico: "image",
  mp4: "video",
  mov: "video",
  avi: "video",
  mkv: "video",
  webm: "video",
  m4v: "video",
  mpeg: "video",
  mpg: "video",
  wmv: "video",
  flv: "video",
  "3gp": "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  opus: "audio",
  wma: "audio",
  aiff: "audio",
  pdf: "document",
  doc: "document",
  docx: "document",
  txt: "document",
  md: "document",
  rtf: "document",
  odt: "document",
  ppt: "document",
  pptx: "document",
  xls: "document",
  xlsx: "document",
  csv: "document",
  json: "document",
};

const BY_WORD: Record<string, Modality> = {
  image: "image",
  images: "image",
  img: "image",
  imgs: "image",
  picture: "image",
  pictures: "image",
  photo: "image",
  photos: "image",
  pic: "image",
  pics: "image",
  screenshot: "image",
  drawing: "image",
  figure: "image",
  video: "video",
  videos: "video",
  movie: "video",
  movies: "video",
  clip: "video",
  clips: "video",
  film: "video",
  footage: "video",
  audio: "audio",
  sound: "audio",
  sounds: "audio",
  voice: "audio",
  speech: "audio",
  recording: "audio",
  music: "audio",
  song: "audio",
  document: "document",
  documents: "document",
  doc: "document",
  docs: "document",
  file: "document",
  files: "document",
  pdf: "document",
  spreadsheet: "document",
  slides: "document",
  slide: "document",
  attachment: "document",
  text: "document",
};

/** Normalise an arbitrary attachment descriptor into a canonical modality. */
export function normalizeModality(raw: string): Modality {
  const s = raw.trim().toLowerCase();
  if (!s) return "other";

  // MIME type, e.g. "image/png", "audio/mpeg", "application/pdf".
  const slash = s.indexOf("/");
  if (slash > 0) {
    const prefix = s.slice(0, slash);
    if (prefix === "image") return "image";
    if (prefix === "video") return "video";
    if (prefix === "audio") return "audio";
    if (prefix === "application" || prefix === "text") return "document";
  }

  // Plain word / alias (checked before extensions so "audio" resolves directly).
  const byWord = BY_WORD[s];
  if (byWord) return byWord;

  // File name or bare extension: take the part after the last ".".
  const ext = s.includes(".") ? s.slice(s.lastIndexOf(".") + 1) : s;
  const byExt = BY_EXTENSION[ext];
  if (byExt) return byExt;

  return "other";
}
