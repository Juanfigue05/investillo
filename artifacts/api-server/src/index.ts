import app from "./app";
import { logger } from "./lib/logger";


process.on("uncaughtException", (err) => {
  console.error("Error no capturado (el servidor sigue corriendo):", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Promesa rechazada sin capturar (el servidor sigue corriendo):", reason);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
