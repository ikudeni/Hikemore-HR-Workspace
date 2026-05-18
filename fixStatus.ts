import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    const empSnap = await getDocs(collection(db, 'employees'));
    const allEmployees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Create a map from name to status
    const empStatusMap = new Map();
    allEmployees.forEach(emp => {
       if (emp.name && emp.status) {
          empStatusMap.set(emp.name, emp.status);
       }
    });

    const docRef = doc(db, 'settings', 'overtimeRecords');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      const records = data.records;
      if (records) {
        const updated = records.map((r: any) => {
           if (empStatusMap.has(r.name)) {
              r.status = empStatusMap.get(r.name);
           }
           // Special case for manual override requested previously:
           // Dzul and Riski to Karyawan
           const nameLower = (r.name || "").toLowerCase();
           if (nameLower.includes("dzul") || nameLower.includes("riski")) {
              r.status = "Karyawan";
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
