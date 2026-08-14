import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="h-full flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
