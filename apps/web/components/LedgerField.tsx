"use client";

/**
 * The ledger field: three hundred thin bars on a plane that drift and re-sort
 * toward the cursor. It stands for the ledger settling into an order once a
 * question is asked. Loaded only when the visitor has not asked for less
 * movement and the browser can actually draw it.
 */
import React from "react";
import { GridBackground, useReducedMotion } from "@veritas/ui";

const BAR_COUNT = 300;
const COLUMNS = 30;

export default function LedgerField() {
  const reduced = useReducedMotion();
  const [failed, setFailed] = React.useState(false);
  const host = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (reduced || failed) return;
    let stop = () => {};
    let cancelled = false;

    (async () => {
      try {
        const THREE = await import("three");
        if (cancelled || !host.current) return;

        const width = host.current.clientWidth || 800;
        const height = host.current.clientHeight || 420;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        host.current.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
        camera.position.set(0, 6.5, 11);
        camera.lookAt(0, 0, 0);
        scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.1);
        key.position.set(4, 9, 6);
        scene.add(key);

        const bars = new THREE.InstancedMesh(
          new THREE.BoxGeometry(0.16, 1, 0.16),
          new THREE.MeshLambertMaterial({ color: new THREE.Color("hsl(169, 46%, 34%)") }),
          BAR_COUNT,
        );
        scene.add(bars);

        const home = Array.from({ length: BAR_COUNT }, (_, i) => {
          const column = i % COLUMNS;
          const row = Math.floor(i / COLUMNS);
          return new THREE.Vector3((column - COLUMNS / 2) * 0.42, 0, (row - BAR_COUNT / COLUMNS / 2) * 0.62);
        });
        const seeds = Array.from({ length: BAR_COUNT }, (_, i) => (i * 137.5) % 360);

        const pointer = new THREE.Vector2(0, 0);
        const onMove = (event: PointerEvent) => {
          const box = renderer.domElement.getBoundingClientRect();
          pointer.set(((event.clientX - box.left) / box.width - 0.5) * 6,
                      ((event.clientY - box.top) / box.height - 0.5) * 6);
        };
        window.addEventListener("pointermove", onMove);

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3(1, 1, 1);
        const quaternion = new THREE.Quaternion();
        let frame = 0;

        const draw = () => {
          const time = performance.now() / 1000;
          for (let i = 0; i < BAR_COUNT; i += 1) {
            const base = home[i];
            const distance = Math.hypot(base.x - pointer.x, base.z - pointer.y);
            const pull = Math.max(0, 1 - distance / 4);
            const drift = Math.sin(time * 0.6 + seeds[i]) * 0.18;
            const tall = 0.35 + pull * 2.4 + drift;
            position.set(base.x, tall / 2, base.z);
            scale.set(1, tall, 1);
            matrix.compose(position, quaternion, scale);
            bars.setMatrixAt(i, matrix);
          }
          bars.instanceMatrix.needsUpdate = true;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(draw);
        };
        draw();

        stop = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("pointermove", onMove);
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [reduced, failed]);

  if (reduced || failed) {
    return <div className="h-[420px] w-full"><GridBackground /></div>;
  }
  return <div ref={host} className="h-[420px] w-full" aria-hidden="true" />;
}
