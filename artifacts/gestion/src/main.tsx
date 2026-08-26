import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("error", (event) => {
  document.body.innerHTML = `
    <div style="background:#1a0000;color:#ff6b6b;padding:24px;font-family:monospace;white-space:pre-wrap;min-height:100vh;">
      <h2 style="color:#ff9999;">Error al cargar la aplicación</h2>
      <p><strong>Mensaje:</strong> ${event.message}</p>
      <p><strong>Archivo:</strong> ${event.filename}:${event.lineno}:${event.colno}</p>
      <p><strong>Stack:</strong></p>
      <pre>${event.error?.stack || "(sin stack disponible)"}</pre>
    </div>
  `;
});

window.addEventListener("unhandledrejection", (event) => {
  document.body.innerHTML = `
    <div style="background:#1a0000;color:#ff6b6b;padding:24px;font-family:monospace;white-space:pre-wrap;min-height:100vh;">
      <h2 style="color:#ff9999;">Promesa rechazada sin capturar</h2>
      <pre>${event.reason?.stack || event.reason || "(sin detalle)"}</pre>
    </div>
  `;
});

createRoot(document.getElementById("root")!).render(<App />);
