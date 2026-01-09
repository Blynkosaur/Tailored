import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <nav className="h-16 bg-(--bg-secondary) flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-muted" />
        <h1 className="text-xl font-semibold text-muted">CV Tailor</h1>
      </div>

      <div className="flex items-center gap-6">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
        >
          Editor
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
        >
          Templates
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
        >
          Job Personalizer
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-(--bg-foreground) flex items-center justify-center">
          <span className="text-sm font-medium text-muted">U</span>
        </div>
      </div>
    </nav>
  );
}
