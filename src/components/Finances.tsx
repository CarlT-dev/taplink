
import { useEffect, useState, type FormEvent } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Wallet,
  ReceiptText,
  X,
  CircleDollarSign,
} from "lucide-react";

type Transaction = {
  id: string;
  description: string;
  type: "Sale" | "Expense";
  amount: number;
  affectsCash: boolean;
  source?: string;
  date: string;
  timestamp: number;
};

const OPENING_CASH = 100;
const INITIAL_CAPITAL_SPENT = 1351;

const money = (amount: number) =>
  amount.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });

export default function Finances() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<"Sale" | "Expense">("Sale");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    // Add the historical sale once, without adding it to current cash again.
    async function seedHistoricalSale() {
      try {
        await setDoc(
          doc(db, "transactions", "historical-gray-sale"),
          {
            description: "Gray Tap Link keychain — paid and delivered",
            type: "Sale",
            amount: 100,
            affectsCash: false,
            source: "historical",
            createdAt: null,
          },
          { merge: false }
        ).catch(async (err) => {
          // If the document already exists, do not replace it.
          if (err?.code !== "already-exists") throw err;
        });
      } catch (err) {
        console.error("Historical transaction setup:", err);
        if (active) {
          setDbError(
            "Could not initialize the historical transaction. Check Firestore permissions."
          );
        }
      }
    }

    // The fixed document ID makes the historical record identifiable.
    // Read before creating it, so existing data is never overwritten.
    async function ensureHistoricalSale() {
      try {
        const { getDoc } = await import("firebase/firestore");
        const historicalRef = doc(
          db,
          "transactions",
          "historical-gray-sale"
        );
        const historicalSnapshot = await getDoc(historicalRef);

        if (!historicalSnapshot.exists()) {
          await seedHistoricalSale();
        }
      } catch (err) {
        console.error("Historical sale initialization failed:", err);
        if (active) {
          setDbError(
            "Could not initialize the historical sale. Check Firestore permissions."
          );
        }
      }
    }

    ensureHistoricalSale();

    const unsubscribe = onSnapshot(
      collection(db, "transactions"),
      (snapshot) => {
        if (!active) return;

        const records: Transaction[] = snapshot.docs.map((item) => {
          const data = item.data();
          const timestamp = data.createdAt?.toMillis?.() ?? 0;

          return {
            id: item.id,
            description: data.description ?? "Transaction",
            type: data.type === "Expense" ? "Expense" : "Sale",
            amount: Number(data.amount ?? 0),
            affectsCash: data.affectsCash === true,
            source: data.source ?? "manual",
            date: timestamp
              ? new Date(timestamp).toLocaleString()
              : "Historical record",
            timestamp,
          };
        });

        records.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(records);
        setLoading(false);
      },
      (err) => {
        console.error("Finance listener failed:", err);
        if (active) {
          setDbError(
            "Unable to load transactions. Check your Firestore connection and security rules."
          );
          setLoading(false);
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Historical sale is displayed in sales totals, but does not add cash again.
  const salesTotal = transactions
    .filter((item) => item.type === "Sale")
    .reduce((sum, item) => sum + item.amount, 0);

  const expensesTotal = transactions
    .filter((item) => item.type === "Expense")
    .reduce((sum, item) => sum + item.amount, 0);

  const cash = transactions.reduce(
    (balance, item) => {
      if (!item.affectsCash) return balance;

      return balance + (item.type === "Sale" ? item.amount : -item.amount);
    },
    OPENING_CASH
  );

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const value = Number(amount);
    const cleanDescription = description.trim();

    if (
      !cleanDescription ||
      !Number.isFinite(value) ||
      value <= 0
    ) {
      setError("Enter a description and an amount greater than zero.");
      return;
    }

    if (type === "Expense" && value > cash) {
      setError("This expense exceeds your recorded available cash.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "transactions"), {
        description: cleanDescription,
        type,
        amount: value,
        affectsCash: true,
        source: "manual",
        createdAt: serverTimestamp(),
      });

      setDescription("");
      setAmount("");
      setModalOpen(false);
    } catch (err) {
      console.error("Could not save finance transaction:", err);
      setError("Could not save the transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#159eaa]">
            Business Management
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Finances
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Track Tap Link's cash, sales, and expenses.
          </p>
        </div>

        <button
          onClick={() => {
            setError("");
            setModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#88f0fa] px-4 py-3 text-sm font-bold text-gray-900 hover:bg-[#65e5f0]"
        >
          <Plus size={17} />
          Record Transaction
        </button>
      </header>

      {dbError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {dbError}
        </p>
      )}

      {loading && (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Loading transactions from Firestore...
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon={<Wallet size={20} />}
          title="Available Business Cash"
          value={money(cash)}
          detail="Opening balance plus recorded cash movements"
        />
        <SummaryCard
          icon={<ArrowUpRight size={20} />}
          title="Recorded Sales"
          value={money(salesTotal)}
          detail="Includes the historical gray keychain sale"
        />
        <SummaryCard
          icon={<ArrowDownLeft size={20} />}
          title="Recorded Expenses"
          value={money(expensesTotal)}
          detail="Expenses recorded in Firestore"
        />
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#e7fbfd] p-3 text-[#159eaa]">
            <CircleDollarSign size={22} />
          </div>
          <div>
            <h2 className="font-bold">Capital Overview</h2>
            <p className="mt-1 text-sm text-gray-500">
              Historical investment and current cash are different figures.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Initial capital spent</p>
            <p className="mt-2 text-2xl font-bold">
              {money(INITIAL_CAPITAL_SPENT)}
            </p>
            <p className="mt-2 text-xs leading-5 text-gray-400">
              Historical spending on initial stock and supplies. It is not
              deducted again from current cash.
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-sm text-gray-500">Current cash available</p>
            <p className="mt-2 text-2xl font-bold">{money(cash)}</p>
            <p className="mt-2 text-xs leading-5 text-gray-400">
              Based on your ₱100 opening cash plus recorded cash movements.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Upgrade budget is not yet established
          </p>
          <p className="mt-1 text-sm leading-5 text-amber-800">
            Estimate essential restocking costs before deciding how much
            current cash is safe to spend on new equipment.
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-5">
          <div className="flex items-center gap-3">
            <ReceiptText size={20} className="text-[#159eaa]" />
            <div>
              <h2 className="font-bold">Transaction History</h2>
              <p className="mt-1 text-xs text-gray-400">
                Sales and expenses saved in Firestore.
              </p>
            </div>
          </div>
        </div>

        {transactions.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            No transactions recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between gap-3 p-4 sm:px-5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`rounded-xl p-3 ${
                      transaction.type === "Sale"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {transaction.type === "Sale" ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {transaction.description}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {transaction.type} · {transaction.date}
                      {transaction.source === "historical"
                        ? " · Historical"
                        : ""}
                    </p>
                  </div>
                </div>

                <p
                  className={`shrink-0 text-sm font-bold ${
                    transaction.type === "Sale"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {transaction.type === "Sale" ? "+" : "-"}
                  {money(transaction.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="rounded-xl bg-gray-100 p-4 text-xs leading-5 text-gray-500">
        Transactions are saved in Firestore and synced in real time. The
        historical sale is included in recorded sales but is not added to
        current cash a second time.
      </p>

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">Record Transaction</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Record money received or spent by the business.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                aria-label="Close"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={saveTransaction} className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Transaction type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Sale", "Expense"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={saving}
                      onClick={() => setType(option)}
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                        type === option
                          ? "border-[#45d9e5] bg-[#e7fbfd]"
                          : "border-gray-200"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Description
                </label>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    type === "Sale"
                      ? "e.g. Blue keychain sale"
                      : "e.g. NFC tag restock"
                  }
                  disabled={saving}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#55dce8]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Amount (₱)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  disabled={saving}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none focus:border-[#55dce8]"
                />
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#88f0fa] px-4 py-3 text-sm font-bold text-gray-900 hover:bg-[#65e5f0] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Transaction"}
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
        <div className="rounded-xl bg-[#e7fbfd] p-3 text-[#159eaa]">
          {icon}
        </div>
      </div>
      <p className="mt-4 text-xs text-gray-400">{detail}</p>
    </article>
  );
}
