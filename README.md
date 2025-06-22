# Gmail Flight Scraper

This project is a command-line interface (CLI) tool for scraping flight information from your Gmail accounts. It authenticates with the Gmail API, searches for flight-related emails (like confirmations and e-tickets), and extracts key information into a structured format.

_This is a work in progress and is not extremely accurate. There are false positives and true negatives._

## Features

- **Interactive CLI**: Easy-to-use menu for managing accounts and fetching data.
- **Multi-Account Support**: Securely connect multiple Gmail accounts.
- **Automated OAuth 2.0 Flow**: A local server handles the authentication process seamlessly.
- **Smart Data Extraction**: Uses regex and validation to find flight details like IATA codes and flight numbers.
- **Flexible Output**: Export your flight data as either CSV or JSON, and choose to print it to the console or save it to a file.
- **Customizable Search**: Filter flights by a specific date range.

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm

### Installation & Setup

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd flights2csv
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Set up Google API Credentials:**

    - Go to the [Google Cloud Console](https://console.cloud.google.com/).
    - Create a new project.
    - Enable the **Gmail API** for your project.
    - Create an **OAuth 2.0 Client ID** for a **Desktop app**.
    - Download the credentials JSON file and save it as `credentials.json` in the root of this project directory.

4.  **Run the CLI:**
    ```bash
    npm run flights
    ```
    The first time you run the tool, it will guide you through adding your first Gmail account.

## How to Use

Once you start the CLI, you will be presented with a menu:

- **Get Flights**: This will start the process of fetching flight data. You will be prompted to:
  - Validate your accounts.
  - Select which accounts to search.
  - Specify a date range.
  - Choose an output format (CSV or JSON).
  - Choose an output destination (console or file).
- **Add account**: Add a new Gmail account to be scraped.
- **Remove account**: Remove an existing Gmail account.
- **Quit**: Exit the CLI.

This project also includes a Next.js frontend, which can be run with `npm run dev`, but the core functionality resides in the CLI.
