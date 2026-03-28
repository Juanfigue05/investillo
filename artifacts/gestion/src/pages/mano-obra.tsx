import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useGetManoObra, useCrearManoObra, useGetTrabajadores, useCrearVenta } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Wrench, Plus, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function ManoObra() {
  const { data: manoObras, isLoading } = useGetManoObra();
  const { data: trabajadores } = useGetTrabajadores();
  
  const queryClient = useQueryClient();
  const crearMutation = useCrearManoObra();
  const crearVentaMutation = useCrearVenta();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    descripcion: "",
    valorTotal: "",
    trabajadoresIds: [] as number[],
  });

  const toggleTrabajador = (id: number) => {
    setFormData(prev => ({
      ...prev,
      trabajadoresIds: prev.trabajadoresIds.includes(id) 
        ? prev.trabajadoresIds.filter(t => t !== id)
        : [...prev.trabajadoresIds, id]
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const valor = parseFloat(formData.valorTotal);
    if (!valor || formData.trabajadoresIds.length === 0) {
      alert("Llene la descripción, el valor y seleccione al menos un trabajador.");
      return;
    }

    const valorPorTrabajador = Math.floor(valor / formData.trabajadoresIds.length);
    
    const distribuciones = formData.trabajadoresIds.map((id, index) => {
      // Logic for level out if remainder
      const isLast = index === formData.trabajadoresIds.length - 1;
      const remainder = valor - (valorPorTrabajador * formData.trabajadoresIds.length);
      const val = isLast ? valorPorTrabajador + remainder : valorPorTrabajador;
      
      return {
        trabajadorId: id,
        valor: val,
        descuentoSeguro: 0, // Simplified for now, backend could handle real logic
        descuentoOtros: 0
      };
    });

    crearMutation.mutate({
      data: {
        fecha: new Date().toISOString().split('T')[0],
        descripcion: formData.descripcion,
        valorTotal: valor,
        distribuciones
      }
    }, {
      onSuccess: () => {
        // Automatically add to ventas diarias as requested
        crearVentaMutation.mutate({
          data: {
            fecha: new Date().toISOString().split('T')[0],
            referencia: "Servicio",
            tipoLinea: "manoobra",
            productoNombre: `Mano de Obra: ${formData.descripcion}`,
            cantidad: 1,
            precioCompraUnidad: 0,
            precioVentaUnidad: valor,
            precioVentaTotal: valor,
            beneficio: valor,
            descripcion: "Pago de mano de obra distribuida"
          }
        }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/manoobra"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
            setShowForm(false);
            setFormData({ descripcion: "", valorTotal: "", trabajadoresIds: [] });
          }
        });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Control Mano de Obra</h1>
            <p className="text-muted-foreground mt-1">Registra y distribuye los cobros de servicios entre mecánicos.</p>
          </div>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            Registrar Servicio
          </button>
        </div>

        {showForm && (
          <div className="bg-card border border-border p-6 rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 mb-8">
            <h3 className="text-xl font-display font-bold text-foreground mb-4">Nuevo Registro de Mano de Obra</h3>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Descripción del Servicio</label>
                  <input required type="text" value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} placeholder="Ej: Cambio de pastillas" className="w-full bg-background border border-border px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Valor Cobrado Total ($)</label>
                  <input required type="number" value={formData.valorTotal} onChange={e => setFormData({...formData, valorTotal: e.target.value})} placeholder="50000" className="w-full bg-background border border-border px-4 py-3 rounded-xl focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-3">Trabajadores involucrados (se divide automático)</label>
                <div className="flex flex-wrap gap-3">
                  {trabajadores?.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTrabajador(t.id)}
                      className={`px-4 py-2 rounded-xl border transition-all ${
                        formData.trabajadoresIds.includes(t.id)
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-background border-border text-muted-foreground hover:border-muted-foreground"
                      }`}
                    >
                      {t.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <button type="submit" disabled={crearMutation.isPending || crearVentaMutation.isPending} className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all">
                  <Save className="w-5 h-5" />
                  Guardar y Enviar a Ventas
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-muted text-muted-foreground text-sm border-b border-border">
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Servicio</th>
                <th className="px-6 py-4 font-medium">Valor Total</th>
                <th className="px-6 py-4 font-medium">Distribución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Cargando registros...</td></tr>
              ) : (
                manoObras?.map(mo => (
                  <tr key={mo.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{new Date(mo.fecha).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium text-foreground">{mo.descripcion}</td>
                    <td className="px-6 py-4 text-primary font-bold">{formatCurrency(mo.valorTotal)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {mo.distribuciones.map(d => (
                          <span key={d.id} className="bg-background border border-border px-2 py-1 rounded-md text-xs text-muted-foreground flex items-center gap-1">
                            <span className="font-medium text-foreground">{d.trabajadorNombre}</span>
                            {formatCurrency(d.valor)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
