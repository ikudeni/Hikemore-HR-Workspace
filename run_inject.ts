import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function run() {
  const ref = doc(db, 'settings', 'recruitmentData');
  const snap = await getDoc(ref);
  const data = snap.data();
  if (data) {
    let schedules = data.schedules || [];
    let jobListings = data.jobListings || [];
    let candidates = data.candidates || [];
    
    // Find job "Helper Cutting"
    let job = jobListings.find(j => j.title.toLowerCase().includes('helper cutting'));
    if (!job) {
       console.log('No Helper Cutting job found.');
    } else {
       console.log("Job found:" + job.title);
    }
    
    let cand1 = candidates.filter(c => job ? c.jobId === job.id : c.name === "Dummy 1")[0];
    let cand2 = candidates.filter(c => job ? c.jobId === job.id : c.name === "Dummy 2")[1];
    if (!cand2) cand2 = candidates.filter(c => job ? c.jobId === job.id : false)[0];

    if (!cand1) {
       console.log("Create dummy candidates for helper cutting if job exists");
       cand1 = {
         id: "HELPERC1",
         name: "Budi (Helper Cutting)",
         jobId: job ? job.id : 999,
         stageId: 1,
         applyDate: new Date().toISOString().split('T')[0]
       };
       cand2 = {
         id: "HELPERC2",
         name: "Agus (Helper Cutting)",
         jobId: job ? job.id : 999,
         stageId: 1,
         applyDate: new Date().toISOString().split('T')[0]
       };
       candidates.push(cand1);
       candidates.push(cand2);
    }
    
    if (cand1) {
       // Avoid duplication
       if (!schedules.some(s => s.candidateId === cand1.id && s.attendance === 'Tidak Hadir' && s.date === new Date().toISOString().split('T')[0])) {
           schedules.push({
              id: Date.now().toString() + "_S1",
              candidateId: cand1.id,
              candidateName: cand1.name,
              title: "Interview Offline - " + cand1.name,
              date: new Date().toISOString().split('T')[0],
              startTime: "13:00",
              endTime: "14:00",
              type: "Interview Offline",
              attendance: "Tidak Hadir",
              interviewer: "Deni Akbar Saputro"
           });
           console.log("Added sched 1 for " + cand1.name);
       } else {
           console.log("Sched 1 already exists");
       }
    }
    if (cand2 && cand2.id !== cand1.id) {
       if (!schedules.some(s => s.candidateId === cand2.id && s.attendance === 'Tidak Hadir' && s.date === new Date().toISOString().split('T')[0])) {
           schedules.push({
              id: Date.now().toString() + "_S2",
              candidateId: cand2.id,
              candidateName: cand2.name,
              title: "Interview Offline - " + cand2.name,
              date: new Date().toISOString().split('T')[0],
              startTime: "14:00",
              endTime: "15:00",
              type: "Interview Offline",
              attendance: "Tidak Hadir",
              interviewer: "Deni Akbar Saputro"
           });
           console.log("Added sched 2 for " + cand2.name);
       } else {
           console.log("Sched 2 already exists");
       }
    }
    
    await setDoc(ref, { schedules, candidates }, { merge: true });
    console.log("DONE!");
    process.exit(0);
  } else {
    console.log("No data");
    process.exit(1);
  }
}

run().catch(console.error);
