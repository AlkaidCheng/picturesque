const DATABASE_NAME = "frame-match";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const INDEX_STORE = "project-index";

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve, { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error), { once: true });
  });
}

let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("IndexedDB is not available in this browser."));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(INDEX_STORE)) {
        const store = database.createObjectStore(INDEX_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });

  return databasePromise;
}

function projectMetadata(project) {
  const active = project.comparisons.find((comparison) => comparison.id === project.activeComparisonId)
    ?? project.comparisons[0]
    ?? null;
  return {
    id: project.id,
    name: project.name,
    kind: project.kind,
    updatedAt: project.updatedAt,
    collectionCount: project.collections.length,
    imageCount: project.collections.reduce((total, collection) => total + collection.images.length, 0),
    pairCount: active?.pairs.length ?? 0
  };
}

export async function saveProjectToBrowser(project) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECT_STORE, INDEX_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).put(structuredClone(project));
  transaction.objectStore(INDEX_STORE).put(projectMetadata(project));
  await transactionPromise(transaction);
  return projectMetadata(project);
}

export async function loadProjectFromBrowser(projectId) {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECT_STORE, "readonly");
  const project = await requestPromise(transaction.objectStore(PROJECT_STORE).get(projectId));
  await transactionPromise(transaction);
  return project ?? null;
}

export async function listBrowserProjects() {
  const database = await openDatabase();
  const transaction = database.transaction(INDEX_STORE, "readonly");
  const projects = await requestPromise(transaction.objectStore(INDEX_STORE).getAll());
  await transactionPromise(transaction);
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteBrowserProject(projectId) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECT_STORE, INDEX_STORE], "readwrite");
  transaction.objectStore(PROJECT_STORE).delete(projectId);
  transaction.objectStore(INDEX_STORE).delete(projectId);
  await transactionPromise(transaction);
}
