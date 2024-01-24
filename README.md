# Export to Ghostfolio

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/dickw0lff) &nbsp;
[![Bitcoin](https://img.shields.io/badge/Bitcoin-000?style=for-the-badge&logo=bitcoin&logoColor=white)](bc1qsfkpeq8k3zav9g5w7s57gz2l84ju50uu8xqngreuxqas5tz2jrrsndgyth) &nbsp;
[![Github-sponsors](https://img.shields.io/badge/sponsor-30363D?style=for-the-badge&logo=GitHub-Sponsors&logoColor=#EA4AAA)](https://github.com/sponsors/dickwolff) 

This tool allows you to convert a multiple transaction exports (CSV) to an import file that can be read by [Ghostfolio](https://github.com/ghostfolio/ghostfolio/). Currently there is support for:

- [Trading 212](https://trading212.com)
- [DEGIRO](https://degiro.com)
- [Finpension](https://finpension.ch)
- [Swissquote](https://en.swissquote.com/)
- [Schwab]()

Is your broker not in the list? Feel free to create an [issue](https://github.com/dickwolff/Export-To-Ghostfolio/issues/new) or, even better, build it yourself and create a [pull request](https://github.com/dickwolff/Export-To-Ghostfolio/compare)!

## System requirements

The tool requires you to install the latest LTS version of Node, which you can download [here](https://nodejs.org/en/download/). The tool can run on any OS on which you can install Node.

## How to use

### Download transaction export

#### Trading 212

Login to your Trading 212 account and create an export file (via History > Download icon). Choose the period from which you wish to export your history and click download.

#### DEGIRO

Login to your DEGIRO account and create an export file (via Inbox > Account Overview, see image below). Choose the period from which you wish to export your history and click download.

![Export instructions for DEGIRO](./assets/export-degiro.jpg)

#### Finpension

Login to your Finpension account. Select your portfolio from the landing page. Then to the right of the screen select “Transactions”, on the following page to the right notice “transaction report (CSV-file)” and click to email or click to download locally.

#### Swissquote

Login to your Swissquote account. From the bar menu click on “Transactions”. Select the desired time period as well as types and then select the “export CSV” button to the right.

#### Schwab
Login to your Schwab account. Go to “Accounts” then “History”. Select the account you want to download details from. Select the “Date Range” and select “Export” (csv). Save the file.

![Export instructions for Schwab](./assets/export-schwab.jpg)

### Use the tool

Next, clone the repo to your local machine and open with your editor of choice (e.g. Visual Studio Code).

Run `npm install` to install all required packages.

The repository contains a sample `.env` file. Rename this from `.env.sample`.

- Put your export file path in the `INPUT_FILE` variable. This has to be relative to the root of the project.
- Put the Ghostfolio account name where you want your transactions to end up at in `GHOSTFOLIO_ACCOUNT_ID` 
  - This can be retrieved by going to Accounts > select your account and copying the ID from the URL 
  
    ![image](https://user-images.githubusercontent.com/5620002/203353840-f5db7323-fb2f-4f4f-befc-e4e340466a74.png)
- Optionally you can enable debug logging by setting the `DEBUG_LOGGING` variable to `TRUE`.

You can now run `npm run start [exporttype]`. See the table with run commands below. The tool will open your export and will convert this. It retrieves the symbols that are supported with YAHOO Finance (e.g. for European stocks like `ASML`, it will retrieve `ASML.AS` by the corresponding ISIN). 

| Exporter    | Run command                         |
| ----------- | ----------------------------------- |
| Trading 212 | `run start trading212` (or `t212`)  |
| DEGIRO      | `run start degiro`                  |
| Finpension  | `run start finpension` (or `fp`)    |
| Swissquote  | `run start swissquote` (or `sq`)    |
| Schwab      | `run start schwab`                  |
  
The export file can now be imported in Ghostfolio by going to Portfolio > Activities and pressing the 3 dots at the top right of the table. Since Ghostfolio 1.221.0, you can now preview the import and validate the data has been converted correctly. When it is to your satisfaction, press import to add the activities to your portfolio.

![image](https://user-images.githubusercontent.com/5620002/203356387-1f42ca31-7cff-44a5-8f6c-84045cf7101e.png)

### Caching

The tool uses `cacache` to store data retrieved from Yahoo Finance on disk. This way the load on Yahoo Finance is reduced and the tool should run faster. The cached data is stored in `tmp/e2g-cache`. If you feel you need to invalidate your cache, you can do so by removing the folder and the tool will recreate the cache when you run it the next time.
