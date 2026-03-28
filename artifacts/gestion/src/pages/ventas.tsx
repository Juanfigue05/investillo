import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useGetVentas, useCrearVenta, useGetInventario, useEliminarVenta } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Printer, Save, Trash2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function VentasDiarias() {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const { data: ventas, isLoading } = useGetVentas({ fecha });
  const { data: productos } = useGetInventario();
  
  const queryClient = useQueryClient();
  const crearMutation = useCrearVenta();
  const eliminarMutation = useEliminarVenta();

  // New row state
  const [newRow, setNewRow] = useState({
    referencia: "",
    tipoLinea: "venta" as const,
    productoId: "",
    productoNombre: "",
    marca: "",
    cantidad: "", // string to allow "1,5"
    precioCompra: 0,
    precioVenta: 0,
  });

  const handleProductSelect = (idStr: string) => {
    if (!idStr) return;
    const prod = productos?.find(p => p.id.toString() === idStr);
    if (prod) {
      setNewRow(prev => ({
        ...prev,
        productoId: idStr,
        productoNombre: prod.nombre,
        marca: prod.marca || "",
        precioCompra: prod.precioCompra,
        precioVenta: prod.precioVentaConIva,
      }));
    }
  };

  const handleAddRow = () => {
    if (!newRow.referencia || !newRow.productoNombre || !newRow.cantidad) {
      alert("Por favor llena los campos requeridos (Referencia, Producto, Cantidad)");
      return;
    }

    const cantidadNum = parseFloat(newRow.cantidad.replace(',', '.'));
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      alert("Cantidad inválida");
      return;
    }

    const beneficio = (newRow.precioVenta - newRow.precioCompra) * cantidadNum;
    const precioTotal = newRow.precioVenta * cantidadNum;

    crearMutation.mutate({
      data: {
        fecha,
        referencia: newRow.referencia,
        tipoLinea: newRow.tipoLinea,
        productoId: newRow.productoId ? parseInt(newRow.productoId) : null,
        productoNombre: newRow.productoNombre,
        productoMarca: newRow.marca,
        cantidad: cantidadNum,
        precioCompraUnidad: newRow.precioCompra,
        precioVentaUnidad: newRow.precioVenta,
        precioVentaTotal: precioTotal,
        beneficio: beneficio,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
        // Reset only values, keep referencia usually same for batch
        setNewRow(prev => ({ ...prev, productoId: "", productoNombre: "", marca: "", cantidad: "", precioCompra: 0, precioVenta: 0 }));
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Eliminar esta fila?")) {
      eliminarMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ventas"] })
      });
    }
  };

  const totalVentas = ventas?.filter(v => v.tipoLinea === "venta").reduce((acc, v) => acc + v.precioVentaTotal, 0) || 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Ventas Diarias</h1>
            <p className="text-muted-foreground mt-1">Registra y edita ventas de mostrador rápidamente.</p>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="date" 
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-card border border-border text-foreground px-4 py-2 rounded-xl focus:ring-2 focus:ring-primary outline-none"
            />
            <button className="flex items-center gap-2 px-6 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all border border-border">
              <Printer className="w-5 h-5" />
              Imprimir Día
            </button>
          </div>
        </div>

        {/* The Direct Edit Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl shadow-black/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-muted text-muted-foreground text-sm border-b border-border">
                  <th className="px-4 py-3 font-medium">No. Remisión / Ref</th>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Marca</th>
                  <th className="px-4 py-3 font-medium">Cantidad</th>
                  <th className="px-4 py-3 font-medium">P. Compra (Unid)</th>
                  <th className="px-4 py-3 font-medium">P. Venta (Unid)</th>
                  <th className="px-4 py-3 font-medium text-primary">P. Venta Total</th>
                  <th className="px-4 py-3 font-medium text-green-500">Beneficio</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                
                {/* New Row Input */}
                <tr className="bg-background/50">
                  <td className="p-2">
                    <input type="text" placeholder="R 1234 24-ENE" value={newRow.referencia} onChange={e => setNewRow({...newRow, referencia: e.target.value})} className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </td>
                  <td className="p-2 min-w-[200px]">
                    <div className="flex flex-col gap-1">
                      <select value={newRow.productoId} onChange={e => handleProductSelect(e.target.value)} className="w-full bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none">
                        <option value="">Seleccionar inventario...</option>
                        {productos?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                      <input type="text" placeholder="O escribe nombre manual..." value={newRow.productoNombre} onChange={e => setNewRow({...newRow, productoNombre: e.target.value, productoId: ""})} className="w-full bg-background border border-border px-3 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                    </div>
                  </td>
                  <td className="p-2">
                    <input type="text" value={newRow.marca} onChange={e => setNewRow({...newRow, marca: e.target.value})} className="w-24 bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </td>
                  <td className="p-2">
                    <input type="text" placeholder="Ej: 1,5" value={newRow.cantidad} onChange={e => setNewRow({...newRow, cantidad: e.target.value})} className="w-20 bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </td>
                  <td className="p-2">
                    <input type="number" value={newRow.precioCompra} onChange={e => setNewRow({...newRow, precioCompra: parseFloat(e.target.value) || 0})} className="w-28 bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </td>
                  <td className="p-2">
                    <input type="number" value={newRow.precioVenta} onChange={e => setNewRow({...newRow, precioVenta: parseFloat(e.target.value) || 0})} className="w-28 bg-background border border-border px-3 py-2 rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none" />
                  </td>
                  <td className="p-2 text-muted-foreground text-sm">
                    {formatCurrency(newRow.precioVenta * (parseFloat(newRow.cantidad.replace(',', '.')) || 0))}
                  </td>
                  <td className="p-2 text-muted-foreground text-sm">
                    {formatCurrency((newRow.precioVenta - newRow.precioCompra) * (parseFloat(newRow.cantidad.replace(',', '.')) || 0))}
                  </td>
                  <td className="p-2">
                    <button onClick={handleAddRow} disabled={crearMutation.isPending} className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-md">
                      <Save className="w-4 h-4" />
                    </button>
                  </td>
                </tr>

                {/* Data Rows */}
                {isLoading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Cargando ventas...</td></tr>
                ) : (
                  ventas?.map((venta) => {
                    const rowClass = venta.tipoLinea === 'manoobra' ? 'row-manoobra' : venta.tipoLinea === 'credito' ? 'row-credito' : 'row-venta';
                    
                    return (
                      <tr key={venta.id} className={`${rowClass} group hover:bg-muted/30 transition-colors`}>
                        <td className="px-4 py-3 font-mono text-sm">{venta.referencia}</td>
                        <td className="px-4 py-3 font-medium">{venta.productoNombre}</td>
                        <td className="px-4 py-3 text-muted-foreground">{venta.productoMarca || '-'}</td>
                        <td className="px-4 py-3">{venta.cantidad}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(venta.precioCompraUnidad)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(venta.precioVentaUnidad)}</td>
                        <td className="px-4 py-3 font-bold text-primary">{formatCurrency(venta.precioVentaTotal)}</td>
                        <td className="px-4 py-3 font-medium text-green-500">{formatCurrency(venta.beneficio)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDelete(venta.id)} className="p-1.5 text-muted-foreground hover:text-destructive bg-background rounded-lg opacity-0 group-hover:opacity-100 transition-opacity border border-border">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-card border-t border-border">
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-right font-medium text-muted-foreground uppercase text-xs tracking-wider">Total Ventas Diarias (Excluye MO y Abonos)</td>
                  <td className="px-4 py-4 font-display font-bold text-2xl text-primary">{formatCurrency(totalVentas)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex gap-4 text-xs font-medium uppercase tracking-wider text-muted-foreground p-4 bg-card rounded-xl border border-border">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-background border border-border"></div> Venta Normal</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/30"></div> Mano de Obra</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500/30"></div> Crédito/Abono</div>
        </div>
      </div>
    </Layout>
  );
}
