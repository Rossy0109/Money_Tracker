const DB_NAME = "ahmed_finance_offline_db";
const STORE_NAME = "offline_transactions";
const DB_VERSION = 1;

export interface QueuedOfflineTransaction {
  id: string; // client uuid
  projectId: number;
  type: "income" | "expense";
  amount: number;
  categoryId: number;
  accountId?: number;
  paymentMethod: string;
  note?: string;
  occurredAt: string;
  createdAt: number;
  status?: "pending" | "syncing" | "failed";
  lastError?: string;
}

function notifyQueueChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-queue-changed"));
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueOfflineTransaction(
  item: Omit<QueuedOfflineTransaction, "id" | "createdAt">
): Promise<QueuedOfflineTransaction> {
  const db = await openDatabase();
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const record: QueuedOfflineTransaction = {
    ...item,
    id,
    createdAt: Date.now(),
    status: item.status || "pending",
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);

    req.onsuccess = () => {
      notifyQueueChange();
      resolve(record);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function updateQueuedOfflineTransaction(
  id: string,
  patch: Partial<Omit<QueuedOfflineTransaction, "id">>
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const existing = getReq.result as QueuedOfflineTransaction | undefined;
        if (!existing) {
          resolve();
          return;
        }
        const updated: QueuedOfflineTransaction = { ...existing, ...patch };
        const putReq = store.put(updated);
        putReq.onsuccess = () => {
          notifyQueueChange();
          resolve();
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {
    // Ignore offline db errors
  }
}

export async function getQueuedOfflineTransactions(): Promise<
  QueuedOfflineTransaction[]
> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removeQueuedOfflineTransaction(
  id: string
): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        notifyQueueChange();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore offline db errors
  }
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => {
        notifyQueueChange();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }
}

export async function getOfflineQueueStats(projectId?: number): Promise<{
  total: number;
  pending: number;
  failed: number;
}> {
  const all = await getQueuedOfflineTransactions();
  const filtered = projectId ? all.filter(t => t.projectId === projectId) : all;
  const failed = filtered.filter(t => t.status === "failed").length;
  const pending = filtered.length - failed;
  return {
    total: filtered.length,
    pending,
    failed,
  };
}
