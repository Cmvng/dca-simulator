import React, { Suspense } from "react";
import LegacySimulator from "./App.jsx";

const OnchainAnalyzer = React.lazy(() => import("./components/OnchainAnalyzer.jsx"));

function isContractRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.replace(/\/+$/, "") === "/contract";
}

export default function AppShell() {
  if (!isContractRoute()) return <LegacySimulator />;

  return (
    <Suspense fallback={<div role="status" style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#5A6B87", background: "#EEF3FA" }}>Loading contract analyzer…</div>}>
      <OnchainAnalyzer />
    </Suspense>
  );
}
