
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  runTransaction,
  increment,
} from "firebase/firestore";
import {
  Check,
  ClipboardList,
  Clock,
  CreditCard,
  Link as LinkIcon,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { db } from "../firebase";

const PRICE = 100;

const COLORS = [
  "Black",
  "Blue",
  "Gray",
  "Pink",
  "Purple",
  "White",
];

type ItemStatus = "Unfinished" | "Finished";
type PaymentStatus = "Unpaid" | "Paid";

type OrderItem = {
  color: string;
  link: string;
  quantity: number;
};

type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  itemStatus: ItemStatus;
  paymentStatus: PaymentStatus;
  createdAt?: { toDate: () => Date };
};

export default function Operations() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [selectedColor, setSelectedColor] = useState("Purple");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<OrderItem[]>([]);

  const [itemStatus, setItemStatus] =
    useState<ItemStatus>("Unfinished");
  const [paymentStatus, setPaymentStatus] =
    useState<PaymentStatus>("Unpaid");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "orders"),
      (snapshot) => {
        const records = snapshot.docs.map((snapshotDoc) => {
          const data = snapshotDoc.data();

          return {
            id: snapshotDoc.id,
            items: (data.items ?? []) as OrderItem[],
            total:
              typeof data.total === "number"
                ? data.total
                : (data.items ?? []).reduce(
                    (sum: number, item: OrderItem) =>
                      sum + item.quantity * PRICE,
                    0
                  ),
            itemStatus: (data.itemStatus ??
              "Unfinished") as ItemStatus,
            paymentStatus: (data.paymentStatus ??
              "Unpaid") as PaymentStatus,
            createdAt: data.createdAt,
          };
        });

        records.sort(
          (a, b) =>
            (b.createdAt?.toDate().getTime() ?? 0) -
            (a.createdAt?.toDate().getTime() ?? 0)
        );

        setOrders(records);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error(err);
        setError(
          "Unable to load orders. Check your Firestore configuration and security rules."
        );
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.quantity * PRICE,
        0
      ),
    [cart]
  );

  function addItem() {
    if (!link.trim()) {
      setError("Enter the link you want written to the NFC.");
      return;
    }

    if (!/^https?:\/\/\S+$/i.test(link.trim())) {
      setError("Enter a valid link starting with https:// or http://.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setError("Quantity must be at least 1.");
      return;
    }

    setCart((current) => [
      ...current,
      {
        color: selectedColor,
        link: link.trim(),
        quantity,
      },
    ]);

    setLink("");
    setQuantity(1);
    setError("");
  }

  function removeItem(index: number) {
    setCart((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
  }

  async function confirmOrder() {
    if (cart.length === 0) {
      setError("Add at least one item before confirming.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await addDoc(collection(db, "orders"), {
        items: cart,
        total: cartTotal,
        itemStatus,
        paymentStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCart([]);
      setItemStatus("Unfinished");
      setPaymentStatus("Unpaid");
    } catch (err) {
      console.error(err);
      setError("Could not save the order. Check your Firebase permissions.");
    } finally {
      setSaving(false);
    }
  }

  
async function updateOrder(
  order: Order,
  changes: Partial<Pick<Order, "itemStatus" | "paymentStatus">>
) {
  try {
    const orderRef = doc(db, "orders", order.id);
    const saleRef = doc(db, "transactions", `sale_${order.id}`);

    await runTransaction(db, async (transaction) => {
      // Always read the order and payment record first.
      const orderSnapshot = await transaction.get(orderRef);
      const saleSnapshot = await transaction.get(saleRef);

      if (!orderSnapshot.exists()) {
        throw new Error("Order not found.");
      }

      const current = orderSnapshot.data();
      const previousPayment = current.paymentStatus ?? "Unpaid";
      const nextPayment = changes.paymentStatus ?? previousPayment;
      const previousStatus = current.itemStatus ?? "Unfinished";
      const nextStatus = changes.itemStatus ?? previousStatus;

      // Deduct stock only when production changes to Finished for the first time.
      const shouldDeductStock =
        previousStatus !== "Finished" &&
        nextStatus === "Finished" &&
        current.inventoryDeducted !== true;

      const deductions = new Map<
        string,
        {
          collectionName: "inventory" | "pigments";
          id: string;
          name: string;
          quantity: number;
        }
      >();

      if (shouldDeductStock) {
        const items = (current.items ?? []) as OrderItem[];
        let totalQuantity = 0;

        for (const item of items) {
          if (
            !Number.isInteger(item.quantity) ||
            item.quantity <= 0
          ) {
            throw new Error("An order contains an invalid quantity.");
          }

          totalQuantity += item.quantity;

          const pigmentId = item.color.toLowerCase();

          const existing = deductions.get(`pigments/${pigmentId}`);

          deductions.set(`pigments/${pigmentId}`, {
            collectionName: "pigments",
            id: pigmentId,
            name: `${item.color} Pigment`,
            quantity: (existing?.quantity ?? 0) + item.quantity,
          });
        }

        if (totalQuantity <= 0) {
          throw new Error("This order has no valid items.");
        }

        const baseItems = [
          { id: "resin", name: "Epoxy Resin" },
          { id: "nfc", name: "NFC Tags" },
          { id: "rings", name: "Keychain Rings" },
          { id: "packaging", name: "Plastic Packaging" },
        ];

        for (const item of baseItems) {
          deductions.set(`inventory/${item.id}`, {
            collectionName: "inventory",
            id: item.id,
            name: item.name,
            quantity: totalQuantity,
          });
        }
      }

      // Read every required stock document before performing any writes.
      const stockRecords = [];

      for (const deduction of deductions.values()) {
        const ref = doc(
          db,
          deduction.collectionName,
          deduction.id
        );

        const snapshot = await transaction.get(ref);

        if (!snapshot.exists()) {
          throw new Error(`${deduction.name} is missing from inventory.`);
        }

        const available = Number(snapshot.data().quantity ?? 0);

        if (available < deduction.quantity) {
          throw new Error(
            `Not enough ${deduction.name}. Available: ${available}; required: ${deduction.quantity}.`
          );
        }

        stockRecords.push({ ref, deduction });
      }

      // All reads are complete. Apply the order update.
      transaction.update(orderRef, {
        ...changes,
        ...(shouldDeductStock ? { inventoryDeducted: true } : {}),
        updatedAt: serverTimestamp(),
      });

      // Deduct stock and record each deduction in inventory history.
    for (const { ref, deduction } of stockRecords) {
    transaction.update(ref, {
        quantity: increment(-deduction.quantity),
    });

    const historyRef = doc(collection(db, "inventoryHistory"));

    transaction.set(historyRef, {
        item: deduction.name,
        itemId: deduction.id,
        action: "Production",
        quantity: -deduction.quantity,
        cost: 0,
        reason: `Order #${order.id.slice(-6).toUpperCase()} production`,
        orderId: order.id,
        createdAt: serverTimestamp(),
    });
    }

      // Record received money only on the first Unpaid -> Paid transition.
      if (
        previousPayment !== "Paid" &&
        nextPayment === "Paid" &&
        !saleSnapshot.exists()
      ) {
        transaction.set(saleRef, {
          description: `Tap Link order #${order.id.slice(-6).toUpperCase()}`,
          type: "Sale",
          amount: Number(current.total ?? order.total),
          affectsCash: true,
          source: "order",
          orderId: order.id,
          createdAt: serverTimestamp(),
        });
      }
    });

    setError("");
  } catch (err) {
    console.error("Order update failed:", err);
    setError(
      err instanceof Error
        ? err.message
        : "Could not update the order. Please try again."
    );
  }
}


  const visibleOrders = orders.filter((order) => {
    if (filter === "All") return true;
    if (filter === "Finished") return order.itemStatus === "Finished";
    if (filter === "Unfinished") return order.itemStatus === "Unfinished";
    if (filter === "Paid") return order.paymentStatus === "Paid";
    if (filter === "Unpaid") return order.paymentStatus === "Unpaid";
    return true;
  });

  const totalUnits = orders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );

  const unpaidAmount = orders
    .filter((order) => order.paymentStatus === "Unpaid")
    .reduce((sum, order) => sum + order.total, 0);

  const peso = (amount: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <div className="space-y-6 text-gray-800">
      <header>
        <p className="text-sm font-semibold text-violet-600">
          TAP LINK BUSINESS
        </p>
        <h1 className="mt-1 text-2xl font-bold">Operations & Checkout</h1>
        <p className="mt-1 text-sm text-gray-500">
          Select a keychain, enter its NFC link, and confirm the order.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <ClipboardList className="text-violet-600" size={22} />
          <p className="mt-3 text-sm text-gray-500">Orders</p>
          <p className="text-2xl font-bold">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <Package className="text-blue-600" size={22} />
          <p className="mt-3 text-sm text-gray-500">Keychains ordered</p>
          <p className="text-2xl font-bold">{totalUnits}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <CreditCard className="text-amber-600" size={22} />
          <p className="mt-3 text-sm text-gray-500">Unpaid order value</p>
          <p className="text-2xl font-bold">{peso(unpaidAmount)}</p>
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="text-violet-600" size={21} />
            <h2 className="text-lg font-bold">Choose an item</h2>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Tap a color card to select your keychain design.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {COLORS.map((color) => {
              const selected = selectedColor === color;

              return (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`relative rounded-xl border p-4 text-left transition ${
                    selected
                      ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600"
                      : "border-gray-200 hover:border-violet-300"
                  }`}
                >
                  <div
                    className={`mb-3 h-9 w-9 rounded-full border border-black/10 ${
                      color === "Black"
                        ? "bg-black"
                        : color === "Blue"
                          ? "bg-blue-500"
                          : color === "Gray"
                            ? "bg-gray-400"
                            : color === "Pink"
                              ? "bg-pink-300"
                              : color === "Purple"
                                ? "bg-purple-500"
                                : "bg-white"
                    }`}
                  />
                  <p className="font-semibold">{color}</p>
                  <p className="mt-1 text-sm text-gray-500">
                    {peso(PRICE)} / piece
                  </p>
                  {selected && (
                    <Check
                      size={17}
                      className="absolute right-3 top-3 text-violet-600"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 border-t border-gray-100 pt-5">
            <label className="block text-sm font-semibold">
              <span className="flex items-center gap-2">
                <LinkIcon size={17} />
                Link to write on the NFC
              </span>
              <input
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://instagram.com/username"
                className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 font-normal outline-none focus:border-violet-500"
              />
            </label>

            <div className="mt-4 flex items-end gap-3">
              <label className="w-28 text-sm font-semibold">
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(Math.max(1, Number(event.target.value) || 1))
                  }
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3"
                />
              </label>

              <button
                onClick={addItem}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700"
              >
                <Plus size={18} />
                Add item
              </button>
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 xl:sticky xl:top-5">
          <div className="flex items-center gap-2">
            <CreditCard className="text-violet-600" size={21} />
            <h2 className="text-lg font-bold">Confirm order</h2>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            Review the items before saving.
          </p>

          <div className="mt-4 space-y-3">
            {cart.length === 0 ? (
              <div className="rounded-xl bg-gray-50 px-4 py-8 text-center">
                <ShoppingBag
                  className="mx-auto text-gray-300"
                  size={28}
                />
                <p className="mt-2 text-sm text-gray-500">
                  No items added yet.
                </p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={`${item.color}-${index}`}
                  className="rounded-xl border border-gray-200 p-3"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {item.color} Tap Link
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Quantity: {item.quantity}
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="self-start rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="mt-2 break-all text-xs text-violet-700">
                    {item.link}
                  </p>
                  <p className="mt-2 text-right font-semibold">
                    {peso(item.quantity * PRICE)}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 border-t border-dashed border-gray-200 pt-4">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Items</span>
              <span>
                {cart.reduce((sum, item) => sum + item.quantity, 0)} pcs
              </span>
            </div>
            <div className="mt-3 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold">{peso(cartTotal)}</span>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-semibold">
              Production status
              <select
                value={itemStatus}
                onChange={(event) =>
                  setItemStatus(event.target.value as ItemStatus)
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3"
              >
                <option value="Unfinished">Unfinished</option>
                <option value="Finished">Finished</option>
              </select>
            </label>

            <label className="block text-sm font-semibold">
              Payment status
              <select
                value={paymentStatus}
                onChange={(event) =>
                  setPaymentStatus(event.target.value as PaymentStatus)
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-3"
              >
                <option value="Unpaid">Unpaid</option>
                <option value="Paid">Paid</option>
              </select>
            </label>

            <button
              onClick={confirmOrder}
              disabled={saving || cart.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={18} />
              {saving ? "Saving..." : "Confirm & save order"}
            </button>
          </div>
        </aside>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold">Confirmed orders</h2>
            <p className="mt-1 text-sm text-gray-500">
              Orders saved in Firestore appear here automatically.
            </p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm"
          >
            <option>All</option>
            <option>Unfinished</option>
            <option>Finished</option>
            <option>Unpaid</option>
            <option>Paid</option>
          </select>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Loading orders...
          </p>
        ) : visibleOrders.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="mx-auto text-gray-300" size={30} />
            <p className="mt-2 font-semibold">No confirmed orders yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Add an item and confirm it to create your first order.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {visibleOrders.map((order) => (
              <article
                key={order.id}
                className="rounded-xl border border-gray-200 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      Order #{order.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {order.createdAt
                        ? order.createdAt.toDate().toLocaleString()
                        : "Recently created"}
                    </p>
                  </div>
                  <p className="text-lg font-bold">{peso(order.total)}</p>
                </div>

                <div className="mt-3 space-y-2">
                  {order.items.map((item, index) => (
                    <div
                      key={`${item.color}-${index}`}
                      className="rounded-lg bg-gray-50 p-3"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {item.color} · {item.quantity} pc(s)
                        </p>
                        <p className="text-sm">
                          {peso(item.quantity * PRICE)}
                        </p>
                      </div>
                      <p className="mt-1 break-all text-xs text-violet-700">
                        {item.link}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-gray-500">
                    Production
                    <select
                      value={order.itemStatus}
                      onChange={(event) =>
                        updateOrder(order, {
                          itemStatus: event.target.value as ItemStatus,
                        })
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800"
                    >
                      <option value="Unfinished">Unfinished</option>
                      <option value="Finished">Finished</option>
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-gray-500">
                    Payment
                    <select
                      value={order.paymentStatus}
                      onChange={(event) =>
                        updateOrder(order, {
                          paymentStatus: event.target.value as PaymentStatus,
                        })
                      }
                      className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800"
                    >
                      <option value="Unpaid">Unpaid</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-gray-400">
        Orders and status changes are saved in Firestore. This page does not
        yet automatically deduct inventory or record paid orders in Finances.
        Those actions should be connected through shared business transactions
        before using the app as your live bookkeeping system.
      </p>
    </div>
  );
}
