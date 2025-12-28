import ReactDOM from "react-dom/client";
import i18next from "i18next"
import { initReactI18next } from "react-i18next";
import App from "./main/App";
import { HashRouter, Route, Routes } from "react-router";
import "./index.css";
import Settings from "./settings/Settings";
import { defaultNs, resources } from "./i18n/i18n";

i18next.use(initReactI18next).init({
  lng: "en", // lng is set by the React component once everything is loaded
  fallbackLng: "en",
  ns: ["main", "settings"],
  defaultNS: defaultNs,
  resources,
  debug: true,
  interpolation: {
    escapeValue: false,
  },
})

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <HashRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  </HashRouter>
);
