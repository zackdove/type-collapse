import { useEffect, useRef } from "react";
import gsap from "gsap";
import LoadingText from "./LoadingText";

export function LoadScreen({ visible = true }: { visible?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const tweenRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (!containerRef.current || !contentRef.current) return;

    tweenRef.current?.kill();

    if (visible) {
      containerRef.current.style.display = "flex";
      containerRef.current.style.pointerEvents = "auto";
      gsap.set(contentRef.current, { autoAlpha: 1 });
      tweenRef.current = gsap.timeline().to(containerRef.current, {
        autoAlpha: 1,
        duration: 0.3,
        ease: "power1.out",
      });
      return;
    }

    containerRef.current.style.pointerEvents = "none";
    tweenRef.current = gsap
      .timeline({
        onComplete: () => {
          if (containerRef.current) containerRef.current.style.display = "none";
        },
      })
      .to(contentRef.current, {
        autoAlpha: 0,
        duration: 0.2,
        delay: 0.8,
        ease: "power1.out",
      })
      .to(
        containerRef.current,
        {
          autoAlpha: 0,
          duration: 1,
          ease: "power1.out",
        },
        ">-0.2",
      );
  }, [visible]);

  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        top: "0",
        left: "0",
        position: "fixed",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "black",
        color: "red",
        opacity: 1,
        zIndex: 2000,
      }}
    >
      <div ref={contentRef}>
        <LoadingText />
      </div>
    </div>
  );
}
