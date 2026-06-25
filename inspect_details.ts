import fetch from "node-fetch";

const endpoint = "https://pthobimenjadirintisan.api.kledo.com/api/v1";
const token = "gajihub_pat_000Zxu_AAPsQJunKBZm9K-yCwL4IC8lE2Qdp6SeoBhQosStmLTTTX-dWcjgP09-_MeMwEnMCo5lLcekMuLgH85W";

async function inspectDetails() {
  const url = `${endpoint}/hr/schedules`;
  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });
    const json: any = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      const item = json.data[0];
      console.log("=== Employee Name:", item.name);
      console.log("=== hr_schedule_pattern keys:", item.hr_schedule_pattern ? Object.keys(item.hr_schedule_pattern) : "null");
      console.log("=== hr_schedule_pattern detail:", JSON.stringify(item.hr_schedule_pattern, null, 2));
      console.log("=== hr_careers keys:", item.hr_careers ? Object.keys(item.hr_careers) : "null");
      console.log("=== hr_payrolls keys:", item.hr_payrolls ? Object.keys(item.hr_payrolls) : "null");
      
      // Let's search if any employee has actual clock-in or check-in logs in this schedule structure
      console.log("=== Full item keys:", Object.keys(item));
    }
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}

inspectDetails();
