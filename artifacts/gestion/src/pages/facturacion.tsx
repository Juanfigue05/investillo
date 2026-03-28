import { Layout } from "@/components/Layout";
import { Receipt, FileWarning, ExternalLink } from "lucide-react";

export default function Facturacion() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center mt-20">
        <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-8 relative">
          <Receipt className="w-12 h-12 text-primary" />
          <div className="absolute -bottom-2 -right-2 bg-destructive text-destructive-foreground p-1 rounded-full border-4 border-background">
            <FileWarning className="w-5 h-5" />
          </div>
        </div>
        
        <h1 className="text-4xl font-display font-bold text-foreground mb-4">Facturación Electrónica DIAN</h1>
        <p className="text-xl text-muted-foreground mb-8">
          Este módulo se encuentra en construcción para integrarse con los proveedores tecnológicos autorizados por la DIAN en Colombia.
        </p>

        <div className="bg-card border border-border p-8 rounded-3xl text-left w-full shadow-2xl">
          <h3 className="text-lg font-bold text-foreground mb-4 border-b border-border pb-4">Requisitos Previos</h3>
          <ul className="space-y-4 text-muted-foreground">
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">1</div>
              <span>RUT actualizado con responsabilidades fiscales.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">2</div>
              <span>Certificado digital vigente.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 mt-0.5">3</div>
              <span>Resolución de facturación habilitada en el portal MUISCA.</span>
            </li>
          </ul>
        </div>
        
        <button className="mt-8 flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors">
          Saber más sobre requisitos DIAN <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </Layout>
  );
}
