import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Suspense } from "react";

import { TextDestructionExperience } from "./scene/TextDestructionExperience";
import "./App.css";

function App() {
  return (
    <div className="app-shell">
      <Canvas
        className="app-canvas"
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        camera={{ position: [0, 0.15, 9], fov: 42, near: 0.1, far: 120 }}
      >
        <Suspense fallback={null}>
          <TextDestructionExperience />
        </Suspense>
      </Canvas>

      {/* <aside className="app-hud" aria-hidden>
        <h1>Type Collapse</h1>
        <p>Hover text to inject impact. Click text to pause/resume. Drag to orbit.</p>
      </aside> */}

      <Leva collapsed={false} oneLineLabels={false} hideCopyButton />
    </div>
  );
}

export default App;
