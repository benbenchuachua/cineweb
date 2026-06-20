import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const HIGH_SCORE_KEY = "dodge3d-highscore";

const SPAWN_Z = -45;
const HIT_Z = -1.2;
const DANGER_START_Z = -8;
const BASE_SPEED = 12;
const BASE_SPAWN_DELAY = 1200;
const MIN_SPAWN_DELAY = 400;

type GamePhase = "idle" | "playing" | "gameover";

function getHighScore(): number {
  return Number(localStorage.getItem(HIGH_SCORE_KEY) ?? 0);
}

function setHighScore(score: number) {
  localStorage.setItem(HIGH_SCORE_KEY, String(score));
}

function speedForScore(score: number): number {
  return BASE_SPEED * (1 + score * 0.06);
}

function spawnDelayForScore(score: number): number {
  return Math.max(MIN_SPAWN_DELAY, BASE_SPAWN_DELAY - score * 70);
}

function createAsteroid(): THREE.Mesh {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const noise = 0.65 + Math.random() * 0.55;
    pos.setXYZ(i, x * noise, y * noise, z * noise);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a7f72,
    roughness: 0.85,
    metalness: 0.15,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.isAsteroid = true;
  return mesh;
}

function playPop(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

function playThud(ctx: AudioContext) {
  const bufferSize = ctx.sampleRate * 0.25;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 180;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

export function Dodge3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dangerRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<GamePhase>("idle");
  const [score, setScore] = useState(0);
  const [highScore, setHighScoreState] = useState(0);

  const phaseRef = useRef<GamePhase>("idle");
  const scoreRef = useRef(0);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const engineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    asteroid: THREE.Mesh | null;
    particles: THREE.Points[];
    audioCtx: AudioContext | null;
    animId: number;
    lastTime: number;
  } | null>(null);

  const setDangerPulse = (v: number) => {
    const el = dangerRef.current;
    if (!el) return;
    el.style.opacity = String(v * 0.85);
    el.style.boxShadow = `inset 0 0 ${60 + v * 80}px ${20 + v * 40}px rgba(220, 40, 40, ${0.3 + v * 0.5})`;
  };

  useEffect(() => {
    setHighScoreState(getHighScore());
  }, []);

  const clearSpawnTimer = useCallback(() => {
    if (spawnTimerRef.current) {
      clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }
  }, []);

  const spawnAsteroid = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || phaseRef.current !== "playing") return;

    if (engine.asteroid) {
      engine.scene.remove(engine.asteroid);
      engine.asteroid.geometry.dispose();
      (engine.asteroid.material as THREE.Material).dispose();
      engine.asteroid = null;
    }

    const asteroid = createAsteroid();
    asteroid.position.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 4,
      SPAWN_Z
    );
    asteroid.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    asteroid.scale.setScalar(0.15);
    engine.scene.add(asteroid);
    engine.asteroid = asteroid;
  }, []);

  const burstParticles = useCallback((position: THREE.Vector3) => {
    const engine = engineRef.current;
    if (!engine) return;

    const count = 24;
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        )
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffaa55,
      size: 0.15,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.userData.velocities = velocities;
    points.userData.life = 1;
    engine.scene.add(points);
    engine.particles.push(points);
  }, []);

  const endGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || phaseRef.current !== "playing") return;

    phaseRef.current = "gameover";
    setPhase("gameover");
    clearSpawnTimer();

    if (engine.audioCtx) playThud(engine.audioCtx);

    const final = scoreRef.current;
    const best = getHighScore();
    if (final > best) {
      setHighScore(final);
      setHighScoreState(final);
    } else {
      setHighScoreState(best);
    }

    if (engine.asteroid) {
      engine.scene.remove(engine.asteroid);
      engine.asteroid.geometry.dispose();
      (engine.asteroid.material as THREE.Material).dispose();
      engine.asteroid = null;
    }
    setDangerPulse(0);
  }, [clearSpawnTimer]);

  const onHit = useCallback(() => {
    const engine = engineRef.current;
    if (!engine?.asteroid || phaseRef.current !== "playing") return;

    if (engine.audioCtx) playPop(engine.audioCtx);

    burstParticles(engine.asteroid.position.clone());

    engine.scene.remove(engine.asteroid);
    engine.asteroid.geometry.dispose();
    (engine.asteroid.material as THREE.Material).dispose();
    engine.asteroid = null;

    scoreRef.current += 1;
    setScore(scoreRef.current);
    setDangerPulse(0);

    clearSpawnTimer();
    spawnTimerRef.current = setTimeout(() => {
      spawnAsteroid();
    }, spawnDelayForScore(scoreRef.current));
  }, [burstParticles, clearSpawnTimer, spawnAsteroid]);

  const startGame = useCallback(() => {
    clearSpawnTimer();
    scoreRef.current = 0;
    setScore(0);
    setDangerPulse(0);
    phaseRef.current = "playing";
    setPhase("playing");

    const engine = engineRef.current;
    if (engine) {
      engine.particles.forEach((p) => {
        engine.scene.remove(p);
        p.geometry.dispose();
        (p.material as THREE.Material).dispose();
      });
      engine.particles = [];
      if (engine.asteroid) {
        engine.scene.remove(engine.asteroid);
        engine.asteroid.geometry.dispose();
        (engine.asteroid.material as THREE.Material).dispose();
        engine.asteroid = null;
      }
    }

    spawnAsteroid();
  }, [clearSpawnTimer, spawnAsteroid]);

  const handlePointer = useCallback(
    (clientX: number, clientY: number) => {
      const engine = engineRef.current;
      const container = containerRef.current;
      if (!engine || !container) return;

      if (phaseRef.current === "idle") {
        if (!engine.audioCtx) {
          engine.audioCtx = new AudioContext();
        } else if (engine.audioCtx.state === "suspended") {
          engine.audioCtx.resume();
        }
        startGame();
        return;
      }

      if (phaseRef.current === "gameover") return;
      if (!engine.asteroid) return;

      const rect = container.getBoundingClientRect();
      engine.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      engine.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      engine.raycaster.setFromCamera(engine.pointer, engine.camera);
      const hits = engine.raycaster.intersectObject(engine.asteroid, false);
      if (hits.length > 0) onHit();
    },
    [onHit, startGame]
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.FogExp2(0x050508, 0.018);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);

    const ambient = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    keyLight.position.set(3, 4, 6);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x6688ff, 0.8, 60);
    rimLight.position.set(-4, -2, 2);
    scene.add(rimLight);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = 400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 80;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 80;
      starPos[i * 3 + 2] = -10 - Math.random() * 50;
    }
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 })
    );
    scene.add(stars);

    engineRef.current = {
      scene,
      camera,
      renderer,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      asteroid: null,
      particles: [],
      audioCtx: null,
      animId: 0,
      lastTime: performance.now(),
    };

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const onClick = (e: MouseEvent) => handlePointer(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) handlePointer(t.clientX, t.clientY);
    };

    container.addEventListener("click", onClick);
    container.addEventListener("touchstart", onTouch, { passive: false });

    const tick = (now: number) => {
      const engine = engineRef.current;
      if (!engine) return;

      const dt = Math.min((now - engine.lastTime) / 1000, 0.05);
      engine.lastTime = now;

      if (phaseRef.current === "playing" && engine.asteroid) {
        const speed = speedForScore(scoreRef.current);
        engine.asteroid.position.z += speed * dt;

        const progress = (engine.asteroid.position.z - SPAWN_Z) / (HIT_Z - SPAWN_Z);
        const scale = 0.15 + progress * 2.2;
        engine.asteroid.scale.setScalar(scale);

        engine.asteroid.rotation.x += dt * 1.2;
        engine.asteroid.rotation.y += dt * 0.9;

        const mat = engine.asteroid.material as THREE.MeshStandardMaterial;
        if (engine.asteroid.position.z > DANGER_START_Z) {
          const danger =
            (engine.asteroid.position.z - DANGER_START_Z) /
            (HIT_Z - DANGER_START_Z);
          const clamped = Math.min(1, Math.max(0, danger));
          mat.emissive.setRGB(clamped * 0.8, 0, 0);
          mat.emissiveIntensity = clamped * 1.5;
          setDangerPulse(clamped);
        } else {
          mat.emissive.setRGB(0, 0, 0);
          mat.emissiveIntensity = 0;
          setDangerPulse(0);
        }

        if (engine.asteroid.position.z >= HIT_Z) {
          endGame();
        }
      }

      engine.particles = engine.particles.filter((p) => {
        const life = (p.userData.life as number) - dt * 2.5;
        p.userData.life = life;
        (p.material as THREE.PointsMaterial).opacity = life;
        const velocities = p.userData.velocities as THREE.Vector3[];
        const pos = p.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < velocities.length; i++) {
          pos.setXYZ(
            i,
            pos.getX(i) + velocities[i].x * dt,
            pos.getY(i) + velocities[i].y * dt,
            pos.getZ(i) + velocities[i].z * dt
          );
        }
        pos.needsUpdate = true;
        if (life <= 0) {
          engine.scene.remove(p);
          p.geometry.dispose();
          (p.material as THREE.Material).dispose();
          return false;
        }
        return true;
      });

      renderer.render(scene, camera);
      engine.animId = requestAnimationFrame(tick);
    };
    engineRef.current.animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(engineRef.current?.animId ?? 0);
      window.removeEventListener("resize", onResize);
      container.removeEventListener("click", onClick);
      container.removeEventListener("touchstart", onTouch);
      clearSpawnTimer();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      engineRef.current = null;
    };
  }, [clearSpawnTimer, endGame, handlePointer]);

  return (
    <div className="game">
      <div ref={containerRef} className="canvas-wrap">
        <canvas ref={canvasRef} />
      </div>

      <div ref={dangerRef} className="danger-vignette" />

      <div className="hud">
        <div className="score-pill">
          <span className="score">{score}</span>
        </div>
      </div>

      {phase === "idle" && (
        <div className="overlay overlay-idle">
          <h1 className="title">Dodge3D</h1>
          <p className="subtitle">
            Tap incoming asteroids before they reach you. One miss ends the run.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => handlePointer(window.innerWidth / 2, window.innerHeight / 2)}
          >
            Play
          </button>
          {highScore > 0 && <p className="best">Best: {highScore}</p>}
        </div>
      )}

      {phase === "gameover" && (
        <div className="overlay overlay-gameover">
          <p className="gameover-label">Game Over</p>
          <p className="final-score">{score}</p>
          <p className="best" style={{ marginTop: 0, marginBottom: "2rem" }}>
            Best: {Math.max(score, highScore)}
          </p>
          <button type="button" className="btn" onClick={startGame}>
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
