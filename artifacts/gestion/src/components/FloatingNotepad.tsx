import { useState, useEffect, useRef } from "react";
import { StickyNote, Minus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetNotas, useGuardarNotas } from "@workspace/api-client-react";

export function FloatingNotepad() {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notas } = useGetNotas();
  const guardarMutation = useGuardarNotas();

  useEffect(() => {
    if (notas?.contenido) {
      setContent(notas.contenido);
    }
  }, [notas]);

  const handleSave = () => {
    guardarMutation.mutate({ data: { contenido: content } });
  };

  const handleClear = () => {
    setContent("");
    guardarMutation.mutate({ data: { contenido: "" } });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="mb-4 w-80 bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col"
          >
            <div className="bg-muted px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <StickyNote className="w-4 h-4 text-primary" />
                Notas Rápidas
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleClear}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                  title="Borrar Todo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-background rounded-md transition-colors"
                  title="Minimizar"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={handleSave}
              placeholder="Anota cosas pendientes aquí..."
              className="w-full h-64 p-4 bg-card text-foreground resize-none focus:outline-none placeholder:text-muted-foreground/50 text-sm"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative group/note">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-xl flex items-center justify-center hover:scale-105 hover:shadow-primary/25 transition-all duration-200 active:scale-95"
          aria-label="Notas rápidas"
        >
          <StickyNote className="w-6 h-6" />
        </button>
        <span className="absolute right-16 top-1/2 -translate-y-1/2 bg-card border border-border text-foreground text-xs font-medium px-2.5 py-1 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover/note:opacity-100 transition-opacity pointer-events-none">
          Notas Rápidas
        </span>
      </div>
    </div>
  );
}
