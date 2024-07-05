import Trading212ScheduledService from "./trading212ScheduledService";

export default class ScheduledService {

    public async run() {

        await new Trading212ScheduledService().run();
    }
}
