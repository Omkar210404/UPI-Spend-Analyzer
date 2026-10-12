import { PATTERNS } from '../../core/narration/registry';
import { STORAGE_KEYS, STORAGE_PREFIX } from '../../core/storage/storage';

const FIELD_LABELS: Record<string, string> = {
  channel: 'Channel',
  counterparty: 'Name',
  vpa: 'UPI handle',
  reference: 'Reference',
  note: 'Note',
  personToPerson: 'To a person',
};

export function AboutView() {
  return (
    <div class="about">
      <header class="page-head">
        <h1 tabIndex={-1}>How it works</h1>
        <p class="lead">
          What "nothing leaves your browser" means here, how to check it yourself, and what this app
          can and cannot read.
        </p>
      </header>

      <section class="card prose" aria-labelledby="privacy-title">
        <h2 class="card-title" id="privacy-title">
          Privacy
        </h2>
        <p>
          The whole app is a set of files (HTML, CSS, JavaScript, two font files) that your browser
          downloaded when you opened this page. From then on it works alone. Your statement is read
          from your disk straight into this tab's memory. There is no server for it to go to: this
          project has none.
        </p>
        <p>
          This is enforced, not just promised. The page carries a Content-Security-Policy with{' '}
          <code>connect-src 'none'</code>, which tells the browser to refuse every background
          request this page tries to make (fetch, XHR, WebSocket, beacons). Images, fonts and
          scripts may only come from this same site, and the page uses no web workers.
        </p>
        <h3>Check it yourself</h3>
        <ol>
          <li>Open your browser's developer tools (F12) and go to the Network tab.</li>
          <li>Tick "Preserve log", then reload this page and wait for it to finish loading.</li>
          <li>Clear the list. Now open a statement, or the sample, and use every tab.</li>
          <li>
            The list stays empty. The one exception is choosing a PDF: that fetches the PDF reader's
            code from this same site. It is a download of program code; nothing about your file is
            in the request.
          </li>
          <li>
            For a blunter test, switch the Network tab to "Offline" (or turn off Wi-Fi) after the
            page has loaded. Everything except opening a PDF for the first time keeps working.
          </li>
        </ol>
        <h3>What the policy cannot do</h3>
        <p>
          A policy written into the page cannot stop another site from showing this page inside a
          frame, and no policy can stop a page from sending the browser to a different address. This
          app contains no code that does either. The source is open, so that can be checked too.
        </p>
      </section>

      <section class="card prose" aria-labelledby="stored-title">
        <h2 class="card-title" id="stored-title">
          What is kept, and where
        </h2>
        <ul>
          <li>
            <strong>Transactions:</strong> in this tab's memory only. They are never written to
            storage. Reload or close the tab and they are gone.
          </li>
          <li>
            <strong>Columns you did not map:</strong> discarded when you import. Card and account
            fragments inside narrations are removed at the same moment.
          </li>
          <li>
            <strong>Rules, category choices, column mappings and the theme:</strong> in this
            browser's local storage, under these keys:{' '}
            {STORAGE_KEYS.map((key, index) => (
              <>
                <code key={key}>{STORAGE_PREFIX + key}</code>
                {index < STORAGE_KEYS.length - 1 ? ', ' : '.'}
              </>
            ))}{' '}
            They stay on this device and in this browser. "Rules and data" lets you export or delete
            them.
          </li>
        </ul>
        <p>
          The app never asks for an account number, card number, PIN, Aadhaar or PAN, and never
          will. If your export has such columns, delete them before opening the file.
        </p>
      </section>

      <section class="card prose" aria-labelledby="files-title">
        <h2 class="card-title" id="files-title">
          Files it can read
        </h2>
        <ul>
          <li>
            <strong>CSV</strong> (also tab, semicolon or pipe separated). This is the reliable
            route. Lines above the column headings are skipped.
          </li>
          <li>
            <strong>PDF, experimental.</strong> Only PDFs whose text can be selected. The table is
            rebuilt from where the text sits on the page, which fails on unusual layouts. Scanned
            PDFs (pictures of pages) and password-protected PDFs are not supported.
          </li>
          <li>
            <strong>Not supported:</strong> XLS and XLSX. Open the file in a spreadsheet and save it
            as CSV first.
          </li>
        </ul>
        <h3>Getting a statement out of your bank</h3>
        <p>The menus differ from bank to bank and change over time, so these are general steps:</p>
        <ol>
          <li>Sign in to your bank's net banking site or app.</li>
          <li>Find the account statement page (often under Accounts, then Statement).</li>
          <li>
            Choose a date range. Three to twelve months gives the signals enough to work with.
          </li>
          <li>
            Pick CSV as the format if it is offered. "Excel" also works if you then save it as CSV.
          </li>
          <li>Download it, delete any columns with account or card numbers, and open it here.</li>
        </ol>
      </section>

      <section class="card prose" aria-labelledby="styles-title">
        <h2 class="card-title" id="styles-title">
          Narration styles it understands
        </h2>
        <p>
          A narration is the line of text a bank writes for each transaction. Every bank lays it out
          differently, and the same bank changes it over time. This app tries the styles below in
          order and uses the first that fits. They were written from commonly seen layouts using
          invented examples, not from any bank's specification, so they will not cover every bank. A
          narration that fits none of them still gets a best-effort reading from the last style in
          the list. The Transactions tab shows which style read each row.
        </p>
        <ul class="pattern-list">
          {PATTERNS.map((pattern) => (
            <li key={pattern.id} class="pattern">
              <h3>{pattern.label}</h3>
              <p class="mono pattern-layout">{pattern.layout}</p>
              {pattern.examples.slice(0, 1).map((example) => (
                <div key={example.input} class="pattern-example">
                  <p class="mono">{example.input}</p>
                  <dl class="pattern-fields">
                    {Object.entries(example.expect).map(([field, value]) => (
                      <div key={field}>
                        <dt>{FIELD_LABELS[field] ?? field}</dt>
                        <dd>{value === true ? 'Yes' : String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section class="card prose" aria-labelledby="limits-title">
        <h2 class="card-title" id="limits-title">
          Limits worth knowing
        </h2>
        <ul>
          <li>
            A payment to a person and a payment to a small shop using a personal UPI handle look the
            same in a statement. Use the category menu on the Transactions tab to correct them.
          </li>
          <li>One merchant that appears under two different names is treated as two merchants.</li>
          <li>
            "Money in" is every credit, so it includes refunds and transfers, not only income.
          </li>
          <li>
            Statements usually carry dates without times, so "the same day" is the finest the
            duplicate check can do.
          </li>
          <li>
            The signals use fixed thresholds, shown under each one. They have not been tuned on real
            statements.
          </li>
        </ul>
        <p>
          <strong>This is not financial advice.</strong> The app adds up what is in a file and
          points at patterns. What, if anything, to do about them is your decision.
        </p>
      </section>
    </div>
  );
}
