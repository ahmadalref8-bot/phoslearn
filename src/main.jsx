import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import PublicPage, { isPublicPath } from "./components/PublicPages.jsx";

const pathname = window.location.pathname;
createRoot(document.getElementById("root")).render(
  isPublicPath(pathname) ? <PublicPage pathname={pathname} /> : <App />,
);
