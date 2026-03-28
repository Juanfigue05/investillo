import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useGetCreditos, useCrearCredito, useActualizarCredito, useCrearVenta } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Plus, Search, DollarSign } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Creditos() {
  const { data: creditos, isLoading } = useGetCreditos();
  const queryClient = useQueryClient();
  
  const [showPay, setShowPay] = useState<number | null>(null);
  const [abono, setAbono] = useState("");
  const [productoAbono, setProductoAbono] = useState("");

  const actualizarMutation = useActualizarCredito();
  const crearVentaMutation = useCrearVenta();

  const handleAbono = (credito: any) => {
    const abonoNum = parseFloat(abono);
    if (!abonoNum || abonoNum <= 0 || abonoNum > credito.valorRestante) {
      alert("Valor de abono inválido");
      return;
    }

    const nuevoAbonado = credito.valorAbonado + abonoNum;

    actualizarMutation.mutate({
      id: credito.id,
      data: { valorAbonado: nuevoAbonado }
    }, {
      onSuccess: () => {
        // Create Venta Diaria entry for the payment
        crearVentaMutation.mutate({
          data: {
            fecha: new Date().toISOString().split('T')[0],
            referencia: credito.nombreCliente,
            tipoLinea: "credito",
            productoNombre: productoAbono || "Abono Factura",
            cantidad: 1,
            precioCompraUnidad: 0,
            precioVentaUnidad: abonoNum,
            precioVentaTotal: abonoNum,
            beneficio: abonoNum,
            descripcion: `Abono de ${credito.nombreCliente} (Ref: ${credito.fechaFactura})`
          }
        }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
            setShowPay(null);
            setAbono("");
            setProductoAbono("");
          }
        });
      }
    });
  };

  const totalNosDeben = creditos?.reduce((acc, c) => acc + c.valorRestante, 0) || 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Créditos de Clientes</h1>
            <p className="text-muted-foreground mt-1">Lleva el control de facturas o cuentas pendientes.</p>
          </div>
          <button className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
            <Plus className="w-5 h-5" />
            Nuevo Crédito
          </button>
        </div>

        {/* Dashboard-style sum */}
        <div className="bg-gradient-to-r from-card to-muted border border-border p-6 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-muted-foreground font-medium mb-1 uppercase tracking-wider text-sm">Total que nos deben</p>
            <h2 className="text-4xl font-display font-bold text-destructive">{formatCurrency(totalNosDeben)}</h2>
          </div>
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <DollarSign className="w-8 h-8 text-destructive" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-8 text-muted-foreground">Cargando créditos...</div>
          ) : (
            creditos?.filter(c => c.valorRestante > 0).map(credito => (
              <div key={credito.id} className="bg-card border border-border rounded-2xl p-6 shadow-md hover:shadow-xl transition-all flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{credito.nombreCliente}</h3>
                    <p className="text-sm text-muted-foreground">Factura: {new Date(credito.fechaFactura).toLocaleDateString()}</p>
                  </div>
                  <span className="bg-destructive/10 text-destructive text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Pendiente
                  </span>
                </div>

                <div className="space-y-2 mb-6 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Placa:</span>
                    <span className="font-medium text-foreground">{credito.placaVehiculo || '-'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Valor Inicial:</span>
                    <span className="font-medium text-foreground">{formatCurrency(credito.valorCredito)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Abonado:</span>
                    <span className="font-medium text-green-500">{formatCurrency(credito.valorAbonado)}</span>
                  </div>
                  <div className="flex justify-between text-base mt-2 pt-2 border-t border-border">
                    <span className="text-foreground font-bold">Resta:</span>
                    <span className="font-bold text-destructive">{formatCurrency(credito.valorRestante)}</span>
                  </div>
                </div>

                {showPay === credito.id ? (
                  <div className="bg-background rounded-xl p-4 border border-border animate-in fade-in slide-in-from-bottom-2">
                    <h4 className="text-sm font-medium mb-3 text-foreground">Registrar Abono</h4>
                    <div className="space-y-3">
                      <input 
                        type="number" 
                        placeholder="Monto a abonar ($)" 
                        value={abono}
                        onChange={e => setAbono(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <input 
                        type="text" 
                        placeholder="Producto al que abona (opcional)" 
                        value={productoAbono}
                        onChange={e => setProductoAbono(e.target.value)}
                        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setShowPay(null)} className="flex-1 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors">Cancelar</button>
                        <button onClick={() => handleAbono(credito)} disabled={actualizarMutation.isPending} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">Confirmar</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowPay(credito.id)}
                    className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors border border-border"
                  >
                    Abonar / Pagar
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
