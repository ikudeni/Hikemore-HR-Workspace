import fetch from "node-fetch";

const endpoint = "https://pthobimenjadirintisan.api.kledo.com/api/v1";
const token = "gajihub_pat_000Zxu_AAPsQJunKBZm9K-yCwL4IC8lE2Qdp6SeoBhQosStmLTTTX-dWcjgP09-_MeMwEnMCo5lLcekMuLgH85W";

async function probeHrEndpoints() {
  const paths = [
    "/hr/time-logs",
    "/hr/timesheets",
    "/hr/shifts",
    "/hr/attendance_logs",
    "/hr/presence_logs",
    "/hr/presence-logs",
    "/hr/attendance-settings",
    "/hr/employees",
    "/hr/leaves",
    "/hr/overtimes",
    "/hr/working-hours",
    "/hr/working_hours",
    "/hr/salaries"
  ];

  for (const path of paths) {
    const url = `${endpoint}${path}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        }
      });
      console.log(`GET ${path} | Status: ${res.status}`);
      if (res.status === 200) {
        const text = await res.text();
        console.log(`Response start (200 OK): ${text.substring(0, 300)}`);
      }
    } catch (err: any) {
      console.error(`GET ${path} failed:`, err.message);
    }
  }
}

probeHrEndpoints();
