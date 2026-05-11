
import {
  Suspense,
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Canvas, useThree, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { MeshHotspot } from "@/lib/types";

function cleanName(raw: string): string {
  const cleaned = raw
    .replace(/[_-]+/g, " ")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0 && /^[A-Za-z]/.test(w))
    .join(" ");
  return cleaned || raw;
}

interface MeshInfo {
  name: string;
  displayName: string;
  geometry: THREE.BufferGeometry;
  originalMaterial: THREE.Material | THREE.Material[];
  hoverMaterial: THREE.MeshStandardMaterial;
  highlightMaterial: THREE.MeshStandardMaterial;
  worldPosition: THREE.Vector3;
  worldQuaternion: THREE.Quaternion;
  worldScale: THREE.Vector3;
  explodeDir: THREE.Vector3;
}

interface ModelViewer3DProps {
  url: string;
  meshHotspots?: MeshHotspot[];
  onHotspotClick?: (hs: MeshHotspot, meshIndex: number) => void;
  autoRotate?: boolean;
}

function CameraSetup({
  meshInfos,
  refitRef,
}: {
  meshInfos: MeshInfo[];
  refitRef: React.MutableRefObject<() => void>;
}) {
  const { camera } = useThree();
  
  const controls = useThree((s) => s.controls) as any;
  const fittedRef = useRef(false);

  const doFit = useCallback(() => {
    if (!meshInfos.length) return;

    const box = new THREE.Box3();
    const mat4 = new THREE.Matrix4();
    meshInfos.forEach((m) => {
      m.geometry.computeBoundingBox();
      const gb = m.geometry.boundingBox;
      if (!gb) return;
      mat4.compose(m.worldPosition, m.worldQuaternion, m.worldScale);
      box.union(gb.clone().applyMatrix4(mat4));
    });
    if (box.isEmpty()) return;

    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    if (sphere.radius < 0.0001) return;

    const cam = camera as THREE.PerspectiveCamera;
    const fovRad = THREE.MathUtils.degToRad(cam.fov ?? 50);
    const fitDist = (sphere.radius * 2.5) / Math.tan(fovRad / 2);

    cam.position.set(
      sphere.center.x,
      sphere.center.y + sphere.radius * 0.15,
      sphere.center.z + fitDist
    );
    cam.near = Math.max(0.001, fitDist * 0.0005);
    cam.far = fitDist * 200;
    cam.updateProjectionMatrix();

    if (controls?.target) {
      controls.target.copy(sphere.center);
      controls.update(); 
    }
  }, [meshInfos, camera, controls]);

  useFrame(() => {
    if (fittedRef.current) return;
    if (!meshInfos.length || !controls) return;
    doFit();
    fittedRef.current = true;
    refitRef.current = () => {
      doFit();
    };
  });

  useEffect(() => {
    if (!meshInfos.length || !controls || fittedRef.current) return;
    doFit();
    fittedRef.current = true;
    refitRef.current = doFit;
  }, [meshInfos, controls, doFit]);

  return null;
}

