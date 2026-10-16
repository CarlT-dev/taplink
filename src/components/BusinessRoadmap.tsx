
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  Plus,
  Target,
  Trash2,
  Wallet,
  ShieldCheck,
  Package,
  Wrench,
  Sparkles,
  X,
} from "lucide-react";

type Priority = "High" | "Medium" | "Low";

type RoadmapTarget = {
  id: string;
  name: string;
  category: string;
  cost: number;
  saved: number;
  priority: Priority;
  reason: string;
};

const initialTargets: RoadmapTarget[] = [
  {
    id: "initial-1",
    name: "Additional silicone molder",
    category: "Equipment",
    cost: 0,
    saved: 0,
    priority: "High",
    reason:
      "Increase production capacity beyond the current two keychains per day.",
  },
  {
    id: "initial-2",
    name: "Gloves and safety supplies",
    category: "Supplies",
    cost: 0,
    saved: 0,
    priority: "High",
    reason:
      "Improve safety when handling resin and other production materials.",
  },
  {
    id: "initial-3",
    name: "Explore UV resin production",
    category: "Process Improvement",
    cost: 0,
    saved: 0,
    priority: "Medium",
    reason:
      "Compare costs, curing equipment, product quality, and possible waste reduction before switching.",
  },
];

const peso = (amount: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(amount);

export default function BusinessRoadmap() {
  const [targets, setTargets] = useState<RoadmapTarget[]>([]);
const [transactions, setTransactions] = useState<
  { type: string; amount: number; affectsCash?: boolean }[]
>([]);
const [restockReserve, setRestockReserve] = useState("");
const [commitments, setCommitments] = useState("");
const [showForm, setShowForm] = useState(false);
const [editingFunds, setEditingFunds] = useState<string | null>(null);
const [fundAmount, setFundAmount] = useState("");
const [loadingRoadmap, setLoadingRoadmap] = useState(true);
const [saveError, setSaveError] = useState("");

const [newTarget, setNewTarget] = useState({
  name: "",
  category: "Equipment",
  cost: "",
  priority: "Medium" as Priority,
  reason: "",
});

useEffect(() => {
  const unsubscribeTargets = onSnapshot(
    collection(db, "roadmapTargets"),
    (snapshot) => {
      setTargets(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as RoadmapTarget[]
      );
      setLoadingRoadmap(false);
    },
    (error) => {
      console.error("Roadmap targets error:", error);
      setSaveError("Unable to load roadmap targets.");
      setLoadingRoadmap(false);
    }
  );

  const unsubscribeSettings = onSnapshot(
    doc(db, "businessRoadmap", "settings"),
    (snapshot) => {
      if (snapshot.exists()) {
        const settings = snapshot.data();
        setRestockReserve(String(settings.restockReserve ?? ""));
        setCommitments(String(settings.commitments ?? ""));
      }
    },
    (error) => {
      console.error("Roadmap settings error:", error);
      setSaveError("Unable to load budget settings.");
    }
  );

  const unsubscribeTransactions = onSnapshot(
    collection(db, "transactions"),
    (snapshot) => {
      setTransactions(
        snapshot.docs.map((item) => {
          const data = item.data();
          return {
            type: data.type,
            amount: Number(data.amount || 0),
            affectsCash: data.affectsCash === true,
          };
        })
      );
    },
    (error) => {
      console.error("Roadmap transactions error:", error);
      setSaveError("Unable to load the business cash balance.");
    }
  );

  // Seed the default targets only if the collection is empty.
  async function seedTargetsIfEmpty() {
    try {
      const existing = await getDocs(collection(db, "roadmapTargets"));

      if (existing.empty) {
        for (const target of initialTargets) {
          await setDoc(doc(db, "roadmapTargets", target.id), target);
        }
      }
    } catch (error) {
      console.error("Unable to initialize roadmap:", error);
      setSaveError("Unable to initialize roadmap targets.");
    }
  }

  void seedTargetsIfEmpty();

  return () => {
    unsubscribeTargets();
    unsubscribeSettings();
    unsubscribeTransactions();
  };
}, []);

const cash = Math.max(
  0,
  100 +
    transactions.reduce((total, transaction) => {
      if (!transaction.affectsCash) return total;

      if (transaction.type === "Sale") {
        return total + transaction.amount;
      }

      if (transaction.type === "Expense") {
        return total - transaction.amount;
      }

      return total;
    }, 0)
);

const reserve = Math.max(0, Number(restockReserve) || 0);
const pendingCommitments = Math.max(0, Number(commitments) || 0);
const safeBudget = Math.max(0, cash - reserve - pendingCommitments);

const totalSaved = targets.reduce(
  (total, target) => total + Number(target.saved || 0),
  0
);

async function saveBudgetSettings(
  nextReserve: string,
  nextCommitments: string
) {
  setRestockReserve(nextReserve);
  setCommitments(nextCommitments);
  setSaveError("");

  try {
    await setDoc(
      doc(db, "businessRoadmap", "settings"),
      {
        restockReserve: nextReserve,
        commitments: nextCommitments,
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Unable to save budget settings:", error);
    setSaveError("Budget settings could not be saved. Please try again.");
  }
}

  async function addTarget() {
  const cost = Number(newTarget.cost);

  if (!newTarget.name.trim() || !newTarget.cost || !Number.isFinite(cost) || cost <= 0) {
    return;
  }

  setSaveError("");

  try {
    await addDoc(collection(db, "roadmapTargets"), {
      name: newTarget.name.trim(),
      category: newTarget.category,
      cost,
      saved: 0,
      priority: newTarget.priority,
      reason: newTarget.reason.trim(),
    });

    setNewTarget({
      name: "",
      category: "Equipment",
      cost: "",
      priority: "Medium",
      reason: "",
    });
    setShowForm(false);
  } catch (error) {
    console.error("Unable to add target:", error);
    setSaveError("Unable to save the new target.");
  }
}

async function updateSaved(id: string) {
  const amount = Number(fundAmount);
  const target = targets.find((item) => item.id === id);

  if (
    !target ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > target.cost
  ) {
    setSaveError("Enter a valid funding amount within the target cost.");
    return;
  }

  setSaveError("");

  try {
    await updateDoc(doc(db, "roadmapTargets", id), {
      saved: amount,
    });

    setEditingFunds(null);
    setFundAmount("");
  } catch (error) {
    console.error("Unable to update funding:", error);
    setSaveError("Unable to save funding progress.");
  }
}

async function deleteTarget(id: string) {
  setSaveError("");

  try {
    await deleteDoc(doc(db, "roadmapTargets", id));
  } catch (error) {
    console.error("Unable to delete target:", error);
    setSaveError("Unable to delete the target.");
  }
}

  const priorityStyle: Record<Priority, string> = {
    High: "bg-red-50 text-red-700",
    Medium: "bg-amber-50 text-amber-700",
    Low: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-6 text-gray-800">
        {saveError && (
            <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
                {saveError}
            </p>
            )}

            {loadingRoadmap && (
            <p className="text-sm text-gray-500">Loading your business roadmap...</p>
        )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-600">
            TAP LINK BUSINESS
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            Business Roadmap
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Plan upgrades based on your actual budget and business needs.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
        >
          <Plus size={18} />
          Add a target
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <Wallet className="mb-3 text-violet-600" size={22} />
          <p className="text-sm text-gray-500">Business cash</p>
          <p className="mt-1 text-2xl font-bold">{peso(cash)}</p>
            <p className="mt-1 text-xs text-gray-400">
            Synced with your Finance transactions.
            </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <ShieldCheck className="mb-3 text-emerald-600" size={22} />
          <p className="text-sm text-gray-500">Safe upgrade budget</p>
          <p className="mt-1 text-2xl font-bold">{peso(safeBudget)}</p>
          <p className="mt-2 text-xs text-gray-400">
            Cash minus reserve and commitments.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <Target className="mb-3 text-blue-600" size={22} />
          <p className="text-sm text-gray-500">Planned targets</p>
          <p className="mt-1 text-2xl font-bold">{targets.length}</p>
          <p className="mt-2 text-xs text-gray-400">
            Equipment, supplies, and improvements.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <Sparkles className="mb-3 text-amber-600" size={22} />
          <p className="text-sm text-gray-500">Target funding recorded</p>
          <p className="mt-1 text-2xl font-bold">{peso(totalSaved)}</p>
          <p className="mt-2 text-xs text-gray-400">
            Manually recorded funding across targets.
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-bold">Budget settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use your real cash balance, expected essential restocking costs,
          and existing commitments. Do not include historical capital spent
          as current cash.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Current cash (₱)
            <p className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 font-semibold text-gray-700">
            {peso(cash)}
            </p>
          </label>

          <label className="text-sm font-medium">
            Essential restock reserve (₱)
            <input
              type="number"
              min="0"
              value={restockReserve}
              onChange={(e) =>
                void saveBudgetSettings(e.target.value, commitments)
                }
              placeholder="Enter estimate"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-violet-500"
            />
          </label>

          <label className="text-sm font-medium">
            Existing commitments (₱)
            <input
              type="number"
              min="0"
              value={commitments}
              onChange={(e) =>
                void saveBudgetSettings(restockReserve, e.target.value)
                }
              placeholder="Enter unpaid obligations"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 outline-none focus:border-violet-500"
            />
          </label>
        </div>

        {restockReserve === "" && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Set your restock reserve before deciding whether an upgrade is
            affordable. Until then, the calculated budget is provisional.
          </p>
        )}
      </section>

      {showForm && (
        <section className="rounded-2xl border border-violet-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Create a business target</h2>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close form"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Target name *
              <input
                value={newTarget.name}
                onChange={(e) =>
                  setNewTarget({ ...newTarget, name: e.target.value })
                }
                placeholder="e.g. Buy 2 more molders"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3"
              />
            </label>

            <label className="text-sm font-medium">
              Estimated total cost (₱) *
              <input
                type="number"
                min="1"
                value={newTarget.cost}
                onChange={(e) =>
                  setNewTarget({ ...newTarget, cost: e.target.value })
                }
                placeholder="Enter estimated price"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3"
              />
            </label>

            <label className="text-sm font-medium">
              Category
              <select
                value={newTarget.category}
                onChange={(e) =>
                  setNewTarget({ ...newTarget, category: e.target.value })
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3"
              >
                <option>Equipment</option>
                <option>Supplies</option>
                <option>Inventory</option>
                <option>Process Improvement</option>
                <option>Marketing</option>
                <option>Other</option>
              </select>
            </label>

            <label className="text-sm font-medium">
              Priority
              <select
                value={newTarget.priority}
                onChange={(e) =>
                  setNewTarget({
                    ...newTarget,
                    priority: e.target.value as Priority,
                  })
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3"
              >
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>

            <label className="text-sm font-medium sm:col-span-2">
              Reason or expected benefit
              <textarea
                value={newTarget.reason}
                onChange={(e) =>
                  setNewTarget({ ...newTarget, reason: e.target.value })
                }
                placeholder="Why is this upgrade needed?"
                rows={3}
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3"
              />
            </label>
          </div>

          <button
            onClick={addTarget}
            className="mt-4 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Save target
          </button>
        </section>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold">Upgrade targets</h2>
          <p className="mt-1 text-sm text-gray-500">
            Research unknown prices before setting a target cost.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {targets.map((target) => {
            const progress =
              target.cost > 0
                ? Math.min(100, (target.saved / target.cost) * 100)
                : 0;

            const reserveConfigured = restockReserve !== "";
            const canAfford =
              reserveConfigured && target.cost > 0 && safeBudget >= target.cost;

            return (
              <article
                key={target.id}
                className="rounded-2xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="rounded-xl bg-violet-50 p-3 text-violet-600">
                      {target.category === "Equipment" ? (
                        <Wrench size={21} />
                      ) : target.category === "Supplies" ? (
                        <ShieldCheck size={21} />
                      ) : target.category === "Inventory" ? (
                        <Package size={21} />
                      ) : (
                        <Sparkles size={21} />
                      )}
                    </div>

                    <div>
                      <h3 className="font-bold">{target.name}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {target.category}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteTarget(target.id)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${target.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityStyle[target.priority]}`}
                  >
                    {target.priority} priority
                  </span>

                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    {target.cost > 0
                      ? canAfford
                        ? "Within calculated budget"
                        : reserveConfigured
                          ? "Not safely affordable yet"
                          : "Set reserve to evaluate"
                      : "Cost not set"}
                  </span>
                </div>

                {target.reason && (
                  <p className="mt-4 text-sm leading-6 text-gray-600">
                    {target.reason}
                  </p>
                )}

                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Estimated cost</p>
                    <p className="mt-1 text-lg font-bold">
                      {target.cost > 0 ? peso(target.cost) : "Not set"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-500">Funding recorded</p>
                    <p className="mt-1 font-semibold">
                      {peso(target.saved)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-violet-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="mt-2 flex justify-between text-xs text-gray-500">
                  <span>{Math.round(progress)}% funded</span>
                  <span>
                    {target.cost > 0
                      ? `${peso(Math.max(0, target.cost - target.saved))} remaining`
                      : "Set a cost to track funding"}
                  </span>
                </div>

                {editingFunds === target.id ? (
                  <div className="mt-4 flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max={target.cost}
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      placeholder="Total allocated so far"
                      className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => updateSaved(target.id)}
                      className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingFunds(null)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingFunds(target.id);
                      setFundAmount(String(target.saved));
                    }}
                    className="mt-4 w-full rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  >
                    Update funding progress
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

        <p className="text-xs leading-5 text-gray-400">
            Roadmap targets and budget settings are saved in Firestore.
            Funding progress is manually recorded and does not move money
            or deduct cash. Safe upgrade budget is a planning estimate,
            not a purchase authorization.
        </p>
    </div>
  );
}
