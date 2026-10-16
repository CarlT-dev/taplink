
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  History,
  Package,
  Plus,
  Search,
  TrendingDown,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

type Material = {
  id: string;
  name: string;
  category: "Material" | "Equipment";
  quantity: number;
  unit: string;
  unitCost: number;
  restockCost: number;
  capacity?: number;
  note?: string;
};

type Pigment = {
  id: string;
  name: string;
  quantity: number;
  unitCost: number;
};

type PurchaseRecord = {
  id: string;
  item: string;
  quantity: number;
  cost: number;
  reason: string;
  date: string;
};

const initialMaterials: Material[] = [
  {
    id: "resin",
    name: "Epoxy Resin",
    category: "Material",
    quantity: 40,
    unit: "keychains worth",
    unitCost: 173 / 50,
    restockCost: 173,
    capacity: 50,
    note: "One restock supports approximately 50 keychains.",
  },
  {
    id: "nfc",
    name: "NFC Tags",
    category: "Material",
    quantity: 18,
    unit: "pcs",
    unitCost: 218 / 20,
    restockCost: 218,
    note: "One NFC tag per keychain.",
  },
  {
    id: "rings",
    name: "Keychain Rings",
    category: "Material",
    quantity: 90,
    unit: "pcs",
    unitCost: 122 / 100,
    restockCost: 122,
    capacity: 100,
  },
  {
    id: "packaging",
    name: "Plastic Packaging",
    category: "Material",
    quantity: 90,
    unit: "pcs",
    unitCost: 0,
    restockCost: 0,
    capacity: 100,
    note: "Purchase price not provided yet.",
  },
  {
    id: "molders",
    name: "Silicone Molders",
    category: "Equipment",
    quantity: 2,
    unit: "pcs",
    unitCost: 99 / 2,
    restockCost: 99,
    note: "Two molders can produce up to two keychains per day.",
  },
  {
    id: "dropper",
    name: "Measuring Dropper",
    category: "Equipment",
    quantity: 1,
    unit: "pc",
    unitCost: 59,
    restockCost: 59,
    note: "Reusable measuring tool.",
  },
];

const initialPigments: Pigment[] = [
  { id: "blue", name: "Blue", quantity: 50, unitCost: 356 / 7 },
  { id: "red", name: "Red", quantity: 50, unitCost: 356 / 7 },
  { id: "pink", name: "Pink", quantity: 50, unitCost: 356 / 7 },
  { id: "purple", name: "Purple", quantity: 50, unitCost: 356 / 7 },
  { id: "white", name: "White", quantity: 50, unitCost: 356 / 7 },
  { id: "gray", name: "Gray", quantity: 50, unitCost: 356 / 7 },
  { id: "black", name: "Black", quantity: 50, unitCost: 356 / 7 },
];

const nfcBatches = [
  { quantity: 10, cost: 133 },
  { quantity: 20, cost: 218 },
  { quantity: 50, cost: 550 },
];

const money = (amount: number) =>
  amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });

