import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    const docRef = doc(db, 'settings', 'overtimeRecords');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const records = data.records;
      if (records) {
        const updated = records.map((r: any) => {
           if (!r.status) {
              const nameLower = r.name.toLowerCase();
              if (nameLower.includes("dzul") || nameLower.includes("riski")) {
                 r.status = "Karyawan";
              } else {
                 r.status = "Karyawan"; // default fallback for now if they didn't specify? Or let's see their actual data in Employees.
              }
           }
           return r;
        });
        await updateDoc(docRef, { records: updated });
        console.log("Updated records!");
      }
    }
  } catch (e) {
    console.error(e);
  }
}
run();
