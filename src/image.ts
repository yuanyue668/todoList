import type { ImageAttachment } from "./types";

const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.86;

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export async function fileToAttachment(file: File): Promise<ImageAttachment> {
  const dataUrl = await fileToCompressedDataUrl(file);
  return {
    id: crypto.randomUUID(),
    name: file.name || "pasted-image",
    mimeType: file.type || "image/png",
    dataUrl,
    createdAt: Date.now(),
  };
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file);

  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return original;
  }

  const image = await loadImage(original);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return original;
  }

  context.drawImage(image, 0, 0, width, height);
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(outputType, outputType === "image/jpeg" ? JPEG_QUALITY : undefined);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
