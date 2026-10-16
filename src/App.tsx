
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Menu,
  X,
  LogOut,
  Eye,
  EyeOff,
  TrendingUp,
  Wallet,
  ShoppingBag,
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  KeyRound,
  Route,
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  collection,
  doc,
  onSnapshot,
} from "firebase/firestore";

import Inventory from "./components/Inventory";
import Operations from "./components/Operations";
import Finances from "./components/Finances";
import BusinessRoadmap from "./components/BusinessRoadmap";

type Page =
  | "Dashboard"
  | "Inventory"
  | "Finances"
  | "Operations"
  | "Business Roadmap";

const navigation = [
  { name: "Dashboard" as const, icon: LayoutDashboard },
  { name: "Inventory" as const, icon: Package },
  { name: "Operations" as const, icon: ClipboardList },
  { name: "Finances" as const, icon: Wallet },
  { name: "Business Roadmap" as const, icon: Route }
];

type TransactionRecord = {
  id: string;
  description?: string;
  type: "Sale" | "Expense";
  amount: number;
  affectsCash?: boolean;
  source?: string;
  createdAt?: {
    toDate: () => Date;
  };
};

type DashboardOrder = {
  id: string;
  total?: number;
};

type InventoryItem = {
  id: string;
  name?: string;
  quantity: number;
  capacity?: number;
  unit?: string;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [page, setPage] = useState<Page>("Dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
const [orders, setOrders] = useState<DashboardOrder[]>([]);
const [inventory, setInventory] = useState<Record<string, InventoryItem>>({});

useEffect(() => {
  const unsubscribeTransactions = onSnapshot(
    collection(db, "transactions"),
    (snapshot) => {
      setTransactions(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as TransactionRecord[]
      );
    },
    (error) => console.error("Dashboard transactions error:", error)
  );

  const unsubscribeOrders = onSnapshot(
    collection(db, "orders"),
    (snapshot) => {
      setOrders(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as DashboardOrder[]
      );
    },
    (error) => console.error("Dashboard orders error:", error)
  );

  const inventoryIds = ["resin", "nfc", "rings", "packaging"];

  const unsubscribeInventory = inventoryIds.map((id) =>
    onSnapshot(
      doc(db, "inventory", id),
      (snapshot) => {
        if (snapshot.exists()) {
          setInventory((previous) => ({
            ...previous,
            [id]: {
              id,
              ...snapshot.data(),
            } as InventoryItem,
          }));
        }
      },
      (error) => console.error(`Dashboard ${id} error:`, error)
    )
  );

  return () => {
    unsubscribeTransactions();
    unsubscribeOrders();
    unsubscribeInventory.forEach((unsubscribe) => unsubscribe());
  };
}, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
  }, []);

  const totalSales = transactions
  .filter((transaction) => transaction.type === "Sale")
  .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

const totalExpenses = transactions
  .filter((transaction) => transaction.type === "Expense")
  .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);

const totalProfit = totalSales - totalExpenses;

const currentCash = Math.max(
  0,
  100 +
    transactions.reduce((total, transaction) => {
      if (transaction.affectsCash !== true) return total;

      if (transaction.type === "Sale") {
        return total + Number(transaction.amount || 0);
      }

      if (transaction.type === "Expense") {
        return total - Number(transaction.amount || 0);
      }

      return total;
    }, 0)
);

