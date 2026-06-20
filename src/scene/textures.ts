import * as THREE from "three";
import { imageUrl } from "../lib/api";

const PLACEHOLDER_MOVIE = "#3d1515";
const PLACEHOLDER_PERSON = "#2a1010";
const STAGGER_MS = 80;

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
  label: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `bold ${Math.floor(size * 0.11)}px system-ui,sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = label.split(" ");
  const line = words.length > 2 ? `${words[0]} ${words[1]}` : label;
  ctx.fillText(line.slice(0, 14), size / 2, size / 2);
}

function circularCanvasFromImage(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  const aspect = img.width / img.height;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  if (aspect > 1) {
    sw = img.height;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - size * 0.02, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

function placeholderCanvas(label: string, type: "movie" | "person"): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawPlaceholder(ctx, size, type === "movie" ? PLACEHOLDER_MOVIE : PLACEHOLDER_PERSON, label);
  return canvas;
}

let loadQueue: Promise<void> = Promise.resolve();

function enqueueLoad<T>(fn: () => Promise<T>): Promise<T> {
  const result = loadQueue.then(fn);
  loadQueue = result.then(
    () => new Promise((r) => setTimeout(r, STAGGER_MS)),
    () => new Promise((r) => setTimeout(r, STAGGER_MS))
  );
  return result;
}

export function loadNodeTexture(
  imagePath: string | null,
  label: string,
  type: "movie" | "person"
): Promise<THREE.Texture> {
  return enqueueLoad(
    () =>
      new Promise((resolve) => {
        const url = imageUrl(imagePath, type === "movie" ? "w342" : "w185");
        if (!url) {
          resolve(new THREE.CanvasTexture(placeholderCanvas(label, type)));
          return;
        }
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          resolve(new THREE.CanvasTexture(circularCanvasFromImage(img, 256)));
        };
        img.onerror = () => {
          resolve(new THREE.CanvasTexture(placeholderCanvas(label, type)));
        };
        img.src = url;
      })
  );
}

export function createSprite(
  texture: THREE.Texture,
  scale: number,
  nodeId: string
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  sprite.userData.nodeId = nodeId;
  return sprite;
}

export function createEdgeLine(from: THREE.Vector3, to: THREE.Vector3): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color: 0x8b1a1a,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.Line(geo, mat);
}

export function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
