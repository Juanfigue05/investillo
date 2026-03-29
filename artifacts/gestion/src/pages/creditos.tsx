import { useState } from "react";
import { Layout } from "@/components/Layout";
import {
  useGetCreditos,
  useCrearCredito,
  useActualizarCredito,
  useEliminarCredito,
  useCrearVenta,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Plus, DollarSign, Trash2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const emptyCredito = {
  fechaFactura: new Date().toISOString().split("T")[0],
  placaVehiculo: "",
  nombreCliente: "",
  telefonoCliente: "",
  descripcion: "",
  valorCredito: "",
  valorAbonado: "0",
};

export default function Creditos() {
  const { data: creditos, isLoading } = useGetCreditos();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyCredito });
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const [showPay, setShowPay] = useState<number | null>(null);
  const [abono, setAbono] = useState("");
  const [productoAbono, setProductoAbono] = useState("");

  const crearMutation = useCrearCredito();
  const actualizarMutation = useActualizarCredito();
  const eliminarMutation = useEliminarCredito();
  const crearVentaMutation = useCrearVenta();

  const handleCrear = () => {
    const errors: string[] = [];
    if (!form.nombreCliente.trim()) errors.push("El nombre del cliente es obligatorio");
    if (!form.valorCredito || parseFloat(form.valorCredito) <= 0)
      errors.push("El valor del crédito debe ser mayor a 0");
    if (!form.fechaFactura) errors.push("La fecha es obligatoria");
    if (errors.length) {
      setFormErrors(errors);
      return;
    }
    setFormErrors([]);
    crearMutation.mutate(
      {
        data: {
          fechaFactura: form.fechaFactura,
          placaVehiculo: form.placaVehiculo || undefined,
          nombreCliente: form.nombreCliente,
          telefonoCliente: form.telefonoCliente || undefined,
          descripcion: form.descripcion || undefined,
          valorCredito: parseFloat(form.valorCredito),
          valorAbonado: parseFloat(form.valorAbonado) || 0,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
          setShowForm(false);
          setForm({ ...emptyCredito });
        },
      }
    );
  };

  const handleAbono = (credito: any) => {
    const abonoNum = parseFloat(abono);
    if (!abonoNum || abonoNum <= 0) {
      alert("Valor de abono inválido");
      return;
    }
    if (abonoNum > credito.valorRestante) {
      alert(`El abono no puede superar el saldo restante de ${formatCurrency(credito.valorRestante)}`);
      return;
    }

    const nuevoAbonado = credito.valorAbonado + abonoNum;

    actualizarMutation.mutate(
      { id: credito.id, data: { valorAbonado: nuevoAbonado } },
      {
        onSuccess: () => {
          crearVentaMutation.mutate(
            {
              data: {
                fecha: new Date().toISOString().split("T")[0],
                referencia: credito.placaVehiculo
                  ? `${credito.nombreCliente} / ${credito.placaVehiculo}`
                  : credito.nombreCliente,
                tipoLinea: "credito",
                productoNombre: productoAbono || "Abono factura",
                cantidad: 1,
                precioCompraUnidad: 0,
                precioVentaUnidad: abonoNum,
                precioVentaTotal: abonoNum,
                beneficio: 0,
                descripcion: `Abono de ${credito.nombreCliente}`,
              },
            },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: ["/api/creditos"] });
                queryClient.invalidateQueries({ queryKey: ["/api/ventas"] });
                setShowPay(null);
                setAbono("");
                setProductoAbono("");
              },
            }
          );
        },
      }
    );
  };

  const handleEliminar = (id: number) => {
    if (confirm("¿Eliminar este crédito permanentemente?")) {
      eliminarMutation.mutate(
        { id },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/creditos"] }) }
      );
    }
  };

  const totalNosDeben = creditos?.reduce((acc, c) => acc + Math.max(0, c.valorRestante), 0) || 0;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Créditos de Clientes</h1>
            <p className="text-muted-foreground mt-1">Lleva el control de facturas o cuentas pendientes.</p>
          </div>
          <button
            onClick={() => {
              setShowForm(true);
              setForm({ ...emptyCredito });
              setFormErrors([]);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            Nuevo Crédito
          </button>
        </div>

        {/* Total */}
        <div className="bg-gradient-to-r from-card to-muted border border-border p-6 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <p className="text-muted-foreground font-medium mb-1 uppercase tracking-wider text-sm">
              Total que nos deben
            </p>
            <h2 className="text-4xl font-display font-bold text-destructive">{formatCurrency(totalNosDeben)}</h2>
          </div>
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <DollarSign className="w-8 h-8 text-destructive" />
          </div>
        </div>

        {/* New Credit Form */}
        {showForm && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-foreground">Registrar Nuevo Crédito</h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive">
                {formErrors.map((e, i) => (
                  <p key={i}>• {e}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Fecha Factura <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={form.fechaFactura}
                  onChange={(e) => setForm({ ...form, fechaFactura: e.target.value })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Nombre Cliente <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nombre completo"
                  value={form.nombreCliente}
                  onChange={(e) => setForm({ ...form, nombreCliente: e.target.value })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Placa Vehículo</label>
                <input
                  type="text"
                  placeholder="ABC-123"
                  value={form.placaVehiculo}
                  onChange={(e) => setForm({ ...form, placaVehiculo: e.target.value.toUpperCase() })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Teléfono</label>
                <input
                  type="text"
                  placeholder="300 000 0000"
                  value={form.telefonoCliente}
                  onChange={(e) => setForm({ ...form, telefonoCliente: e.target.value })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Valor Crédito <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  placeholder="200000"
                  value={form.valorCredito}
                  onChange={(e) => setForm({ ...form, valorCredito: e.target.value })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Abono Inicial ($)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={form.valorAbonado}
                  onChange={(e) => setForm({ ...form, valorAbonado: e.target.value })}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-muted-foreground mb-1">Descripción</label>
                <textarea
                  placeholder="Productos, observaciones..."
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-primary outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2.5 bg-muted text-foreground rounded-xl font-medium hover:bg-muted/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrear}
                disabled={crearMutation.isPending}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-md"
              >
                {crearMutation.isPending ? "Guardando..." : "Guardar Crédito"}
              </button>
            </div>
          </div>
        )}

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-8 text-muted-foreground">Cargando créditos...</div>
          ) : creditos?.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-card rounded-2xl border border-border">
              <p className="text-muted-foreground">No hay créditos registrados.</p>
            </div>
          ) : (
            creditos
              ?.filter((c) => c.valorRestante > 0)
              .map((credito) => (
                <div
                  key={credito.id}
                  className="bg-card border border-border rounded-2xl p-6 shadow-md hover:shadow-xl transition-all flex flex-col"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-foreground">{credito.nombreCliente}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(credito.fechaFactura + "T12:00:00").toLocaleDateString("es-CO")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-destructive/10 text-destructive text-xs font-bold px-2 py-1 rounded-full uppercase">
                        Pendiente
                      </span>
                      <button
                        onClick={() => handleEliminar(credito.id)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4 flex-1 text-sm">
                    {credito.placaVehiculo && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Placa:</span>
                        <span className="font-medium">{credito.placaVehiculo}</span>
                      </div>
                    )}
                    {credito.telefonoCliente && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tel:</span>
                        <span>{credito.telefonoCliente}</span>
                      </div>
                    )}
                    {credito.descripcion && (
                      <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{credito.descripcion}</p>
                    )}
                    <div className="flex justify-between pt-1">
                      <span className="text-muted-foreground">Valor inicial:</span>
                      <span className="font-medium">{formatCurrency(credito.valorCredito)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Abonado:</span>
                      <span className="font-medium text-green-500">{formatCurrency(credito.valorAbonado)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border font-bold text-base">
                      <span>Saldo:</span>
                      <span className="text-destructive">{formatCurrency(credito.valorRestante)}</span>
                    </div>
                  </div>

                  {showPay === credito.id ? (
                    <div className="bg-background rounded-xl p-4 border border-border animate-in fade-in slide-in-from-bottom-2">
                      <h4 className="text-sm font-medium mb-3 text-foreground">Registrar Abono</h4>
                      <div className="space-y-3">
                        <input
                          type="number"
                          placeholder={`Monto (max ${formatCurrency(credito.valorRestante)})`}
                          value={abono}
                          onChange={(e) => setAbono(e.target.value)}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                          type="text"
                          placeholder="Producto al que abona..."
                          value={productoAbono}
                          onChange={(e) => setProductoAbono(e.target.value)}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowPay(null)}
                            className="flex-1 py-2 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleAbono(credito)}
                            disabled={actualizarMutation.isPending || crearVentaMutation.isPending}
                            className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setShowPay(credito.id);
                        setAbono("");
                        setProductoAbono("");
                      }}
                      className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors border border-border"
                    >
                      Abonar / Pagar
                    </button>
                  )}
                </div>
              ))
          )}
        </div>

        {/* Pagados */}
        {creditos?.some((c) => c.valorRestante <= 0) && (
          <div>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Cancelados / Pagados
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 opacity-60">
              {creditos
                ?.filter((c) => c.valorRestante <= 0)
                .map((c) => (
                  <div key={c.id} className="bg-card border border-green-500/30 rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-foreground">{c.nombreCliente}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(c.valorCredito)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-500 font-medium">Pagado</span>
                      <button
                        onClick={() => handleEliminar(c.id)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
