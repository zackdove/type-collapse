import { Canvas, useFrame } from "@react-three/fiber";
import { Leva } from "leva";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { TextDestructionExperience } from "./scene/TextDestructionExperience";
import "./App.css";
import { levaTheme } from "./config/levaTheme";
import { LoadScreen } from "./components/LoadScreen/LoadScreen";

type SceneReadySignalProps = {
  onReady: () => void;
};

function SceneReadySignal({ onReady }: SceneReadySignalProps) {
  const signaledRef = useRef(false);

  useFrame(() => {
    if (signaledRef.current) {
      return;
    }

    signaledRef.current = true;
    onReady();
  });

  return null;
}

function App() {
  const [sceneReady, setSceneReady] = useState(false);
  const [minimumDelayElapsed, setMinimumDelayElapsed] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMinimumDelayElapsed(true);
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const handleSceneReady = useCallback(() => {
    setSceneReady(true);
  }, []);

  const loadingVisible = !sceneReady || !minimumDelayElapsed;

  return (
    <div className="app-shell">
      <LoadScreen visible={loadingVisible} />

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
          <SceneReadySignal onReady={handleSceneReady} />
        </Suspense>
      </Canvas>

      {/* <aside className="app-hud" aria-hidden>
        <h1>Type Collapse</h1>
        <p>Hover text to inject impact. Click text to pause/resume. Drag to orbit.</p>
      </aside> */}
      <div className="leva-wrapper">
        <Leva
          fill
          collapsed
          oneLineLabels={false}
          hideCopyButton
          theme={levaTheme}
          titleBar={{
            title: "Controls",
            filter: false,
          }}
        />
      </div>
    </div>
  );
}

export default App;
