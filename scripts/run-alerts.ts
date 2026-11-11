import { runAlerts } from "../src/lib/alerts";
runAlerts().then((r) => { console.log(r); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
