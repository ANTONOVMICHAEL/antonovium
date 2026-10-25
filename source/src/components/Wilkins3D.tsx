import { useEffect, useRef, useState } from 'react';
import WilkinsIllustration from './WilkinsIllustration';
import type { WilkinsPose } from '../wilkinsCompanion';

type Props = { motion: boolean; reaction: number; onInteract: () => void; pose?: WilkinsPose; facing?: number;
  onMove?: (dx:number,dy:number) => void; onGrab?: () => void; onDrop?: () => void };

/** A locally modelled, real-time character. No film stills or remote character files are bundled. */
export default function Wilkins3D({ motion, reaction, onInteract, pose='idle', facing=0, onMove, onGrab, onDrop }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controls = useRef<{ rotate: (dx: number, dy: number) => void; react: () => void; redraw: () => void } | null>(null);
  const pointer = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [ready, setReady] = useState(false);
  const [renderMode,setRenderMode]=useState<'loading'|'webgl2'|'vector'>('loading');
  const motionRef = useRef(motion);
  const poseRef = useRef(pose), facingRef = useRef(facing);
  poseRef.current = pose; facingRef.current = facing;
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;
  useEffect(() => { motionRef.current = motion; controls.current?.redraw(); }, [motion]);
  useEffect(() => { controls.current?.redraw(); }, [pose, facing]);
  useEffect(() => { if (reaction) controls.current?.react(); }, [reaction]);

  useEffect(() => {
    let live = true;
    let cleanup = () => {};
    const node = canvas.current;
    if (!node) return;
    void import('three').then(THREE => {
      if (!live) return;
      if (!node.getContext('webgl2')) {setRenderMode('vector');return;}
      try {
        const renderer = new THREE.WebGLRenderer({ canvas: node, alpha: true, antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.55;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
        camera.position.set(0, 2.27, 8.9);
        camera.lookAt(0, 2.25, 0);
        scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x917568, 2.4));
        const key = new THREE.DirectionalLight(0xfff7e9, 3.1);
        key.position.set(-3, 7, 7); scene.add(key);
        const rim = new THREE.DirectionalLight(0xb7e1ea, 2.8);
        rim.position.set(3, 5, -4); scene.add(rim);

        const body = new THREE.Group(); scene.add(body);
        const plastic = new THREE.MeshPhysicalMaterial({ color: 0xfff9e9, roughness: .58, metalness: 0, clearcoat: .22 });
        const clay = new THREE.MeshStandardMaterial({ color: 0xf3ebd8, roughness: .88 });
        const eyeWhite = new THREE.MeshPhysicalMaterial({ color: 0xfffaf3, roughness: .38, clearcoat: .25 });
        const pupils = new THREE.MeshPhysicalMaterial({ color: 0x161721, roughness: .31, clearcoat: .5 });
        const blue = new THREE.MeshStandardMaterial({ color: 0x1394b4, roughness: .87 });
        const red = new THREE.MeshStandardMaterial({ color: 0xc74235, roughness: .98 });
        const redFiber = new THREE.MeshStandardMaterial({ color: 0xd4614a, roughness: 1 });
        const wood = new THREE.MeshStandardMaterial({ color: 0xdba95c, roughness: .87 });
        const innerMouth = new THREE.MeshStandardMaterial({ color: 0x825c58, roughness: .96 });
        const unitSphere = new THREE.SphereGeometry(1, 24, 16);
        const bead = (parent: InstanceType<typeof THREE.Object3D>, material: InstanceType<typeof THREE.Material>, pos: [number, number, number], scale: [number, number, number]) => {
          const mesh = new THREE.Mesh(unitSphere, material);
          mesh.position.set(...pos); mesh.scale.set(...scale); parent.add(mesh); return mesh;
        };
        const tube = (parent: InstanceType<typeof THREE.Object3D>, points: [number, number, number][], radius: number, material: InstanceType<typeof THREE.Material>, segments = 42) => {
          const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
          const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, segments, radius, 7, false), material);
          parent.add(mesh); return path;
        };

        // One bevelled fork silhouette, with four separate rounded tines and a narrow stem.
        const shape = new THREE.Shape();
        shape.moveTo(-.135, .43);
        shape.bezierCurveTo(-.15, 1.0, -.14, 2.05, -.16, 2.34);
        shape.bezierCurveTo(-.19, 2.65, -.47, 2.82, -.67, 3.13);
        shape.bezierCurveTo(-.83, 3.43, -.80, 3.94, -.70, 4.43);
        shape.quadraticCurveTo(-.64, 4.62, -.57, 4.44);
        shape.lineTo(-.40, 3.98);
        shape.lineTo(-.34, 4.50);
        shape.quadraticCurveTo(-.28, 4.68, -.21, 4.49);
        shape.lineTo(-.10, 3.99);
        shape.lineTo(.07, 4.52);
        shape.quadraticCurveTo(.15, 4.67, .22, 4.48);
        shape.lineTo(.30, 3.98);
        shape.lineTo(.49, 4.44);
        shape.quadraticCurveTo(.58, 4.62, .65, 4.42);
        shape.bezierCurveTo(.84, 3.89, .79, 3.39, .59, 3.05);
        shape.bezierCurveTo(.37, 2.73, .17, 2.62, .15, 2.31);
        shape.bezierCurveTo(.13, 1.9, .15, .94, .135, .43);
        shape.closePath();
        const fork = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelThickness: .075, bevelSize: .065, bevelSegments: 4, curveSegments: 12, steps: 1 }), plastic);
        fork.position.z = -.11; body.add(fork);
        bead(body, clay, [0, .36, .10], [.39, .24, .31]);
        bead(body, clay, [-.16, .43, .30], [.23, .16, .17]);
        bead(body, clay, [.15, .40, .29], [.21, .13, .16]);
        const plank = new THREE.Shape();
        plank.moveTo(-.49, -.09); plank.lineTo(.48, -.09);
        plank.quadraticCurveTo(.59, -.05, .52, .04); plank.lineTo(-.49, .09);
        plank.quadraticCurveTo(-.65, .05, -.49, -.09);
        const footGeometry = new THREE.ExtrudeGeometry(plank, { depth: .10, bevelEnabled: true, bevelSize: .06, bevelThickness: .04, bevelSegments: 2 });
        const feet: InstanceType<typeof THREE.Mesh>[] = [];
        for (const [x, angle] of [[-.25, .14], [.26, -.15]]) {
          const foot = new THREE.Mesh(footGeometry, wood); foot.position.set(x, .19, .10); foot.rotation.z = angle; body.add(foot);
          feet.push(foot);
        }

        const leftEye = new THREE.Group(), rightEye = new THREE.Group();
        body.add(leftEye, rightEye);
        bead(leftEye, eyeWhite, [-.35, 3.35, .27], [.30, .37, .18]);
        bead(leftEye, pupils, [-.40, 3.33, .43], [.18, .22, .085]);
        bead(rightEye, eyeWhite, [.34, 3.36, .26], [.235, .285, .15]);
        bead(rightEye, pupils, [.36, 3.34, .39], [.105, .13, .07]);
        bead(leftEye, eyeWhite, [-.46, 3.44, .504], [.036, .045, .014]);
        bead(rightEye, eyeWhite, [.32, 3.39, .46], [.021, .025, .009]);
        leftEye.position.y = 3.35; rightEye.position.y = 3.36;
        for (const eye of [leftEye, rightEye]) for (const part of eye.children) part.position.y -= eye.position.y;
        const brow = new THREE.Group(), mouth = new THREE.Group(); body.add(brow, mouth);
        tube(brow, [[-.59, 3.88, .29], [-.39, 4.03, .34], [-.03, 4.06, .34], [.35, 3.94, .29], [.54, 3.82, .27]], .059, red, 48);
        bead(mouth, innerMouth, [0, 2.94, .305], [.38, .14, .034]);
        tube(mouth, [[-.42, 3.03, .33], [-.33, 2.88, .39], [-.07, 2.86, .41], [.14, 2.90, .39], [.36, 3.05, .32], [.43, 2.97, .29], [.36, 2.82, .37], [.06, 2.77, .41], [-.25, 2.82, .39], [-.42, 3.03, .33]], .07, blue, 60);
        brow.position.y = 3.95; mouth.position.y = 2.92;
        for (const part of brow.children) part.position.y -= brow.position.y;
        for (const part of mouth.children) part.position.y -= mouth.position.y;

        const leftArm = new THREE.Group(), rightArm = new THREE.Group();
        leftArm.position.set(-.10, 1.85, .06); rightArm.position.set(.10, 1.85, .06);
        body.add(leftArm, rightArm);
        const makeArm = (group: InstanceType<typeof THREE.Group>, points: [number, number, number][], seed: number) => {
          const path = tube(group, points, .054, red, 70);
          // Short, uneven filaments make the pipe cleaner read as a tactile object.
          const fiberGeometry = new THREE.CylinderGeometry(.008, .010, .105, 4);
          const fibers = new THREE.InstancedMesh(fiberGeometry, redFiber, 142);
          const instance = new THREE.Object3D();
          for (let i = 0; i < 142; i++) {
            const t = (i + .5) / 142, center = path.getPoint(t), tangent = path.getTangent(t);
            const radial = new THREE.Vector3(Math.cos(i * 2.4 + seed), Math.sin(i * 2.4 + seed), Math.cos(i * 1.7 + seed)).addScaledVector(tangent, -.32).normalize();
            instance.position.copy(center).addScaledVector(radial, .071);
            instance.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
            instance.scale.set(1, .45 + (i % 5) * .11, 1);
            instance.updateMatrix(); fibers.setMatrixAt(i, instance.matrix);
          }
          fibers.instanceMatrix.needsUpdate = true; group.add(fibers);
        };
        makeArm(leftArm, [[0, 0, 0], [-.36, .10, .11], [-.78, .04, .15], [-1.03, -.16, .18], [-1.13, -.39, .22], [-.99, -.48, .24]], 0);
        makeArm(rightArm, [[0, 0, 0], [.40, -.03, .10], [.83, -.14, .14], [1.02, -.04, .20], [1.12, .20, .25]], 1);
        for (const [parent, sign] of [[leftArm, -1], [rightArm, 1]] as const) {
          const x = sign < 0 ? -.99 : 1.12, y = sign < 0 ? -.48 : .20;
          makeArm(parent, [[x, y, .24], [x + sign * .15, y + .07, .26], [x + sign * .22, y + .22, .27]], 2);
          makeArm(parent, [[x, y, .24], [x + sign * .07, y + .13, .27], [x + sign * .06, y + .37, .26]], 3);
          makeArm(parent, [[x, y, .24], [x - sign * .05, y + .10, .27], [x - sign * .10, y + .25, .27]], 4);
        }
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(.86, 32), new THREE.MeshBasicMaterial({ color: 0x344551, transparent: true, opacity: .16, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.scale.y = .43; shadow.position.y = .055; scene.add(shadow);
        const book = new THREE.Group(), coverMaterial = new THREE.MeshStandardMaterial({color:0x345c73,roughness:.86});
        book.position.set(0,1.86,.58);body.add(book);
        for(const side of [-1,1]){
          const half=new THREE.Group();half.position.x=side*.22;half.rotation.y=side*-.25;half.rotation.z=side*.10;book.add(half);
          const cover=new THREE.Mesh(new THREE.BoxGeometry(.48,.54,.05),coverMaterial);half.add(cover);
          const pages=new THREE.Mesh(new THREE.BoxGeometry(.43,.48,.07),plastic);pages.position.z=.04;half.add(pages);
        }

        let yaw = -.10, targetYaw = -.10, pitch = 0, targetPitch = 0, pulse = 0, frame = 0;
        let active = true, rendered = false, lastFrame = 0;
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        const draw = (time: number) => {
          frame = 0;
          if (!active || document.hidden) return;
          const animated = motionRef.current && !prefersReduced.matches;
          if (animated && time-lastFrame < 32) { frame=requestAnimationFrame(draw); return; }
          lastFrame=time;
          const t = time / 1000;
          const action=poseRef.current, walking=animated&&action==='walk', asleep=action==='sleep';
          book.visible=action==='read';
          const stride=walking?Math.sin(t*15):0;
          yaw += (targetYaw - yaw) * .13;
          pitch += (targetPitch - pitch) * .13;
          body.rotation.y = yaw + facingRef.current*.46 + (animated ? Math.sin(t * .85) * .042 : 0);
          body.rotation.x = pitch+(action==='read'?.10:0);
          body.rotation.z = asleep?-.12:walking?stride*.065:animated ? Math.sin(t * 1.3) * .022 + pulse * .055 : 0;
          body.position.y = walking?Math.abs(stride)*.12:animated ? Math.sin(t * 1.8) * .047 + pulse * .10 + (action==='celebrate'?Math.abs(Math.sin(t*8))*.20:0) : 0;
          rightArm.rotation.z = !animated?0:action==='drag'?-.85:action==='think'?-.62:action==='wave'||action==='celebrate'?-.3+Math.sin(t*16)*.30:walking?stride*.22:Math.sin(t*2.4)*.08 + pulse*Math.sin(t*22)*.38;
          leftArm.rotation.z = !animated?0:action==='drag'?.8:walking?-stride*.22:Math.sin(t*1.65)*.035;
          for(let i=0;i<feet.length;i++){feet[i].rotation.x=walking?stride*(i?-.4:.4):0;feet[i].position.y=.19+(walking?Math.max(0,stride*(i?-1:1))*.13:0)}
          const blink = asleep?.08:animated && Math.sin(t * 1.37) > .997 ? .15 : 1;
          leftEye.scale.y = rightEye.scale.y = blink;
          mouth.scale.y = 1 + pulse * .18;
          brow.rotation.z = pulse * -.07+(action==='think'?-.13:0);
          pulse *= .93;
          renderer.render(scene, camera);
          if (!rendered) { rendered = true; setReady(true);setRenderMode('webgl2'); }
          if (animated || Math.abs(targetYaw - yaw) > .001 || Math.abs(targetPitch - pitch) > .001 || pulse > .01) frame = requestAnimationFrame(draw);
          else frame = 0;
        };
        const redraw = () => { if (!frame && active && !document.hidden) frame = requestAnimationFrame(draw); };
        const resize = () => {
          const width = node.clientWidth, height = node.clientHeight;
          if (!width || !height) return;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix(); redraw();
        };
        const observer = new ResizeObserver(resize); observer.observe(node);
        const visibility = () => redraw(); document.addEventListener('visibilitychange', visibility);
        const reduce = () => redraw(); prefersReduced.addEventListener('change', reduce);
        const contextLost = (event: Event) => { event.preventDefault(); active = false; cancelAnimationFrame(frame); setReady(false);setRenderMode('vector'); };
        node.addEventListener('webglcontextlost', contextLost);
        controls.current = {
          rotate(dx, dy) { targetYaw = Math.max(-1.05, Math.min(1.05, targetYaw + dx * .010)); targetPitch = Math.max(-.25, Math.min(.25, targetPitch + dy * .006)); redraw(); },
          react() { pulse = motionRef.current && !prefersReduced.matches ? 1 : 0; redraw(); },
          redraw,
        };
        resize(); redraw();
        cleanup = () => {
          active = false; cancelAnimationFrame(frame); controls.current = null;
          observer.disconnect(); document.removeEventListener('visibilitychange', visibility);
          prefersReduced.removeEventListener('change', reduce); node.removeEventListener('webglcontextlost', contextLost);
          scene.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            if (object.geometry !== unitSphere) object.geometry.dispose();
          });
          unitSphere.dispose();
          for (const material of [plastic, clay, eyeWhite, pupils, blue, red, redFiber, wood, innerMouth, coverMaterial, shadow.material]) material.dispose();
          renderer.dispose();
        };
      } catch(error) { setReady(false);setRenderMode('vector');console.debug('Wilkins renderer fallback',error); }
    }).catch(() => { if (live) {setReady(false);setRenderMode('vector');} });
    return () => { live = false; cleanup(); };
  }, []);

  return <button type="button" className="wilkins-3d" data-renderer={renderMode} data-pose={pose} data-facing={facing} aria-label={onMove?'Вилкинс — позвать или перетащить':'Вилкинс: нажать для ответа или повернуть жестом'} onClick={() => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    interactRef.current();
  }} onPointerDown={event => { suppressClick.current = false; pointer.current = { x: event.clientX, y: event.clientY, dragged: false }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
    const drag = pointer.current; if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) { if(!drag.dragged)onGrab?.();drag.dragged = true;if(onMove)onMove(dx,dy);else {controls.current?.rotate(dx, dy); if (!ready) { const fallback = event.currentTarget.querySelector<SVGSVGElement>('.wilkins-illustration'); fallback?.style.setProperty('--illustration-turn', `${Math.max(-15,Math.min(15,(event.clientX - event.currentTarget.getBoundingClientRect().left - event.currentTarget.clientWidth / 2) / 10))}deg`); } } }
    drag.x = event.clientX; drag.y = event.clientY;
  }} onPointerUp={() => { suppressClick.current = !!pointer.current?.dragged;if(pointer.current?.dragged)onDrop?.();pointer.current = null; }} onPointerCancel={() => { if(pointer.current?.dragged)onDrop?.();pointer.current = null; }}>
    <canvas ref={canvas} aria-hidden="true" style={{ opacity: ready ? 1 : 0 }}/>
    {!ready && <WilkinsIllustration motion={motion} reaction={reaction} pose={pose} facing={facing}/>}
  </button>;
}
