import type { RequestHandler } from "express";

export const rechazarCuerpoComprimido: RequestHandler = (req, res, next) => {
  const contentEncoding = req.header("content-encoding");
  if (
    contentEncoding !== undefined &&
    contentEncoding.trim().toLowerCase() !== "identity"
  ) {
    res.status(415).json({ error: "Codificacion de contenido no soportada" });
    return;
  }
  next();
};
