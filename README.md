# Export to Ghostfolio

[![Shield: Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-Support-yellow?logo=buymeacoffee)](https://www.buymeacoffee.com/dickw0lff)


This tool allows you to convert a multiple transaction exports (CSV) to an import file that can be read by [Ghostfolio](https://github.com/ghostfolio/ghostfolio/). Currently there is support for:

- [Trading 212](https://trading212.com)
- [DEGIRO](https://degiro.com)


**NOTICE: It is recommended to only use this when you have a local instance of Ghostfolio, so you don't spam the online service hosted by Ghostfolio!**

## How to use

### Download transaction export

#### Trading 212

Go to Trading 212 and create an export file (via History > Download icon). Choose the period from which you wish to export your history and click download.

#### DEGIRO

Go to DEGIRO and create an export file (via Inbox > Account Overview, see image below). Choose the period from which you wish to export your history and click download.

![image](https://github.com/dickwolff/Export-To-Ghostfolio/assets/5620002/ff48baf9-5725-4efc-a9ec-fbbf0472a656)

### Use the tool

Next, clone the repo to your local machine and open with your editor of choice (e.g. Visual Studio Code).

Run `npm install` to install all required packages.

The repository contains a sample `.env` file. Rename this from `.env.sample`.

- Put your Trading 212 export file path in the `INPUT_FILE` variable.
- Put the Ghostfolio account name where you want your transactions to end up at in `GHOSTFOLIO_ACCOUNT_ID` 
  - This can be retrieved by going to Accounts > select your account and copying the ID from the URL 
  
    ![image](https://user-images.githubusercontent.com/5620002/203353840-f5db7323-fb2f-4f4f-befc-e4e340466a74.png)
- Optionally you can enable debug logging by setting the `DEBUG_LOGGING` variable to `TRUE`.

You can now run `npm run start [exporttype]`. See the table with run commands below. The tool will open your export and will convert this. It retrieves the tickers that are supported YAHOO Finance (e.g. for European stocks like `ASML`, it will retrieve `ASML.AS` by the corresponding ISIN). 

| Exporter | Run command |
| --- | --- |
| Trading 212 | `run start trading212` |
| DEGIRO | `run start degiro` |
  
The export file can now be imported in Ghostfolio by going to Portfolio > Activities and pressing the 3 dots at the top right of the table. Since Ghostfolio 1.221.0, you can now preview the import and validate the data has been converted correctly. When it is to your satisfaction, press import to add the activities to your portfolio.

![image](https://user-images.githubusercontent.com/5620002/203356387-1f42ca31-7cff-44a5-8f6c-84045cf7101e.png)

-------

## Potential future development

The list below contains some plans of how this project could be improved. Options are to be validated on their feasibility.

- [x] More robust header checking
- [ ] More user friendly import (not via command line)
- [ ] Connect directly to Trading 212 API (removing the manual export step)
- [ ] Import directly into Ghostfolio via the API (removing the manual import step)
