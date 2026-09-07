import React, { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, ShieldCheck, Sparkles, Building2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing?: boolean;
}

const SUPPORTED_BANKS = [
  { key: "abl", name: "Allied Bank", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  { key: "fbl", name: "Faysal Bank", color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20" },
  { key: "sadaPay", name: "SadaPay", color: "bg-teal-500/10 text-teal-600 border-teal-500/20" },
  { key: "easyPaisa", name: "easypaisa", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  { key: "nayaPay", name: "NayaPay", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  { key: "payoneer", name: "Payoneer (USD)", color: "bg-rose-500/10 text-rose-600 border-rose-500/20" },
];

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, isProcessing = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 p-8 md:p-12 text-center
          ${
            isDragOver
              ? "border-primary bg-primary/5 scale-[1.01] shadow-xl ring-4 ring-primary/10"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30 bg-card/60 backdrop-blur-sm shadow-sm"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.csv,.xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Ambient Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-32 bg-primary/10 blur-3xl pointer-events-none rounded-full" />

        <div className="flex flex-col items-center justify-center space-y-4 relative z-10">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isDragOver
                ? "bg-primary text-primary-foreground scale-110 shadow-lg"
                : "bg-primary/10 text-primary group-hover:scale-105 group-hover:bg-primary/15"
            }`}
          >
            <UploadCloud className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl md:text-2xl font-semibold tracking-tight">
              Drop your bank statements here
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Drop PDF, CSV, or Excel statements from any Pakistani or global bank. Formats are auto-detected instantly.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              size="lg"
              disabled={isProcessing}
              className="rounded-xl shadow-md font-medium px-6 pointer-events-none"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
            <span className="text-xs text-muted-foreground">or drag & drop anywhere</span>
          </div>

          {/* Supported Bank Pills */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
            <div className="flex items-center text-xs text-muted-foreground mr-1">
              <Building2 className="w-3.5 h-3.5 mr-1" />
              Auto-detects:
            </div>
            {SUPPORTED_BANKS.map((b) => (
              <Badge
                key={b.key}
                variant="outline"
                className={`text-xs px-2.5 py-0.5 font-medium transition-all ${b.color}`}
              >
                {b.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Privacy Guarantee Note */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80 py-1">
        <ShieldCheck className="w-4 h-4 text-emerald-600" />
        <span>
          <strong>Zero Storage / 100% Auth-Free:</strong> Files are processed ephemerally in serverless functions and never permanently stored.
        </span>
      </div>
    </div>
  );
};
