import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: resolve(__dirname, "src/shims/reactNativeWeb.tsx") },
      { find: /^react-native-reanimated$/, replacement: resolve(__dirname, "src/shims/reanimated.tsx") },
      { find: "react-native/Libraries/Renderer/shims/ReactNative", replacement: resolve(__dirname, "src/shims/ReactNative.ts") },
    ],
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".web.js", ".js", ".json"],
  },
  define: { __DEV__: JSON.stringify(process.env.NODE_ENV !== "production") },
  optimizeDeps: {
    include: [
      "@ant-design/react-native/es/button",
      "@ant-design/react-native/es/card",
      "@ant-design/react-native/es/icon",
      "@ant-design/react-native/es/input",
      "@ant-design/react-native/es/list",
      "@ant-design/react-native/es/picker",
      "@ant-design/react-native/es/provider",
      "@ant-design/react-native/es/result",
      "@ant-design/react-native/es/tab-bar",
      "@ant-design/react-native/es/tag",
      "@ant-design/react-native/es/toast",
    ],
    exclude: ["react-native", "react-native-gesture-handler", "react-native-reanimated"],
  },
  server: { port: 5177, host: true },
});
