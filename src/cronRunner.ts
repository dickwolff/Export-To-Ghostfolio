import dotenv from "dotenv";
import cron from "node-cron";
import ScheduledService from "./scheduledServices/scheduledService";

dotenv.config();

cron.schedule('50 23 * * *', async () => {
    console.log("[i] Starting Cron Runner..");

    await new ScheduledService().run();
});

console.log("[i] Scheduled Cron Runner to run at 23:50!");
