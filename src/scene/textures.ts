import * as THREE from "three";
import { getActiveSceneTheme } from "../lib/theme";
import { imageUrl } from "../lib/api";

const STAGGER_MS = 80;
const SIZE = 256;
const PAD = 6;
const RADIUS = 10;

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  color: string,
  label: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 ${Math.floor(w * 0.11)}px "Libre Franklin", "Helvetica Neue", Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = label.split(" ");
  const line = words.length > 2 ? `${words[0]} ${words[1]}` : label;
  ctx.fillText(line.slice(0, 14), w / 2, h / 2);
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSquareBorder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const theme = getActiveSceneTheme();
  roundedRectPath(ctx, PAD, PAD, w - PAD * 2, h - PAD * 2, RADIUS);
  ctx.strokeStyle = theme.borderOuter;
  ctx.lineWidth = 8;
  ctx.stroke();
  roundedRectPath(ctx, PAD + 4, PAD + 4, w - PAD * 2 - 8, h - PAD * 2 - 8, RADIUS - 2);
  ctx.strokeStyle = theme.borderInner;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function squareCanvasFromImage(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.save();
  roundedRectPath(ctx, PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2, RADIUS);
  ctx.clip();

  const inner = SIZE - PAD * 2;
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
  ctx.drawImage(img, sx, sy, sw, sh, PAD, PAD, inner, inner);
  ctx.restore();
  drawSquareBorder(ctx, SIZE, SIZE);
  return canvas;
}

function placeholderCanvas(label: string, type: "movie" | "person"): HTMLCanvasElement {
  const theme = getActiveSceneTheme();
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  roundedRectPath(ctx, PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2, RADIUS);
  ctx.clip();
  drawPlaceholder(
    ctx,
    SIZE,
    SIZE,
    type === "movie" ? theme.placeholderMovie : theme.placeholderPerson,
    label
  );
  ctx.restore();
  drawSquareBorder(ctx, SIZE, SIZE);
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
          resolve(new THREE.CanvasTexture(squareCanvasFromImage(img)));
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
  sprite.userData.baseScale = scale;
  return sprite;
}

export function createEdgeLine(from: THREE.Vector3, to: THREE.Vector3): THREE.Line {
  const theme = getActiveSceneTheme();
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({
    color: theme.edgeColor,
    transparent: true,
    opacity: theme.edgeOpacity,
  });
  return new THREE.Line(geo, mat);
}

export function updateEdgeMaterial(line: THREE.Line) {
  const theme = getActiveSceneTheme();
  const mat = line.material as THREE.LineBasicMaterial;
  mat.color.setHex(theme.edgeColor);
  mat.opacity = theme.edgeOpacity;
}

export function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
