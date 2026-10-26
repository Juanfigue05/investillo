import app from "./app";
import { logger } from "./lib/logger";
import { iniciarGuardadoDiario } from "./lib/guardado-diario";

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Excepción no capturada; se terminará el proceso");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal(
    { err: reason },
    "Rechazo no controlado; se terminará el proceso",
  );
  process.exit(1);
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
  iniciarGuardadoDiario();
});