function AssemblyScene({
  url,
  explodeAmount,
  meshHotspots,
  onHotspotClick,
  selectedMesh,
  onSelectMesh,
  refitRef,
}: {
  url: string;
  explodeAmount: number;
  meshHotspots?: MeshHotspot[];
  onHotspotClick?: (hs: MeshHotspot, idx: number) => void;
  selectedMesh: string | null;
  onSelectMesh: (name: string | null) => void;
  refitRef: React.MutableRefObject<() => void>;
}) {
  const { scene } = useGLTF(url);
  const [hoveredMesh, setHoveredMesh] = useState<string | null>(null);

  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.updateMatrixWorld(true);
    return c;
  }, [scene]);

  const { meshInfos, explodeScale } = useMemo(() => {
    const modelBox = new THREE.Box3().setFromObject(cloned);
    const modelCenter = modelBox.getCenter(new THREE.Vector3());

    const modelSphere = new THREE.Sphere();
    modelBox.getBoundingSphere(modelSphere);
    const dynScale = modelSphere.radius > 0.0001 ? modelSphere.radius : 1;

    const infos: MeshInfo[] = [];
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.name) return;

      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const worldQuat = new THREE.Quaternion();
      obj.getWorldQuaternion(worldQuat);
      const worldScale = new THREE.Vector3();
      obj.getWorldScale(worldScale);

      const meshBox = new THREE.Box3().setFromObject(obj);
      const meshCenter = meshBox.getCenter(new THREE.Vector3());
      const dir = meshCenter.clone().sub(modelCenter);
      if (dir.length() < 0.0001) dir.set(0, 1, 0);
      dir.normalize();

      const hoverMat = new THREE.MeshStandardMaterial({
        color: "#38bdf8",
        emissive: "#0ea5e9",
        emissiveIntensity: 0.5,
        roughness: 0.4,
        metalness: 0.3,
        transparent: true,
        opacity: 0.85,
      });
      const hlMat = new THREE.MeshStandardMaterial({
        color: "#f97316",
        emissive: "#f97316",
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.2,
      });

      infos.push({
        name: obj.name,
        displayName: cleanName(obj.name),
        geometry: obj.geometry,
        originalMaterial: obj.material,
        hoverMaterial: hoverMat,
        highlightMaterial: hlMat,
        worldPosition: worldPos,
        worldQuaternion: worldQuat,
        worldScale,
        explodeDir: dir,
      });
    });

    return { meshInfos: infos, explodeScale: dynScale };
  }, [cloned]);

  const labelSet = useMemo<Set<string>>(() => {
    if (!meshHotspots || meshHotspots.length === 0)
      return new Set(meshInfos.map((m) => m.name));
    return new Set(meshHotspots.map((h) => h.meshName));
  }, [meshHotspots, meshInfos]);

  return (
    <>
      <ambientLight intensity={1.0} />
      <directionalLight position={[5, 8, 5]} intensity={1.8} castShadow />
      <directionalLight position={[-4, -3, -5]} intensity={0.6} />
      <directionalLight position={[0, -5, 3]} intensity={0.3} />

      <CameraSetup meshInfos={meshInfos} refitRef={refitRef} />

      <group>
        {meshInfos.map((m, idx) => {
          const isSelected = selectedMesh === m.name;
          const isHovered = hoveredMesh === m.name;

          const ex = m.worldPosition.x + m.explodeDir.x * explodeAmount * explodeScale;
          const ey = m.worldPosition.y + m.explodeDir.y * explodeAmount * explodeScale;
          const ez = m.worldPosition.z + m.explodeDir.z * explodeAmount * explodeScale;

          const activeMat: THREE.Material | THREE.Material[] = isSelected
            ? m.highlightMaterial
            : isHovered
            ? m.hoverMaterial
            : m.originalMaterial;

          const hotspot = meshHotspots?.find((h) => h.meshName === m.name);
          const showLabel = labelSet.has(m.name);
          const labelText = hotspot?.text ?? m.displayName;

          const handleClick = (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            const syntheticHs: MeshHotspot = hotspot ?? {
              meshName: m.name,
              text: labelText,
            };
            onHotspotClick?.(syntheticHs, idx);
            onSelectMesh(isSelected ? null : m.name);
          };

          return (
            <mesh
              key={m.name}
              geometry={m.geometry}
              material={activeMat}
              position={[ex, ey, ez]}
              quaternion={m.worldQuaternion}
              scale={m.worldScale}
              onClick={handleClick}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredMesh(m.name);
                document.body.style.cursor = "pointer";
              }}
              onPointerOut={(_e: ThreeEvent<PointerEvent>) => {
                setHoveredMesh(null);
                document.body.style.cursor = "auto";
              }}
            >
              {showLabel && (
                <Html
                  center
                  occlude
                  style={{ pointerEvents: "none" }}
                >
                  <button
                    style={{
                      pointerEvents: "auto",
                      background: isSelected
                        ? "rgba(249,115,22,0.92)"
                        : isHovered
                        ? "rgba(14,165,233,0.88)"
                        : "rgba(10,10,20,0.82)",
                      color: "#fff",
                      border: isSelected
                        ? "1px solid rgba(249,115,22,0.7)"
                        : isHovered
                        ? "1px solid rgba(56,189,248,0.7)"
                        : "1px solid rgba(255,255,255,0.22)",
                      borderRadius: "4px",
                      padding: "3px 9px",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      backdropFilter: "blur(6px)",
                      userSelect: "none",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClick(e as unknown as { stopPropagation: () => void });
                    }}
                  >
                    {labelText}
                  </button>
                </Html>
              )}
            </mesh>
          );
        })}
      </group>
    </>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div
        style={{
          color: "#94a3b8",
          fontSize: "13px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "16px",
            height: "16px",
            border: "2px solid #3b82f6",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "mv3d-spin 0.8s linear infinite",
          }}
        />
        Loading model…
      </div>
    </Html>
  );
}

export function ModelViewer3D({
  url,
  meshHotspots,
  onHotspotClick,
  autoRotate = true,
}: ModelViewer3DProps) {
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [selectedMesh, setSelectedMesh] = useState<string | null>(null);
  const controlsRef = useRef<any>(null);
  const refitRef = useRef<() => void>(() => {});

  const handleReset = useCallback(() => {
    setExplodeAmount(0);
    setSelectedMesh(null);
    
    setTimeout(() => refitRef.current(), 50);
  }, []);

  useEffect(() => {
    useGLTF.preload(url);
  }, [url]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: "300px",
      }}
    >
      <style>{`@keyframes mv3d-spin { to { transform: rotate(360deg); } }`}</style>

      <Canvas
        camera={{ position: [0, 0, 5], fov: 50, near: 0.001, far: 100000 }}
        style={{ width: "100%", height: "100%", background: "#0f172a" }}
      >
        <Suspense fallback={<LoadingFallback />}>
          <AssemblyScene
            url={url}
            explodeAmount={explodeAmount}
            meshHotspots={meshHotspots}
            onHotspotClick={onHotspotClick}
            selectedMesh={selectedMesh}
            onSelectMesh={setSelectedMesh}
            refitRef={refitRef}
          />
        </Suspense>
        {}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          autoRotate={autoRotate && explodeAmount === 0}
          autoRotateSpeed={1.2}
          enablePan={false}
        />
      </Canvas>

      {}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "10px 16px",
          background: "linear-gradient(to top, rgba(0,0,0,0.78), transparent)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            pointerEvents: "auto",
          }}
        >
          <span style={{ color: "#94a3b8", fontSize: "10px", whiteSpace: "nowrap" }}>
            Assembled
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explodeAmount}
            onChange={(e) => setExplodeAmount(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#3b82f6", cursor: "pointer" }}
            title="Explode view"
          />
          <span style={{ color: "#94a3b8", fontSize: "10px", whiteSpace: "nowrap" }}>
            Exploded
          </span>
        </div>
        <button
          onClick={handleReset}
          style={{
            pointerEvents: "auto",
            background: "rgba(255,255,255,0.1)",
            color: "#cbd5e1",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "6px",
            padding: "4px 10px",
            fontSize: "11px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