export default function Inventory() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [pigments, setPigments] = useState<Pigment[]>([]);
  const [history, setHistory] = useState<PurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [modal, setModal] = useState<"restock" | "adjust" | null>(null);
  const [selectedId, setSelectedId] = useState("nfc");
  const [restockQuantity, setRestockQuantity] = useState("20");
  const [restockCost, setRestockCost] = useState("218");
  const [adjustment, setAdjustment] = useState("1");
  const [adjustmentReason, setAdjustmentReason] =
    useState("Used in production");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Seed initial stock only if the corresponding collection is empty.
  useEffect(() => {
    let active = true;

    async function initializeStock() {
      try {
        const materialsRef = collection(db, "inventory");
        const pigmentsRef = collection(db, "pigments");

        const [materialsSnapshot, pigmentsSnapshot] = await Promise.all([
          getDocs(materialsRef),
          getDocs(pigmentsRef),
        ]);

        const batch = writeBatch(db);
        let hasSeedData = false;

        if (materialsSnapshot.empty) {
          initialMaterials.forEach((item) => {
            const { id, ...data } = item;
            batch.set(doc(db, "inventory", id), data);
            hasSeedData = true;
          });
        }

        if (pigmentsSnapshot.empty) {
          initialPigments.forEach((item) => {
            const { id, ...data } = item;
            batch.set(doc(db, "pigments", id), data);
            hasSeedData = true;
          });
        }

        if (hasSeedData) {
          await batch.commit();
        }
      } catch (error) {
        console.error("Could not initialize inventory:", error);
        if (active) {
          setDbError(
            "Could not initialize stock. Check your Firestore connection and security rules."
          );
        }
      }
    }

    initializeStock();

    const unsubscribeMaterials = onSnapshot(
      collection(db, "inventory"),
      (snapshot) => {
        if (!active) return;

        setMaterials(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Material[]
        );
        setLoading(false);
      },
      (error) => {
        console.error("Inventory listener error:", error);
        if (active) {
          setDbError("Unable to load inventory from Firestore.");
          setLoading(false);
        }
      }
    );

    const unsubscribePigments = onSnapshot(
      collection(db, "pigments"),
      (snapshot) => {
        if (!active) return;

        setPigments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Pigment[]
        );
      },
      (error) => {
        console.error("Pigment listener error:", error);
        if (active) setDbError("Unable to load pigments from Firestore.");
      }
    );

    const unsubscribeHistory = onSnapshot(
      collection(db, "inventoryHistory"),
      (snapshot) => {
        if (!active) return;

        const records = snapshot.docs.map((item) => {
          const data = item.data();
          const date = data.createdAt?.toDate
            ? data.createdAt.toDate().toLocaleString()
            : "Saving date...";

          return {
            id: item.id,
            item: data.item ?? "Inventory activity",
            quantity: data.quantity ?? 0,
            cost: data.cost ?? 0,
            reason: data.reason ?? "",
            date,
            timestamp: data.createdAt?.toMillis?.() ?? 0,
          };
        });

        records.sort(
          (a, b) =>
            (b as any).timestamp - (a as any).timestamp
        );

        setHistory(records);
      },
      (error) => {
        console.error("History listener error:", error);
        if (active) setDbError("Unable to load inventory history.");
      }
    );

    return () => {
      active = false;
      unsubscribeMaterials();
      unsubscribePigments();
      unsubscribeHistory();
    };
  }, []);

  const selectedMaterial = materials.find(
    (item) => item.id === selectedId
  );

  const filteredMaterials = useMemo(
    () =>
      materials.filter((item) => {
        const matchesSearch = item.name
          .toLowerCase()
          .includes(search.toLowerCase());

        const matchesFilter =
          filter === "All" ||
          (filter === "Materials" && item.category === "Material") ||
          (filter === "Equipment" && item.category === "Equipment");

        return matchesSearch && matchesFilter;
      }),
    [materials, search, filter]
  );

  const lowStockCount = materials.filter(
    (item) =>
      item.category === "Material" &&
      item.capacity !== undefined &&
      item.capacity > 0 &&
      item.quantity / item.capacity <= 0.2
  ).length;

  function openRestock() {
    setFormError("");
    setSelectedId("nfc");
    setRestockQuantity("20");
    setRestockCost("218");
    setModal("restock");
  }

  function selectRestockItem(id: string) {
    setSelectedId(id);

    if (id === "nfc") {
      setRestockQuantity("20");
      setRestockCost("218");
    } else if (id === "resin") {
      setRestockQuantity("50");
      setRestockCost("173");
    } else if (id === "rings" || id === "packaging") {
      setRestockQuantity("100");
      setRestockCost(id === "rings" ? "122" : "");
    } else {
      setRestockQuantity("");
      setRestockCost("");
    }
  }

  async function handleRestock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const quantity = Number(restockQuantity);
    const cost = Number(restockCost);

    if (
      !selectedMaterial ||
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(cost) ||
      cost < 0
    ) {
      setFormError("Enter a valid quantity and purchase cost.");
      return;
    }

    if (
      selectedId === "nfc" &&
      !nfcBatches.some(
        (batch) => batch.quantity === quantity && batch.cost === cost
      )
    ) {
      setFormError(
        "Choose an NFC batch: 10 for ₱133, 20 for ₱218, or 50 for ₱550."
      );
      return;
    }

    setSaving(true);

    try {
      const batch = writeBatch(db);
      const materialRef = doc(db, "inventory", selectedId);
      const newCapacity =
        selectedMaterial.capacity === undefined
          ? undefined
          : selectedMaterial.capacity + quantity;

      batch.update(materialRef, {
        quantity: increment(quantity),
        restockCost: cost,
        unitCost: cost / quantity,
        ...(newCapacity !== undefined ? { capacity: newCapacity } : {}),
      });

      
const historyRef = doc(collection(db, "inventoryHistory"));

batch.set(historyRef, {
  item: selectedMaterial.name,
  itemId: selectedId,
  action: "Restock",
  quantity,
  cost,
  reason: "Purchase",
  createdAt: serverTimestamp(),
});

// Record the restock cost in Finances.
// Use the history ID to prevent duplicate expense records.
if (cost > 0) {
  const expenseRef = doc(db, "transactions", `restock_${historyRef.id}`);

  batch.set(expenseRef, {
    description: `Inventory restock — ${selectedMaterial.name}`,
    type: "Expense",
    amount: cost,
    affectsCash: true,
    source: "inventory_restock",
    inventoryHistoryId: historyRef.id,
    createdAt: serverTimestamp(),
  });
}

await batch.commit();
setModal(null);

      setModal(null);
    } catch (error) {
      console.error("Restock failed:", error);
      setFormError("Could not save restock. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjustment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");

    const amount = Number(adjustment);

    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError("Enter a valid whole-number quantity.");
      return;
    }

    const material = materials.find((item) => item.id === selectedId);
    const pigment = pigments.find((item) => item.id === selectedId);
    const item = material ?? pigment;

    if (!item || item.quantity < amount) {
      setFormError("The adjustment exceeds the available stock.");
      return;
    }

    setSaving(true);

    try {
      const batch = writeBatch(db);
      const collectionName = material ? "inventory" : "pigments";
      const itemRef = doc(db, collectionName, selectedId);

      batch.update(itemRef, { quantity: increment(-amount) });

      const historyRef = doc(collection(db, "inventoryHistory"));
      batch.set(historyRef, {
        item: material?.name ?? `${pigment?.name} Pigment`,
        itemId: selectedId,
        action: "Adjustment",
        quantity: -amount,
        cost: 0,
        reason: adjustmentReason,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setModal(null);
    } catch (error) {
      console.error("Stock adjustment failed:", error);
      setFormError("Could not save stock usage. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const allStockItems = [
    ...materials.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    })),
    ...pigments.map((item) => ({
      id: item.id,
      name: `${item.name} Pigment`,
      quantity: item.quantity,
      unit: "estimated keychains",
      category: "Material",
    })),
  ];

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#159eaa]">
            Stock Management
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Inventory
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Track supplies, purchase costs, and remaining stock.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-gray-50"
          >
            <History size={17} /> History
          </button>
          <button
            type="button"
            onClick={openRestock}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#88f0fa] px-4 py-3 text-sm font-bold text-gray-900 transition hover:bg-[#65e5f0]"
          >
            <Plus size={17} /> Restock
          </button>
        </div>
      </header>

      {dbError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {dbError}
        </div>
      )}

      {loading && (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Loading inventory from Firestore...
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Boxes size={20} />}
          title="Tracked Items"
          value={String(materials.length + pigments.length)}
          detail="Materials and equipment"
        />
        <SummaryCard
          icon={<Package size={20} />}
          title="NFC Tags"
          value={`${materials.find((item) => item.id === "nfc")?.quantity ?? 0} pcs`}
          detail="Current available stock"
        />
        <SummaryCard
          icon={<AlertTriangle size={20} />}
          title="Low Stock"
          value={String(lowStockCount)}
          detail="At or below 20% capacity"
        />
        <SummaryCard
          icon={<TrendingDown size={20} />}
          title="Pigment Colors"
          value={String(pigments.length)}
          detail="Tracked individually"
        />
      </section>

      {showHistory && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-bold">Stock Activity History</h2>
          {history.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              No activity recorded yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-gray-400">
                  <tr>
                    <th className="py-3 pr-4">Activity</th>
                    <th className="py-3 pr-4">Quantity</th>
                    <th className="py-3 pr-4">Cost</th>
                    <th className="py-3 pr-4">Reason</th>
                    <th className="py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => (
                    <tr key={record.id} className="border-t border-gray-100">
                      <td className="py-3 pr-4 font-medium">{record.item}</td>
                      <td className="py-3 pr-4">
                        {record.quantity > 0 ? "+" : ""}
                        {record.quantity}
                      </td>
                      <td className="py-3 pr-4">{money(record.cost)}</td>
                      <td className="py-3 pr-4 text-gray-500">{record.reason}</td>
                      <td className="py-3 text-gray-500">{record.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="flex flex-col justify-between gap-4 border-b border-gray-100 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold">Materials & Equipment</h2>
            <p className="mt-1 text-xs text-gray-400">
              Live stock and purchase cost.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3">
              <Search size={17} className="text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items..."
                className="min-w-0 py-2.5 text-sm outline-none"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#55dce8]"
            >
              <option>All</option>
              <option>Materials</option>
              <option>Equipment</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[740px] text-left">
            <thead className="bg-[#fafafa] text-xs font-semibold text-gray-500">
              <tr>
                <th className="px-5 py-4">Item</th>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4">Remaining</th>
                <th className="px-5 py-4">Purchase Cost</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMaterials.map((item) => {
                const low =
                  item.category === "Material" &&
                  item.capacity !== undefined &&
                  item.capacity > 0 &&
                  item.quantity / item.capacity <= 0.2;

                return (
                  <tr key={item.id} className="hover:bg-gray-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e7fbfd] text-[#159eaa]">
                          <Package size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.name}</p>
                          {item.note && (
                            <p className="mt-1 max-w-xs text-xs text-gray-400">{item.note}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-500">{item.category}</td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold">{item.quantity}</p>
                      <p className="text-xs text-gray-400">{item.unit}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold">
                        {item.restockCost > 0 ? money(item.restockCost) : "Not set"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.unitCost > 0 ? `${money(item.unitCost)} per unit` : "Cost not provided"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                      }`}>
                        {low ? "Low stock" : "In stock"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                    No matching inventory items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold">Color Pigments</h2>
          <p className="mt-1 text-sm text-gray-500">
            ₱356 for the original seven-color bundle. Approximately ₱50.86 allocated per color.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            The 50-keychain capacity per color is an estimate until actual remaining capacity is confirmed.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pigments.map((pigment) => (
            <article key={pigment.id} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`h-4 w-4 rounded-full border border-gray-200 ${pigmentDot(pigment.name)}`} />
                  <h3 className="font-semibold">{pigment.name}</h3>
                </div>
                <span className="rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-500">Pigment</span>
              </div>
              <p className="mt-5 text-2xl font-bold">{pigment.quantity}</p>
              <p className="mt-1 text-xs text-gray-400">Estimated keychains remaining</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#88f0fa]" style={{ width: `${Math.min(100, pigment.quantity / 50 * 100)}%` }} />
              </div>
              <p className="mt-3 text-xs text-gray-500">Allocated cost: {money(pigment.unitCost)}</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(pigment.id);
                  setAdjustment("1");
                  setAdjustmentReason("Used in production");
                  setFormError("");
                  setModal("adjust");
                }}
                className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold transition hover:border-[#88f0fa] hover:bg-[#f5feff]"
              >
                Record usage
              </button>
            </article>
          ))}
        </div>
      </section>

      <p className="rounded-xl bg-gray-100 p-4 text-xs leading-5 text-gray-500">
        Inventory is connected to Firestore. Restocks and stock adjustments are saved to the database and appear in activity history.
      </p>

      {modal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setModal(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {modal === "restock" ? "Restock Inventory" : "Record Stock Usage"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {modal === "restock" ? "Record a purchase and update stock." : "Deduct stock used or lost."}
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setModal(null)}
                aria-label="Close dialog"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={modal === "restock" ? handleRestock : handleAdjustment} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold">Inventory item</label>
                <select
                  value={selectedId}
                  onChange={(e) => selectRestockItem(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#55dce8]"
                >
                  {(modal === "restock"
                    ? materials.filter((item) => item.category === "Material")
                    : allStockItems
                  ).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {modal === "restock" && selectedId === "nfc" && (
                <div>
                  <label className="mb-2 block text-sm font-semibold">NFC purchase batch</label>
                  <div className="grid grid-cols-3 gap-2">
                    {nfcBatches.map((batch) => (
                      <button
                        key={batch.quantity}
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setRestockQuantity(String(batch.quantity));
                          setRestockCost(String(batch.cost));
                        }}
                        className={`rounded-xl border p-3 text-left transition ${
                          restockQuantity === String(batch.quantity) && restockCost === String(batch.cost)
                            ? "border-[#45d9e5] bg-[#e7fbfd]"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="block text-sm font-bold">{batch.quantity} pcs</span>
                        <span className="mt-1 block text-xs text-gray-500">{money(batch.cost)}</span>
                        <span className="mt-1 block text-[10px] text-gray-400">{money(batch.cost / batch.quantity)}/tag</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  {modal === "restock" ? "Quantity purchased" : "Quantity to deduct"}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={modal === "restock" ? restockQuantity : adjustment}
                  disabled={saving}
                  onChange={(e) => {
                    if (modal === "restock") {
                      setRestockQuantity(e.target.value);
                      if (selectedId === "nfc") setRestockCost("");
                    } else {
                      setAdjustment(e.target.value);
                    }
                  }}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#55dce8]"
                />
              </div>

              {modal === "restock" ? (
                <div>
                  <label className="mb-2 block text-sm font-semibold">Total purchase cost (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={restockCost}
                    disabled={saving}
                    onChange={(e) => setRestockCost(e.target.value)}
                    required
                    className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#55dce8]"
                  />
                  {selectedId === "nfc" && (
                    <p className="mt-2 text-xs text-gray-400">NFC batches must match one of the listed package options.</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-sm font-semibold">Reason</label>
                  <select
                    value={adjustmentReason}
                    disabled={saving}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#55dce8]"
                  >
                    <option>Used in production</option>
                    <option>Rejected product</option>
                    <option>Damaged or lost</option>
                    <option>Stock correction</option>
                  </select>
                </div>
              )}

              {formError && (
                <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{formError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModal(null)}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#88f0fa] px-4 py-3 text-sm font-bold text-gray-900 hover:bg-[#65e5f0] disabled:opacity-50"
                >
                  {saving ? "Saving..." : modal === "restock" ? "Save Purchase" : "Record Usage"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className="rounded-xl bg-[#e7fbfd] p-3 text-[#159eaa]">{icon}</div>
      </div>
      <p className="mt-4 text-xs text-gray-400">{detail}</p>
    </article>
  );
}

function pigmentDot(name: string) {
  const classes: Record<string, string> = {
    Blue: "bg-blue-500",
    Red: "bg-red-500",
    Pink: "bg-pink-300",
    Purple: "bg-purple-500",
    White: "bg-white",
    Gray: "bg-gray-500",
    Black: "bg-gray-900",
  };

  return classes[name] ?? "bg-gray-300";
}
