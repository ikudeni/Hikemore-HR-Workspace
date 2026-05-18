import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const docRef = doc(db, 'settings', 'overtimeRecords');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const data = snap.data();
    const records = data.records || [];
    const someMagang = records.filter((r: any) => ["Astrid", "Thessalonika", "Fakih", "Noval"].some(n => r.name.includes(n)));
    console.log("Magang records:", someMagang.map((r: any) => ({ name: r.name, status: r.status })));
  }
}
run();
