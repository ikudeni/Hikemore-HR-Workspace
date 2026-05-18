import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const testRef = ref(storage, "test.txt");

async function run() {
  try {
    const res = await fetch("https://firebasestorage.googleapis.com/v0/b/" + firebaseConfig.storageBucket + "/o");
    console.log("Fetch init bucket:", res.status, await res.text());
  } catch (e) {
    console.error("Failed:", e);
  }
}
run();
