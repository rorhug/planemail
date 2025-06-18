export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold mb-4">
          Gmail Flight Scraper
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl">
          A command-line tool to connect to your Gmail accounts, find all your
          flight confirmation emails, and export them into a clean, structured
          CSV or JSON file.
        </p>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl">
          <h2 className="text-2xl font-semibold mb-4 text-left">How to Use</h2>
          <ol className="list-decimal list-inside text-left space-y-4">
            <li>
              <p>
                <strong>Set up your credentials:</strong> Download your
                `credentials.json` file from the Google Cloud Console and place
                it in the project root.
              </p>
            </li>
            <li>
              <p>
                <strong>Run the CLI:</strong> Open your terminal, navigate to
                the project directory, and run the following command:
              </p>
              <code className="block bg-gray-200 dark:bg-gray-700 rounded p-4 my-2 text-sm sm:text-base font-mono">
                npm run flights
              </code>
            </li>
            <li>
              <p>
                <strong>Follow the prompts:</strong> The interactive menu will
                guide you through adding accounts and fetching your flight data.
              </p>
            </li>
          </ol>
        </div>
      </main>
      <footer className="w-full p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Built with Next.js, TypeScript, and Inquirer.js
        </p>
      </footer>
    </div>
  );
}
