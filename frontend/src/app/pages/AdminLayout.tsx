import { NavLink, Outlet, useNavigate } from "react-router";
import { Users, FolderOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/app/components/ui/button";

export default function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {}
      <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="text-gray-400 hover:text-white h-8 gap-1"
        >
          <ArrowLeft className="size-4" />
          Back to Viewer
        </Button>
        <span className="text-gray-500">|</span>
        <span className="text-sm font-semibold text-white">Admin Panel</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {}
        <nav className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col p-3 gap-1 shrink-0">
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <Users className="size-4" />
            Users
          </NavLink>
          <NavLink
            to="/admin/groups"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`
            }
          >
            <FolderOpen className="size-4" />
            Groups
          </NavLink>
        </nav>

        {}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
