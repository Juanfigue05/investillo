import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inventarioRouter from "./inventario";
import ventasRouter from "./ventas";
import creditosRouter from "./creditos";
import comprasRouter from "./compras";
import manoObraRouter from "./manoobra";
import trabajadoresRouter from "./trabajadores";
import notasRouter from "./notas";
import historialRouter from "./historial";
import dashboardRouter from "./dashboard";
import historialPreciosRouter from "./historial-precios";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/inventario", inventarioRouter);
router.use("/ventas", ventasRouter);
router.use("/creditos", creditosRouter);
router.use("/compras", comprasRouter);
router.use("/manoobra", manoObraRouter);
router.use("/trabajadores", trabajadoresRouter);
router.use("/notas", notasRouter);
router.use("/historial", historialRouter);
router.use("/dashboard", dashboardRouter);
router.use("/historial-precios", historialPreciosRouter);

export default router;
