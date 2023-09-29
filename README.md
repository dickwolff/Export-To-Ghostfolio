# Trading 212 to Ghostfolio

[![Shield: Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-Support-yellow?logo=buymeacoffee)](https://www.buymeacoffee.com/dickw0lff)


This tool allows you to convert a [Trading 212](https://trading212.com) transaction export (CSV) to an import file that can be read by [Ghostfolio](https://github.com/ghostfolio/ghostfolio/). 

**NOTICE: It is recommended to only use this when you have a local instance of Ghostfolio, so you don't spam the online service hosted by Ghostfolio!**

## How to use

Go to Trading 212 and create an export file (via History > Download icon). Choose the period from which you wish to export your history and click download.

Next, clone the repo to your local machine and open with your editor of choice (e.g. Visual Studio Code).

Run `npm install` to install all required packages.

The repository contains a sample `.env` file. Rename this from `.env.sample`.

- Put your Trading 212 export file path in the `INPUT_FILE` variable.
- Put the Ghostfolio account name where you want your transactions to end up at in `GHOSTFOLIO_ACCOUNT_ID` 
  - This can be retrieved by going to Accounts > select your account and copying the ID from the URL 
  
    ![image](https://user-images.githubusercontent.com/5620002/203353840-f5db7323-fb2f-4f4f-befc-e4e340466a74.png)
- Put your local Ghostfolio endpoint in `GHOSTFOLIO_API_URL`. This is your hostname/ip address with port number (e.g. `http://192.168.1.55:3333`)
- Put your Ghostfolio secret in `GHOSTFOLIO_SECRET`. The secret is what you use to log in to Ghostfolio.
  - This is used to generate a bearer token, which is used to retrieve ticker information via Ghostfolio's Lookup API.
  
You can now run `npm run start`. The tool will open your Trading 212 export and will convert this. It retrieves the tickers that are supported YAHOO Finance (e.g. for European stocks like `ASML`, it will retrieve `ASML.AS` by the corresponding ISIN). 
  
The export file can now be imported in Ghostfolio by going to Portfolio > Activities and pressing the 3 dots at the top right of the table. Since Ghostfolio 1.221.0, you can now preview the import and validate the data has been converted correctly. When it is to your satisfaction, press import to add the activities to your portfolio.

![image](https://user-images.githubusercontent.com/5620002/203356387-1f42ca31-7cff-44a5-8f6c-84045cf7101e.png)

-------

## Potential future development

The list below contains some plans of how this project could be improved. Options are to be validated on their feasibility.

- [ ] More robust header checking
- [ ] More user friendly import (not via command line)
- [ ] Connect directly to Trading 212 API (removing the manual export step)
- [ ] Import directly into Ghostfolio via the API (removing the manual import step)
