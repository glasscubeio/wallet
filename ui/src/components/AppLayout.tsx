import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LogOut, Settings as SettingsIcon, Wallet, ListOrdered } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Brand } from "@/components/Brand";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Wallet", icon: Wallet, end: true },
  { to: "/activity", label: "Activity", icon: ListOrdered, end: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, end: false },
] as const;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4 sm:px-6">
          <Brand size="sm" />

          <div className="flex items-center gap-1">
            <nav className="flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                      isActive
                        ? "bg-indigo-wash text-indigo"
                        : "text-ink-soft hover:bg-indigo-wash/60 hover:text-ink",
                    )
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </NavLink>
              ))}
            </nav>

            <button
              onClick={handleLogout}
              className="ml-1 flex items-center gap-1.5 rounded-[10px] px-2.5 py-2 text-[13.5px] font-medium text-ink-soft transition-colors hover:bg-indigo-wash/60 hover:text-ink"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Sign out {user?.username}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
