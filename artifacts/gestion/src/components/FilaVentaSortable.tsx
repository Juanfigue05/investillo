import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const FORMAS_PAGO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  cuenta_ernesto: "Cta. Ernesto",
  cuenta_olga: "Cta. Olga",
  cuenta_juan: "Cta. Juan",
};

interface Props {
  venta: any;
  isEditing: boolean;
  editValues: any;
  setEditValues: Dispatch<SetStateAction<any>>;
  onSaveEdit: (venta: any) => void;
  onCancelEdit: () => void;
  onOpenEdit: (venta: any) => void;
  onDelete: (id: number) => void;
  guardando: boolean;
}

export function FilaVentaSortable({
  venta,
  isEditing,
  editValues,
  setEditValues,
  onSaveEdit,
  onCancelEdit,
  onOpenEdit,
  onDelete,
  guardando,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: venta.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
  };

  const rowCls = venta.tipoLinea === "manoobra" ? "row-manoobra" : venta.tipoLinea === "credito" ? "row-credito" : "row-venta";

  const dragHandle = (
    <td className="p-2 no-print w-10 cursor-grab active:cursor-grabbing touch-none" {...attributes} {...listeners}>
      <GripVertical className="w-4 h-4 text-muted-foreground mx-auto" />
    </td>
  );

  if (isEditing) {
    const editPvU = parseFloat(editValues.precioVentaUnidad) || 0;
    const editPcU = parseFloat(editValues.precioCompraUnidad) || 0;
    const editCant = parseFloat(editValues.cantidad) || 0;
    const editTotal = editPvU * editCant;
    const editBen = venta.tipoLinea === "venta" ? (editPvU - editPcU) * editCant : 0;

    return (
      <tr ref={setNodeRef} style={style} className={`${rowCls} ring-2 ring-inset ring-primary/40`}>
        {dragHandle}
        <td className="p-2"><input value={editValues.referencia} onChange={(e) => setEditValues((v: any) => ({ ...v, referencia: e.target.value }))} className="w-full bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
        <td className="p-2"><input value={editValues.productoNombre} onChange={(e) => setEditValues((v: any) => ({ ...v, productoNombre: e.target.value }))} className="w-full bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
        <td className="p-2"><input value={editValues.productoMarca} onChange={(e) => setEditValues((v: any) => ({ ...v, productoMarca: e.target.value }))} className="w-20 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
        <td className="p-2"><input type="number" min="0" step="0.25" value={editValues.cantidad} onChange={(e) => setEditValues((v: any) => ({ ...v, cantidad: e.target.value }))} className="w-20 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
        <td className="p-2"><input type="number" value={editValues.precioCompraUnidad} onChange={(e) => setEditValues((v: any) => ({ ...v, precioCompraUnidad: e.target.value }))} className="w-24 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
        <td className="p-2"><input type="number" value={editValues.precioVentaUnidad} onChange={(e) => setEditValues((v: any) => ({ ...v, precioVentaUnidad: e.target.value }))} className="w-24 bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-primary" /></td>
        <td className="p-2 font-bold text-primary whitespace-nowrap">{formatCurrency(editTotal)}</td>
        <td className="p-2 font-medium text-green-500 whitespace-nowrap">{venta.tipoLinea === "venta" ? formatCurrency(editBen) : "—"}</td>
        <td className="p-2 no-print">
          <select value={editValues.formaPago || venta.formaPago || "efectivo"} onChange={(e) => setEditValues((v: any) => ({ ...v, formaPago: e.target.value }))}
            className="w-full bg-background border border-primary/50 px-2 py-1.5 rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary">
            <option value="efectivo">Efectivo</option>
            <option value="cuenta_ernesto">Cta. Ernesto</option>
            <option value="cuenta_olga">Cta. Olga</option>
            <option value="cuenta_juan">Cta. Juan</option>
          </select>
        </td>
        <td className="p-2 no-print">
          <div className="flex gap-1">
            <button onClick={() => onSaveEdit(venta)} disabled={guardando} className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors border border-primary/30"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={onCancelEdit} className="p-1.5 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors border border-border"><X className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr ref={setNodeRef} style={style} className={`${rowCls} group hover:brightness-110 transition-all`}>
      {dragHandle}
      <td className="px-3 py-3 font-mono text-xs">{venta.referencia}</td>
      <td className="px-3 py-3 font-medium">{venta.productoNombre}</td>
      <td className="px-3 py-3 text-muted-foreground text-xs">{venta.productoMarca || "—"}</td>
      <td className="px-3 py-3">{String(venta.cantidad).replace(".", ",")}</td>
      <td className="px-3 py-3 text-muted-foreground">{formatCurrency(venta.precioCompraUnidad)}</td>
      <td className="px-3 py-3 text-muted-foreground">{formatCurrency(venta.precioVentaUnidad)}</td>
      <td className="px-3 py-3 font-bold text-primary">{formatCurrency(venta.precioVentaTotal)}</td>
      <td className="px-3 py-3 font-medium text-green-500">{venta.tipoLinea === "venta" ? formatCurrency(venta.beneficio) : "—"}</td>
      <td className="px-3 py-3 no-print text-xs text-muted-foreground">{FORMAS_PAGO_LABEL[venta.formaPago || "efectivo"]}</td>
      <td className="px-3 py-3 no-print">
        {venta._pendiente ? (
          <span className="text-[10px] text-amber-400 font-medium whitespace-nowrap" title="Guardado local, esperando sincronizar">⏳ Pendiente</span>
        ) : (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button onClick={() => onOpenEdit(venta)} className="p-1.5 text-muted-foreground hover:text-primary bg-background/50 rounded-lg transition-all border border-border">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(venta.id)} className="p-1.5 text-muted-foreground hover:text-destructive bg-background/50 rounded-lg transition-all border border-border">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
