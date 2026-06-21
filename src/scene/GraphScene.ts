import * as THREE from "three";
import type { GraphNode } from "../lib/api";
import type { ViewMode } from "../lib/layout";
import { layoutRingTuples } from "../lib/layout";
import {
  createEdgeLine,
  createSprite,
  disposeSprite,
  loadNodeTexture,
  updateEdgeMaterial,
} from "./textures";
import type { Theme } from "../lib/theme";
import { SCENE_THEMES, setActiveTheme } from "../lib/theme";

export type NodeClickHandler = (node: GraphNode) => void | Promise<void>;
export type HoverHandler = (
  node: GraphNode | null,
  screen: { x: number; y: number } | null
) => void;

interface SceneNode {
  sprite: THREE.Sprite;
  data: GraphNode;
  isCenter: boolean;
  edge: THREE.Line | null;
  targetPos: THREE.Vector3;
  restPos: THREE.Vector3;
  parallax: THREE.Vector3;
  baseScale: number;
}

const CENTER_SCALE = 2.5;
const RING_SCALE = 1.7;
const DRAG_THRESHOLD = 8;
const ORBIT_HOME = { radius: 12, theta: 0, phi: 1.52 };
const ORBIT_DRAG_BASE = 0.0014;
const ORBIT_WHEEL_BASE = 0.0007;
const ZOOM_WHEEL_BASE = 0.0045;
const STATIC_HOLD_MS = 500;
const ORTHO_BASE = 14;
const ORTHO_ZOOM_MIN = 0.35;
const ORTHO_ZOOM_MAX = 4;
const ORTHO_CAM_Z = 20;
const PAN_2D_SCALE = 40;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function tween(duration: number, onFrame: (t: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      onFrame(easeInOutCubic(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export class GraphScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  dragPlane = new THREE.Plane();
  fog: THREE.FogExp2;

  private orthoCamera: THREE.OrthographicCamera;
  private viewMode: ViewMode = "3d";
  private pan2d = { x: 0, y: 0 };
  private zoom2d = 1;
  private aspect = 1;

  private nodes: SceneNode[] = [];
  private container: HTMLElement | null = null;
  private animId = 0;
  private busy = false;
  private session = 0;
  private onNodeClick: NodeClickHandler;
  private onHover: HoverHandler;

  private dragging: SceneNode | null = null;
  private orbiting = false;
  private pointerDown = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private didDrag = false;
  private hoveredSprite: THREE.Sprite | null = null;

  private orbit = { ...ORBIT_HOME };
  private orbitTarget = new THREE.Vector3(0, 0, 0);
  private lastCamPos = new THREE.Vector3();
  private camVelocity = new THREE.Vector3();
  private zoomVelocity = 0;
  private groupOffset = new THREE.Vector3();

  private ambient: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.PointLight;
  private theme: Theme = "dark";
  private scrollSpeed = 1;
  private zoomSpeed = 1;

  constructor(
    canvas: HTMLCanvasElement,
    onNodeClick: NodeClickHandler,
    onHover: HoverHandler,
    theme: Theme = "dark",
    viewMode: ViewMode = "3d"
  ) {
    this.onNodeClick = onNodeClick;
    this.onHover = onHover;
    this.theme = theme;
    this.viewMode = viewMode;
    setActiveTheme(theme);

    this.scene = new THREE.Scene();
    const t = SCENE_THEMES[theme];
    this.scene.background = new THREE.Color(t.background);
    this.fog = new THREE.FogExp2(t.fog, viewMode === "2d" ? 0 : t.fogDensity);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.updateCameraFromOrbit();
    this.updateCamera2d();
    this.lastCamPos.copy(this.activeCamera.position);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.ambient = new THREE.AmbientLight(t.ambient, t.ambientIntensity);
    this.scene.add(this.ambient);
    this.keyLight = new THREE.DirectionalLight(t.keyLight, t.keyIntensity);
    this.keyLight.position.set(2, 4, 6);
    this.scene.add(this.keyLight);
    this.rimLight = new THREE.PointLight(t.rimLight, t.rimIntensity, 30);
    this.rimLight.position.set(-3, -1, 4);
    this.scene.add(this.rimLight);

    this.startLoop();
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    setActiveTheme(theme);
    const t = SCENE_THEMES[theme];
    (this.scene.background as THREE.Color).setHex(t.background);
    this.fog.color.setHex(t.fog);
    this.fog.density = this.viewMode === "2d" ? 0 : t.fogDensity;
    this.ambient.color.setHex(t.ambient);
    this.ambient.intensity = t.ambientIntensity;
    this.keyLight.color.setHex(t.keyLight);
    this.keyLight.intensity = t.keyIntensity;
    this.rimLight.color.setHex(t.rimLight);
    this.rimLight.intensity = t.rimIntensity;
    for (const n of this.nodes) {
      if (n.edge) updateEdgeMaterial(n.edge);
    }
  }

  setScrollSpeed(speed: number) {
    this.scrollSpeed = Math.max(0.25, Math.min(8, speed));
  }

  setZoomSpeed(speed: number) {
    this.zoomSpeed = Math.max(0.25, Math.min(10, speed));
  }

  setViewMode(mode: ViewMode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    const t = SCENE_THEMES[this.theme];
    this.fog.density = mode === "2d" ? 0 : t.fogDensity;
    this.pan2d = { x: 0, y: 0 };
    this.zoom2d = 1;
    this.orbit = { ...ORBIT_HOME };
    this.orbitTarget.set(0, 0, 0);
    this.groupOffset.set(0, 0, 0);
    this.zoomVelocity = 0;
    for (const n of this.nodes) n.parallax.set(0, 0, 0);
    this.relayoutRing();
    this.updateCamera2d();
    this.updateCameraFromOrbit();
  }

  private get activeCamera(): THREE.Camera {
    return this.viewMode === "2d" ? this.orthoCamera : this.camera;
  }

  private relayoutRing() {
    const ringNodes = this.nodes.filter((n) => !n.isCenter);
    if (ringNodes.length === 0) return;
    const positions = layoutRingTuples(ringNodes.length, this.viewMode);
    for (let i = 0; i < ringNodes.length; i++) {
      const n = ringNodes[i]!;
      const [x, y, z] = positions[i] ?? [0, 0, 0];
      n.targetPos.set(x, y, z);
      n.restPos.copy(n.targetPos);
      n.parallax.set(0, 0, 0);
      this.applyNodeTransform(n);
    }
  }

  private updateCamera2d() {
    this.orthoCamera.position.set(this.pan2d.x, this.pan2d.y, ORTHO_CAM_Z);
    this.orthoCamera.lookAt(this.pan2d.x, this.pan2d.y, 0);
    const h = ORTHO_BASE / this.zoom2d;
    const w = h * this.aspect;
    this.orthoCamera.left = -w / 2;
    this.orthoCamera.right = w / 2;
    this.orthoCamera.top = h / 2;
    this.orthoCamera.bottom = -h / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  private pan2dFromScreenDelta(dx: number, dy: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const worldW = ORTHO_BASE / this.zoom2d * this.aspect;
    const worldH = ORTHO_BASE / this.zoom2d;
    this.pan2d.x += (dx / rect.width) * worldW;
    this.pan2d.y -= (dy / rect.height) * worldH;
    this.updateCamera2d();
  }

  private updateCameraFromOrbit() {
    const { radius, theta, phi } = this.orbit;
    const sinP = Math.sin(phi);
    this.camera.position.set(
      this.orbitTarget.x + radius * sinP * Math.sin(theta),
      this.orbitTarget.y + radius * Math.cos(phi),
      this.orbitTarget.z + radius * sinP * Math.cos(theta)
    );
    this.camera.lookAt(this.orbitTarget);
  }

  mount(container: HTMLElement) {
    this.container = container;
    this.resize(container.clientWidth, container.clientHeight);
    container.addEventListener("pointerdown", this.onPointerDown);
    container.addEventListener("pointermove", this.onPointerMove);
    container.addEventListener("pointerup", this.onPointerUp);
    container.addEventListener("pointerleave", this.onPointerLeave);
    container.addEventListener("wheel", this.onWheel, { passive: false });
    container.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  unmount(container: HTMLElement) {
    cancelAnimationFrame(this.animId);
    container.removeEventListener("pointerdown", this.onPointerDown);
    container.removeEventListener("pointermove", this.onPointerMove);
    container.removeEventListener("pointerup", this.onPointerUp);
    container.removeEventListener("pointerleave", this.onPointerLeave);
    container.removeEventListener("wheel", this.onWheel);
    this.container = null;
    this.clearGraph();
    this.renderer.dispose();
  }

  resize(w: number, h: number) {
    this.aspect = w / h || 1;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.updateCamera2d();
    this.renderer.setSize(w, h);
  }

  private updatePointer(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastSprites(): THREE.Sprite | null {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera);
    const hits = this.raycaster.intersectObjects(
      this.nodes.map((n) => n.sprite),
      false
    );
    return hits.length > 0 ? (hits[0].object as THREE.Sprite) : null;
  }

  private scenePointAtPointer(sprite: THREE.Sprite): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.pointer, this.activeCamera);
    if (this.viewMode === "2d") {
      this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), sprite.position);
    } else {
      this.dragPlane.setFromNormalAndCoplanarPoint(
        this.camera.getWorldDirection(new THREE.Vector3()).negate(),
        sprite.position
      );
    }
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.dragPlane, hit) ? hit : null;
  }

  private applyNodeTransform(n: SceneNode) {
    n.sprite.position.copy(n.restPos).add(this.groupOffset).add(n.parallax);
    const zoomBoost =
      this.viewMode === "2d"
        ? 1
        : 1 + this.zoomVelocity * (n.isCenter ? 0.02 : 0.05);
    const s = n.baseScale * zoomBoost;
    n.sprite.scale.set(s, s, 1);
    if (n.edge) this.updateEdge(n);
  }

  private updateEdge(node: SceneNode) {
    if (!node.edge) return;
    const pos = node.edge.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, this.groupOffset.x, this.groupOffset.y, this.groupOffset.z);
    pos.setXYZ(1, node.sprite.position.x, node.sprite.position.y, node.sprite.position.z);
    pos.needsUpdate = true;
  }

  private setSpriteOpacity(sprite: THREE.Sprite, opacity: number) {
    const mat = sprite.material as THREE.SpriteMaterial;
    mat.opacity = opacity;
    mat.transparent = true;
  }

  private fadeEdge(node: SceneNode, opacity: number) {
    if (!node.edge) return;
    (node.edge.material as THREE.LineBasicMaterial).opacity = opacity;
  }

  private onWheel = (e: WheelEvent) => {
    if (this.busy) return;
    e.preventDefault();

    if (this.viewMode === "2d") {
      this.onWheel2d(e);
      return;
    }

    // Pinch-to-zoom on trackpad (macOS sets ctrlKey)
    if (e.ctrlKey) {
      const zoom = ZOOM_WHEEL_BASE * this.zoomSpeed;
      this.orbit.radius = clamp(this.orbit.radius + e.deltaY * zoom, 4, 28);
      this.zoomVelocity = clamp(this.zoomVelocity - e.deltaY * 0.0002 * this.zoomSpeed, -0.2, 0.2);
      this.updateCameraFromOrbit();
      return;
    }

    // Two-finger scroll on trackpad → orbit/pan
    if (Math.abs(e.deltaX) > 0.5 || (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.3 && Math.abs(e.deltaY) > 0.5)) {
      const orbit = ORBIT_WHEEL_BASE * this.scrollSpeed;
      this.orbit.theta += e.deltaX * orbit;
      this.orbit.phi = clamp(this.orbit.phi - e.deltaY * orbit, 0.45, Math.PI - 0.45);
      this.updateCameraFromOrbit();
      return;
    }

    // Mouse wheel → zoom
    const zoom = ZOOM_WHEEL_BASE * this.zoomSpeed;
    this.orbit.radius = clamp(this.orbit.radius + e.deltaY * zoom, 4, 28);
    this.zoomVelocity = clamp(this.zoomVelocity - e.deltaY * 0.0002 * this.zoomSpeed, -0.2, 0.2);
    this.updateCameraFromOrbit();
  };

  private onWheel2d = (e: WheelEvent) => {
    const isZoom =
      e.ctrlKey ||
      (Math.abs(e.deltaY) >= Math.abs(e.deltaX) * 0.6 && Math.abs(e.deltaX) < 1);

    if (isZoom) {
      const zoom = ZOOM_WHEEL_BASE * this.zoomSpeed * 0.55;
      this.zoom2d = clamp(this.zoom2d - e.deltaY * zoom, ORTHO_ZOOM_MIN, ORTHO_ZOOM_MAX);
      this.updateCamera2d();
      return;
    }

    const pan = ORBIT_WHEEL_BASE * this.scrollSpeed * PAN_2D_SCALE;
    this.pan2dFromScreenDelta(-e.deltaX * pan, e.deltaY * pan);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.busy || e.target !== this.renderer.domElement) return;
    this.updatePointer(e.clientX, e.clientY);
    this.pointerDown = { x: e.clientX, y: e.clientY };
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.didDrag = false;

    const hit = this.raycastSprites();
    const node = hit ? this.nodes.find((n) => n.sprite === hit) : null;

    if (node && e.button === 0) {
      this.dragging = node;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0 || e.button === 2) {
      this.orbiting = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    this.updatePointer(e.clientX, e.clientY);
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;

    if (this.orbiting && !this.busy) {
      const totalDx = e.clientX - this.pointerDown.x;
      const totalDy = e.clientY - this.pointerDown.y;
      if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) this.didDrag = true;

      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        if (this.viewMode === "2d") {
          const pan = ORBIT_DRAG_BASE * this.scrollSpeed * PAN_2D_SCALE;
          this.pan2dFromScreenDelta(dx * pan, dy * pan);
        } else {
          const drag = ORBIT_DRAG_BASE * this.scrollSpeed;
          this.orbit.theta += dx * drag;
          this.orbit.phi = clamp(this.orbit.phi - dy * drag, 0.45, Math.PI - 0.45);
          this.updateCameraFromOrbit();
        }
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
      this.onHover(null, null);
      if (this.container) this.container.style.cursor = "grabbing";
      return;
    }

    if (this.dragging && !this.busy) {
      const totalDx = e.clientX - this.pointerDown.x;
      const totalDy = e.clientY - this.pointerDown.y;
      if (Math.hypot(totalDx, totalDy) > DRAG_THRESHOLD) this.didDrag = true;

      const pt = this.scenePointAtPointer(this.dragging.sprite);
      if (pt) {
        if (this.dragging.isCenter) {
          this.groupOffset.copy(pt);
          for (const n of this.nodes) {
            n.parallax.set(0, 0, 0);
            this.applyNodeTransform(n);
          }
        } else {
          this.dragging.restPos.copy(pt).sub(this.groupOffset);
          this.dragging.parallax.set(0, 0, 0);
          this.dragging.targetPos.copy(this.dragging.restPos);
          this.applyNodeTransform(this.dragging);
        }
      }
      this.onHover(null, null);
      if (this.container) this.container.style.cursor = "grabbing";
      return;
    }

    if (this.busy) return;

    const hit = this.raycastSprites();
    if (hit !== this.hoveredSprite) this.hoveredSprite = hit;
    const node = hit ? this.nodes.find((n) => n.sprite === hit) : null;
    if (node) {
      this.onHover(node.data, { x: e.clientX, y: e.clientY });
      if (this.container) {
        this.container.style.cursor = "grab";
      }
    } else {
      this.onHover(null, null);
      if (this.container) this.container.style.cursor = "grab";
    }
  };

  private onPointerUp = () => {
    if (this.orbiting) {
      this.orbiting = false;
      return;
    }

    if (this.dragging) {
      const node = this.dragging;
      this.dragging = null;
      if (!this.didDrag && !this.busy && !node.isCenter) {
        this.navigateToNode(node);
      }
      return;
    }

    if (this.busy || this.didDrag) return;
    const hit = this.raycastSprites();
    const node = hit ? this.nodes.find((n) => n.sprite === hit) : null;
    if (node && !node.isCenter) this.navigateToNode(node);
  };

  private onPointerLeave = () => {
    this.hoveredSprite = null;
    this.onHover(null, null);
    this.orbiting = false;
    this.dragging = null;
    if (this.container) this.container.style.cursor = "default";
  };

  private async resetOrbit(duration = 700) {
    if (this.viewMode === "2d") {
      const startPan = { ...this.pan2d };
      const startZoom = this.zoom2d;
      await tween(duration, (t) => {
        this.pan2d.x = startPan.x * (1 - t);
        this.pan2d.y = startPan.y * (1 - t);
        this.zoom2d = startZoom + (1 - startZoom) * t;
        this.updateCamera2d();
      });
      return;
    }

    const start = { ...this.orbit };
    await tween(duration, (t) => {
      this.orbit.radius = start.radius + (ORBIT_HOME.radius - start.radius) * t;
      this.orbit.theta = start.theta + (ORBIT_HOME.theta - start.theta) * t;
      this.orbit.phi = start.phi + (ORBIT_HOME.phi - start.phi) * t;
      this.updateCameraFromOrbit();
    });
  }

  private async fadeAllNodes(to: number, duration: number) {
    await Promise.all(
      this.nodes.map((n) => {
        const startOp = (n.sprite.material as THREE.SpriteMaterial).opacity;
        const edgeStart = n.edge
          ? (n.edge.material as THREE.LineBasicMaterial).opacity
          : 0;
        return tween(duration, (t) => {
          this.setSpriteOpacity(n.sprite, startOp + (to - startOp) * t);
          if (n.edge) this.fadeEdge(n, edgeStart * (1 - t));
        });
      })
    );
  }

  private async navigateToNode(node: SceneNode) {
    if (this.busy) return;
    const session = this.session;
    this.busy = true;
    this.onHover(null, null);

    await this.fadeAllNodes(0, 450);
    if (session !== this.session) return;
    await this.resetOrbit(500);
    if (session !== this.session) return;

    await this.onNodeClick(node.data);
    if (session !== this.session) return;

    this.busy = false;
  }

  clearGraph() {
    this.groupOffset.set(0, 0, 0);
    for (const n of this.nodes) disposeSprite(n.sprite);
    for (const n of this.nodes) {
      if (n.edge) {
        n.edge.geometry.dispose();
        (n.edge.material as THREE.Material).dispose();
        this.scene.remove(n.edge);
      }
    }
    this.nodes.forEach((n) => this.scene.remove(n.sprite));
    this.nodes = [];
  }

  reset() {
    this.session += 1;
    this.busy = false;
    this.orbiting = false;
    this.dragging = null;
    this.clearGraph();
    this.orbit = { ...ORBIT_HOME };
    this.orbitTarget.set(0, 0, 0);
    this.pan2d = { x: 0, y: 0 };
    this.zoom2d = 1;
    this.zoomVelocity = 0;
    this.onHover(null, null);
    this.updateCameraFromOrbit();
    this.updateCamera2d();
  }

  async setGraph(center: GraphNode, connections: GraphNode[]) {
    const session = this.session;
    this.clearGraph();
    const positions = layoutRingTuples(connections.length, this.viewMode);

    const centerTex = await loadNodeTexture(center.imagePath, center.title, center.type);
    if (session !== this.session) return;
    const centerSprite = createSprite(centerTex, 0.01, center.id);
    this.setSpriteOpacity(centerSprite, 0);
    this.scene.add(centerSprite);
    this.nodes.push({
      sprite: centerSprite,
      data: center,
      isCenter: true,
      edge: null,
      targetPos: new THREE.Vector3(0, 0, 0),
      restPos: new THREE.Vector3(0, 0, 0),
      parallax: new THREE.Vector3(),
      baseScale: CENTER_SCALE,
    });

    // Center fades in alone — static hold before ring appears
    await tween(550, (t) => {
      if (session !== this.session) return;
      const n = this.nodes[0];
      n.baseScale = CENTER_SCALE * t;
      this.setSpriteOpacity(centerSprite, t);
      this.applyNodeTransform(n);
    });
    if (session !== this.session) return;

    await delay(STATIC_HOLD_MS);
    if (session !== this.session) return;

    const ringNodes: SceneNode[] = [];
    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      const [tx, ty, tz] = positions[i] ?? [0, 0, 0];
      const targetPos = new THREE.Vector3(tx, ty, tz);

      const tex = await loadNodeTexture(conn.imagePath, conn.title, conn.type);
      if (session !== this.session) return;
      const sprite = createSprite(tex, 0.01, conn.id);
      this.setSpriteOpacity(sprite, 0);
      this.scene.add(sprite);

      const edge = createEdgeLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
      (edge.material as THREE.LineBasicMaterial).opacity = 0;
      this.scene.add(edge);

      const sceneNode: SceneNode = {
        sprite,
        data: conn,
        isCenter: false,
        edge,
        targetPos,
        restPos: new THREE.Vector3(0, 0, 0),
        parallax: new THREE.Vector3(),
        baseScale: RING_SCALE,
      };
      ringNodes.push(sceneNode);
      this.nodes.push(sceneNode);
    }

    await Promise.all(
      ringNodes.map(
        (n, i) =>
          new Promise<void>((resolve) => setTimeout(resolve, i * 70)).then(async () => {
            if (session !== this.session) return;
            await tween(750, (t) => {
              if (session !== this.session) return;
              n.restPos.lerpVectors(new THREE.Vector3(0, 0, 0), n.targetPos, t);
              n.baseScale = RING_SCALE * t;
              this.setSpriteOpacity(n.sprite, t);
              this.applyNodeTransform(n);
              this.fadeEdge(n, SCENE_THEMES[this.theme].edgeOpacity * t);
            });
          })
      )
    );
  }

  captureScreenshot(): string {
    this.renderer.render(this.scene, this.activeCamera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  private updateParallax(dt: number) {
    if (this.viewMode === "2d") return;

    const camDelta = this.camera.position.clone().sub(this.lastCamPos);
    this.camVelocity.lerp(camDelta, 0.12);
    this.lastCamPos.copy(this.camera.position);
    this.zoomVelocity *= 0.88;

    const homePos = new THREE.Vector3(
      this.orbitTarget.x + ORBIT_HOME.radius * Math.sin(ORBIT_HOME.phi) * Math.sin(ORBIT_HOME.theta),
      this.orbitTarget.y + ORBIT_HOME.radius * Math.cos(ORBIT_HOME.phi),
      this.orbitTarget.z + ORBIT_HOME.radius * Math.sin(ORBIT_HOME.phi) * Math.cos(ORBIT_HOME.theta)
    );
    const camOffset = this.camera.position.clone().sub(homePos);

    for (const n of this.nodes) {
      if (n === this.dragging) continue;
      const depth = n.isCenter ? 0.06 : 0.18;
      const targetParallax = new THREE.Vector3(
        -this.camVelocity.x * depth * 8 - camOffset.x * depth * 0.15,
        -this.camVelocity.y * depth * 8 - camOffset.y * depth * 0.15,
        -camOffset.z * depth * 0.08
      );
      n.parallax.lerp(targetParallax, 1 - Math.pow(0.001, dt));
      this.applyNodeTransform(n);
    }
  }

  private startLoop() {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!this.busy) this.updateParallax(dt);
      this.renderer.render(this.scene, this.activeCamera);
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }
}
