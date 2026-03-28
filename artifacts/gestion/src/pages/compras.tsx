import { Layout } from "@/components/Layout";
import { useGetCompras, useActualizarCompra } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { PackageCheck, Truck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Compras() {
  const { data: compras, isLoading } = useGetCompras();
  const queryClient = useQueryClient();
  const actualizarMutation = useActualizarCompra();

  const handleLlegada = (compra: any) => {
    const cantidad = prompt(`¿Cuántas unidades de ${compra.productoNombre} llegaron?`);
    if (!cantidad) return;
    
    actualizarMutation.mutate({
      id: compra.id,
      data: {
        estado: "llegado",
        cantidadRecibida: parseFloat(cantidad)
      }
    }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/compras"] })
    });
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Módulo de Compras</h1>
            <p className="text-muted-foreground mt-1">Productos con stock bajo agregados automáticamente a la lista de pedidos.</p>
          </div>
        </div>

        <div className="grid gap-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando lista de compras...</div>
          ) : compras?.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-2xl border border-border">
              <PackageCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground">No hay compras pendientes</h3>
              <p className="text-muted-foreground">El inventario está estable.</p>
            </div>
          ) : (
            compras?.map(compra => (
              <div 
                key={compra.id} 
                className={`bg-card rounded-xl border p-5 flex flex-col md:flex-row justify-between items-center gap-6 shadow-md transition-all ${
                  compra.estado === 'pendiente' ? 'border-destructive/50' : 'border-green-500/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${compra.estado === 'pendiente' ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
                    <Truck className={`w-6 h-6 ${compra.estado === 'pendiente' ? 'text-destructive' : 'text-green-500'}`} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{compra.productoNombre}</h3>
                    <p className="text-sm text-muted-foreground">Cód: {compra.productoCodigo} | Min: {compra.stockMinimo}</p>
                  </div>
                </div>
                
                <div className="text-center px-6">
                  <p className="text-sm text-muted-foreground">Stock Actual</p>
                  <p className={`text-2xl font-bold ${compra.stockActual <= 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {compra.stockActual}
                  </p>
                </div>

                <div>
                  {compra.estado === 'pendiente' ? (
                    <button 
                      onClick={() => handleLlegada(compra)}
                      disabled={actualizarMutation.isPending}
                      className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-md active:scale-95 whitespace-nowrap"
                    >
                      Ingresar Inventario
                    </button>
                  ) : (
                    <span className="px-6 py-3 bg-green-500/10 text-green-500 rounded-xl font-medium flex items-center gap-2 border border-green-500/20">
                      <PackageCheck className="w-5 h-5" />
                      Llegado
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
