import React from "react";
import ReactDOM from "react-dom/client";
import App from "./main/App";
import { HashRouter, Route, Routes } from "react-router";
import "./index.css";
import Settings from "./settings/Settings";
import EditPluginMain from "./edit/EditPluginMain";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/edit" element={<EditPluginMain />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
