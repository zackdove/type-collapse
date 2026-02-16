"use client";

import { useEffect, useState } from "react";

export default function LoadingText() {
  const ARROWS = [
    "£",
    "¤",
    "¥",
    "¦",
    "§",
    "©",
    "«",
    "¬",
    "®",
    "±",
    "»",
    "¿",
    "¤",
    "∂",
    "∆",
    "∑",
    "≠",
    "±",
    "∫",
    "√",
    "∏",
    "∴",
    "∵",
    "←",
    "↑",
    "→",
    "↓",
    "↔",
    "↕",
  ];

  const [arrowIndex, setArrowIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setArrowIndex((i) => (i + 1) % ARROWS.length);
    }, 120); // tweak speed here

    return () => clearInterval(interval);
  }, []);

  return <div>{ARROWS[arrowIndex]}</div>;
}
