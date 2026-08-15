import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].startsWith("Unexpected text node:") && args[0].includes("A text node cannot be a child of a <View>")) return;
  originalConsoleError(...args);
};

createRoot(document.getElementById("root")!).render(<App />);
