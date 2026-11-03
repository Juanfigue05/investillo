import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import {
  esOperacionEncoladaOffline,
  esOperacionOfflineNoGuardada,
  leerRespuestaApi,
} from "@/lib/respuesta-api";
import { formatCurrency } from "@/lib/utils";
import { Check, Pencil, Printer, Trash2, X } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`.replace(/\/+/g, "/").replace(/\/$/, "");
const NOMBRES_MES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function anchosColumnasNomina(aplicaDescuento30: boolean, aplicaSeguro: boolean) {
  const pesos = [0.75, 2.4];
  if (aplicaDescuento30) pesos.push(0.7, 1.8);
  if (aplicaSeguro) pesos.push(1.4);
  pesos.push(2.1);
  const total = pesos.reduce((suma, peso) => suma + peso, 0);
  return pesos.map((peso) => `${(peso / total) * 100}%`);
}

function datosDeEjemplo(mes: string) {
  const base = `${mes}-05`;
  return {
    tensionadas: [{ id: "demo-tensionada", fecha: base, valor: 180000 }],
    totalTensionadas: 180000,
    trabajadores: [{
      trabajadorId: "demo-trabajador",
      nombre: "EJEMPLO",
      dias: [
        { fecha: base, valor: 120000, descuentoOtros: 36000, seguro: 0, total: 84000, cierreId: "demo" },
        { fecha: `${mes}-06`, noVino: true },
        { fecha: `${mes}-07`, sinRegistro: true },
      ],
    }],
  };
}

export default function ReporteNomina() {
  const hoy = new Date();
  const [mes, setMes] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarEjemplo, setMostrarEjemplo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [imprimirTensionadas, setImprimirTensionadas] = useState(true);
  const [trabajadoresSeleccionados, setTrabajadoresSeleccionados] = useState<string[]>([]);
  const [printMenu, setPrintMenu] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<"portrait" | "landscape">("portrait");
  const [printPageEnds, setPrintPageEnds] = useState<number[] | null>(null);
  const [tensionadasPageBreak, setTensionadasPageBreak] = useState(false);
  const printMeasureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCargando(true);
    fetch(`${API}/reportes/nomina?mes=${mes}`).then((r) => r.json()).then(setData).finally(() => setCargando(false));
  }, [mes]);

  const recargar = () => fetch(`${API}/reportes/nomina?mes=${mes}`).then((r) => r.json()).then(setData);
  const vista = mostrarEjemplo ? datosDeEjemplo(mes) : data;

  useEffect(() => {
    if (vista?.trabajadores) {
      setTrabajadoresSeleccionados(vista.trabajadores.map((t: any) => String(t.trabajadorId)));
    }
  }, [data, mes, mostrarEjemplo]);

  const todosTrabajadoresSeleccionados = Boolean(vista?.trabajadores?.length) &&
    vista.trabajadores.every((t: any) => trabajadoresSeleccionados.includes(String(t.trabajadorId)));
  const alternarTodosTrabajadores = () => {
    if (todosTrabajadoresSeleccionados) {
      setTrabajadoresSeleccionados([]);
    } else {
      setTrabajadoresSeleccionados((vista?.trabajadores || []).map((t: any) => String(t.trabajadorId)));
    }
  };
  const [mutacionEnCurso, setMutacionEnCurso] = useState(false);

  const fmtFecha = (f: string) => new Date(f + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" });
  const iniciarEdicion = (key: string, d: any) => {
    setEditando(key);
    setBorrador({ fecha: d.fecha, valor: String(d.valor), descuentoOtros: String(d.descuentoOtros), seguro: String(d.seguro), total: String(Math.max(0, Number(d.total) || 0)) });
  };
  const guardarDia = async (fechaOriginal: string, trabajadorId: number, key: string) => {
    if (mutacionEnCurso) return;
    setMutacionEnCurso(true);
    try {
      await leerRespuestaApi(fetch(`${API}/reportes/nomina/dia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaOriginal, trabajadorId, ...Object.fromEntries(Object.entries(borrador).map(([k, v]) => [k, k === "fecha" ? v : Number(v)])) }),
      }));
      setEditando(null);
      await recargar();
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        const cambios = Object.fromEntries(
          Object.entries(borrador).map(([campo, valor]) => [
            campo,
            campo === "fecha" ? valor : Number(valor),
          ]),
        );
        setData((anterior: any) =>
          anterior
            ? {
                ...anterior,
                trabajadores: anterior.trabajadores?.map((trabajador: any) =>
                  String(trabajador.trabajadorId) === String(trabajadorId)
                    ? {
                        ...trabajador,
                        dias: trabajador.dias.map((dia: any) =>
                          dia.fecha === fechaOriginal
                            ? { ...dia, ...cambios }
                            : dia,
                        ),
                      }
                    : trabajador,
                ),
              }
            : anterior,
        );
        setEditando(null);
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setMutacionEnCurso(false);
    }
  };
  const guardarTensionada = async (id: number, key: string) => {
    if (mutacionEnCurso) return;
    setMutacionEnCurso(true);
    try {
      await leerRespuestaApi(fetch(`${API}/tensionadas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: borrador[`${key}:fecha`], valor: Number(borrador[`${key}:valor`]) }),
      }));
      setEditando(null);
      await recargar();
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        setData((anterior: any) =>
          anterior
            ? {
                ...anterior,
                tensionadas: anterior.tensionadas?.map((tensionada: any) =>
                  String(tensionada.id) === String(id)
                    ? {
                        ...tensionada,
                        fecha: borrador[`${key}:fecha`],
                        valor: Number(borrador[`${key}:valor`]),
                      }
                    : tensionada,
                ),
                totalTensionadas: (anterior.tensionadas || []).reduce(
                  (total: number, tensionada: any) =>
                    total +
                    (String(tensionada.id) === String(id)
                      ? Number(borrador[`${key}:valor`])
                      : Number(tensionada.valor)),
                  0,
                ),
              }
            : anterior,
        );
        setEditando(null);
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setMutacionEnCurso(false);
    }
  };
  const eliminarTensionada = async (id: number) => {
    if (mutacionEnCurso || !confirm("¿Eliminar esta tensionada? Esta acción no se puede deshacer.")) return;
    setMutacionEnCurso(true);
    try {
      await leerRespuestaApi(fetch(`${API}/tensionadas/${id}`, { method: "DELETE" }));
      setEditando(null);
      await recargar();
    } catch (error) {
      if (esOperacionEncoladaOffline(error)) {
        setData((anterior: any) =>
          anterior
            ? {
                ...anterior,
                tensionadas: anterior.tensionadas?.filter(
                  (tensionada: any) => String(tensionada.id) !== String(id),
                ),
                totalTensionadas: (anterior.tensionadas || [])
                  .filter((tensionada: any) => String(tensionada.id) !== String(id))
                  .reduce(
                    (total: number, tensionada: any) =>
                      total + Number(tensionada.valor),
                    0,
                  ),
              }
            : anterior,
        );
        setEditando(null);
        return;
      }
      if (esOperacionOfflineNoGuardada(error)) return;
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setMutacionEnCurso(false);
    }
  };

  const trabajadores = vista?.trabajadores || [];
  const paginasDeTrabajadores: any[][] = [];
  if (printPageEnds) {
    let inicioPagina = 0;
    for (const finPagina of printPageEnds) {
      paginasDeTrabajadores.push(trabajadores.slice(inicioPagina, finPagina));
      inicioPagina = finPagina;
    }
    if (inicioPagina < trabajadores.length) {
      if (paginasDeTrabajadores.length) {
        paginasDeTrabajadores[paginasDeTrabajadores.length - 1].push(...trabajadores.slice(inicioPagina));
      } else {
        paginasDeTrabajadores.push(trabajadores.slice(inicioPagina));
      }
    }
  } else {
    paginasDeTrabajadores.push(...Array.from(
      { length: Math.ceil(trabajadores.length / 4) },
      (_, indice) => trabajadores.slice(indice * 4, indice * 4 + 4),
    ));
  }
  const handlePrintWithOrientation = (orientation: "portrait" | "landscape") => {
    const previousStyle = document.getElementById("__nomina_print_page_size");
    previousStyle?.remove();

    const style = document.createElement("style");
    style.id = "__nomina_print_page_size";
    style.textContent = `@page { size: letter ${orientation}; margin: 4mm; }`;
    document.head.appendChild(style);
    window.addEventListener("afterprint", () => style.remove(), { once: true });

    setPrintOrientation(orientation);
    setPrintMenu(false);
    requestAnimationFrame(() => {
      const report = document.querySelector<HTMLElement>(".nomina-report-print");
      const measure = printMeasureRef.current;
      if (!report || !measure) {
        style.remove();
        alert("No se pudo preparar la nómina para imprimir. Intenta nuevamente cuando termine de cargar.");
        return;
      }

      const widthMm = orientation === "portrait" ? 215.9 : 279.4;
      const heightMm = orientation === "portrait" ? 279.4 : 215.9;
      const pageWidthPx = ((widthMm - 8) * 96) / 25.4;
      const pageHeightPx = ((heightMm - 8) * 96) / 25.4;
      const rowGapPx = (2 * 96) / 25.4;
      measure.style.width = `${pageWidthPx}px`;
      measure.replaceChildren();

      const tensionadas = imprimirTensionadas
        ? report.querySelector<HTMLElement>(".nomina-tensionadas:not(.print-omit)")
        : null;
      if (tensionadas) measure.append(tensionadas.cloneNode(true));

      const measureWorkers = document.createElement("div");
      measureWorkers.className = "nomina-measure-workers";
      measure.append(measureWorkers);
      const trabajadoresVisibles = Array.from(
        report.querySelectorAll<HTMLElement>(".nomina-trabajador:not(.print-omit)"),
      );
      const alturasTrabajadores = trabajadoresVisibles.map((trabajador) => {
        const copia = trabajador.cloneNode(true) as HTMLElement;
        measureWorkers.append(copia);
        return copia.getBoundingClientRect().height;
      });
      const altoTensionadas = tensionadas
        ? measure.firstElementChild?.getBoundingClientRect().height ?? 0
        : 0;

      const paginasSeleccionadas: number[][] = [];
      let indiceTrabajador = 0;
      let primeraPagina = true;
      let separarTensionadas = false;

      while (indiceTrabajador < trabajadoresVisibles.length) {
        let altoUsado = primeraPagina && tensionadas
          ? altoTensionadas + rowGapPx
          : 0;
        const trabajadoresPagina: number[] = [];

        while (indiceTrabajador < trabajadoresVisibles.length && trabajadoresPagina.length < 4) {
          const cantidadFila = Math.min(2, 4 - trabajadoresPagina.length);
          const alturasFila = alturasTrabajadores.slice(indiceTrabajador, indiceTrabajador + cantidadFila);
          const altoFila = Math.max(...alturasFila);
          const espacioFila = trabajadoresPagina.length ? rowGapPx : 0;
          if (altoUsado + espacioFila + altoFila > pageHeightPx && trabajadoresPagina.length) break;
          if (altoUsado + espacioFila + altoFila > pageHeightPx && primeraPagina && tensionadas) {
            separarTensionadas = true;
            break;
          }

          for (let indiceFila = 0; indiceFila < alturasFila.length; indiceFila++) {
            trabajadoresPagina.push(indiceTrabajador + indiceFila);
          }
          altoUsado += espacioFila + altoFila;
          indiceTrabajador += alturasFila.length;
        }

        if (trabajadoresPagina.length) {
          paginasSeleccionadas.push(trabajadoresPagina);
          primeraPagina = false;
        } else if (primeraPagina && tensionadas) {
          primeraPagina = false;
        } else {
          paginasSeleccionadas.push([indiceTrabajador]);
          indiceTrabajador++;
          primeraPagina = false;
        }
      }

      const indicesTrabajadores = new Map<string, number>();
      trabajadoresVisibles.forEach((trabajador) => {
        indicesTrabajadores.set(
          trabajador.dataset.trabajadorId || "",
          trabajadores.findIndex((t: any) => String(t.trabajadorId) === trabajador.dataset.trabajadorId),
        );
      });
      let finPagina = 0;
      const limitesPaginas = paginasSeleccionadas.map((pagina) => {
        const ultimoId = trabajadoresVisibles[pagina[pagina.length - 1]]?.dataset.trabajadorId || "";
        finPagina = (indicesTrabajadores.get(ultimoId) ?? finPagina) + 1;
        return finPagina;
      });

      setPrintPageEnds(limitesPaginas);
      setTensionadasPageBreak(separarTensionadas && paginasSeleccionadas.length > 0);
      requestAnimationFrame(() => {
        measure.replaceChildren();
        window.print();
      });
    });
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex justify-between items-center no-print">
          <h1 className="text-2xl font-display font-bold text-foreground">Reporte de Nómina</h1>
          <div className="flex gap-2 items-center">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="bg-card border border-border px-3 py-2 rounded-xl text-sm" />
            <button onClick={() => setMostrarEjemplo((actual) => !actual)} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium">
              {mostrarEjemplo ? "Datos reales" : "Vista de ejemplo"}
            </button>
            <div className="relative">
              <button onClick={() => setPrintMenu((open) => !open)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              {printMenu && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden w-52">
                  <button onClick={() => handlePrintWithOrientation("portrait")} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-sm text-left transition-colors">
                    <span className="text-base">📄</span> Vertical (retrato)
                  </button>
                  <button onClick={() => handlePrintWithOrientation("landscape")} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-sm text-left transition-colors">
                    <span className="text-base">📃</span> Horizontal (paisaje)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="no-print flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium text-foreground">Imprimir:</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={imprimirTensionadas} onChange={(e) => setImprimirTensionadas(e.target.checked)} className="accent-primary" />
            Tensionadas
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={todosTrabajadoresSeleccionados} onChange={alternarTodosTrabajadores} className="accent-primary" />
            Todos los trabajadores
          </label>
          {vista?.trabajadores?.map((t: any) => (
            <label key={t.trabajadorId} className="flex items-center gap-2 cursor-pointer text-muted-foreground">
              <input
                type="checkbox"
                checked={trabajadoresSeleccionados.includes(String(t.trabajadorId))}
                onChange={(e) => setTrabajadoresSeleccionados((prev) => e.target.checked
                  ? [...prev, String(t.trabajadorId)]
                  : prev.filter((id) => id !== String(t.trabajadorId)))}
                className="accent-primary"
              />
              {t.nombre}
            </label>
          ))}
        </div>

        {cargando ? (
          <p className="text-center py-10 text-muted-foreground">Cargando...</p>
        ) : (
          <div className={`flex flex-wrap gap-4 items-start justify-center print:gap-2 nomina-report-print${printOrientation === "landscape" ? " nomina-report-print--landscape" : ""}`}>
            <div className={`border-2 border-cyan-500 rounded-lg overflow-hidden text-xs nomina-tensionadas${tensionadasPageBreak ? " nomina-tensionadas--page-break" : ""} ${imprimirTensionadas ? "" : "print-omit"}`} style={{ minWidth: 180 }}>
              <div className="bg-cyan-400 text-black font-bold text-center py-1">
                TENSIONADAS MES {NOMBRES_MES[parseInt(mes.split("-")[1])].toUpperCase()} {mes.split("-")[0]}
              </div>
              <table className="w-full bg-cyan-50 nomina-tensionadas-table">
                <thead>
                  <tr className="bg-cyan-200 text-black">
                    <th className="px-2 py-1 text-left">FECHA</th>
                    <th className="px-2 py-1 text-right">TOTAL TENSIONADA</th>
                    <th className="px-2 py-1 text-center no-print">ACCIONES</th>
                  </tr>
                </thead>
                <tbody className="text-black">
                  {vista.tensionadas.map((tn: any) => {
                    const key = `tensionada-${tn.id}`;
                    const editandoEsta = editando === key && !mostrarEjemplo;
                    return (
                    <tr key={tn.id} className="border-t border-cyan-200">
                      <td className="px-2 py-1">
                        {editandoEsta ? <input type="date" value={borrador[`${key}:fecha`] || tn.fecha} onChange={(e) => setBorrador((p) => ({ ...p, [`${key}:fecha`]: e.target.value }))} /> : fmtFecha(tn.fecha)}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {editandoEsta ? <input className="w-24 text-right" type="number" value={borrador[`${key}:valor`] || tn.valor} onChange={(e) => setBorrador((p) => ({ ...p, [`${key}:valor`]: e.target.value }))} /> : formatCurrency(tn.valor)}
                      </td>
                      <td className="px-2 py-1 text-center no-print whitespace-nowrap">
                        {!mostrarEjemplo && (
                          editandoEsta ? (
                            <>
                              <button title="Guardar" className="ml-1 text-green-700 hover:text-green-900" onClick={() => guardarTensionada(tn.id, key)}><Check className="inline w-3.5 h-3.5" /></button>
                              <button title="Cancelar" className="ml-1 text-slate-600 hover:text-slate-900" onClick={() => setEditando(null)}><X className="inline w-3.5 h-3.5" /></button>
                            </>
                          ) : (
                            <>
                              <button title="Editar" className="ml-1 text-slate-700 hover:text-slate-950" onClick={() => iniciarEdicion(key, { fecha: tn.fecha, valor: tn.valor })}><Pencil className="inline w-3.5 h-3.5" /></button>
                              <button title="Eliminar" className="ml-2 text-red-600 hover:text-red-800" onClick={() => eliminarTensionada(tn.id)}><Trash2 className="inline w-3.5 h-3.5" /></button>
                            </>
                          )
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  <tr className="border-t-2 border-cyan-400 font-bold bg-cyan-100">
                    <td className="px-2 py-1">TOTAL</td>
                    <td className="px-2 py-1 text-right">{formatCurrency(vista.totalTensionadas)}</td>
                    <td className="no-print"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="nomina-trabajadores-print">
            {paginasDeTrabajadores.map((pagina, indicePagina) => (
              <div key={indicePagina} className="nomina-print-page">
              {pagina.map((t: any) => {
              const anchos = anchosColumnasNomina(t.aplicaDescuento30, t.aplicaSeguro);
              return (
              <div key={t.trabajadorId} data-trabajador-id={String(t.trabajadorId)} className={`nomina-trabajador ${trabajadoresSeleccionados.includes(String(t.trabajadorId)) ? "" : "print-omit"}`}>
                {/* Tabla amarilla del trabajador */}
                <div className="border-2 border-amber-500 rounded-lg overflow-hidden text-xs" style={{ minWidth: 280 }}>
                  <div className="bg-amber-400 text-black font-bold text-center py-1">
                    MES {NOMBRES_MES[parseInt(mes.split("-")[1])].toUpperCase()} {mes.split("-")[0]} {t.nombre.toUpperCase()}
                  </div>
                  <table className="w-full bg-amber-50 nomina-table">
                    <colgroup>
                      {anchos.map((ancho: string, indice: number) => <col key={indice} style={{ width: ancho }} />)}
                    </colgroup>
                    <thead>
                      <tr className="bg-amber-200 text-black">
                        <th className="px-2 py-1 text-left">FECHA</th>
                        <th className="px-2 py-1 text-right">TOTAL MANO DE OBRA</th>
                        {t.aplicaDescuento30 && <th className="px-2 py-1 text-right">%</th>}
                        {t.aplicaDescuento30 && <th className="px-2 py-1 text-right">TOTAL %</th>}
                        {t.aplicaSeguro && <th className="px-2 py-1 text-right">SEGURO</th>}
                        <th className="px-2 py-1 text-right">TOTAL MANO OBRA</th>
                      </tr>
                    </thead>
                    <tbody className="text-black">
                      {t.dias.map((d: any) => {
                        const key = `${t.trabajadorId}-${d.fecha}`;
                        const editandoEsta = editando === key && !mostrarEjemplo;
                        return <tr key={d.fecha} className="border-t border-amber-200">
                          <td className="px-2 py-1">
                            {editandoEsta ? <input type="date" value={borrador.fecha || d.fecha} onChange={(e) => setBorrador((p) => ({ ...p, fecha: e.target.value }))} /> : fmtFecha(d.fecha)}
                          </td>
                          {d.sinRegistro || d.noVino ? (
                            <td colSpan={2 + (t.aplicaDescuento30 ? 2 : 0) + (t.aplicaSeguro ? 1 : 0)} className={`px-2 py-1 italic ${d.noVino ? "text-red-600" : "text-muted-foreground"}`}>
                              {d.noVino ? "No vino" : "No se trabajó"}
                            </td>
                          ) : (
                            <>
                              <td className="px-2 py-1 text-right">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.valor} onChange={(e) => setBorrador((p) => ({ ...p, valor: e.target.value }))} /> : formatCurrency(d.valor)}</td>
                              {t.aplicaDescuento30 && <><td className="px-2 py-1 text-right">30%</td><td className="px-2 py-1 text-right">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.descuentoOtros} onChange={(e) => setBorrador((p) => ({ ...p, descuentoOtros: e.target.value }))} /> : formatCurrency(d.descuentoOtros)}</td></>}
                              {t.aplicaSeguro && <td className="px-2 py-1 text-right">{editandoEsta ? <input className="w-20 text-right" type="number" value={borrador.seguro} onChange={(e) => setBorrador((p) => ({ ...p, seguro: e.target.value }))} /> : formatCurrency(d.seguro)}</td>}
                              <td className="px-2 py-1 text-right font-bold">{editandoEsta ? <input className="w-20 text-right" type="number" min="0" value={borrador.total} onChange={(e) => setBorrador((p) => ({ ...p, total: e.target.value }))} /> : formatCurrency(Math.max(0, Number(d.total) || 0))}
                                {!mostrarEjemplo && d.cierreId && <button className="no-print ml-1" onClick={() => editandoEsta ? guardarDia(d.fecha, t.trabajadorId, key) : iniciarEdicion(key, d)}>{editandoEsta ? <Check className="inline w-3 h-3" /> : <Pencil className="inline w-3 h-3" />}</button>}
                                {editandoEsta && <button className="no-print ml-1" onClick={() => setEditando(null)}><X className="inline w-3 h-3" /></button>}
                              </td>
                            </>
                          )}
                        </tr>
                      })}
                    </tbody>
                    <tfoot>
                      {(() => {
                        const diasConRegistro = t.dias.filter((d: any) => !d.sinRegistro && !d.noVino);
                        const totalValor = diasConRegistro.reduce((suma: number, d: any) => suma + (Number(d.valor) || 0), 0);
                        const totalDescuento = diasConRegistro.reduce((suma: number, d: any) => suma + (Number(d.descuentoOtros) || 0), 0);
                        const totalSeguro = diasConRegistro.reduce((suma: number, d: any) => suma + (Number(d.seguro) || 0), 0);
                        const totalFinal = diasConRegistro.reduce((suma: number, d: any) => suma + Math.max(0, Number(d.total) || 0), 0);
                        return (
                          <tr className="nomina-total-row border-t-2 border-amber-500 bg-amber-300 font-bold text-black">
                            <td className="px-2 py-1">TOTAL</td>
                            <td className="px-2 py-1 text-right">{formatCurrency(totalValor)}</td>
                            {t.aplicaDescuento30 && <><td className="px-2 py-1"></td><td className="px-2 py-1 text-right">{formatCurrency(totalDescuento)}</td></>}
                            {t.aplicaSeguro && <td className="px-2 py-1 text-right">{formatCurrency(totalSeguro)}</td>}
                            <td className="px-2 py-1 text-right">{formatCurrency(totalFinal)}</td>
                          </tr>
                        );
                      })()}
                    </tfoot>
                  </table>
                </div>

              </div>
              );
              })}
              </div>
            ))}
            </div>
          </div>
        )}
        <div ref={printMeasureRef} className="nomina-print-measure" aria-hidden="true" />
      </div>
    </Layout>
  );
}