const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const stats = [
  {
    title: "Current Cash",
    value: formatPeso(currentCash),
    description: "Available business cash",
    icon: Wallet,
  },
  {
    title: "Total Sales",
    value: formatPeso(totalSales),
    description: `${transactions.filter((item) => item.type === "Sale").length} recorded sales`,
    icon: TrendingUp,
  },
  {
    title: "Total Profit",
    value: formatPeso(totalProfit),
    description: "Sales minus recorded expenses",
    icon: TrendingUp,
  },
  {
    title: "Orders",
    value: String(orders.length),
    description: "Total recorded orders",
    icon: ShoppingBag,
  },
  {
    title: "NFC Tags Left",
    value: String(inventory.nfc?.quantity ?? "—"),
    description: "Available tags",
    icon: KeyRound,
  },
];

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoginLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError("Login failed. Check your email and password.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      setPage("Dashboard");
      setMenuOpen(false);
    } catch {
      setError("Unable to log out. Please try again.");
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fcfcfc]">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#88f0fa] text-xl font-black text-gray-900">
            TL
          </div>
          <p className="text-sm font-medium text-gray-500">
            Loading Tap Link Admin...
          </p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-gray-200">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[#88f0fa]" />
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fcfcfc] px-5 py-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm md:grid-cols-2">
          <section className="flex flex-col justify-between bg-[#f0f0f0] p-8 sm:p-12">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#88f0fa] text-lg font-black text-gray-900">
                TL
              </div>

              <p className="mt-10 text-xs font-bold tracking-[0.2em] text-gray-500">
                TAP LINK KEYCHAIN
              </p>

              <h1 className="mt-4 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
                Your business,
                <br />
                all in one place.
              </h1>

              <p className="mt-4 max-w-sm text-sm leading-6 text-gray-500">
                Manage your inventory, track production, and keep your
                business organized from one simple dashboard.
              </p>
            </div>

            <div className="mt-12 hidden items-center gap-3 text-xs text-gray-500 md:flex">
              <span className="h-2 w-2 rounded-full bg-[#36c5d2]" />
              Private administrator access
            </div>
          </section>

          <section className="p-8 sm:p-12">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Sign in to access your admin panel.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 bg-[#fcfcfc] px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#55dce8] focus:ring-4 focus:ring-[#88f0fa]/25"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-gray-700"
                >
                  Password
                </label>

                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 bg-[#fcfcfc] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-gray-400 focus:border-[#55dce8] focus:ring-4 focus:ring-[#88f0fa]/25"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="flex w-full items-center justify-center rounded-xl bg-[#88f0fa] px-4 py-3.5 text-sm font-bold text-gray-900 transition hover:bg-[#65e5f0] focus:outline-none focus:ring-4 focus:ring-[#88f0fa]/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-400">
              Authorized administrator only.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-gray-900">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-white transition-transform duration-300 md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-gray-100 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#88f0fa] font-black text-gray-900">
              TL
            </div>
            <div>
              <h1 className="font-bold tracking-tight">Tap Link</h1>
              <p className="mt-0.5 text-xs text-gray-400">Admin Panel</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-8">
          <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.2em] text-gray-400">
            WORKSPACE
          </p>

          <nav className="space-y-1">
            {navigation.map(({ name, icon: Icon }) => {
              const active = page === name;

              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => {
                    setPage(name);
                    setMenuOpen(false);
                  }}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition ${
                    active
                      ? "bg-[#e7fbfd] text-gray-900"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <Icon
                    size={19}
                    className={
                      active
                        ? "text-[#159eaa]"
                        : "text-gray-400 group-hover:text-gray-600"
                    }
                  />
                  <span className="flex-1">{name}</span>
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#35cbd7]" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-gray-100 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-[#f7f7f7] p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9f9fc] text-sm font-bold text-gray-800">
              {(user.email?.[0] ?? "A").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-gray-800">
                Administrator
              </p>
              <p className="truncate text-xs text-gray-400">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={18} />
            Log out
          </button>
        </div>
      </aside>

      <div className="min-h-screen md:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur-md sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
              className="rounded-xl border border-gray-200 p-2.5 text-gray-600 transition hover:bg-gray-50 md:hidden"
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0">
              <p className="truncate text-lg font-bold tracking-tight">
                {page}
              </p>
              <p className="hidden text-xs text-gray-400 sm:block">
                Tap Link Keychain Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 sm:inline-flex">
              Admin workspace
            </span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#88f0fa] text-sm font-bold">
              {(user.email?.[0] ?? "A").toUpperCase()}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] p-4 sm:p-8">
          {page === "Dashboard" && (
            <div className="space-y-8">
              <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#159eaa]">
                    Overview
                  </p>
                  <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    Business Overview
                  </h1>
                  <p className="mt-2 text-sm text-gray-500">
                    Here's your Tap Link business at a glance.
                  </p>
                </div>

                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500">
                  <span className="h-2 w-2 rounded-full bg-[#40c9a2]" />
                  Admin account active
                </span>
              </section>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map(({ title, value, description, icon: Icon }) => (
                  <article
                    key={title}
                    className="rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-[#b9edf1] hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          {title}
                        </p>
                        <p className="mt-3 text-2xl font-bold tracking-tight">
                          {value}
                        </p>
                      </div>
                      <div className="rounded-xl bg-[#e7fbfd] p-3 text-[#159eaa]">
                        <Icon size={20} />
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-gray-400">
                      {description}
                    </p>
                  </article>
                ))}
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <article className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 xl:col-span-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold">Inventory Snapshot</h2>
                      <p className="mt-1 text-xs text-gray-400">
                        Your current starting stock
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPage("Inventory")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#159eaa] hover:text-gray-900"
                    >
                      View inventory <ChevronRight size={15} />
                    </button>
                  </div>

                  <div className="mt-6 space-y-5">
                    {[
                      { id: "resin", label: "Epoxy resin capacity", fallbackCapacity: 50 },
                      { id: "nfc", label: "NFC tags", fallbackCapacity: 20 },
                      { id: "rings", label: "Keychain rings", fallbackCapacity: 100 },
                      { id: "packaging", label: "Plastic packaging", fallbackCapacity: 100 },
                    ].map(({ id, label, fallbackCapacity }) => {
                      const item = inventory[id];
                      const quantity = item?.quantity ?? 0;
                      const capacity = item?.capacity ?? fallbackCapacity;
                      const percentage =
                        capacity > 0
                          ? Math.min(100, Math.max(0, (quantity / capacity) * 100))
                          : 0;

                      return (
                        <div key={id}>
                          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium text-gray-700">{label}</span>
                            <span className="text-gray-500">
                              {item ? `${quantity} / ${capacity} ${item.unit ?? "pcs"}` : "Loading..."}
                            </span>
                          </div>

                          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-[#88f0fa] transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="mt-6 rounded-xl bg-[#f7f7f7] p-3 text-xs leading-5 text-gray-500">
                    Inventory quantities are synced with Firestore and update automatically.
                  </p>
                </article>

                <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#e7fbfd] p-3 text-[#159eaa]">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h2 className="font-bold">Quick Actions</h2>
                      <p className="mt-1 text-xs text-gray-400">
                        Manage your business
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <button
                      type="button"
                      onClick={() => setPage("Inventory")}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-4 text-left transition hover:border-[#88f0fa] hover:bg-[#f5feff]"
                    >
                      <Package size={19} className="text-[#159eaa]" />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">
                          Manage inventory
                        </span>
                        <span className="mt-1 block text-xs text-gray-400">
                          Materials and supplies
                        </span>
                      </span>
                      <ArrowUpRight size={16} className="text-gray-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setPage("Operations")}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-4 text-left transition hover:border-[#88f0fa] hover:bg-[#f5feff]"
                    >
                      <ClipboardList size={19} className="text-[#159eaa]" />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">
                          View operations
                        </span>
                        <span className="mt-1 block text-xs text-gray-400">
                          Orders and production
                        </span>
                      </span>
                      <ArrowUpRight size={16} className="text-gray-400" />
                    </button>
                  </div>

                  <div className="mt-auto pt-6">
                    <p className="text-xs leading-5 text-gray-400">
                      Your sales, profit, and order statistics will update
                      after transaction management is implemented.
                    </p>
                  </div>
                </article>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-bold">Recent Transactions</h2>
                    <p className="mt-1 text-xs text-gray-400">
                      Latest recorded sales and expenses
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPage("Finances")}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#159eaa] hover:text-gray-900"
                  >
                    View finances <ChevronRight size={15} />
                  </button>
                </div>

                <div className="mt-5 divide-y divide-gray-100">
                  {transactions
                    .slice()
                    .sort((a, b) => {
                      const dateA = a.createdAt?.toDate().getTime() ?? 0;
                      const dateB = b.createdAt?.toDate().getTime() ?? 0;
                      return dateB - dateA;
                    })
                    .slice(0, 5)
                    .map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between gap-4 py-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`rounded-xl p-2 ${
                              transaction.type === "Sale"
                                ? "bg-emerald-50 text-emerald-600"
                                : "bg-red-50 text-red-500"
                            }`}
                          >
                            {transaction.type === "Sale" ? (
                              <TrendingUp size={18} />
                            ) : (
                              <Wallet size={18} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-800">
                              {transaction.description ||
                                (transaction.source === "inventory_restock"
                                  ? "Inventory restock"
                                  : transaction.source === "order"
                                    ? "Order sale"
                                    : "Recorded transaction")}
                            </p>

                            <p className="mt-1 text-xs text-gray-400">
                              {transaction.createdAt
                                ? transaction.createdAt.toDate().toLocaleDateString("en-PH")
                                : "Date unavailable"}
                            </p>
                          </div>
                        </div>

                        <p
                          className={`shrink-0 text-sm font-bold ${
                            transaction.type === "Sale"
                              ? "text-emerald-600"
                              : "text-red-500"
                          }`}
                        >
                          {transaction.type === "Sale" ? "+" : "−"}
                          {formatPeso(Number(transaction.amount || 0))}
                        </p>
                      </div>
                    ))}

                  {transactions.length === 0 && (
                    <p className="py-8 text-center text-sm text-gray-400">
                      No transactions recorded yet.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}

          {page === "Inventory" && <Inventory />}
          {page === "Operations" && <Operations />}
          {page === "Finances" && <Finances />}
          {page === "Business Roadmap" && <BusinessRoadmap />}
        </main>
      </div>
    </div>
  );
}
