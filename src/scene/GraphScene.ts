import * as THREE from "three";
import type { GraphNode } from "../lib/api";
import { ringPosition } from "../lib/layout";
import { createEdgeLine, createSprite, disposeSprite, loadNodeTexture } from "./textures";

export type NodeClickHandler = (node: GraphNode) => void;

interface SceneNode {
  sprite: THREE.Sprite;
  data: GraphNode;
  isCenter: boolean;
}

const CENTER_SCALE = 2.4;
const RING_SCALE = 1.65;
const CAMERA_HOME = new THREE.Vector3(0, 0.5, 11);
const CAMERA_LOOK = new THREE.Vector3(0, 0, 0);

export class GraphScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  private nodes: SceneNode[] = [];
  private edges: THREE.Line[] = [];
  private animId = 0;
  private lastTime = performance.now();
  private flying = false;
  private onNodeClick: NodeClickHandler;
  private clickCb: (x: number, y: number) => void;

  constructor(canvas: HTMLCanvasElement, onNodeClick: NodeClickHandler) {
    this.onNodeClick = onNodeClick;
    this.clickCb = (x, y) => this.handlePointer(x, y);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0404);
    this.scene.fog = new THREE.FogExp2(0x0a0404, 0.028);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.copy(CAMERA_HOME);
    this.camera.lookAt(CAMERA_LOOK);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0xffeedd, 0.35);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffcccc, 0.9);
    key.position.set(2, 4, 6);
    this.scene.add(key);
    const rim = new THREE.PointLight(0xcc2222, 0.6, 30);
    rim.position.set(-3, -1, 4);
    this.scene.add(rim);

    this.addBackdrop();
    this.startLoop();
  }

  private addBackdrop() {
    const geo = new THREE.PlaneGeometry(40, 24);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor1: { value: new THREE.Color(0x1a0505) },
        uColor2: { value: new THREE.Color(0x050202) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        varying vec2 vUv;
        void main() {
          float g = smoothstep(0.0, 1.0, vUv.y);
          gl_FragColor = vec4(mix(uColor2, uColor1, g), 1.0);
        }
      `,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.position.set(0, 0, -8);
    this.scene.add(plane);
  }

  mount(container: HTMLElement) {
    this.setSize(container.clientWidth, container.clientHeight);
    container.addEventListener("click", this.onClick);
    container.addEventListener("touchstart", this.onTouch, { passive: false });
  }

  unmount(container: HTMLElement) {
    cancelAnimationFrame(this.animId);
    container.removeEventListener("click", this.onClick);
    container.removeEventListener("touchstart", this.onTouch);
    this.clearGraph();
    this.renderer.dispose();
  }

  resize(w: number, h: number) {
    this.setSize(w, h);
  }

  private setSize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onClick = (e: MouseEvent) => this.clickCb(e.clientX, e.clientY);
  private onTouch = (e: TouchEvent) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (t) this.clickCb(t.clientX, t.clientY);
  };

  private handlePointer(clientX: number, clientY: number) {
    if (this.flying) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const sprites = this.nodes.filter((n) => !n.isCenter).map((n) => n.sprite);
    const hits = this.raycaster.intersectObjects(sprites, false);
    if (hits.length > 0) {
      const hit = hits[0].object as THREE.Sprite;
      const node = this.nodes.find((n) => n.sprite === hit);
      if (node) this.flyToNode(node);
    }
  }

  private flyToNode(node: SceneNode) {
    this.flying = true;
    const targetPos = node.sprite.position.clone();
    const startCam = this.camera.position.clone();
    const endCam = targetPos.clone().add(new THREE.Vector3(0, 0.2, 3.2));
    const startLook = CAMERA_LOOK.clone();
    const endLook = targetPos.clone();
    const duration = 700;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(startCam, endCam, ease);
      const look = startLook.clone().lerp(endLook, ease);
      this.camera.lookAt(look);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.flying = false;
        this.onNodeClick(node.data);
        this.camera.position.copy(CAMERA_HOME);
        this.camera.lookAt(CAMERA_LOOK);
      }
    };
    requestAnimationFrame(step);
  }

  clearGraph() {
    for (const n of this.nodes) disposeSprite(n.sprite);
    for (const e of this.edges) {
      e.geometry.dispose();
      (e.material as THREE.Material).dispose();
    }
    this.nodes.forEach((n) => this.scene.remove(n.sprite));
    this.edges.forEach((e) => this.scene.remove(e));
    this.nodes = [];
    this.edges = [];
  }

  async setGraph(center: GraphNode, connections: GraphNode[]) {
    this.clearGraph();

    const centerTex = await loadNodeTexture(center.imagePath, center.title, center.type);
    const centerSprite = createSprite(centerTex, CENTER_SCALE, center.id);
    centerSprite.position.set(0, 0, 0);
    this.scene.add(centerSprite);
    this.nodes.push({ sprite: centerSprite, data: center, isCenter: true });

    await Promise.all(
      connections.map(async (conn, i) => {
        const [x, y, z] = ringPosition(i, connections.length);
        const tex = await loadNodeTexture(conn.imagePath, conn.title, conn.type);
        const sprite = createSprite(tex, 0.01, conn.id);
        sprite.position.set(x, y, z);
        this.scene.add(sprite);

        const edge = createEdgeLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y, z));
        this.scene.add(edge);
        this.edges.push(edge);

        const targetScale = RING_SCALE;
        const start = performance.now() + i * 60;
        const bloom = (now: number) => {
          const t = Math.min(1, (now - start) / 500);
          if (t <= 0) {
            requestAnimationFrame(bloom);
            return;
          }
          const ease = 1 - Math.pow(1 - t, 3);
          sprite.scale.set(targetScale * ease, targetScale * ease, 1);
          if (t < 1) requestAnimationFrame(bloom);
        };
        requestAnimationFrame(bloom);

        this.nodes.push({ sprite, data: conn, isCenter: false });
      })
    );
  }

  captureScreenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  private startLoop() {
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;

      for (const n of this.nodes) {
        if (!n.isCenter) {
          n.sprite.position.y += Math.sin(now * 0.001 + n.sprite.position.x) * dt * 0.08;
        } else {
          n.sprite.rotation.z = Math.sin(now * 0.0008) * 0.02;
        }
      }

      if (!this.flying) {
        this.renderer.render(this.scene, this.camera);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }
}
